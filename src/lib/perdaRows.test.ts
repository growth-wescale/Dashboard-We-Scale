import { describe, it, expect } from 'vitest'
import { perdidos, dealsReceitaPerdida, computeKpis } from '@/lib/perdaRows'
import { toWindow, DEFAULT_VIEW_MODES } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])
const modes = DEFAULT_VIEW_MODES

function r(p: Partial<FunnelRow>): FunnelRow {
  return {
    id_lead: 'x', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Oral Unic', nome_funil: 'SDR', origem_comercial: 'Inbound',
    etapa_funil: null, id_etapa_atual: null, status_atual: 'Em andamento',
    nome_negociacao: null, nome_sdr: null, nome_closer: null,
    fonte_macro: null, sub_fonte: null, utm_source: null, sub_fonte_crm: null,
    valor_contrato: null, quantidade_unidades: null, motivo_perda: null,
    data_novo_mql: null, data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    ...p,
  }
}

describe('perdidos', () => {
  it('só conta deals com status atual Perdido e data_perdido na janela', () => {
    const rows = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-10' }),
      r({ id_lead: 'b', status_atual: 'Em andamento', data_perdido: null }),
      r({ id_lead: 'c', status_atual: 'Perdido', data_perdido: '2026-07-10' }), // fora da janela
    ]
    expect(perdidos(rows, win, modes).map(x => x.id_lead)).toEqual(['a'])
  })
})

describe('dealsReceitaPerdida', () => {
  it('só inclui perdidos que chegaram em Oportunidade ou depois', () => {
    const perdas = [
      r({ id_lead: 'a', data_oportunidade: '2026-08-01', valor_contrato: 1000 }),
      r({ id_lead: 'b', data_oportunidade: null, valor_contrato: 2000 }),
    ]
    expect(dealsReceitaPerdida(perdas).map(x => x.id_lead)).toEqual(['a'])
  })
})

describe('computeKpis', () => {
  it('calcula taxa de perda sobre o MQL do período, e conta em aberto no ciclo atual', () => {
    const scoped = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_novo_mql: '2026-08-01', data_perdido: '2026-08-05' }),
      r({ id_lead: 'b', status_atual: 'Em andamento', data_novo_mql: '2026-08-02' }),
      r({ id_lead: 'c', status_atual: 'Em andamento', data_novo_mql: '2026-08-03' }),
    ]
    const kpis = computeKpis(scoped, win, modes)
    expect(kpis.perdidasDeals).toBe(1)
    expect(kpis.mqlsPeriodo).toBe(3)
    expect(kpis.taxaPerda).toBeCloseTo(100 / 3, 5)
    expect(kpis.emAberto).toBe(2)
  })

  it('leadtime médio em dias úteis entre MQL e perda', () => {
    const scoped = [
      // segunda 09:00 -> quarta 09:00 = 2 dias úteis (9h seg + 9h ter, 0h qua antes das 9h)
      r({ id_lead: 'a', status_atual: 'Perdido', data_novo_mql: '2026-08-03T09:00:00-03:00', data_perdido: '2026-08-05T09:00:00-03:00' }),
    ]
    expect(computeKpis(scoped, win, modes).leadtimeDias).toBeCloseTo(2, 5)
  })

  it('etapa que mais perde respeita a trava "Reunião Agendada SQL só no Closer"', () => {
    const scoped = [
      // Perdido parado em "Reunião Agendada SQL" do funil do SDR (id errado)
      // — currentStage() descarta, não deve virar a etapa-top.
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-05', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: 'id-sdr' }),
      r({ id_lead: 'b', status_atual: 'Perdido', data_perdido: '2026-08-06', etapa_funil: 'Diagnóstico' }),
      r({ id_lead: 'c', status_atual: 'Perdido', data_perdido: '2026-08-07', etapa_funil: 'Diagnóstico' }),
    ]
    expect(computeKpis(scoped, win, modes).etapaTop).toBe('Diagnóstico')
  })

  it('receita perdida soma valor_contrato só de quem chegou em Oportunidade ou depois', () => {
    const scoped = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-05', data_oportunidade: '2026-08-01', valor_contrato: 5000 }),
      r({ id_lead: 'b', status_atual: 'Perdido', data_perdido: '2026-08-06', data_oportunidade: null, valor_contrato: 9999 }),
    ]
    expect(computeKpis(scoped, win, modes).receitaPerdida).toBe(5000)
  })
})
