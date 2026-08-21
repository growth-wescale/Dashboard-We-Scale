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
  dealsInStage,
  groupRepeatedDeals,
  isInWindow,
  repeatedDealsInStage,
  resolveStage,
  stageOwnerRole,
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
    nome_negociacao: null,
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

  it('mesmo dia como início e fim ainda casa (multi-seleção de 1 dia)', () => {
    const umDia = toWindow(null, { from: '2026-08-19', to: '2026-08-19' })
    expect(isInWindow('2026-08-19T23:00:00+00:00', umDia)).toBe(true)
    expect(isInWindow('2026-08-18T23:59:00+00:00', umDia)).toBe(false)
  })

  describe('ranges (multi-seleção de período)', () => {
    it('aceita união exata de vários períodos não-contíguos', () => {
      const win = toWindow(null, null, [
        { from: '2026-06-01', to: '2026-06-30' },
        { from: '2026-08-01', to: '2026-08-14' },
      ])
      expect(isInWindow('2026-06-15T10:00:00+00:00', win)).toBe(true)
      expect(isInWindow('2026-08-05T10:00:00+00:00', win)).toBe(true)
      // Julho está no meio dos dois ranges mas não foi selecionado.
      expect(isInWindow('2026-07-15T10:00:00+00:00', win)).toBe(false)
    })

    it('tem prioridade sobre dateRange quando os dois estão presentes', () => {
      const win = toWindow(null, { from: '2026-01-01', to: '2026-12-31' }, [
        { from: '2026-08-01', to: '2026-08-14' },
      ])
      expect(isInWindow('2026-03-01T10:00:00+00:00', win)).toBe(false)
    })
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
    etapa_canonica: 'Contato Efetivo',
    id_etapa: 'et-generica',
    nome_funil: 'SDR',
    ciclo: 1,
    rn_deal_etapa_mes: 1,
    ...over,
  })

  const eventos = [ev({}), ev({}), ev({})] // mesmo deal, 3 passagens no mês

  it('unique conta o deal uma vez por mês, por mais que ele revisite', () => {
    expect(countStageEvents(eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }))).toBe(1)
  })

  it('passages conta todas as passagens', () => {
    expect(countStageEvents(eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'passages' }))).toBe(3)
  })

  it('unique conta deals diferentes separadamente', () => {
    const dois = [ev({ id_deal: 'a' }), ev({ id_deal: 'b' }), ev({ id_deal: 'b' })]
    expect(countStageEvents(dois, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }))).toBe(2)
  })

  it('unique separa ciclos do mesmo deal', () => {
    const reciclado = [ev({ ciclo: 1 }), ev({ ciclo: 2 })]
    expect(countStageEvents(reciclado, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }))).toBe(2)
  })

  it('ignora eventos de outra etapa', () => {
    expect(countStageEvents(eventos, 'SAL', AGOSTO, modes())).toBe(0)
  })

  it('em cohort, filtra pela safra e não pela data do evento', () => {
    const foraDaJanela = [ev({ dia: '2026-09-20' })]
    const safra = new Set([dealKey({ id_lead: 'd1', ciclo: 1 })])
    expect(
      countStageEvents(foraDaJanela, 'Contato Efetivo', AGOSTO, modes({ funnelView: 'cohort' }), {
        cohortIds: safra,
      }),
    ).toBe(1)
  })

  // A INVARIANTE. Foi violada em produção: Passagens aparecia MENOR que Únicos
  // porque cada modo lia uma base diferente.
  it('passages nunca é menor que unique', () => {
    const bagunca = [
      ev({ id_deal: 'a' }), ev({ id_deal: 'a' }), ev({ id_deal: 'b' }),
      ev({ id_deal: 'c' }), ev({ id_deal: 'c' }), ev({ id_deal: 'c' }),
    ]
    for (const etapa of ['Contato Efetivo', 'SAL'] as const) {
      const u = countStageEvents(bagunca, etapa, AGOSTO, modes({ eventSource: 'unique' }))
      const p = countStageEvents(bagunca, etapa, AGOSTO, modes({ eventSource: 'passages' }))
      expect(p).toBeGreaterThanOrEqual(u)
    }
  })
})

