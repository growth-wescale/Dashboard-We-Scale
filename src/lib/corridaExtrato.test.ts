import { describe, it, expect } from 'vitest'
import { lancamentosCloser, lancamentosSdr, type RrUnidade, type VendaUnidade } from './corridaPerformance'
import {
  contaTexto,
  diasTexto,
  fatorBonus,
  fatorFonte,
  fatorTicket,
  fatorVelocidade,
  mesDaData,
  motivoForaCorrida,
  pontosTexto,
  situacaoCloser,
  situacaoSdr,
  type CorridaDoMes,
  type NegocioCorrida,
  type PessoaCadastro,
} from './corridaExtrato'

const rrBase: RrUnidade = {
  nome: 'Sarah Padilha', idLead: 'd1', ciclo: 1, negociacao: 'Clínica X',
  fonte: 'Inbound', marca: 'Oral Unic',
  dataMql: '2026-10-13T12:00:00Z', dataAgendamento: '2026-10-13T21:36:00Z', // 0,4 dia
  dataRr: '2026-10-14T15:00:00Z',
}
const sdr = (extra: Partial<RrUnidade> = {}) => lancamentosSdr([{ ...rrBase, ...extra }], ['Sarah Padilha'])[0]

const vendaBase: VendaUnidade = {
  nome: 'Douglas', idLead: 'v1', ciclo: 1, negociacao: 'Venda Y', fonte: 'Inbound', marca: 'Inpot',
  dataRr: '2026-10-01T12:00:00Z', dataVenda: '2026-10-16T12:00:00Z', unidades: 1, // 15 dias
}

const cadastro: PessoaCadastro[] = [
  { nome: 'Sarah Padilha', cargo: 'SDR', ativo: true },
  { nome: 'Thiago', cargo: 'SDR', ativo: false },
  { nome: 'Bruna', cargo: 'Closer', ativo: true },
  { nome: 'Vanessa Daniel', cargo: 'SDR', ativo: true },
]

describe('textos dos fatores', () => {
  it('conta do exemplo: 1 pt × 1,75 (Oral Unic) × 1,5 (agendou 0,4 dia após o MQL) = 2,63 pts', () => {
    expect(contaTexto(sdr())).toBe('1 pt (Inbound) × 1,75 (Oral Unic) × 1,5 (agendou 0,4 dia após o MQL) = 2,63 pts')
  })

  it('cada fator diz o porquê e quanto vale', () => {
    const l = sdr()
    expect(fatorFonte(l)).toEqual({ motivo: 'Inbound', valor: '1 pt' })
    expect(fatorBonus(l)).toEqual({ motivo: 'só 1 RR no dia', valor: 'sem bônus' })
    expect(fatorTicket(l)).toEqual({ motivo: 'Oral Unic · R$ 501 mil – 1 milhão', valor: '×1,75' })
    expect(fatorVelocidade(l)).toEqual({ motivo: 'agendou 0,4 dia após o MQL · Resposta Relâmpago', valor: '×1,5' })
    expect(fatorFonte(sdr({ fonte: 'Resgate' }))).toEqual({ motivo: 'Resgate', valor: '2 pts' })
    expect(fatorFonte(sdr({ fonte: null }))).toEqual({ motivo: 'sem Fonte Macro', valor: '1 pt' })
  })

  it('sem data de MQL → neutro, na coluna e na conta', () => {
    const l = sdr({ dataMql: null })
    expect(fatorVelocidade(l)).toEqual({ motivo: 'sem data de MQL → neutro', valor: '×1,0' })
    expect(contaTexto(l)).toBe('1 pt (Inbound) × 1,75 (Oral Unic) × 1,0 (sem data de MQL → neutro) = 1,75 pts')
  })

  it('marca fora da tabela de ticket aparece como padrão', () => {
    expect(fatorTicket(sdr({ marca: 'Odonto Scale' }))).toEqual({ motivo: 'Odonto Legacy · marca sem faixa de ticket (padrão)', valor: '×1,0' })
  })

  it('bônus do dia diz quantas RR foram', () => {
    const [a] = lancamentosSdr([rrBase, { ...rrBase, idLead: 'd2', dataRr: '2026-10-14T20:00:00Z' }], ['Sarah Padilha'])
    expect(fatorBonus(a)).toEqual({ motivo: '2 RR no dia', valor: '×1,5' })
    expect(contaTexto(a)).toBe('1 pt (Inbound) × 1,5 (mesmo dia) × 1,75 (Oral Unic) × 1,5 (agendou 0,4 dia após o MQL) = 3,94 pts')
  })

  it('Closer: venda de 2 unidades numa linha, com bônus e × unidades', () => {
    const [l] = lancamentosCloser([{ ...vendaBase, unidades: 2 }], ['Douglas'])
    expect(fatorBonus(l)).toEqual({ motivo: '2 unidades nesta venda', valor: '×1,5' })
    expect(fatorVelocidade(l)).toEqual({ motivo: 'fechou 15 dias após a reunião realizada · Ritmo Ideal', valor: '×1,2' })
    expect(contaTexto(l)).toBe('1 pt (Inbound) × 1,5 (mesmo dia) × 1,5 (Inpot) × 1,2 (fechou 15 dias após a reunião realizada) × 2 unidades = 5,4 pts')
  })

  it('Closer: unidades do dia somando outra venda', () => {
    const [l] = lancamentosCloser([{ ...vendaBase, unidades: 2 }, { ...vendaBase, idLead: 'v2' }], ['Douglas'])
    expect(fatorBonus(l)).toEqual({ motivo: '3 unidades no dia (esta e outras vendas)', valor: '×1,5' })
  })

  it('formatação de dias e pontos', () => {
    expect(diasTexto(0.36)).toBe('0,4 dia')
    expect(diasTexto(1)).toBe('1 dia')
    expect(diasTexto(2.34)).toBe('2,3 dias')
    expect(pontosTexto(1)).toBe('1 pt')
    expect(pontosTexto(2.625)).toBe('2,63 pts')
    expect(pontosTexto(3)).toBe('3 pts')
  })
})

