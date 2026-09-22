import { describe, it, expect } from 'vitest'
import { computeEtapaAtual, dealsInEtapaAtual } from '@/lib/aging'
import type { PeriodWindow } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-08-14T12:00:00Z').getTime()
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

/** Id da etapa "Reunião Agendada SQL" no funil do Closer — a única que conta. */
const SQL_CLOSER = '69b1badfe1def700137f1b89'

const fakeRow = (over: Partial<FunnelRow>): FunnelRow => ({
  id_lead: 'd1',
  ciclo: 1,
  eh_reciclagem: false,
  eh_ciclo_atual: true,
  marca: 'Oral Unic',
  nome_funil: 'Oral Unic',
  origem_comercial: 'Inbound',
  etapa_funil: 'Contato Efetivo',
  status_atual: 'Em andamento',
  nome_negociacao: 'Deal 1',
  nome_sdr: 'Xayane',
  nome_closer: null,
  fonte_macro: 'Inbound',
  sub_fonte: null,
  utm_source: null,
  valor_contrato: null,
  quantidade_unidades: null,
  valor_produto: null,
  motivo_perda: null,
  data_novo_mql: diasAtras(20),
  data_tentando_contato: null,
  data_contato_efetivo: diasAtras(10),
  data_interesse_reuniao: null,
  data_conexao: null,
  data_agendamento_reuniao_sql: null,
  data_reuniao_realizada: null,
  data_no_show: null,
  data_sal: null,
  data_oportunidade: null,
  data_comite: null,
  data_pre_contrato: null,
  data_venda: null,
  data_perdido: null,
  ...over,
})

/** Janela de período por range de datas (o caminho que a Visão Macro usa). */
const janela = (from: string, to: string): PeriodWindow => ({
  activePeriods: new Set(),
  dateRange: { from, to },
  ranges: null,
})

// AGORA = 14/08/2026; MQL de 20 dias atrás = 25/07/2026.
const AGOSTO = janela('2026-08-01', '2026-08-31')
const JULHO = janela('2026-07-01', '2026-07-31')

describe('computeEtapaAtual — modo Atual (sem recorte de período)', () => {
  it('agrupa os negócios vivos pela etapa em que estão agora', () => {
    const rows = [
      fakeRow({ id_lead: 'a', etapa_funil: 'Contato Efetivo' }),
      fakeRow({ id_lead: 'b', etapa_funil: 'Contato Efetivo' }),
      fakeRow({ id_lead: 'c', etapa_funil: 'SAL', data_sal: diasAtras(4) }),
    ]
    const r = computeEtapaAtual(rows, null, AGORA)
    expect(r.get('Contato Efetivo')?.deals).toBe(2)
    expect(r.get('SAL')?.deals).toBe(1)
  })

  it('ignora Ganho, Perdido e ciclo antigo', () => {
    const rows = [
      fakeRow({ id_lead: 'vivo' }),
      fakeRow({ id_lead: 'ganho', status_atual: 'Ganho' }),
      fakeRow({ id_lead: 'perdido', status_atual: 'Perdido' }),
      fakeRow({ id_lead: 'antigo', eh_ciclo_atual: false }),
    ]
    expect(computeEtapaAtual(rows, null, AGORA).get('Contato Efetivo')?.deals).toBe(1)
  })

  it('inclui deal sem MQL — o modo Atual não recorta por safra', () => {
    const rows = [fakeRow({ id_lead: 'sem-mql', data_novo_mql: null })]
    const agg = computeEtapaAtual(rows, null, AGORA).get('Contato Efetivo')
    expect(agg?.deals).toBe(1)
    expect(agg?.mediaAndamento).toBeNull()
  })

  it('média na etapa e média em andamento saem das datas da própria linha', () => {
    const rows = [
      fakeRow({ id_lead: 'a', data_contato_efetivo: diasAtras(10), data_novo_mql: diasAtras(20) }),
      fakeRow({ id_lead: 'b', data_contato_efetivo: diasAtras(20), data_novo_mql: diasAtras(40) }),
    ]
    const agg = computeEtapaAtual(rows, null, AGORA).get('Contato Efetivo')
    expect(agg?.mediaEtapa).toBeCloseTo(15, 5)
    expect(agg?.mediaAndamento).toBeCloseTo(30, 5)
  })

  it('não inventa aging com data futura, mas o deal segue contando', () => {
    const rows = [fakeRow({ data_contato_efetivo: new Date(AGORA + 86_400_000).toISOString() })]
    const agg = computeEtapaAtual(rows, null, AGORA).get('Contato Efetivo')
    expect(agg?.deals).toBe(1)
    expect(agg?.mediaEtapa).toBeNull()
  })

  it('"Reunião Agendada SQL" só conta no funil do Closer', () => {
    const rows = [
      fakeRow({ id_lead: 'closer', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: SQL_CLOSER }),
      fakeRow({ id_lead: 'sdr', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: 'etapa-do-sdr' }),
    ]
    expect(computeEtapaAtual(rows, null, AGORA).get('Reunião Agendada SQL')?.deals).toBe(1)
  })
})

