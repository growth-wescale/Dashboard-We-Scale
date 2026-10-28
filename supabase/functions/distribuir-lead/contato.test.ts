import { describe, expect, it } from 'vitest'
import {
  buscarContatosPorEmail, escolherContato, identificadoPor, ligarDealAoContato, montarNotaReconversao,
  type ContatoRd, type Reconversao,
} from './contato.ts'
import { montarCorpoDeal, type DealPronto } from './rd.ts'

const TOKEN = 'segredo-do-rd-123'

function fetchFixo(status: number, corpo: unknown, registro: Array<{ url: string; init?: RequestInit }> = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    registro.push({ url, init })
    return new Response(JSON.stringify(corpo), { status })
  }) as unknown as typeof fetch
}

const reconv: Reconversao = {
  sdr: 'Xayane',
  deal_do_sdr: 'd2',
  sdr_inelegiveis: [],
  deals: [
    { id_deal: 'd2', nome: 'Humberto', marca: 'Eletrovias', funil: 'SDR', etapa: 'Tentando Contato', responsavel: 'Xayane', nome_sdr: 'Xayane', por_email: true, por_tel: false },
    { id_deal: 'd1', nome: 'Humberto - Curitiba', marca: 'Eletrovias', funil: 'Closer', etapa: 'Negociação SAL', responsavel: 'Jéssica', nome_sdr: 'Sarah Padilha', por_email: false, por_tel: true },
  ],
}

describe('identificadoPor', () => {
  it('diz o que bateu', () => {
    expect(identificadoPor(true, false)).toBe('E-mail')
    expect(identificadoPor(false, true)).toBe('Telefone')
    expect(identificadoPor(true, true)).toBe('E-mail e Telefone')
  })
})

describe('montarNotaReconversao', () => {
  it('sem deal aberto não gera anotação', () => {
    expect(montarNotaReconversao(null, 'Xayane')).toBeNull()
    expect(montarNotaReconversao({ ...reconv, deals: [] }, 'Xayane')).toBeNull()
  })
  it('lista cada deal com link, funil, etapa, marca, responsável e como foi achado', () => {
    const n = montarNotaReconversao(reconv, 'Xayane')!
    expect(n).toContain('2 deals abertos')
    expect(n).toContain('Identificado por: E-mail e Telefone.')
    expect(n).toContain('marca Eletrovias · funil Closer · etapa Negociação SAL · responsável Jéssica (mesmo telefone)')
    expect(n).toContain('https://crm.rdstation.com/app/deals/d1')
    expect(n).toContain('(mesmo e-mail)')
    expect(n).toContain('Este deal foi para Xayane, SDR que já atendeu este lead.')
  })
  it('SDR anterior fora: avisa que foi pelo rodízio e por quê', () => {
    const n = montarNotaReconversao({ ...reconv, sdr: null, deal_do_sdr: null, sdr_inelegiveis: ['Thiago inativo'] }, 'Sarah Padilha')!
    expect(n).toContain('Distribuído pelo rodízio: Thiago inativo.')
    expect(n).toContain('Identificado por: E-mail e Telefone.')
  })
})

describe('escolherContato', () => {
  it('prefere o ligado ao RD Marketing, depois o mais antigo', () => {
    const a: ContatoRd = { id: 'a', integrationId: null, criadoEm: '2026-10-01T00:00:00Z', deals: [] }
    const b: ContatoRd = { id: 'b', integrationId: 'x', criadoEm: '2026-10-20T00:00:00Z', deals: [] }
    const c: ContatoRd = { id: 'c', integrationId: null, criadoEm: '2026-09-01T00:00:00Z', deals: [] }
    expect(escolherContato([a, b, c])?.id).toBe('b')
    expect(escolherContato([a, c])?.id).toBe('c')
    expect(escolherContato([])).toBeNull()
  })
})

describe('buscarContatosPorEmail', () => {
  it('fica só com contato de e-mail igual, ignorando caixa', async () => {
    const f = fetchFixo(200, { contacts: [
      { _id: 'c1', integration_id: 'i', created_at: '2026-10-01', emails: [{ email: 'Lead@T.com' }], deals: [{ _id: 'd1' }] },
      { _id: 'c2', emails: [{ email: 'outro@t.com' }], deals: [] },
    ] })
    const r = await buscarContatosPorEmail(TOKEN, 'lead@t.com', { fetchImpl: f })
    expect(r).toEqual([{ id: 'c1', integrationId: 'i', criadoEm: '2026-10-01', deals: ['d1'] }])
  })
  it('erro do RD vira exceção sem o token', async () => {
    await expect(buscarContatosPorEmail(TOKEN, 'x@t.com', { fetchImpl: fetchFixo(401, { erro: TOKEN }) }))
      .rejects.toThrow(/HTTP 401/)
    await buscarContatosPorEmail(TOKEN, 'x@t.com', { fetchImpl: fetchFixo(401, { erro: TOKEN }) }).catch(e => {
      expect(String(e.message)).not.toContain(TOKEN)
    })
  })
})

describe('ligarDealAoContato', () => {
  it('manda PUT com todos os deals do contato mais o novo', async () => {
    const reg: Array<{ url: string; init?: RequestInit }> = []
    const f = fetchFixo(200, { deal_ids: ['d1', 'd9'] }, reg)
    const e = await ligarDealAoContato(TOKEN, { id: 'c1', integrationId: null, criadoEm: null, deals: ['d1'] }, 'd9', { fetchImpl: f })
    expect(e).toBeNull()
    expect(reg[0].init?.method).toBe('PUT')
    expect(reg[0].url).toContain('/contacts/c1?token=')
    expect(JSON.parse(String(reg[0].init?.body))).toEqual({ contact: { deal_ids: ['d1', 'd9'] } })
  })
  it('RD responde sem o deal novo: trata como erro', async () => {
    const e = await ligarDealAoContato(TOKEN, { id: 'c1', integrationId: null, criadoEm: null, deals: [] }, 'd9', { fetchImpl: fetchFixo(200, { deal_ids: [] }) })
    expect(e).toMatch(/não apareceu/)
  })
})

describe('montarCorpoDeal sem contato', () => {
  it('não manda contacts quando o contato vai ser reaproveitado', () => {
    const deal = {
      name: 'L', deal_stage_id: 'e', user_id: 'u', campaign_id: null, marca_rd: 'Viva', nome_sdr: 'Sarah Padilha',
      contato: { nome: 'L', email: 'l@t.com', telefone: null },
      utm: { source: null, medium: null, campaign: null, term: null, content: null },
      cidade: null, estado: null, capital: null, campos_extra: {},
    } as DealPronto
    expect(montarCorpoDeal(deal, true).contacts).toBeUndefined()
    expect(montarCorpoDeal(deal).contacts?.[0].emails[0].email).toBe('l@t.com')
  })
})

describe('montarNotaReconversao com rodapé', () => {
  it('troca só a última linha', () => {
    const n = montarNotaReconversao(reconv, null, 'Anotação feita depois.')!
    expect(n.endsWith('Anotação feita depois.')).toBe(true)
    expect(n).not.toContain('rodízio')
  })
})