describe('motivoForaCorrida', () => {
  it('sem responsável', () => {
    expect(motivoForaCorrida('sdr', null, '2026-10-01', cadastro)).toBe('Negócio sem SDR no RD: a reunião não pontua para ninguém.')
    expect(motivoForaCorrida('closer', '  ', '2026-10-01', cadastro)).toBe('Venda sem Closer no RD: não pontua para ninguém.')
  })
  it('sem meta no mês, com cargo e situação no cadastro', () => {
    expect(motivoForaCorrida('sdr', 'Thiago', '2026-10-01', cadastro))
      .toBe('Thiago não tem meta de SDR em outubro de 2026 (versão das metas em vigor). Só quem tem meta no mês participa da Corrida. Thiago está inativo no cadastro.')
    expect(motivoForaCorrida('closer', 'Vanessa Daniel', '2026-10-01', cadastro))
      .toBe('Vanessa Daniel não tem meta de Closer em outubro de 2026 (versão das metas em vigor). Só quem tem meta no mês participa da Corrida. No cadastro, Vanessa Daniel está como SDR.')
  })
  it('nome fora do cadastro', () => {
    expect(motivoForaCorrida('sdr', 'Fulano', '2026-09-01', cadastro))
      .toBe('Fulano não está no cadastro de pessoas do time nem tem meta de SDR em setembro de 2026.')
  })
})

