import { describe, expect, it, vi } from 'vitest'
import { filterRows } from './partnerOuroQuery'
import { createLegacyOuroFetch, LEGACY_MARKETING_ROUTES } from './legacyOuroFetch'

const origin = 'https://marketing.example'
const row = (id: string, marca: string, dia = '2026-10-10') => ({ id, marca, dia })
function setup(route = '/', gold = [row('new', 'Odonto Scale'), row('event', 'Odonto Legacy')]) {
  const legacy = [row('old', 'Odonto Scale'), row('sept', 'Odonto Scale', '2026-09-10'), row('partner', 'We Scale'), row('other', 'Inpot')]
  const referenceFetch = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(filterRows(legacy, new URL(String(input)).searchParams))))
  const fetch = vi.fn(async () => new Response(JSON.stringify({ mode: 'ouro', contract: 'legacy_marketing_v1', rows: gold })))
  return { referenceFetch, fetch, read: createLegacyOuroFetch({ origin, route: () => route, token: async () => 'session', fetch, referenceFetch }) }
}
describe('integração Legacy exclusiva de Marketing', () => {
  it.each([...LEGACY_MARKETING_ROUTES])('integra %s preservando Partner, outras marcas e história', async route => {
    const { read } = setup(route)
    const data = await (await read(`${origin}/rest/v1/leads?select=id,marca,dia&order=id.asc`)).json()
    expect(data.map((r: { id: string }) => r.id)).toEqual(['event', 'new', 'other', 'partner', 'sept'])
  })
  it.each(['/funil-vendas', '/performance-vendas', '/analise-perda', '/metas', '/gp-setembro/tv'])('não intercepta %s', async route => {
    const s = setup(route)
    await s.read(`${origin}/rest/v1/leads`)
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.referenceFetch).toHaveBeenCalledTimes(1)
  })
  it('pagina depois da união; seleciona colunas depois do filtro de marca', async () => {
    const s = setup()
    const data = await (await s.read(`${origin}/rest/v1/leads?select=id&marca=eq.Odonto%20Scale&order=dia.desc&offset=0&limit=1`)).json()
    expect(data[0]).toEqual({ id: 'new' })
    expect(s.referenceFetch.mock.calls[0]).toBeDefined()
  })
  it('rejeita resposta ouro fora de marca/período sem retirar o legado', async () => {
    const s = setup('/', [row('bad', 'We Scale')])
    await expect(s.read(`${origin}/rest/v1/leads`)).rejects.toThrow('Escopo')
  })
  it('não intercepta escritas ou tabelas comerciais', async () => {
    const s = setup()
    await s.read(`${origin}/rest/v1/leads`, { method: 'POST' })
    await s.read(`${origin}/rest/v1/vw_funil_vendas`)
    expect(s.fetch).not.toHaveBeenCalled()
  })
})

describe('mídia da conta compartilhada', () => {
  const campaign = '[ODL] Consultoria I LEADS I SITE LEGACY'
  const old = [
    { ...row('replace', 'Oral Unic'), canal: 'meta', campanha: campaign },
    { ...row('community', 'Oral Unic'), canal: 'meta', campanha: '[CMD] AQUISIÇÃO (comunidade) I LEADS' },
    { ...row('franchise', 'Oral Unic'), canal: 'meta', campanha: '[OUF] FUNDO_MQL_FRANQUIA_NOVA' },
    { ...row('sept', 'Oral Unic', '2026-09-10'), canal: 'meta', campanha: campaign },
  ]
  it('substitui somente a campanha Legacy no mês e conserva comunidade, franquia e setembro', async () => {
    const referenceFetch = vi.fn(async () => new Response(JSON.stringify(old)))
    const fetch = vi.fn(async () => new Response(JSON.stringify({ mode: 'ouro', contract: 'legacy_marketing_v1', rows: [{ ...old[0], id: 'gold' }] })))
    const read = createLegacyOuroFetch({ origin, route: () => '/marca', token: async () => 'session', fetch, referenceFetch })
    const result = await (await read(`${origin}/rest/v1/media_daily_raw?select=id&order=id.asc`)).json()
    expect(result.map((r: { id: string }) => r.id)).toEqual(['community', 'franchise', 'gold', 'sept'])
  })
  it('falha de identidade não devolve totais parciais nem usa fonte silenciosamente', async () => {
    const referenceFetch = vi.fn()
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'commercial_identity_incomplete' }), { status: 409 }))
    const read = createLegacyOuroFetch({ origin, route: () => '/sop-marketing', token: async () => 'session', fetch, referenceFetch })
    await expect(read(`${origin}/rest/v1/leads`)).rejects.toThrow('ouro de Legacy')
    expect(referenceFetch).not.toHaveBeenCalled()
  })
  it('consulta explícita de outra marca e modo desligado não chamam gateway', async () => {
    const referenceFetch = vi.fn(async () => new Response('[]')); const fetch = vi.fn()
    const read = createLegacyOuroFetch({ origin, route: () => '/', token: async () => 'session', fetch, referenceFetch })
    await read(`${origin}/rest/v1/leads?marca=eq.Oral%20Unic`)
    await read(`${origin}/rest/v1/media_daily_raw?marca=eq.Inpot`)
    await read(`${origin}/rest/v1/leads?marca=in.(Eletrovias)`)
    await read(`${origin}/rest/v1/leads?marca=in.(Lisô%20Laser,We%20Scale)`)
    await read(`${origin}/rest/v1/leads?marca=eq.Odonto%20Scale&dia=lte.2026-09-30`)
    const disabled = createLegacyOuroFetch({ origin, route: () => '/', token: async () => 'session', fetch, referenceFetch, enabled: false })
    await disabled(`${origin}/rest/v1/leads?marca=eq.Odonto%20Scale`)
    expect(fetch).not.toHaveBeenCalled(); expect(referenceFetch).toHaveBeenCalledTimes(6)
  })
})
