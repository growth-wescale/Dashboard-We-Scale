import { describe, it, expect } from 'vitest'
import { limitesDoMes, separarRrs, separarVendas, type RawRr, type RawVenda } from './corridaDados'

const rr = (extra: Partial<RawRr>): RawRr => ({
  id_lead: 'd1', ciclo: 1, nome_negociacao: 'Negócio', nome_sdr: 'Sarah Padilha', fonte_macro: 'Inbound',
  marca: 'Oral Unic', data_novo_mql: '2026-10-01T12:00:00Z', data_agendamento_reuniao_sql: '2026-10-02T12:00:00Z',
  data_reuniao_realizada: '2026-10-05T15:00:00Z', ...extra,
})
const venda = (extra: Partial<RawVenda>): RawVenda => ({
  id_lead: 'v1', ciclo: 1, nome_negociacao: 'Venda', nome_closer: 'Douglas', fonte_macro: 'Inbound',
  marca: 'Inpot', quantidade_unidades: 2, data_reuniao_realizada: '2026-10-01T12:00:00Z',
  data_venda: '2026-10-20T15:00:00Z', ...extra,
})

describe('separarRrs', () => {
  it('piloto vira unidade com o nome canônico e o negócio junto', () => {
    const { unidades, fora } = separarRrs([rr({ nome_sdr: '  sarah padilha ' })], ['Sarah Padilha'])
    expect(fora).toEqual([])
    expect(unidades).toEqual([{
      nome: 'Sarah Padilha', idLead: 'd1', ciclo: 1, negociacao: 'Negócio', fonte: 'Inbound', marca: 'Oral Unic',
      dataMql: '2026-10-01T12:00:00Z', dataAgendamento: '2026-10-02T12:00:00Z', dataRr: '2026-10-05T15:00:00Z',
    }])
  })

  it('sem SDR ou SDR sem meta no mês vai pra "não pontuou", com o nome do RD', () => {
    const { unidades, fora } = separarRrs([
      rr({ id_lead: 'a', nome_sdr: null }),
      rr({ id_lead: 'b', nome_sdr: 'Thiago' }),
      rr({ id_lead: 'c', nome_sdr: '   ' }),
    ], ['Sarah Padilha'])
    expect(unidades).toEqual([])
    expect(fora.map(f => [f.idLead, f.nome, f.trilha, f.unidades])).toEqual([
      ['a', null, 'sdr', 1], ['b', 'Thiago', 'sdr', 1], ['c', null, 'sdr', 1],
    ])
  })

  it('fora da janela não entra nem como "não pontuou"', () => {
    const janelas = [{ inicio: '2026-10-06', fim: '2026-10-12' }]
    const { unidades, fora } = separarRrs([rr({}), rr({ nome_sdr: null })], ['Sarah Padilha'], janelas)
    expect(unidades).toEqual([])
    expect(fora).toEqual([])
  })
})

describe('separarVendas', () => {
  it('unidades pela quantidade do produto; sem produto conta 1', () => {
    const { unidades } = separarVendas([venda({}), venda({ id_lead: 'v2', quantidade_unidades: null })], ['Douglas'])
    expect(unidades.map(u => [u.idLead, u.unidades])).toEqual([['v1', 2], ['v2', 1]])
  })

  it('venda sem Closer ou de quem não tem meta vira "não pontuou" com as unidades', () => {
    const { unidades, fora } = separarVendas([venda({ nome_closer: null }), venda({ id_lead: 'v3', nome_closer: 'Thaina Freitas', quantidade_unidades: 3 })], ['Douglas'])
    expect(unidades).toEqual([])
    expect(fora.map(f => [f.idLead, f.nome, f.trilha, f.unidades])).toEqual([['v1', null, 'closer', 2], ['v3', 'Thaina Freitas', 'closer', 3]])
  })
})

describe('limitesDoMes', () => {
  it('mês inteiro em Brasília', () => {
    expect(limitesDoMes('2026-09-01')).toEqual({ inicio: '2026-09-01T00:00:00-03:00', fim: '2026-09-30T23:59:59.999-03:00' })
    expect(limitesDoMes('2026-02-01').fim).toBe('2026-02-28T23:59:59.999-03:00')
    expect(limitesDoMes('2026-12-01').fim).toBe('2026-12-31T23:59:59.999-03:00')
  })
})
