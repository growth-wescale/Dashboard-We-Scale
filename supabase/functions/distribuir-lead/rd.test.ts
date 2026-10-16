import { describe, expect, it } from 'vitest'
import { criarDealNoRd, montarCorpoDeal, type DealPronto } from './rd.ts'

const deal: DealPronto = {
  name: 'Lead X', deal_stage_id: 'etapa', user_id: 'u1', campaign_id: 'camp', marca_rd: 'Eletrovias', nome_sdr: 'Sarah Padilha',
  contato: { nome: 'Lead X', email: 'x@t.com', telefone: '48999990000' },
  utm: { source: 'meta', medium: null, campaign: null, term: null, content: null },
  cidade: 'Floripa', estado: 'SC', capital: null, campos_extra: { '699f2143a0f592001365ce42': 'Até R$ 50 mil' },
}
const TOKEN = 'segredo-do-rd-123'

function fetchQue(respostas: Array<() => Response | Error>): { fetch: typeof fetch; chamadas: number } {
  const estado = { chamadas: 0 }
  const f = (async () => {
    const r = respostas[Math.min(estado.chamadas, respostas.length - 1)]
    estado.chamadas++
    const x = r()
    if (x instanceof Error) throw x
    return x
  }) as unknown as typeof fetch
  return { fetch: f, get chamadas() { return estado.chamadas } }
}

describe('montarCorpoDeal', () => {
  it('monta o corpo com Marca, Fonte Macro Inbound, fixos e campos extra, sem repetir id', () => {
    const b = montarCorpoDeal(deal)
    const ids = b.deal.deal_custom_fields.map(c => c.custom_field_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(b.deal.deal_custom_fields).toEqual(expect.arrayContaining([
      { custom_field_id: '69600aafd006b100155e4066', value: 'Eletrovias' },
      { custom_field_id: '6a8c4f1b06873300248bbff5', value: 'Inbound' },
      { custom_field_id: '699f2143a0f592001365ce42', value: 'Até R$ 50 mil' },
    ]))
    expect(b.campaign).toEqual({ _id: 'camp' })
    expect(b.contacts[0].phones).toEqual([{ phone: '48999990000', type: 'cellphone' }])
  })
})

describe('criarDealNoRd', () => {
  it('erro de rede nunca devolve o token na mensagem', async () => {
    const q = fetchQue([() => new Error(`error sending request for url (https://crm.rdstation.com/api/v1/deals?token=${TOKEN}): dns error`)])
    const r = await criarDealNoRd(TOKEN, deal, { fetchImpl: q.fetch, tentativas: 1 })
    expect(r.erro).toBeDefined()
    expect(r.erro).not.toContain(TOKEN)
    expect(r.erro).toContain('token=[token]')
  })

  it('timeout não repete: fica em erro pra conferir no RD', async () => {
    const q = fetchQue([() => Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })])
    const r = await criarDealNoRd(TOKEN, deal, { fetchImpl: q.fetch, tentativas: 3 })
    expect(r.id).toBeUndefined()
    expect(q.chamadas).toBe(1)
    expect(r.erro).toMatch(/timeout/i)
    expect(r.erro).toMatch(/conferir no RD/i)
  })

  it('2xx com corpo não-JSON não repete o POST', async () => {
    const q = fetchQue([() => new Response('<html>ok</html>', { status: 200 })])
    const r = await criarDealNoRd(TOKEN, deal, { fetchImpl: q.fetch, tentativas: 3 })
    expect(q.chamadas).toBe(1)
    expect(r.id).toBeUndefined()
    expect(r.erro).toMatch(/sem id/)
  })

  it('429 repete e respeita Retry-After; depois 200 devolve o id', async () => {
    const q = fetchQue([
      () => new Response('{"message":"rate limit"}', { status: 429, headers: { 'Retry-After': '0' } }),
      () => new Response('{"id":"deal-1"}', { status: 200 }),
    ])
    const r = await criarDealNoRd(TOKEN, deal, { fetchImpl: q.fetch, tentativas: 3 })
    expect(r).toMatchObject({ id: 'deal-1', tentativas: 2 })
  })

  it('422 não repete', async () => {
    const q = fetchQue([() => new Response('{"errors":{"deal_custom_fields":["x"]}}', { status: 422 })])
    const r = await criarDealNoRd(TOKEN, deal, { fetchImpl: q.fetch, tentativas: 3 })
    expect(q.chamadas).toBe(1)
    expect(r.erro).toContain('HTTP 422')
  })
})