// Regra de negócio do Junior: "Reunião Agendada SQL" só conta na etapa do funil
// do Closer. A mesma etapa existe no funil do SDR, e o handoff SDR->Closer
// gerava dois eventos para uma única reunião — inflando o SQL de 71 para 144.
describe('Reunião Agendada SQL — só a etapa do Closer', () => {
  const ETAPA_CLOSER = '69b1badfe1def700137f1b89'
  const evSql = (funil: string, id_etapa: string, over: Partial<FunnelEventRow> = {}): FunnelEventRow => ({
    id_deal: 'd1', dia: '2026-08-05',
    etapa_canonica: 'Reunião Agendada SQL', id_etapa, nome_funil: funil,
    ciclo: 1, rn_deal_etapa_mes: 1, ...over,
  })

  const handoff = [
    evSql('SDR', '69380917e00ed10014daaa68'),  // não conta
    evSql('Closer', ETAPA_CLOSER),             // conta
  ]

  it('ignora a etapa homônima do funil SDR', () => {
    expect(countStageEvents(handoff, 'Reunião Agendada SQL', AGOSTO, modes({ eventSource: 'passages' }))).toBe(1)
  })

  it('conta duas vezes só se o deal reentrar na etapa do Closer', () => {
    const reentrou = [...handoff, evSql('Closer', ETAPA_CLOSER)]
    expect(countStageEvents(reentrou, 'Reunião Agendada SQL', AGOSTO, modes({ eventSource: 'passages' }))).toBe(2)
    expect(countStageEvents(reentrou, 'Reunião Agendada SQL', AGOSTO, modes({ eventSource: 'unique' }))).toBe(1)
  })

  it('não usa rn_deal_etapa_mes do banco, que agrupa sem separar funil', () => {
    // o rn=1 é do SDR (excluído); se dependêssemos dele, o Closer sumiria
    const rnDoSdr = [
      evSql('SDR', '69380917e00ed10014daaa68', { rn_deal_etapa_mes: 1 }),
      evSql('Closer', ETAPA_CLOSER, { rn_deal_etapa_mes: 2 }),
    ]
    expect(countStageEvents(rnDoSdr, 'Reunião Agendada SQL', AGOSTO, modes({ eventSource: 'unique' }))).toBe(1)
  })
})

