import { describe, expect, it, vi } from 'vitest'
import { createPartnerOuroFetch } from './partnerOuroFetch'

function harness(mode = 'ouro') {
  const original = [{ id_lead: 'lis', marca: 'Lisô Laser', valor_contrato: 10 }, { id_lead: 'par', marca: 'Scale Partner', valor_contrato: 2 }]
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const value = String(input)
    if (value.startsWith('/api/')) return new Response(JSON.stringify({ mode, contract: 'scale_partner_dashboard_v1', partner_ids: ['par'], rows: [{ id_lead: 'par', marca: 'We Scale', valor_contrato: 3 }], warnings: [], observed_at: null }))
    return new Response(JSON.stringify(original), { headers: { 'Content-Type': 'application/json' } })
  })
  const read = createPartnerOuroFetch({ source: 'vendas', origin: 'https://sales.test', token: async () => 'user-session', route: () => '/', fetch })
  return { read, fetch }
}
describe('provider Partner exclusivo de Marketing', () => {
  it('projeta e pagina depois de substituir; count inclui só uma versão Partner', async () => {
    const h = harness(); const r = await h.read('https://sales.test/rest/v1/vw_funil_vendas?select=valor_contrato&offset=1&limit=1&order=valor_contrato.desc')
    expect(await r.json()).toEqual([{ valor_contrato: 3 }]);expect(r.headers.get('content-range')).toBe('1-1/2')
    expect(String(h.fetch.mock.calls[1][0])).toContain('select=valor_contrato%2Cid_lead%2Cmarca')
  })
  it.each(['POST', 'PATCH', 'DELETE'])('não intercepta mutação %s', async method => {
    const h = harness();await h.read('https://sales.test/rest/v1/vw_funil_vendas', { method });expect(h.fetch).toHaveBeenCalledTimes(1)
  })
  it('não intercepta outra marca, Auth, RPC ou metas', async () => {
    const h = harness()
    for (const suffix of ['/rest/v1/vw_funil_vendas?marca=eq.Inpot', '/auth/v1/user', '/rest/v1/rpc/minhas_permissoes', '/rest/v1/DB_Metas_Performance']) await h.read('https://sales.test'+suffix)
    expect(h.fetch).toHaveBeenCalledTimes(4);expect(h.fetch.mock.calls.every(c => !String(c[0]).startsWith('/api/'))).toBe(true)
  })
  it('modo de rollback devolve a consulta original intacta', async () => {
    const h = harness('legacy');const url = 'https://sales.test/rest/v1/vw_funil_vendas?select=*&offset=1000&limit=1000';await h.read(url)
    expect(h.fetch.mock.calls[1][0]).toBe(url)
  })
  it('falha de gateway não vira zero nem fallback automático', async () => {
    const native = vi.fn(async () => new Response('{}', { status: 503 }))
    const read = createPartnerOuroFetch({ source: 'vendas', origin: 'https://sales.test', token: async () => 'user', route: () => '/', fetch: native })
    await expect(read('https://sales.test/rest/v1/vw_funil_vendas')).rejects.toThrow('ouro')
    expect(native).toHaveBeenCalledTimes(1)
  })
  it('gateway recebe só o domínio fixo e a rota; filtros e SQL não são enviados', async () => {
    const h = harness();await h.read('https://sales.test/rest/v1/vw_funil_vendas?select=*&id_lead=eq.par')
    const first = h.fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(first[1].body))).toEqual({ dataset: 'cycles', route: '/' })
  })
  it.each(['/funil-vendas','/performance-vendas','/analise-perda','/linha-do-tempo','/linha-do-tempo/0123456789abcdef01234567','/analise-objecoes','/metas','/distribuicao-leads','/gp-setembro','/gp-setembro/tv'])('preserva consultas e mídia de Vendas em %s', async route => {
    const token = vi.fn(async () => 'session')
    const native = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('[{"original":true}]'))
    for (const source of ['marketing','vendas'] as const) {
      const read = createPartnerOuroFetch({ source, origin: 'https://native.test', route: () => route, token, fetch: native })
      for (const table of source === 'marketing' ? ['leads','media_daily_raw'] : ['vw_funil_vendas','vw_funil_etapas_v2','vw_marketing_funil','vw_funil_compat','vw_deal_timeline_eventos','vw_deal_timeline_tarefas']) {
        const url = `https://native.test/rest/v1/${table}?select=*&offset=3&limit=2`
        const init = { headers: { 'x-reference': 'unchanged' } }
        expect(await (await read(url, init)).json()).toEqual([{ original: true }])
        expect(native).toHaveBeenLastCalledWith(url, init)
      }
    }
    expect(token).not.toHaveBeenCalled()
    expect(native.mock.calls.every(c => !String(c[0]).startsWith('/api/'))).toBe(true)
  })

})
