import { periodoMensal, type PeriodoMensal } from './previaMensal'
import { leituraOuroSop } from './leituraOuroSop'
import { inEletroviasWindow, isEletroviasMigrationMedia, isEletroviasMigrationLead } from './eletroviasOuroScope'
import { filterRows, sortRows, projectRows, type RecordRow } from './partnerOuroQuery'

export const ELETROVIAS_MARKETING_ROUTES = new Set(['/', '/marca', '/sop-marketing', '/okrs', '/copa-b2b'])

const TABLES: Record<string, { dataset: string }> = { leads: { dataset: 'leads' }, media_daily_raw: { dataset: 'media' } }
interface GoldReply { mode: 'legacy' | 'ouro'; rows: RecordRow[];  contract: string; observed_at: string | null; warnings: string[] }
interface Options {
  marketingScope?: { mensal?: boolean; brands: readonly string[]; endpoint: string; contract: string; includes: (row: RecordRow, table: string) => boolean }
  origin: string
  token: () => Promise<string | null>
  route: () => string
  fetch?: typeof fetch
  referenceFetch?: typeof fetch
  enabled?: boolean
  dealsEnabled?: boolean
}
// Não guarda sessão nem dados pessoais em armazenamento persistente.
export function createEletroviasOuroFetch(options: Options): typeof fetch {
  const scope = options.marketingScope
  const label = scope?.brands.join(', ') ?? 'Eletrovias'
  const nativeFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const referenceFetch = options.referenceFetch ?? nativeFetch
  const goldCache = new Map<string, { at: number; value: Promise<GoldReply> }>()
  const legacyCache = new Map<string, { at: number; value: Promise<RecordRow[]> }>()
  let currentToken: string | null = null
  if (typeof window !== 'undefined') window.addEventListener('dashboard:refresh', () => { goldCache.clear(); legacyCache.clear() })
  async function getGold(dataset: string, route: string, token: string, periodo?: PeriodoMensal): Promise<GoldReply> {
    const goldKey = `${route}:${dataset}:${periodo?.inicio ?? ''}:${periodo?.fim ?? ''}`
    let goldEntry = goldCache.get(goldKey)
    if (!goldEntry || Date.now() - goldEntry.at > 60_000) {
      const value = (async () => {
        const response = await leituraOuroSop(nativeFetch, scope?.endpoint ?? '/api/eletrovias-ouro/v1/read', {
          method: 'POST', signal: AbortSignal.timeout(60_000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset, route, periodo }),
        }, route)
        if (periodo && response.status === 409) {
          const erro = await response.json()
          if (erro.code === 'periodo_sem_publicacao') throw new Error('A ouro ainda não publicou dados para o período selecionado.')
        }
        if (!response.ok) throw new Error(`Não foi possível consultar a ouro de ${label}. Atualize os dados para tentar novamente.`)
        return await response.json() as GoldReply
      })()
      goldEntry = { at: Infinity, value }; goldCache.set(goldKey, goldEntry)
      value.then(() => { const e = goldCache.get(goldKey); if (e?.value === value) e.at = Date.now() }, () => {})
      value.catch(() => { if (goldCache.get(goldKey)?.value === value) goldCache.delete(goldKey) })
    }
    return await goldEntry.value
  }
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1/'.length) : ''
    const config = TABLES[table]
    if (options.enabled === false || url.origin !== new URL(options.origin).origin || !config || !['GET', 'HEAD'].includes(method)) return referenceFetch(input, init)
    const route = options.route()
    if (!ELETROVIAS_MARKETING_ROUTES.has(route)) return referenceFetch(input, init)
    const marca = url.searchParams.get('marca')
    const candidateBrands = scope?.brands ?? ['Eletrovias']
    // Inclui filtros in.(...) da S&OP: falha Eletrovias não pode zerar outra marca.
    if (marca && !filterRows(candidateBrands.map(marca => ({ marca })), new URLSearchParams({ marca })).length) return referenceFetch(input, init)
    const outsideWindow = url.searchParams.getAll('dia').some(value => {
      const [op, day] = value.split('.')
      return (op === 'lt' && day <= '2026-10-01') || (op === 'lte' && day < '2026-10-01')
        || (op === 'gt' && day >= '2026-10-31') || (op === 'gte' && day >= '2026-11-01')
        || (op === 'eq' && (day < '2026-10-01' || day >= '2026-11-01'))
    })
    const periodo = scope?.mensal ? periodoMensal(url.searchParams) : undefined
    if (scope?.mensal ? !periodo : outsideWindow) return referenceFetch(input, init)
    const token = await options.token()
    if (!token) throw new Error(`Entre novamente para consultar ${label}.`)
    if (token !== currentToken) { goldCache.clear(); legacyCache.clear(); currentToken = token }
    const reply = await getGold(config.dataset, route, token, periodo)
    if (init?.signal?.aborted) throw new Error('Consulta cancelada.')
    if (reply.mode === 'legacy') return referenceFetch(input, init)
    if (reply.mode !== 'ouro' || !Array.isArray(reply.rows) || reply.contract !== (scope?.contract ?? 'eletrovias_marketing_v1')) throw new Error(`Contrato de ${label} inválido.`)
    const requested = url.searchParams
    const extra = table === 'media_daily_raw' ? ['marca', 'dia', 'campanha', 'canal'] : ['marca', 'dia', 'formulario', 'dados_extras', 'utm_campaign']
    const select = requested.get('select') ?? '*'
    const extended = select === '*' ? '*' : [...new Set([...select.split(',').map(x => x.trim()), ...extra])].join(',')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.delete('Range'); headers.delete('range-unit'); headers.set('Accept', 'application/json')
    // Buscar a união antes da paginação evita duplicar Eletrovias ou deslocar as
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
    const scoped = (r: RecordRow) => (periodo ? typeof r.dia === 'string' && r.dia >= periodo.inicio && r.dia <= periodo.fim : inEletroviasWindow(r)) && (scope ? scope.includes(r, table) : table === 'leads' ? isEletroviasMigrationLead(r) : isEletroviasMigrationMedia(r))
    if (reply.rows.some(r => !scoped(r))) throw new Error(`Escopo de ${label} inválido.`)
    let goldRows = reply.rows
    if (table === 'leads' && options.dealsEnabled) {
      const deals = await getGold('negocios', route, token)
      if (deals.mode !== 'ouro' || deals.contract !== 'eletrovias_negocios_v1' || !Array.isArray(deals.rows)) throw new Error('Contrato de negociações de Eletrovias inválido.')
      const ids = new Set<string>()
      for (const row of deals.rows) {
        const data = row.dados_extras as Record<string, unknown> | null
        const key = JSON.stringify([data?.conta_id, data?.id_deal])
        if (!scoped(row) || data?.metric_grain !== 'crm_deal' || data?.conta_id !== 'wescale_principal_crm'
          || typeof data?.id_deal !== 'string' || !data.id_deal || ids.has(key)) throw new Error('Escopo de negociações de Eletrovias inválido.')
        ids.add(key)
      }
      const profiles = new Map<unknown, RecordRow>()
      for (const row of reply.rows) {
        const id = (row.dados_extras as Record<string, unknown> | null)?.id_deal
        if (id && !profiles.has(id)) profiles.set(id, row)
      }
      const metricRows = deals.rows.map(row => {
        const data = row.dados_extras as Record<string, unknown>
        const profile = profiles.get(data.id_deal)
        if (!profile) return row
        return { ...row,
          ...Object.fromEntries(['nome', 'email', 'telefone', 'uf', 'cidade', 'formulario'].map(field => [field, profile[field] ?? null])),
          dados_extras: { ...data, capital: (profile.dados_extras as Record<string, unknown> | null)?.capital ?? null },
        }
      })
      // Contact rows remain available to contact metrics; LP submissions never add MQLs.
      goldRows = [...reply.rows.map(row => ({ ...row, dados_extras: { ...(row.dados_extras as object ?? {}), metric_grain: 'contact_only' } })), ...metricRows]
    }
    const merged = sortRows([...rows.filter(r => !scoped(r)), ...filterRows(goldRows, requested)], requested.get('order'))
    const offset = Number(requested.get('offset') ?? 0), limit = Number(requested.get('limit') ?? merged.length)
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || offset < 0 || limit < 0) throw new Error('Página de dados inválida.')
    const page = projectRows(merged.slice(offset, offset + limit), select)
    const end = offset + page.length - 1
    const out = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Range': `${page.length ? `${offset}-${end}` : '*'}/${merged.length}` })
    if (!scope && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eletrovias-ouro:read', { detail: { observedAt: reply.observed_at, warnings: reply.warnings } }))
    return new Response(method === 'HEAD' ? null : JSON.stringify(page), { status: 200, headers: out })
  }
}
