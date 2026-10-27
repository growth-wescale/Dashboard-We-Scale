import { describe, expect, it, vi } from 'vitest'
import { filterRows } from './partnerOuroQuery'
import { createLisoOuroFetch, LISO_MARKETING_ROUTES } from './lisoOuroFetch'

const origin = 'https://marketing.example'
const row = (id: string, marca: string, dia = '2026-10-10') => ({ id, marca, dia })
function setup(route = '/', gold = [row('new', 'Lisô Laser'), row('event', 'Beauty Connection')]) {
  const legacy = [row('old', 'Lisô Laser'), row('sept', 'Lisô Laser', '2026-09-10'), row('partner', 'We Scale'), row('other', 'Inpot')]
  const referenceFetch = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(filterRows(legacy, new URL(String(input)).searchParams))))
  const fetch = vi.fn(async () => new Response(JSON.stringify({ mode: 'ouro', contract: 'liso_beauty_marketing_v1', rows: gold })))
  return { referenceFetch, fetch, read: createLisoOuroFetch({ origin, route: () => route, token: async () => 'session', fetch, referenceFetch }) }
}
describe('integração Lisô/Beauty exclusiva de Marketing', () => {
  it.each([...LISO_MARKETING_ROUTES])('integra %s preservando Partner, outras marcas e história', async route => {
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
    const data = await (await s.read(`${origin}/rest/v1/leads?select=id&marca=eq.Lisô%20Laser&order=dia.desc&offset=0&limit=1`)).json()
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