// O recorte por marca NUNCA sai do evento. `vw_funil_etapas_v2.marca` vem de
// `deal_eventos.marca`, um retrato gravado na ingestão que fica nulo em boa
// parte da base — filtrar por ele (o hook fazia isso no servidor com 1 marca
// selecionada) derrubava ~87% dos eventos e zerava o funil da marca sozinha.
// A marca confiável é a do deal, em `vw_funil_vendas`, e entra pelo `extra`.
describe('recorte por marca vem dos deals, nunca do evento', () => {
  const ev = (id_deal: string): FunnelEventRow => ({
    id_deal, dia: '2026-08-05', etapa_canonica: 'Novo MQL',
    id_etapa: 'et-mql', nome_funil: 'SDR', ciclo: 1, rn_deal_etapa_mes: 1,
  })
  const eventos = [ev('d1'), ev('d2'), ev('d3')]

  it('conta todos os eventos dos deals do escopo, sem depender de marca no evento', () => {
    const idsEscopo = new Set(['d1', 'd2', 'd3'])
    expect(countStageEvents(eventos, 'MQL', AGOSTO, modes(), {
      extra: e => idsEscopo.has(String(e.id_deal)),
    })).toBe(3)
  })

  it('deixa de fora o evento de deal que não está no escopo', () => {
    const idsEscopo = new Set(['d1'])
    expect(countStageEvents(eventos, 'MQL', AGOSTO, modes(), {
      extra: e => idsEscopo.has(String(e.id_deal)),
    })).toBe(1)
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

// ── Deals por trás do clique numa etapa (popup de detalhe) ─────────────────

describe('dealsInStage', () => {
  const ev = (over: Partial<FunnelEventRow>): FunnelEventRow => ({
    id_deal: 'd1',
    dia: '2026-08-05',
    etapa_canonica: 'Contato Efetivo',
    id_etapa: 'et-generica',
    nome_funil: 'SDR',
    ciclo: 1,
    rn_deal_etapa_mes: 1,
    ...over,
  })

  it('Fechamento usa a trava de venda, não o histórico de eventos', () => {
    const scoped = [
      row({ id_lead: 'a', status_atual: 'Ganho', data_venda: '2026-08-05T10:00:00+00:00' }),
      row({ id_lead: 'b', status_atual: 'Em andamento', data_venda: '2026-08-06T10:00:00+00:00' }),
    ]
    const out = dealsInStage(scoped, [], 'Fechamento', AGOSTO, modes(), 'performance')
    expect(out).toHaveLength(1)
    expect(out[0].row.id_lead).toBe('a')
    expect(out[0].dataEtapa).toBe('2026-08-05T10:00:00+00:00')
  })

  it('modo Atual devolve deals vivos parados na etapa, ignorando o período', () => {
    const scoped = [
      row({ id_lead: 'a', eh_ciclo_atual: true, status_atual: 'Em andamento', etapa_funil: 'Negociação SAL (7 dias)' }),
      row({ id_lead: 'b', eh_ciclo_atual: false, status_atual: 'Em andamento', etapa_funil: 'Negociação SAL (7 dias)' }), // ciclo antigo
      row({ id_lead: 'c', eh_ciclo_atual: true, status_atual: 'Perdido', etapa_funil: 'Negociação SAL (7 dias)' }), // morto
    ]
    const out = dealsInStage(scoped, [], 'SAL', AGOSTO, modes(), 'atual')
    expect(out.map(d => d.row.id_lead)).toEqual(['a'])
  })

  it('modo Performance cruza o evento de volta com a linha completa do deal', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1, marca: 'Inpot', nome_sdr: 'Xayane' })]
    const eventos = [ev({})]
    const out = dealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes(), 'performance')
    expect(out).toHaveLength(1)
    expect(out[0].row.nome_sdr).toBe('Xayane')
    expect(out[0].dataEtapa).toBe('2026-08-05')
  })

  it('respeita a chave composta id_lead+ciclo — não cruza com o ciclo errado', () => {
    const scoped = [
      row({ id_lead: 'd1', ciclo: 1, marca: 'Ciclo 1' }),
      row({ id_lead: 'd1', ciclo: 2, marca: 'Ciclo 2' }),
    ]
    const eventos = [ev({ ciclo: 2 })]
    const out = dealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes(), 'performance')
    expect(out).toHaveLength(1)
    expect(out[0].row.marca).toBe('Ciclo 2')
  })

  it('Passagens nunca devolve menos linhas que Únicos, igual à contagem', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({}), ev({}), ev({})] // 3 passagens no mesmo mês
    const unicos = dealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }), 'performance')
    const passagens = dealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'passages' }), 'performance')
    expect(unicos).toHaveLength(1)
    expect(passagens).toHaveLength(3)
  })

  it('ignora eventos de deals fora do escopo (não estão em scoped)', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({ id_deal: 'fora-do-escopo' })]
    const out = dealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes(), 'performance')
    expect(out).toHaveLength(0)
  })
})

// ── Repetidos em Passagens (contador + popup) ───────────────────────────────

describe('repeatedDealsInStage', () => {
  const ev = (over: Partial<FunnelEventRow>): FunnelEventRow => ({
    id_deal: 'd1',
    dia: '2026-08-05',
    etapa_canonica: 'Contato Efetivo',
    id_etapa: 'et-generica',
    nome_funil: 'SDR',
    ciclo: 1,
    rn_deal_etapa_mes: 1,
    ...over,
  })

  it('uma única passagem no mês não é repetição', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const out = repeatedDealsInStage(scoped, [ev({})], 'Contato Efetivo', AGOSTO, modes())
    expect(out).toHaveLength(0)
  })

  it('cada passagem além da primeira no mês vira 1 repetido', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({ dia: '2026-08-02' }), ev({ dia: '2026-08-05' }), ev({ dia: '2026-08-09' })]
    const out = repeatedDealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes())
    expect(out).toHaveLength(2)
    expect(out.map(d => d.dataEtapa)).toEqual(['2026-08-05', '2026-08-09'])
    expect(out.every(d => d.row.id_lead === 'd1')).toBe(true)
  })

  it('passagens em meses diferentes não contam como repetição entre si', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({ dia: '2026-08-02' }), ev({ dia: '2026-09-02' })]
    const out = repeatedDealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes())
    expect(out).toHaveLength(0)
  })

  it('respeita a chave composta id_lead+ciclo — não mistura repetição entre ciclos', () => {
    const scoped = [
      row({ id_lead: 'd1', ciclo: 1 }),
      row({ id_lead: 'd1', ciclo: 2 }),
    ]
    const eventos = [ev({ ciclo: 1 }), ev({ ciclo: 2 })]
    const out = repeatedDealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes())
    expect(out).toHaveLength(0)
  })

  it('Fechamento não é passagem — nunca tem repetido', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1, status_atual: 'Ganho', data_venda: '2026-08-05T10:00:00+00:00' })]
    const out = repeatedDealsInStage(scoped, [], 'Fechamento', AGOSTO, modes())
    expect(out).toHaveLength(0)
  })

  it('ignora eventos de deals fora do escopo', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({ id_deal: 'fora-do-escopo', dia: '2026-08-02' }), ev({ id_deal: 'fora-do-escopo', dia: '2026-08-05' })]
    const out = repeatedDealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes())
    expect(out).toHaveLength(0)
  })

  it('conta repetição mesmo chamado com modes de Únicos — não depende do toggle do chamador', () => {
    const scoped = [row({ id_lead: 'd1', ciclo: 1 })]
    const eventos = [ev({ dia: '2026-08-02' }), ev({ dia: '2026-08-05' })]
    const out = repeatedDealsInStage(scoped, eventos, 'Contato Efetivo', AGOSTO, modes({ eventSource: 'unique' }))
    expect(out).toHaveLength(1)
  })
})

