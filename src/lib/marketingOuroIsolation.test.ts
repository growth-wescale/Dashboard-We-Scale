import { createOralUnicOuroFetch } from './oralUnicOuroFetch'
import { describe, expect, it, vi } from 'vitest'
import { createPartnerOuroFetch } from './partnerOuroFetch'
import { createLisoOuroFetch } from './lisoOuroFetch'
import { createLegacyOuroFetch } from './legacyOuroFetch'

describe('isolamento da cadeia ouro nas consultas S&OP', () => {
  it.each(['in.(Eletrovias)', 'in.(Inpot,Viva)', 'eq.B2Case'])('preserva %s mesmo com todos os gateways indisponíveis', async marca => {
    const rows = [{ id: 'original', marca: 'Eletrovias', dia: '2026-10-10', dados_extras: { lead_type: 'MQL' } }]
    const native = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith('/api/')
      ? new Response('{}', { status: 503 }) : new Response(JSON.stringify(rows)))
    const token = vi.fn(async () => 'session')
    const options = { origin: 'https://marketing.test', token, route: () => '/sop-marketing', fetch: native }
    const partner = createPartnerOuroFetch({ ...options, source: 'marketing' })
    const liso = createLisoOuroFetch({ ...options, referenceFetch: partner })
    const legacy = createLegacyOuroFetch({ ...options, referenceFetch: liso })
    const read = createOralUnicOuroFetch({ ...options, referenceFetch: legacy })
    const url = `${options.origin}/rest/v1/leads?marca=${encodeURIComponent(marca)}&dia=gte.2026-10-01`
    expect(await (await read(url)).json()).toEqual(rows)
    expect(native).toHaveBeenCalledTimes(1)
    expect(native).toHaveBeenCalledWith(url, undefined)
    expect(token).not.toHaveBeenCalled()
  })
})
