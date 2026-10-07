import { describe, expect, it } from 'vitest'
import { MESES_MISSAO, METAS_MISSAO } from '@/constants/missaoImpossivel'
import { captacaoMissao, ciclosUnicos, funilMissao, rangeAteHoje, rangeValido, receitaMissao, verbaNoPeriodo, type MissaoDeal } from './missaoImpossivel'
import type { FunnelEventRow } from './metrics'
import type { Lead, MediaDailyRaw } from './types'

const outubro = { start: '2026-10-01', end: '2026-10-31' }
const ano = { start: '2026-01-01', end: '2026-12-31' }
function deal(over: Partial<MissaoDeal> = {}): MissaoDeal {
  return { id_lead: 'd1', ciclo: 1, marca: 'Inpot', status_atual: 'Em andamento', valor_contrato: null,
    data_venda: null, data_criacao_original: '2026-10-01T12:00:00Z', data_novo_mql: '2026-10-01',
    data_agendamento_reuniao_sql: null, data_sal: null, ...over }
}
function event(over: Partial<FunnelEventRow> = {}): FunnelEventRow {
  return { id_deal: 'd1', ciclo: 1, dia: '2026-10-02', etapa_canonica: 'Reunião Agendada SQL',
    id_etapa: '69b1badfe1def700137f1b89', ...over }
}

describe('Missão: datas e orçamento', () => {
  it('confere os três orçamentos e rateio, sem incluir Viva/Oral', () => {
    expect(METAS_MISSAO.reduce((s, m) => s + m.investimento, 0)).toBe(238000)
    expect(MESES_MISSAO.map(m => 238000 * m.peso)).toEqual([95200, 95200, 47600])
    expect(METAS_MISSAO.map(m => verbaNoPeriodo(m.investimento, outubro))).toEqual([36000, 30400, 28800])
  })
  it('soma outubro a dezembro exatamente e mantém dezembro com 20%', () => {
    expect(verbaNoPeriodo(90000, { start: '2026-10-01', end: '2026-12-31' })).toBe(90000)
    expect(verbaNoPeriodo(90000, { start: '2026-12-01', end: '2026-12-31' })).toBe(18000)
  })
  it('proporciona somente verba por dias quando o recorte é parcial', () => {
    expect(verbaNoPeriodo(90000, { start: '2026-10-01', end: '2026-10-10' })).toBe(11612.9)
    expect(verbaNoPeriodo(90000, { start: '2026-10-31', end: '2026-11-01' })).toBe(2361.29)
  })
  it('não compara orçamento Q4 com investimento anual ou outro trimestre', () => {
    expect(verbaNoPeriodo(90000, ano)).toBeNull()
    expect(verbaNoPeriodo(90000, { start: '2026-09-01', end: '2026-09-30' })).toBeNull()
  })
  it('valida vazio, formato, ordem e calendário', () => {
    for (const start of ['', '2026-2-1', '2026-02-30', '2026-13-01']) expect(rangeValido({ start, end: '2026-12-31' })).toBe(false)
    expect(rangeValido({ start: '2026-10-31', end: '2026-10-01' })).toBe(false)
    expect(rangeValido(outubro)).toBe(true)
  })
  it('trunca realizado hoje, mantém mês fechado e não inventa zero futuro', () => {
    expect(rangeAteHoje(outubro, '2026-10-07')).toEqual({ start: '2026-10-01', end: '2026-10-07' })
    expect(rangeAteHoje(outubro, '2026-11-01')).toEqual(outubro)
    expect(rangeAteHoje(outubro, '2026-09-30')).toBeNull()
  })
})