describe('situação de um negócio no pop-up', () => {
  const negocio = (extra: Partial<NegocioCorrida> = {}): NegocioCorrida => ({
    id_lead: 'd1', ciclo: 1, nome_sdr: 'Sarah Padilha', nome_closer: 'Douglas', status_atual: 'Em andamento',
    data_reuniao_realizada: '2026-10-14T15:00:00Z', data_venda: null, ...extra,
  })
  const outubro: CorridaDoMes = {
    mes: '2026-10-01',
    pilotosSdr: ['Sarah Padilha', 'Xayane'],
    pilotosCloser: ['Douglas'],
    lancamentosSdr: lancamentosSdr([rrBase, { ...rrBase, idLead: 'd9', dataRr: '2026-10-20T15:00:00Z', marca: 'B2Case' }], ['Sarah Padilha', 'Xayane']),
    lancamentosCloser: lancamentosCloser([{ ...vendaBase, idLead: 'd1' }], ['Douglas']),
  }

  it('pontuou: devolve o lançamento do negócio + ciclo e o total da pessoa no mês', () => {
    const s = situacaoSdr(negocio(), outubro, cadastro)
    expect(s.tipo).toBe('pontuou')
    if (s.tipo !== 'pontuou') return
    expect(s.lancamento.idLead).toBe('d1')
    expect(s.mes).toBe('2026-10-01')
    expect(s.totalPessoaMes).toBe(4.1) // 2,625 + 1,5 (B2Case, 1 × 1,0 × 1,5)
  })

  it('outro ciclo do mesmo negócio não pega o lançamento', () => {
    const s = situacaoSdr(negocio({ ciclo: 2 }), outubro, cadastro)
    expect(s).toEqual({ tipo: 'nao_pontuou', motivo: expect.stringContaining('ainda não aparece na Corrida de outubro de 2026') })
  })

  it('pede os dados do mês antes de responder', () => {
    expect(situacaoSdr(negocio(), null, cadastro)).toEqual({ tipo: 'precisa_mes', mes: '2026-10-01' })
  })

  it('motivos da trilha SDR', () => {
    expect(situacaoSdr(negocio({ data_reuniao_realizada: null }), outubro, cadastro))
      .toEqual({ tipo: 'nao_pontuou', motivo: 'Ainda sem reunião realizada (Diagnóstico). A trilha SDR pontua quando a reunião acontece.' })
    expect(situacaoSdr(negocio({ data_reuniao_realizada: null, status_atual: 'Perdido' }), outubro, cadastro))
      .toEqual({ tipo: 'nao_pontuou', motivo: 'Este ciclo do negócio não teve reunião realizada (Diagnóstico) registrada, e a trilha SDR só pontua reunião realizada.' })
    expect(situacaoSdr(negocio({ data_reuniao_realizada: '2026-08-20T15:00:00Z' }), outubro, cadastro))
      .toEqual({ tipo: 'nao_pontuou', motivo: 'Reunião realizada em 20/08/2026, antes de a Corrida começar (setembro de 2026).' })
    expect(situacaoSdr(negocio({ id_lead: 'x', nome_sdr: 'Thiago' }), outubro, cadastro).tipo).toBe('nao_pontuou')
    expect(situacaoSdr(negocio({ id_lead: 'x', nome_sdr: null }), outubro, cadastro))
      .toEqual({ tipo: 'nao_pontuou', motivo: 'Negócio sem SDR no RD: a reunião não pontua para ninguém.' })
  })

  it('motivos da trilha Closer', () => {
    expect(situacaoCloser(negocio(), outubro, cadastro).tipo).toBe('nao_pontuou')
    expect(situacaoCloser(negocio({ status_atual: 'Perdido' }), outubro, cadastro))
      .toEqual({ tipo: 'nao_pontuou', motivo: 'Negócio perdido: não houve venda.' })
    expect(situacaoCloser(negocio({ status_atual: 'Perdido', data_venda: '2026-10-16T12:00:00Z' }), outubro, cadastro).tipo).toBe('nao_pontuou')
    const ganho = situacaoCloser(negocio({ status_atual: 'Ganho', data_venda: '2026-10-16T12:00:00Z' }), outubro, cadastro)
    expect(ganho.tipo).toBe('pontuou')
    expect(situacaoCloser(negocio({ status_atual: 'Ganho', data_venda: '2026-11-02T12:00:00Z' }), outubro, cadastro))
      .toEqual({ tipo: 'precisa_mes', mes: '2026-11-01' })
  })

  it('mês da data em Brasília', () => {
    expect(mesDaData('2026-10-01T02:30:00Z')).toBe('2026-09-01') // 30/09 23h30 em Brasília
    expect(mesDaData(null)).toBeNull()
  })
})

describe('negociação retomada no extrato', () => {
  it('fonte → peso explica a retomada e mostra a Fonte Macro do RD', () => {
    const l = sdr({ ciclo: 2 })
    expect(fatorFonte(l)).toEqual({ motivo: 'Negociação retomada (resgate) · no RD: Inbound', valor: '2 pts' })
    expect(contaTexto(l)).toBe('2 pts (negociação retomada) × 1,75 (Oral Unic) × 1,5 (agendou 0,4 dia após o MQL) = 5,25 pts')
  })
  it('retomada com Fonte Macro Resgate não repete a fonte', () => {
    expect(fatorFonte(sdr({ ciclo: 2, fonte: 'Resgate' }))).toEqual({ motivo: 'Negociação retomada (resgate)', valor: '2 pts' })
  })
})
