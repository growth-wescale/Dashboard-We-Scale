import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIEW_MODES, countSales, countStage, countStageEvents, noEscopoDoCiclo, sumRevenue, toWindow,
  type FunnelEventRow, type ViewModes,
} from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { mesesDoComparativo, referenciaMtd, serieMtd, type MetricaMtd } from '@/lib/mtdSeries'

function row(over: Partial<FunnelRow> = {}): FunnelRow {
  return {
    id_lead: 'd1', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true, marca: 'Inpot', nome_funil: 'SDR',
    etapa_funil: null, status_atual: 'Em andamento', nome_sdr: null, nome_closer: null, nome_negociacao: null,
    fonte_macro: null, sub_fonte: null, utm_source: null, valor_contrato: null, quantidade_unidades: null,
    valor_produto: null, motivo_perda: null, data_novo_mql: null, data_tentando_contato: null,
    data_contato_efetivo: null, data_interesse_reuniao: null, data_conexao: null,
    data_agendamento_reuniao_sql: null, data_reuniao_realizada: null, data_no_show: null, data_sal: null,
    data_oportunidade: null, data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    origem_comercial: 'Inbound', ...over,
  } as FunnelRow
}

const SQL_CLOSER = '69b1badfe1def700137f1b89'
const ev = (id: string, dia: string, etapa: string, over: Partial<FunnelEventRow> = {}): FunnelEventRow =>
  ({ id_deal: id, dia, etapa_canonica: etapa, ciclo: 1, id_etapa: null, marca_deal: 'Inpot', ...over })

const rows: FunnelRow[] = [
  row({ id_lead: 'a', data_novo_mql: '2026-10-02T13:00:00+00:00', status_atual: 'Ganho', data_venda: '2026-10-05T15:00:00+00:00', valor_contrato: 100, quantidade_unidades: 2 }),
  row({ id_lead: 'b', data_novo_mql: '2026-10-02T02:00:00+00:00' }), // 01/10 23h em Brasília
  row({ id_lead: 'c', data_novo_mql: '2026-10-09T13:00:00+00:00', status_atual: 'Ganho', data_venda: '2026-10-09T13:00:00+00:00', valor_contrato: 50 }),
  row({ id_lead: 'd', data_novo_mql: '2026-09-03T13:00:00+00:00', status_atual: 'Perdido', data_venda: '2026-09-04T13:00:00+00:00' }),
  row({ id_lead: 'fora', data_novo_mql: '2026-10-03T13:00:00+00:00' }),
]
const scoped = rows.filter(r => r.id_lead !== 'fora')
const eventos: FunnelEventRow[] = [
  ev('a', '2026-10-03', 'Diagnóstico'),
  ev('a', '2026-10-07', 'Diagnóstico'), // reentrada: conta só em Passagens
  ev('b', '2026-10-04', 'Diagnóstico'),
  ev('fora', '2026-10-04', 'Diagnóstico'), // fora do escopo da barra
  ev('a', '2026-10-02', 'Reunião Agendada SQL', { id_etapa: SQL_CLOSER }),
  ev('b', '2026-10-02', 'Reunião Agendada SQL', { id_etapa: 'etapa-do-sdr' }), // funil errado: não conta
  ev('c', '2026-10-08', 'SAL'),
]

const ctx = (modes: ViewModes) => ({ scoped, eventos, modes, extra: noEscopoDoCiclo(scoped) })

/** O mesmo número que o card daria com o período "dia 1 até o dia N". */
function doCard(m: MetricaMtd, ate: string, modes: ViewModes): number {
  const win = toWindow(null, null, [{ from: '2026-10-01', to: ate }])
  const o = { extra: noEscopoDoCiclo(scoped) }
  switch (m) {
    case 'mql': return countStage(scoped, 'MQL', win, modes)
    case 'sql': return countStageEvents(eventos, 'Reunião Agendada SQL', win, modes, o)
    case 'diag': return countStageEvents(eventos, 'Diagnóstico', win, modes, o)
    case 'sal': return countStageEvents(eventos, 'SAL', win, modes, o)
    case 'cof': return countStageEvents(eventos, 'Oportunidade COF', win, modes, o)
    case 'noShow': return countStageEvents(eventos, 'No Show', win, modes, o)
    case 'fech': return countSales(scoped, win, modes)
    case 'receita': return sumRevenue(scoped, win, modes)
  }
}

describe('serieMtd', () => {
  const metricas: MetricaMtd[] = ['mql', 'sql', 'diag', 'sal', 'cof', 'noShow', 'fech', 'receita']
  const variantes: ViewModes[] = [
    DEFAULT_VIEW_MODES,
    { ...DEFAULT_VIEW_MODES, eventSource: 'passages' },
    { ...DEFAULT_VIEW_MODES, salesMode: 'units' },
  ]

  it('cada ponto bate com o card no período dia 1 → dia N', () => {
    for (const modes of variantes) {
      for (const m of metricas) {
        const serie = serieMtd(m, { mesKey: '2026-10', dias: 10 }, ctx(modes))
        serie.forEach((v, i) => {
          expect(v, `${m} dia ${i + 1} (${modes.eventSource}/${modes.salesMode})`)
            .toBe(doCard(m, `2026-10-${String(i + 1).padStart(2, '0')}`, modes))
        })
      }
    }
  })

  it('Deals únicos conta a reentrada uma vez só; Passagens conta as duas', () => {
    expect(serieMtd('diag', { mesKey: '2026-10', dias: 10 }, ctx(DEFAULT_VIEW_MODES)).at(-1)).toBe(2)
    expect(serieMtd('diag', { mesKey: '2026-10', dias: 10 }, ctx({ ...DEFAULT_VIEW_MODES, eventSource: 'passages' })).at(-1)).toBe(3)
  })

  it('MQL usa o dia em Brasília e venda só com status Ganho', () => {
    const mql = serieMtd('mql', { mesKey: '2026-10', dias: 3 }, ctx(DEFAULT_VIEW_MODES))
    expect(mql).toEqual([1, 2, 2])
    expect(serieMtd('fech', { mesKey: '2026-09', dias: 30 }, ctx(DEFAULT_VIEW_MODES)).at(-1)).toBe(0)
  })
})

describe('mesesDoComparativo', () => {
  it('referência + 3 anteriores, cortados no mesmo dia ou no fim do mês', () => {
    expect(mesesDoComparativo('2026-03', 31)).toEqual([
      { mesKey: '2026-03', dias: 31 },
      { mesKey: '2026-02', dias: 28 },
      { mesKey: '2026-01', dias: 31 },
      { mesKey: '2025-12', dias: 31 },
    ])
    expect(mesesDoComparativo('2026-11', 10).map(m => m.dias)).toEqual([10, 10, 10, 10])
  })
})

describe('referenciaMtd', () => {
  it('mês em curso vai até o fim da janela; mês fechado vai inteiro', () => {
    expect(referenciaMtd('2026-11', '2026-11-10')).toEqual({ mesKey: '2026-11', dia: 10 })
    expect(referenciaMtd('2026-09', '2026-09-30')).toEqual({ mesKey: '2026-09', dia: 30 })
  })
  it('fora de um mês único usa o mês do fim do período', () => {
    expect(referenciaMtd(null, '2026-09-30')).toEqual({ mesKey: '2026-09', dia: 30 })
    expect(referenciaMtd(null, '2026-11-10')).toEqual({ mesKey: '2026-11', dia: 10 })
  })
})
