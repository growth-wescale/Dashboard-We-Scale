import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: true,
  createClient: vi.fn((_url: string, _key: string, options: any) => options),
  session: vi.fn(async () => ({ data: { session: { access_token: 'marketing-session' } } })),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('./supabase', () => ({ supabase: { native: true, auth: { getSession: mocks.session } } }))
vi.mock('./oralUnicOuroScope', async original => ({
  ...await original<typeof import('./oralUnicOuroScope')>(),
  get oralUnicOuroEnabled() { return mocks.enabled },
}))

const media = (id: string, campanha: string, spend_brl: number, extra = {}) => ({
  id, campanha, spend_brl, marca: 'Oral Unic', canal: 'meta', dia: '2026-10-21', ...extra,
})
const old = media('ouf-old', '[OUF] FUNDO_MQL_FRANQUIA_NOVA', 100)
const gold = { ...old, id: 'ouf-gold', spend_brl: 110 }
const preserved = [
  media('odl', '[ODL] Consultoria I LEADS I SITE LEGACY', 200),
  media('odl-google', '[SEARCH] Intenção - Defesa de Marca', 300, { canal: 'google' }),
  media('cmd', '[CMD] AQUISIÇÃO (comunidade) I LEADS', 40),
  media('v4', '[V4] Aquisição', 50),
  { ...old, id: 'september', dia: '2026-09-21' },
  { ...old, id: 'liso', marca: 'Lisô Laser' },
]

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.enabled = true
  vi.stubEnv('VITE_SUPABASE_URL', 'https://marketing.test')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
  vi.stubGlobal('window', { location: { pathname: '/marca' }, addEventListener: vi.fn(), dispatchEvent: vi.fn() })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('cliente exclusivo Oral Unic da Esteira', () => {
  it('troca só a parcela aprovada; consultoria, comunidade, V4, história e outras marcas permanecem literais', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).startsWith('/api/')
      ? { mode: 'ouro', contract: 'oral_unic_marketing_v1', rows: [gold] }
      : [old, ...preserved])))
    vi.stubGlobal('fetch', fetch)
    const { oralUnicMarketingClient } = await import('./oralUnicMarketingClient')
    const client = oralUnicMarketingClient() as any
    const result = await (await client.global.fetch('https://marketing.test/rest/v1/media_daily_raw?select=*')).json()
    expect(result).toEqual([...preserved, gold])
    expect(fetch.mock.calls.map(([url]) => String(url)).filter(url => url.startsWith('/api/'))).toEqual(['/api/oral-unic-ouro/v1/read'])
    expect(await client.accessToken()).toBe('marketing-session')
    expect(client.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false })
    expect(oralUnicMarketingClient()).toBe(client)
  })
  it('com flag desligada continua no cliente nativo', async () => {
    mocks.enabled = false
    const { oralUnicMarketingClient } = await import('./oralUnicMarketingClient')
    expect(oralUnicMarketingClient()).toHaveProperty('native', true)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('não intercepta páginas de Vendas nem envia a sessão Marketing ao CRM', async () => {
    vi.stubGlobal('window', { location: { pathname: '/funil-vendas' }, addEventListener: vi.fn() })
    const fetch = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    const { oralUnicMarketingClient } = await import('./oralUnicMarketingClient')
    const client = oralUnicMarketingClient() as any
    await client.global.fetch('https://marketing.test/rest/v1/media_daily_raw')
    await client.global.fetch('https://crm.test/rest/v1/vw_funil_vendas')
    expect(mocks.session).not.toHaveBeenCalled()
    expect(fetch.mock.calls).toHaveLength(2)
  })
  it('falha da ouro é explícita, sem substituir por zero ou voltar à mídia antiga', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const { oralUnicMarketingClient } = await import('./oralUnicMarketingClient')
    const client = oralUnicMarketingClient() as any
    await expect(client.global.fetch('https://marketing.test/rest/v1/media_daily_raw')).rejects.toThrow('ouro de Oral Unic')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
