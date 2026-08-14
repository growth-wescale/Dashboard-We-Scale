import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIEW_MODES,
  STAGE_ORDER,
  buildScopeFilter,
  cohortKeys,
  conversion,
  countSales,
  countStage,
  countStageEvents,
  dealKey,
  isInWindow,
  resolveStage,
  sumRevenue,
  toWindow,
  type FunnelEventRow,
  type ViewModes,
} from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Linha mínima do funil; sobrescreva só o que o teste precisa. */
function row(over: Partial<FunnelRow> = {}): FunnelRow {
  return {
    id_lead: 'd1',
    ciclo: 1,
    eh_reciclagem: false,
    eh_ciclo_atual: true,
    marca: 'Inpot',
    nome_funil: 'SDR',
    etapa_funil: null,
    status_atual: 'Em andamento',
    nome_sdr: null,
    nome_closer: null,
    fonte_macro: null,
    sub_fonte: null,
    utm_source: null,
    valor_contrato: null,
    quantidade_unidades: null,
    motivo_perda: null,
    data_novo_mql: null,
    data_tentando_contato: null,
    data_contato_efetivo: null,
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
  } as FunnelRow
}

const AGOSTO = toWindow(null, { from: '2026-08-01', to: '2026-08-14' })
const modes = (over: Partial<ViewModes> = {}): ViewModes => ({ ...DEFAULT_VIEW_MODES, ...over })

// ── Janela de período ──────────────────────────────────────────────────────

describe('isInWindow', () => {
  it('aceita data dentro do range', () => {
    expect(isInWindow('2026-08-05T10:00:00+00:00', AGOSTO)).toBe(true)
  })

  it('rejeita data fora do range', () => {
    expect(isInWindow('2026-07-31T10:00:00+00:00', AGOSTO)).toBe(false)
  })

  it('rejeita nulo', () => {
    expect(isInWindow(null, AGOSTO)).toBe(false)
  })

  it('converte para horário de Brasília, não UTC', () => {
    // 2026-08-15T02:00Z == 2026-08-14 23:00 em BRT (UTC-3) → dentro da janela
    expect(isInWindow('2026-08-15T02:00:00+00:00', AGOSTO)).toBe(true)
    // 2026-08-01T02:00Z == 2026-07-31 23:00 em BRT → fora da janela
    expect(isInWindow('2026-08-01T02:00:00+00:00', AGOSTO)).toBe(false)
  })

  it('filtra por conjunto de meses quando não há range', () => {
    const win = toWindow(new Set(['2026-08']), null)
    expect(isInWindow('2026-08-20T10:00:00+00:00', win)).toBe(true)
    expect(isInWindow('2026-07-20T10:00:00+00:00', win)).toBe(false)
  })

  it('aceita os formatos de timestamptz que o Postgres devolve', () => {
    // Data que não parseia vira null e a etapa zera silenciosamente — daí travar
    // os formatos aqui. O cliente supabase-js entrega ISO com offset completo;
    // dumps e queries diretas usam espaço no lugar do "T".
    expect(isInWindow('2026-08-05T10:00:00.123456+00:00', AGOSTO)).toBe(true)
    expect(isInWindow('2026-08-05 10:00:00.123456+00', AGOSTO)).toBe(true)
    expect(isInWindow('2026-08-05T10:00:00Z', AGOSTO)).toBe(true)
  })
})

// ── Catálogo de etapas ─────────────────────────────────────────────────────

describe('etapas', () => {
  it('tem as 12 etapas na ordem do funil', () => {
    expect(STAGE_ORDER).toEqual([
      'MQL',
      'Tentando Contato',
      'Contato Efetivo',
      'Interesse Reunião',
      'Conexão',
      'Reunião Agendada SQL',
      'Diagnóstico',
      'SAL',
      'Oportunidade COF',
      'Comitê',
      'Pré-Contrato',
      'Fechamento',
    ])
  })

  it('resolve os rótulos crus do RD para a etapa canônica', () => {
    // Estes vêm de etapa_funil no modo "Funil Atual" e quebrariam a contagem sem alias.
    expect(resolveStage('Diagnóstico (1 dia)')).toBe('Diagnóstico')
    expect(resolveStage('Negociação SAL (7 dias)')).toBe('SAL')
    expect(resolveStage('Tentando Contato (Cadência)')).toBe('Tentando Contato')
    expect(resolveStage('Oportunidade COF (7 dias)')).toBe('Oportunidade COF')
    expect(resolveStage('Pré Contrato (5 dias)')).toBe('Pré-Contrato')
    expect(resolveStage('Reunião Agendada')).toBe('Reunião Agendada SQL')
    expect(resolveStage('Novo MQL')).toBe('MQL')
  })

  it('devolve null para rótulo desconhecido', () => {
    expect(resolveStage('Etapa Que Não Existe')).toBeNull()
    expect(resolveStage(null)).toBeNull()
  })
})