describe('groupRepeatedDeals', () => {
  it('agrupa passagens repetidas do mesmo deal, contando quantas vezes', () => {
    const d = row({ id_lead: 'd1', ciclo: 1 })
    const out = groupRepeatedDeals(
      [{ row: d, dataEtapa: '2026-08-05' }, { row: d, dataEtapa: '2026-08-09' }],
      'Contato Efetivo',
    )
    expect(out).toHaveLength(1)
    expect(out[0].vezes).toBe(2)
    expect(out[0].row.id_lead).toBe('d1')
  })

  it('mantém deals diferentes em grupos separados', () => {
    const a = row({ id_lead: 'a', ciclo: 1 })
    const b = row({ id_lead: 'b', ciclo: 1 })
    const out = groupRepeatedDeals(
      [{ row: a, dataEtapa: '2026-08-05' }, { row: b, dataEtapa: '2026-08-06' }, { row: b, dataEtapa: '2026-08-07' }],
      'Contato Efetivo',
    )
    expect(out).toHaveLength(2)
    expect(out.find(g => g.row.id_lead === 'a')?.vezes).toBe(1)
    expect(out.find(g => g.row.id_lead === 'b')?.vezes).toBe(2)
  })

  it('separa ciclos diferentes do mesmo id_lead', () => {
    const c1 = row({ id_lead: 'd1', ciclo: 1 })
    const c2 = row({ id_lead: 'd1', ciclo: 2 })
    const out = groupRepeatedDeals(
      [{ row: c1, dataEtapa: '2026-08-05' }, { row: c2, dataEtapa: '2026-08-06' }],
      'Contato Efetivo',
    )
    expect(out).toHaveLength(2)
  })

  it('usa a data mais recente como ultimaData', () => {
    const d = row({ id_lead: 'd1', ciclo: 1 })
    const out = groupRepeatedDeals(
      [{ row: d, dataEtapa: '2026-08-09' }, { row: d, dataEtapa: '2026-08-02' }],
      'Contato Efetivo',
    )
    expect(out[0].ultimaData).toBe('2026-08-09')
  })

  it('preserva a etapa recebida em cada grupo', () => {
    const d = row({ id_lead: 'd1', ciclo: 1 })
    const out = groupRepeatedDeals([{ row: d, dataEtapa: '2026-08-05' }], 'SAL')
    expect(out[0].stage).toBe('SAL')
  })

  it('lista vazia devolve grupos vazios', () => {
    expect(groupRepeatedDeals([], 'MQL')).toEqual([])
  })
})

// ── Dono do deal por etapa (SDR × Closer no popup) ──────────────────────────

describe('stageOwnerRole', () => {
  it('etapas de SDR (antes de Diagnóstico) são do SDR', () => {
    expect(stageOwnerRole('MQL')).toBe('sdr')
    expect(stageOwnerRole('Contato Efetivo')).toBe('sdr')
    expect(stageOwnerRole('Reunião Agendada SQL')).toBe('sdr')
  })

  it('Diagnóstico em diante é do Closer, mesmo com nome_closer já preenchido antes', () => {
    expect(stageOwnerRole('Diagnóstico')).toBe('closer')
    expect(stageOwnerRole('SAL')).toBe('closer')
    expect(stageOwnerRole('Fechamento')).toBe('closer')
  })
})
