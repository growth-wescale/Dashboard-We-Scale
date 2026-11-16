import { describe, expect, it, vi } from 'vitest'
import { monthlyReferenceUrl, monthlyReferenceCoveredBrands } from './monthlyReference'
import { linhaMensal, marcasMensais } from './previaMensal'
import { filterRows, sortRows, projectRows } from './partnerOuroQuery'
import { createEletroviasOuroFetch } from './eletroviasOuroFetch'

const origin = 'https://marketing.test'
const periodo = { inicio: '2026-11-01', fim: '2026-11-16' }
const row = (id: string, marca: string | null, dia: string | null, extra = {}) => ({ id, marca, dia, ...extra })
const reference = [
  ...monthlyReferenceCoveredBrands.flatMap(m => [row(m, m, '2026-11-02'), row(m + '-old', m, '2026-10-15'), row(m + '-future', m, '2026-12-01')]),
  row('community', 'Oral Unic', '2026-11-02', { formulario: 'comunidade_multistep' }),
  row('consulting', 'Oral Unic', '2026-11-02', { utm_campaign: '[V4] Consultoria' }),
  row('oral-franchise', 'Oral Unic', '2026-11-02', { formulario: 'oralunic_multistep' }),
  row('oral-other', 'Oral Unic', '2026-11-02'),
  row('legacy', 'Odonto Scale', '2026-11-02'), row('legacy-alias', 'Odonto Legacy', '2026-11-02'),
  row('partner', 'We Scale', '2026-11-02'), row('unbranded', null, '2026-11-02'), row('undated', 'Inpot', null),
]
function setup(reduce = true, route = '/', mode = 'ouro', data = reference) {
  const gold = monthlyReferenceCoveredBrands.map(m => row('gold-' + m, m, '2026-11-02'))
  const native = vi.fn<typeof fetch>(async input => {
    const q = new URL(String(input)).searchParams
    const filtered = sortRows(filterRows(data, q), q.get('order'))
    const start = Number(q.get('offset') ?? 0), end = start + Number(q.get('limit') ?? filtered.length)
    return new Response(JSON.stringify(projectRows(filtered.slice(start, end), q.get('select'))))
  })
  const goldFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ mode, contract: 'marketing_mensal_v1', rows: gold })))
  const read = createEletroviasOuroFetch({ origin, route: () => route, token: async () => 'session', referenceFetch: native, fetch: goldFetch, parallelReference: true,
    marketingScope: { mensal: true, brands: marcasMensais, includes: linhaMensal, endpoint: '/api/marketing-mensal-ouro/v1/read', contract: 'marketing_mensal_v1',
      referenceCoveredBrands: reduce ? monthlyReferenceCoveredBrands : undefined } })
  return { native, goldFetch, read }
}

describe('referência mensal reduzida', () => {
  it.each(['leads', 'media_daily_raw'])('remove apenas linhas inteiramente cobertas de %s', table => {
    const original = new URL(`${origin}/rest/v1/${table}`)
    const reduced = monthlyReferenceUrl(original, periodo, monthlyReferenceCoveredBrands)
    const kept = filterRows(reference, reduced.searchParams)
    const removed = reference.filter(r => !kept.includes(r))
    expect(removed.map(r => r.id)).toEqual([...monthlyReferenceCoveredBrands])
    expect(removed.every(r => linhaMensal(r, table))).toBe(true)
    for (const id of ['community', 'consulting', 'oral-franchise', 'oral-other', 'legacy', 'legacy-alias', 'partner', 'unbranded', 'undated']) expect(kept.some(r => r.id === id)).toBe(true)
    expect(original.searchParams.size).toBe(0)
  })
  it.each(['or', 'and', 'not.or', 'not.and'])('preserva filtro lógico %s sem reescrever', key => {
    const url = new URL(`${origin}/rest/v1/leads`); url.searchParams.set(key, '(marca.eq.Inpot,marca.eq.Viva)')
    expect(monthlyReferenceUrl(url, periodo, monthlyReferenceCoveredBrands).href).toBe(url.href)
  })
  it('não exclui marcas adicionais fornecidas por engano', () => {
    const url = new URL(`${origin}/rest/v1/leads`)
    expect(monthlyReferenceUrl(url, periodo, ['Oral Unic', 'Odonto Scale', 'We Scale']).href).toBe(url.href)
  })
  it.each(['leads', 'media_daily_raw'])('preserva a união completa e seus campos para %s', async table => {
    const before = setup(false), after = setup()
    const url = `${origin}/rest/v1/${table}?dia=gte.2026-10-01&dia=lte.2026-11-16&order=id.asc`
    const a = await before.read(url), b = await after.read(url)
    expect(await b.json()).toEqual(await a.json()); expect(b.headers.get('Content-Range')).toBe(a.headers.get('Content-Range'))
    expect(String(after.native.mock.calls[0][0])).toContain('or=')
  })
  it('preserva paginação, projeção, filtros e compartilhamento com mais de mil referências', async () => {
    const data = [...reference, ...Array.from({ length: 1002 }, (_, i) => row('community-' + String(i).padStart(4, '0'), 'Oral Unic', '2026-11-02', { formulario: 'comunidade_multistep' }))]
    const query = `${origin}/rest/v1/leads?dia=gte.2026-11-01&dia=lte.2026-11-16&order=id.asc&select=id,marca&offset=995&limit=30`
    const before = setup(false, '/', 'ouro', data), after = setup(true, '/', 'ouro', data)
    const [a, b, shared] = await Promise.all([before.read(query), after.read(query), after.read(query)])
    const expected = await a.json(); expect(await b.json()).toEqual(expected); expect(await shared.json()).toEqual(expected)
    expect(b.headers.get('Content-Range')).toBe(a.headers.get('Content-Range')); expect(after.native).toHaveBeenCalledTimes(2)
  })
  it.each(['/marca', '/sop-marketing', '/okrs', '/funil-vendas', '/esteira'])('não reduz a referência em %s', async route => {
    const s = setup(true, route); await s.read(`${origin}/rest/v1/leads?dia=gte.2026-11-01`)
    expect(s.native.mock.calls.every(([u]) => !new URL(String(u)).searchParams.has('or'))).toBe(true)
  })
  it('mantém outubro e HEAD sem redução', async () => {
    for (const [query, init] of [['dia=lte.2026-10-31', {}], ['dia=gte.2026-11-01', { method: 'HEAD' }]] as const) {
      const s = setup(); await s.read(`${origin}/rest/v1/leads?${query}`, init)
      expect(s.native.mock.calls.every(([u]) => !new URL(String(u)).searchParams.has('or'))).toBe(true)
    }
  })
  it('modo legado volta à consulta original integral', async () => {
    const s = setup(true, '/', 'legacy'); const url = `${origin}/rest/v1/leads?dia=gte.2026-11-01&order=id.asc`
    expect(await (await s.read(url)).json()).toEqual(sortRows(filterRows(reference, new URL(url).searchParams), 'id.asc'))
    expect(String(s.native.mock.calls.at(-1)![0])).toBe(url)
  })
  it('não entrega referência parcial quando a ouro falha', async () => {
    const s = setup(); s.goldFetch.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(s.read(`${origin}/rest/v1/leads?dia=gte.2026-11-01`)).rejects.toThrow('ouro')
  })
})
