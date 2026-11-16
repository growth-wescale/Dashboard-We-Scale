import { describe, expect, it, vi } from 'vitest'
import { createLisoOuroFetch } from './lisoOuroFetch'
import { createLegacyOuroFetch } from './legacyOuroFetch'
import { createOralUnicOuroFetch } from './oralUnicOuroFetch'
import { createPartnerOuroFetch } from './partnerOuroFetch'
import { createEletroviasOuroFetch } from './eletroviasOuroFetch'

const origin = 'https://marketing.test'
const url = `${origin}/rest/v1/leads?order=id.asc`
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const adapters = [
  { name: 'Lisô', create: createLisoOuroFetch, contract: 'liso_beauty_marketing_v1', marca: 'Lisô Laser' },
  { name: 'Legacy', create: createLegacyOuroFetch, contract: 'legacy_marketing_v1', marca: 'Odonto Scale' },
  { name: 'Oral Unic', create: createOralUnicOuroFetch, contract: 'oral_unic_marketing_v1', marca: 'Oral Unic' },
  { name: 'Eletrovias', create: createEletroviasOuroFetch, contract: 'eletrovias_marketing_v1', marca: 'Eletrovias' },
  { name: 'Partner', create: createPartnerOuroFetch, contract: 'scale_partner_dashboard_v1', marca: 'We Scale' },
]
for (const adapter of adapters) describe(`leituras independentes de ${adapter.name}`, () => {
  function setup(parallelReference = true, route = '/') {
    const row = { id: 'gold', marca: adapter.marca, dia: '2026-10-10', formulario: 'oralunic_multistep' }
    const referenceRows = [{ id: 'preserved', marca: 'Inpot', dia: '2026-10-10' }]
    const reply = () => new Response(JSON.stringify({ mode: 'ouro', contract: adapter.contract, rows: [row], partner_ids: [] }))
    const gold = vi.fn<typeof fetch>(async () => reply())
    const reference = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(referenceRows)))
    const read = adapter.create({ source: 'marketing', origin, token: async () => 'session', route: () => route, parallelReference,
      fetch: (input, init) => String(input).startsWith('/api/') ? gold(input, init) : reference(input, init), referenceFetch: reference })
    return { read, gold, reference, reply, row, referenceRows }
  }
  it('sobrepõe as leituras e conserva exatamente a união sequencial', async () => {
    const sequential = setup(false), s = setup(), gold = deferred<Response>(), entered = deferred<void>()
    s.gold.mockReturnValue(gold.promise)
    s.reference.mockImplementation(async () => { entered.resolve(); return new Response(JSON.stringify(s.referenceRows)) })
    const complete = vi.fn(), result = s.read(url).then(r => { complete(); return r })
    await entered.promise
    expect(s.gold).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled()
    gold.resolve(s.reply())
    const actual = await result, expected = await sequential.read(url)
    expect(await actual.json()).toEqual(await expected.json())
    expect(actual.headers.get('Content-Range')).toBe('0-1/2')
  })
  it.each([[false, '/'], [true, '/marca'], [true, '/sop-marketing'], [true, '/okrs']])('preserva sequência opt-in %s rota %s', async (enabled, route) => {
    const s = setup(Boolean(enabled), String(route)), gold = deferred<Response>(), entered = deferred<void>()
    s.gold.mockImplementation(() => { entered.resolve(); return gold.promise })
    const result = s.read(url)
    await entered.promise; expect(s.reference).not.toHaveBeenCalled()
    gold.resolve(s.reply()); await result
  })
  it('não entrega referência isolada quando a ouro falha; permite tentar novamente', async () => {
    const s = setup()
    s.gold.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    s.reference.mockRejectedValueOnce(new Error('reference failure'))
    await expect(s.read(url)).rejects.toThrow('ouro')
    expect(await (await s.read(url)).json()).toHaveLength(2)
  })
  it('não entrega ouro isolada quando a referência falha', async () => {
    const s = setup(); s.reference.mockRejectedValueOnce(new Error('reference failure'))
    await expect(s.read(url)).rejects.toThrow('reference failure')
    expect(await (await s.read(url)).json()).toHaveLength(2)
    expect(s.gold).toHaveBeenCalledOnce()
  })
})
it('não paraleliza o cliente CRM mesmo com opção ligada na Visão Geral', async () => {
  const gold = deferred<Response>(), entered = deferred<void>(), reference = vi.fn<typeof fetch>(async () => new Response('[]'))
  const read = createPartnerOuroFetch({ source: 'vendas', origin, token: async () => 'session', route: () => '/', parallelReference: true,
    fetch: async (input, init) => {
      if (String(input).startsWith('/api/')) { entered.resolve(); return gold.promise }
      return reference(input, init)
    } })
  const result = read(`${origin}/rest/v1/vw_marketing_funil`)
  await entered.promise; expect(reference).not.toHaveBeenCalled()
  gold.resolve(new Response(JSON.stringify({ mode: 'ouro', contract: 'scale_partner_dashboard_v1', rows: [], partner_ids: [] })))
  await result; expect(reference).toHaveBeenCalledOnce()
})
