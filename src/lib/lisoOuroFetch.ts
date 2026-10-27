import { filterRows, sortRows, projectRows, type RecordRow } from './partnerOuroQuery'

export const LISO_MARKETING_ROUTES = new Set(['/', '/marca', '/sop-marketing', '/okrs', '/copa-b2b'])

const TABLES: Record<string, { dataset: string }> = { leads: { dataset: 'leads' }, media_daily_raw: { dataset: 'media' } }
interface GoldReply { mode: 'legacy' | 'ouro'; rows: RecordRow[];  contract: string; observed_at: string | null; warnings: string[] }
interface Options {
  origin: string
  token: () => Promise<string | null>
  route: () => string
  fetch?: typeof fetch
  referenceFetch?: typeof fetch
  enabled?: boolean
}
// Não guarda sessão nem dados pessoais em armazenamento persistente.
export function createLisoOuroFetch(options: Options): typeof fetch {
  const nativeFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const referenceFetch = options.referenceFetch ?? nativeFetch
  const goldCache = new Map<string, { at: number; value: Promise<GoldReply> }>()
  const legacyCache = new Map<string, { at: number; value: Promise<RecordRow[]> }>()
  let currentToken: string | null = null
  if (typeof window !== 'undefined') window.addEventListener('dashboard:refresh', () => { goldCache.clear(); legacyCache.clear() })
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1/'.length) : ''
    const config = TABLES[table]
    if (options.enabled === false || url.origin !== new URL(options.origin).origin || !config || !['GET', 'HEAD'].includes(method)) return referenceFetch(input, init)
    const route = options.route()
    if (!LISO_MARKETING_ROUTES.has(route)) return referenceFetch(input, init)
    const marca = url.searchParams.get('marca')
    // Uma consulta explicitamente de outra marca permanece idêntica.
    if (marca?.startsWith('eq.') && !['eq.Lisô Laser', 'eq.Beauty Connection'].includes(marca)) return referenceFetch(input, init)
    const token = await options.token()
    if (!token) throw new Error('Entre novamente para consultar Lisô e Beauty.')
    if (token !== currentToken) { goldCache.clear(); legacyCache.clear(); currentToken = token }
    const goldKey = `${route}:${config.dataset}`
    let goldEntry = goldCache.get(goldKey)
    if (!goldEntry || Date.now() - goldEntry.at > 60_000) {
      const value = (async () => {
        const response = await nativeFetch('/api/liso-ouro/v1/read', {
          method: 'POST', signal: AbortSignal.timeout(60_000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset: config.dataset, route }),
        })
        if (!response.ok) throw new Error('Não foi possível consultar a ouro de Lisô e Beauty. Atualize os dados para tentar novamente.')
        return await response.json() as GoldReply
      })()
      goldEntry = { at: Infinity, value }; goldCache.set(goldKey, goldEntry)
      value.then(() => { const e = goldCache.get(goldKey); if (e?.value === value) e.at = Date.now() }, () => {})
      value.catch(() => { if (goldCache.get(goldKey)?.value === value) goldCache.delete(goldKey) })
    }
    const reply = await goldEntry.value
    if (init?.signal?.aborted) throw new Error('Consulta cancelada.')
    if (reply.mode === 'legacy') return referenceFetch(input, init)
    if (reply.mode !== 'ouro' || !Array.isArray(reply.rows) || reply.contract !== 'liso_beauty_marketing_v1') throw new Error('Contrato de Lisô e Beauty inválido.')
    const requested = url.searchParams
    const extra = ['marca', 'dia']
    const select = requested.get('select') ?? '*'
    const extended = select === '*' ? '*' : [...new Set([...select.split(',').map(x => x.trim()), ...extra])].join(',')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.delete('Range'); headers.delete('range-unit'); headers.set('Accept', 'application/json')
    // Buscar a união antes da paginação evita duplicar Lisô/Beauty ou deslocar as
    // páginas das demais marcas. Limite explícito: resposta parcial não é dado.
    const base = new URL(url); base.searchParams.delete('offset'); base.searchParams.delete('limit')
    const legacyKey = `${route}:${base.href}`
    let legacyEntry = legacyCache.get(legacyKey)
    if (!legacyEntry || Date.now() - legacyEntry.at > 60_000) {
      const value = (async () => {
        const rows: RecordRow[] = []
        const started = Date.now()
    for (let page = 0; ; page++) {
      if (page >= 100 || Date.now() - started > 55_000) throw new Error('A consulta excedeu o limite de linhas; refine o período.')
      const current = new URL(url)
      current.searchParams.set('select', extended)
      current.searchParams.set('offset', String(page * 1000)); current.searchParams.set('limit', '1000')
      const legacy = await referenceFetch(current, { ...init, method: 'GET', headers, signal: AbortSignal.timeout(Math.max(1, 55_000 - (Date.now() - started))) })
      if (!legacy.ok) throw new Error('Não foi possível consultar a fonte de referência.')
      const chunk: unknown = await legacy.json()
      if (!Array.isArray(chunk)) throw new Error('Resposta incompleta da fonte de referência.')
      rows.push(...chunk as RecordRow[])
      if (chunk.length < 1000) break
    }
        return rows
      })()
      legacyEntry = { at: Infinity, value }; legacyCache.set(legacyKey, legacyEntry)
      value.then(() => { const e = legacyCache.get(legacyKey); if (e?.value === value) e.at = Date.now() }, () => {})
      value.catch(() => { if (legacyCache.get(legacyKey)?.value === value) legacyCache.delete(legacyKey) })
      for (const [key, entry] of legacyCache) if (Date.now() - entry.at > 60_000) legacyCache.delete(key)
    }
    const rows = await legacyEntry.value
    if (init?.signal?.aborted) throw new Error('Consulta cancelada.')
    const scoped = (r: RecordRow) => ['Lisô Laser', 'Beauty Connection'].includes(String(r.marca)) && typeof r.dia === 'string' && r.dia >= '2026-10-01' && r.dia < '2026-11-01'
    if (reply.rows.some(r => !scoped(r))) throw new Error('Escopo Lisô/Beauty inválido.')
    const merged = sortRows([...rows.filter(r => !scoped(r)), ...filterRows(reply.rows, requested)], requested.get('order'))
    const offset = Number(requested.get('offset') ?? 0), limit = Number(requested.get('limit') ?? merged.length)
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || offset < 0 || limit < 0) throw new Error('Página de dados inválida.')
    const page = projectRows(merged.slice(offset, offset + limit), select)
    const end = offset + page.length - 1
    const out = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Range': `${page.length ? `${offset}-${end}` : '*'}/${merged.length}` })
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('liso-ouro:read', { detail: { observedAt: reply.observed_at, warnings: reply.warnings } }))
    return new Response(method === 'HEAD' ? null : JSON.stringify(page), { status: 200, headers: out })
  }
}