describe('Missão: receita de Vendas', () => {
  it('exige Ganho e data da venda no período, não a criação do negócio', () => {
    const rows = [deal({ status_atual: 'Ganho', data_venda: '2026-10-03', valor_contrato: 30000, data_criacao_original: '2025-01-01' }),
      deal({ id_lead: 'revertido', status_atual: 'Perdido', data_venda: '2026-10-04', valor_contrato: 90000 }),
      deal({ id_lead: 'fora', status_atual: 'Ganho', data_venda: '2026-09-30', valor_contrato: 50000 })]
    expect(receitaMissao(rows, outubro)).toEqual({ receita: 30000, negocios: 1, semValor: 0 })
  })
  it('deduplica negócio/ciclo, mas mantém ciclos legítimos distintos', () => {
    const r = deal({ status_atual: 'Ganho', data_venda: '2026-10-03', valor_contrato: 10 })
    expect(receitaMissao([r, r, { ...r, ciclo: 2 }], outubro).receita).toBe(20)
    expect(ciclosUnicos([r, r])).toHaveLength(1)
  })
  it('inclui marcas não prioritárias e não filtra fontes', () => {
    const rows = ['Inpot', 'B2Case', 'Viva', 'Odonto Legacy', 'Scale Partner'].map((marca, i) =>
      deal({ id_lead: String(i), marca, status_atual: 'Ganho', data_venda: '2026-10-03', valor_contrato: 100 }))
    expect(receitaMissao(rows, outubro).receita).toBe(500)
  })
  it('informa contratos nulos sem estimar receita', () => {
    const rows = [deal({ status_atual: 'Ganho', data_venda: '2026-10-03' }),
      deal({ id_lead: 'zero', status_atual: 'Ganho', data_venda: '2026-10-03', valor_contrato: 0 })]
    expect(receitaMissao(rows, outubro)).toEqual({ receita: 0, negocios: 2, semValor: 1 })
  })
  it('preserva centavos, limites BRT e datas puras', () => {
    const rows = [deal({ status_atual: 'Ganho', data_venda: '2026-10-01T02:59:59Z', valor_contrato: 500 }),
      deal({ id_lead: 'b', status_atual: 'Ganho', data_venda: '2026-11-01T02:59:59Z', valor_contrato: 0.1 }),
      deal({ id_lead: 'c', status_atual: 'Ganho', data_venda: '2026-10-01', valor_contrato: 0.2 })]
    expect(receitaMissao(rows, outubro).receita).toBe(0.3)
  })
  it('retorna base vazia quando o trimestre não começou', () => {
    expect(receitaMissao([deal()], null)).toEqual({ receita: 0, negocios: 0, semValor: 0 })
  })
})