describe('computeEtapaAtual — modo Aging (safra do período)', () => {
  it('conta só os negócios cujo MQL caiu na janela', () => {
    const rows = [
      fakeRow({ id_lead: 'jul', data_novo_mql: '2026-07-25T12:00:00Z' }),
      fakeRow({ id_lead: 'ago', data_novo_mql: '2026-08-10T12:00:00Z' }),
    ]
    expect(computeEtapaAtual(rows, AGOSTO, AGORA).get('Contato Efetivo')?.deals).toBe(1)
    expect(computeEtapaAtual(rows, JULHO, AGORA).get('Contato Efetivo')?.deals).toBe(1)
    expect(computeEtapaAtual(rows, null, AGORA).get('Contato Efetivo')?.deals).toBe(2)
  })

  it('a etapa é a de HOJE, não a que o deal tinha no período', () => {
    // MQL em agosto, hoje já está em SAL: conta em SAL, não em MQL.
    const rows = [fakeRow({
      etapa_funil: 'SAL',
      data_novo_mql: '2026-08-02T12:00:00Z',
      data_sal: '2026-08-12T12:00:00Z',
    })]
    const r = computeEtapaAtual(rows, AGOSTO, AGORA)
    expect(r.get('SAL')?.deals).toBe(1)
    expect(r.has('MQL')).toBe(false)
  })

  it('deal sem MQL fica fora da safra', () => {
    const rows = [fakeRow({ data_novo_mql: null })]
    expect(computeEtapaAtual(rows, AGOSTO, AGORA).size).toBe(0)
  })

  it('não conta negócio já fechado, mesmo com MQL na janela', () => {
    const rows = [
      fakeRow({ id_lead: 'vivo', data_novo_mql: '2026-08-05T12:00:00Z' }),
      fakeRow({ id_lead: 'ganho', status_atual: 'Ganho', data_novo_mql: '2026-08-05T12:00:00Z' }),
    ]
    expect(computeEtapaAtual(rows, AGOSTO, AGORA).get('Contato Efetivo')?.deals).toBe(1)
  })
})

describe('dealsInEtapaAtual', () => {
  it('devolve exatamente as linhas que computeEtapaAtual conta', () => {
    const rows = [
      fakeRow({ id_lead: 'a', data_novo_mql: '2026-08-02T12:00:00Z' }),
      fakeRow({ id_lead: 'b', data_novo_mql: '2026-08-03T12:00:00Z' }),
      fakeRow({ id_lead: 'fora', data_novo_mql: '2026-07-03T12:00:00Z' }),
      fakeRow({ id_lead: 'morto', status_atual: 'Perdido', data_novo_mql: '2026-08-04T12:00:00Z' }),
    ]
    const lista = dealsInEtapaAtual(rows, 'Contato Efetivo', AGOSTO)
    expect(lista.map(d => d.row.id_lead)).toEqual(['a', 'b'])
    expect(lista.length).toBe(computeEtapaAtual(rows, AGOSTO, AGORA).get('Contato Efetivo')?.deals)
  })

  it('carrega a data de entrada na etapa clicada', () => {
    const rows = [fakeRow({ data_sal: diasAtras(3), etapa_funil: 'SAL' })]
    expect(dealsInEtapaAtual(rows, 'SAL', null)[0].dataEtapa).toBe(diasAtras(3))
  })

  it('sem janela devolve todo negócio em aberto na etapa', () => {
    const rows = [
      fakeRow({ id_lead: 'a', data_novo_mql: '2026-07-03T12:00:00Z' }),
      fakeRow({ id_lead: 'b', data_novo_mql: '2026-08-03T12:00:00Z' }),
    ]
    expect(dealsInEtapaAtual(rows, 'Contato Efetivo', null).map(d => d.row.id_lead)).toEqual(['a', 'b'])
  })
})