// ── Trava de venda ─────────────────────────────────────────────────────────

describe('trava de venda', () => {
  it('não conta deal com data_venda mas status diferente de Ganho', () => {
    const rows = [row({ data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Perdido' })]
    expect(countSales(rows, AGOSTO, modes())).toBe(0)
  })

  it('conta deal Ganho dentro da janela', () => {
    const rows = [row({ data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Ganho' })]
    expect(countSales(rows, AGOSTO, modes())).toBe(1)
  })

  it('vale também via countStage("Fechamento")', () => {
    const rows = [row({ data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Em andamento' })]
    expect(countStage(rows, 'Fechamento', AGOSTO, modes())).toBe(0)
  })
})

// ── Toggle: Negócios × Unidades ────────────────────────────────────────────

describe('salesMode', () => {
  const rows = [
    row({ id_lead: 'a', data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Ganho', quantidade_unidades: 3 }),
    row({ id_lead: 'b', data_venda: '2026-08-06T10:00:00+00:00', status_atual: 'Ganho', quantidade_unidades: null }),
  ]

  it('deals conta negócios', () => {
    expect(countSales(rows, AGOSTO, modes({ salesMode: 'deals' }))).toBe(2)
  })

  it('units soma quantidade_unidades, tratando nulo como 1', () => {
    expect(countSales(rows, AGOSTO, modes({ salesMode: 'units' }))).toBe(4)
  })

  it('units trata zero e negativo como 1', () => {
    const estranhos = [
      row({ id_lead: 'c', data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Ganho', quantidade_unidades: 0 }),
      row({ id_lead: 'd', data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Ganho', quantidade_unidades: -2 }),
    ]
    expect(countSales(estranhos, AGOSTO, modes({ salesMode: 'units' }))).toBe(2)
  })

  it('faturamento ignora salesMode e soma valor_contrato', () => {
    const comValor = [
      row({ data_venda: '2026-08-05T10:00:00+00:00', status_atual: 'Ganho', valor_contrato: 1000, quantidade_unidades: 5 }),
    ]
    expect(sumRevenue(comValor, AGOSTO, modes({ salesMode: 'units' }))).toBe(1000)
  })
})

// ── Toggle: Deals criados no período (safra/coorte) ────────────────────────

describe('funnelView', () => {
  // MQL em julho, chegou em SAL em agosto.
  const atrasado = row({
    data_novo_mql: '2026-07-10T10:00:00+00:00',
    data_sal: '2026-08-05T10:00:00+00:00',
  })

  it('stageDate conta pela data da própria etapa', () => {
    expect(countStage([atrasado], 'SAL', AGOSTO, modes({ funnelView: 'stageDate' }))).toBe(1)
    expect(countStage([atrasado], 'MQL', AGOSTO, modes({ funnelView: 'stageDate' }))).toBe(0)
  })

  it('cohort conta pela safra de MQL, ignorando a data da etapa', () => {
    // MQL é de julho → fora da safra de agosto, mesmo com SAL em agosto.
    expect(countStage([atrasado], 'SAL', AGOSTO, modes({ funnelView: 'cohort' }))).toBe(0)
  })

  it('cohort inclui etapa alcançada em qualquer data se o MQL é da safra', () => {
    const daSafra = row({
      data_novo_mql: '2026-08-02T10:00:00+00:00',
      data_sal: '2026-09-20T10:00:00+00:00', // fora da janela
    })
    expect(countStage([daSafra], 'SAL', AGOSTO, modes({ funnelView: 'cohort' }))).toBe(1)
  })

  it('cohort exige venda concretizada, não só safra', () => {
    const semVenda = row({ data_novo_mql: '2026-08-02T10:00:00+00:00', status_atual: 'Em andamento' })
    expect(countStage([semVenda], 'Fechamento', AGOSTO, modes({ funnelView: 'cohort' }))).toBe(0)
  })
})

// ── Chave composta (reciclagem) ────────────────────────────────────────────

describe('dealKey e cohortKeys', () => {
  it('distingue ciclos diferentes do mesmo deal', () => {
    expect(dealKey({ id_lead: 'x', ciclo: 1 })).not.toBe(dealKey({ id_lead: 'x', ciclo: 2 }))
  })

  it('assume ciclo 1 quando ausente', () => {
    expect(dealKey({ id_lead: 'x' })).toBe(dealKey({ id_lead: 'x', ciclo: 1 }))
  })

  it('cohortKeys devolve uma chave por ciclo dentro da safra', () => {
    const rows = [
      row({ id_lead: 'x', ciclo: 1, data_novo_mql: '2026-07-01T10:00:00+00:00' }), // fora
      row({ id_lead: 'x', ciclo: 2, data_novo_mql: '2026-08-03T10:00:00+00:00' }), // dentro
    ]
    const keys = cohortKeys(rows, AGOSTO)
    expect(keys.size).toBe(1)
    expect(keys.has(dealKey({ id_lead: 'x', ciclo: 2 }))).toBe(true)
  })
})

// ── Eventos: Deals únicos × Passagens ──────────────────────────────────────

describe('countStageEvents', () => {
  const ev = (over: Partial<FunnelEventRow>): FunnelEventRow => ({
    id_deal: 'd1',
    dia: '2026-08-05',
    marca: 'Inpot',
    etapa_canonica: 'Contato Efetivo',
    ciclo: 1,
    rn_deal_etapa_mes: 1,
    ...over,
  })

  const eventos = [
    ev({ rn_deal_etapa_mes: 1 }),
    ev({ rn_deal_etapa_mes: 2 }), // revisita no mesmo mês
    ev({ rn_deal_etapa_mes: 3 }),
  ]

  it('unique conta só a primeira passagem do mês', () => {
    expect(countStageEvents(eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }))).toBe(1)
  })

  it('passages conta todas as passagens', () => {
    expect(countStageEvents(eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'passages' }))).toBe(3)
  })

  it('ignora eventos de outra etapa', () => {
    expect(countStageEvents(eventos, 'SAL', AGOSTO, modes())).toBe(0)
  })

  it('em cohort, filtra pela safra e não pela data do evento', () => {
    const foraDaJanela = [ev({ dia: '2026-09-20', rn_deal_etapa_mes: 1 })]
    const safra = new Set([dealKey({ id_lead: 'd1', ciclo: 1 })])
    expect(
      countStageEvents(foraDaJanela, 'Contato Efetivo', AGOSTO, modes({ funnelView: 'cohort' }), {
        cohortIds: safra,
      }),
    ).toBe(1)
  })
})

// ── Conversão ──────────────────────────────────────────────────────────────

describe('conversion', () => {
  const rows = [
    row({ id_lead: 'a', data_contato_efetivo: '2026-08-02T10:00:00+00:00', data_sal: '2026-08-03T10:00:00+00:00' }),
    row({ id_lead: 'b', data_contato_efetivo: '2026-08-02T10:00:00+00:00' }),
  ]

  it('calcula num/den/taxa entre duas etapas', () => {
    const r = conversion(rows, 'Contato Efetivo', 'SAL', AGOSTO, modes())
    expect(r.den).toBe(2)
    expect(r.num).toBe(1)
    expect(r.taxa).toBe(50)
  })

  it('devolve taxa nula quando o denominador é zero', () => {
    expect(conversion([], 'Contato Efetivo', 'SAL', AGOSTO, modes()).taxa).toBeNull()
  })

  it('não trava quando a etapa seguinte tem volume maior (funil não-monotônico)', () => {
    // Pré-Contrato (3) > Comitê (2) acontece de verdade: deals pulam etapas.
    const pulando = [
      row({ id_lead: 'a', data_comite: '2026-08-02T10:00:00+00:00' }),
      row({ id_lead: 'b', data_pre_contrato: '2026-08-03T10:00:00+00:00' }),
      row({ id_lead: 'c', data_pre_contrato: '2026-08-03T10:00:00+00:00' }),
    ]
    const r = conversion(pulando, 'Comitê', 'Pré-Contrato', AGOSTO, modes())
    expect(r.den).toBe(1)
    expect(r.num).toBe(2)
    expect(r.taxa).toBe(200)
  })
})

// ── Filtro de escopo ───────────────────────────────────────────────────────

describe('buildScopeFilter', () => {
  const r = row({ marca: 'Inpot', fonte_macro: 'Inbound', utm_source: 'ig', nome_sdr: 'Xayane' })

  it('sem critérios, aceita tudo', () => {
    expect(buildScopeFilter({})(r)).toBe(true)
  })

  it('filtra por marca', () => {
    expect(buildScopeFilter({ marcas: ['Inpot'] })(r)).toBe(true)
    expect(buildScopeFilter({ marcas: ['B2Case'] })(r)).toBe(false)
  })

  it('filtra por fonte_macro', () => {
    expect(buildScopeFilter({ fontes: ['Inbound'] })(r)).toBe(true)
    expect(buildScopeFilter({ fontes: ['Resgate'] })(r)).toBe(false)
  })

  it('filtra por sub-fonte já normalizada', () => {
    // utm_source 'ig' pertence ao grupo 'Meta'
    expect(buildScopeFilter({ subFontes: ['Meta'] })(r)).toBe(true)
    expect(buildScopeFilter({ subFontes: ['Google'] })(r)).toBe(false)
  })

  it('combina critérios com AND', () => {
    expect(buildScopeFilter({ marcas: ['Inpot'], fontes: ['Resgate'] })(r)).toBe(false)
  })
})