describe('Missão: taxas dos mesmos negócios', () => {
  it('calcula 10 SQL dos mesmos 100 MQL = 10%', () => {
    const rows = Array.from({ length: 100 }, (_, i) => deal({ id_lead: String(i), data_agendamento_reuniao_sql: i < 10 ? '2026-10-03' : null }))
    expect(funilMissao(rows, [], 'Inpot', outubro, null).mqlSql).toEqual({ num: 10, den: 100, valor: 10 })
  })
  it('não coloca um SQL de outro grupo no numerador da conversão MQL', () => {
    const rows = [deal(), deal({ id_lead: 'antigo', data_novo_mql: '2026-09-01', data_agendamento_reuniao_sql: '2026-10-03' })]
    const f = funilMissao(rows, [], 'Inpot', outubro, null)
    expect(f.sql).toBe(1)
    expect(f.mqlSql).toEqual({ num: 0, den: 1, valor: 0 })
  })
  it('filtra criação original, não data de MQL/reciclagem', () => {
    const rows = [deal({ data_criacao_original: '2026-09-01', status_atual: 'Ganho', data_venda: '2026-10-05', valor_contrato: 100 }),
      deal({ id_lead: 'novo', status_atual: 'Ganho', data_venda: '2026-10-05', valor_contrato: 200 })]
    expect(funilMissao(rows, [], 'Inpot', outubro, null).receita.receita).toBe(300)
    const f = funilMissao(rows, [], 'Inpot', outubro, outubro)
    expect(f.mql).toBe(1)
    expect(f.vendas).toBe(1)
    expect(f.receita.receita).toBe(200)
    expect(receitaMissao(rows, ano).receita).toBe(300)
  })
  it('aceita intervalo de criação independente do período de análise', () => {
    const r = deal({ data_agendamento_reuniao_sql: '2026-11-03', status_atual: 'Ganho', data_venda: '2026-11-10' })
    const f = funilMissao([r], [], 'Inpot', { start: '2026-11-01', end: '2026-11-30' }, outubro)
    expect(f.sqlVenda).toEqual({ num: 1, den: 1, valor: 100 })
  })
  it('não limita o denominador aos ganhos', () => {
    const rows = [deal({ data_sal: '2026-10-02', status_atual: 'Ganho', data_venda: '2026-10-10' }),
      deal({ id_lead: 'perdido', data_sal: '2026-10-03', status_atual: 'Perdido' })]
    expect(funilMissao(rows, [], 'Inpot', outubro, null).salVenda).toEqual({ num: 1, den: 2, valor: 50 })
  })
  it('venda sem SQL não vira conversão SQL, mas soma receita', () => {
    const f = funilMissao([deal({ status_atual: 'Ganho', data_venda: '2026-10-05', valor_contrato: 100 })], [], 'Inpot', outubro, null)
    expect(f.sqlVenda.valor).toBeNull()
    expect(f.receita.receita).toBe(100)
  })
  it('reúne evento e data flat, sem duplicar handoff SDR/Closer', () => {
    const rows = [deal({ data_agendamento_reuniao_sql: '2026-10-02' })]
    const events = [event(), event(), event({ id_etapa: 'sdr' }), event({ id_deal: 'outro' })]
    expect(funilMissao(rows, events, 'Inpot', outubro, null).sql).toBe(1)
    expect(funilMissao([deal()], [event({ id_etapa: 'sdr' })], 'Inpot', outubro, null).sql).toBe(0)
  })
  it('deduplica passagens entre meses no ano e filtra a marca do deal', () => {
    const events = [event({ marca_deal: 'Viva' }), event({ dia: '2026-11-03' })]
    expect(funilMissao([deal()], events, 'Inpot', ano, null).sql).toBe(1)
    expect(funilMissao([deal()], events, 'Viva', ano, null).sql).toBe(0)
  })
  it('não cruza resultados de ciclos distintos do mesmo negócio', () => {
    const rows = [deal(), deal({ ciclo: 2, data_novo_mql: '2026-09-01', data_agendamento_reuniao_sql: '2026-10-03' })]
    expect(funilMissao(rows, [], 'Inpot', outubro, null).mqlSql.num).toBe(0)
  })
  it('respeita fuso da criação e informa ausência da data', () => {
    const rows = [deal({ data_criacao_original: '2026-10-01T02:00:00Z' }), deal({ id_lead: 'nulo', data_criacao_original: null })]
    const f = funilMissao(rows, [], 'Inpot', outubro, outubro)
    expect(f.mql).toBe(0)
    expect(f.semDataCriacao).toBe(1)
  })
  it('não inclui excluídos, outra marca ou etapas futuras', () => {
    const rows = [deal({ status_atual: 'Excluído' }), deal({ id_lead: 'viva', marca: 'Viva' }), deal({ id_lead: 'futuro', data_novo_mql: '2026-11-01' })]
    expect(funilMissao(rows, [], 'Inpot', outubro, null).mql).toBe(0)
  })
})

describe('Missão: captação mantém contrato Marketing', () => {
  const lead = (over: Partial<Lead> = {}) => ({ id: 'l1', dia: '2026-10-01', marca: 'Inpot', email: 'teste@example.invalid', dados_extras: { lead_type: 'MQL' }, ...over }) as Lead
  const media = (over: Partial<MediaDailyRaw> = {}) => ({ dia: '2026-10-01', marca: 'Inpot', spend_brl: 100, ...over }) as MediaDailyRaw
  it('deduplica MQLs e calcula razão dos totais, sem média de custos', () => {
    const c = captacaoMissao([lead(), lead(), lead({ id: 'l2', email: 'outro@example.invalid' })], [media(), media({ spend_brl: 300 })], 'Inpot', outubro)
    expect(c).toEqual({ mql: 2, investimento: 400, cpmql: 200 })
  })
  it('não inventa MQL nem custo zero quando só há gasto', () => {
    expect(captacaoMissao([lead({ dados_extras: null })], [media()], 'Inpot', outubro).cpmql).toBeNull()
  })
  it('recorta marca e período e mantém exceção existente de evento', () => {
    const e = lead({ dados_extras: { lead_type: 'MQL', evento: 'evento' } })
    expect(captacaoMissao([e, e, lead({ marca: 'Viva' }), lead({ dia: '2026-09-01' })], [], 'Inpot', outubro).mql).toBe(2)
  })
})
