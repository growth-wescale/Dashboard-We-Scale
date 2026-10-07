import { MESES_MISSAO, MISSAO } from '@/constants/missaoImpossivel'
import { normalizeMarcaRaw } from '@/constants/brands'
import { toLocalDate } from './dateUtils'
import { DEFAULT_VIEW_MODES, dealKey, eventsInStage, toWindow, type FunnelEventRow } from './metrics'
import type { FunnelRow } from './funnelTypes'
import type { DateRange } from './periodo'
import type { Lead, MediaDailyRaw } from './types'
import { deduplicateLeads, isLeadMql } from './leadUtils'
import { filterMediaByMarca } from './visaoGeralMedia'

export type MissaoDeal = Pick<FunnelRow,
  'id_lead' | 'ciclo' | 'marca' | 'status_atual' | 'valor_contrato' | 'data_venda' |
  'data_criacao_original' | 'data_novo_mql' | 'data_agendamento_reuniao_sql' | 'data_sal'>

export function rangeValido(r: DateRange): boolean {
  const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
  return dataValida(r.start) && dataValida(r.end) && r.start <= r.end
}

export function rangeAteHoje(r: DateRange, hoje: string): DateRange | null {
  if (!rangeValido(r) || r.start > hoje) return null
  return { start: r.start, end: r.end < hoje ? r.end : hoje }
}

export function dentroDaMissao(r: DateRange): boolean {
  return rangeValido(r) && r.start >= MISSAO.inicio && r.end <= MISSAO.fim
}

function noPeriodo(value: string | null | undefined, r: DateRange): boolean {
  const d = toLocalDate(value)
  return !!d && d >= r.start && d <= r.end
}

/** Não transporta déficit entre meses nem rateia meta de receita. */
export function verbaNoPeriodo(total: number, r: DateRange): number | null {
  if (!dentroDaMissao(r)) return null
  return Math.round(MESES_MISSAO.reduce((s, m) => {
    const start = r.start > m.inicio ? r.start : m.inicio
    const end = r.end < m.fim ? r.end : m.fim
    if (start > end) return s
    const dias = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1
    return s + total * m.peso * dias / m.dias
  }, 0) * 100) / 100
}

export function ciclosUnicos(rows: MissaoDeal[]): MissaoDeal[] {
  const seen = new Set<string>()
  return rows.filter(r => {
    const key = dealKey(r)
    if (!r.id_lead || r.status_atual === 'Excluído' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Mesma trava e data de Vendas; unidades não multiplicam o valor do contrato. */
export function receitaMissao(rows: MissaoDeal[], range: DateRange | null) {
  const ganhos = range ? ciclosUnicos(rows).filter(r => r.status_atual === 'Ganho' && noPeriodo(r.data_venda, range)) : []
  return {
    receita: ganhos.reduce((s, r) => s + Math.round((Number(r.valor_contrato) || 0) * 100), 0) / 100,
    negocios: ganhos.length,
    semValor: ganhos.filter(r => r.valor_contrato == null).length,
  }
}

/** CP-MQL mantém a base Marketing; não pressupõe vínculo individual com o CRM. */
export function captacaoMissao(leads: Lead[], media: MediaDailyRaw[], marca: string, range: DateRange | null) {
  const mql = range ? deduplicateLeads(leads.filter(r => r.marca === marca && noPeriodo(r.dia, range))).filter(isLeadMql).length : 0
  const investimento = range ? filterMediaByMarca(media, marca)
    .filter(r => noPeriodo(r.dia, range)).reduce((s, r) => s + Number(r.spend_brl || 0), 0) : 0
  return { mql, investimento, cpmql: mql > 0 ? investimento / mql : null }
}

export interface TaxaMissao { num: number; den: number; valor: number | null }

function taxaMesmosNegocios(base: Set<string>, resultado: Set<string>): TaxaMissao {
  const num = [...base].filter(k => resultado.has(k)).length
  return { num, den: base.size, valor: base.size > 0 ? num / base.size * 100 : null }
}

/** Uma ocorrência por ciclo no intervalo inteiro, não uma nova pessoa a cada mês. */
export function funilMissao(rows: MissaoDeal[], events: FunnelEventRow[], marca: string,
  range: DateRange | null, criacao: DateRange | null) {
  const scoped = ciclosUnicos(rows).filter(r => normalizeMarcaRaw(r.marca) === marca
    && (!criacao || noPeriodo(r.data_criacao_original, criacao)))
  const semDataCriacao = ciclosUnicos(rows).filter(r => normalizeMarcaRaw(r.marca) === marca && !r.data_criacao_original).length
  const byKey = new Map(scoped.map(r => [dealKey(r), r]))
  const eventos = events.filter(e => byKey.has(dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })))
    .map(e => ({ ...e, marca_deal: byKey.get(dealKey({ id_lead: e.id_deal, ciclo: e.ciclo }))!.marca }))
  const keys = (stage: 'MQL' | 'Reunião Agendada SQL' | 'SAL', field: 'data_novo_mql' | 'data_agendamento_reuniao_sql' | 'data_sal') => {
    if (!range) return new Set<string>()
    const win = toWindow(null, { from: range.start, to: range.end })
    const set = new Set(eventsInStage(eventos, stage, win, DEFAULT_VIEW_MODES)
      .map(e => dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })))
    // Datas normalizadas do ciclo preservam o histórico anterior aos eventos.
    for (const row of scoped) if (noPeriodo(row[field], range)) set.add(dealKey(row))
    return set
  }
  const mql = keys('MQL', 'data_novo_mql')
  const sql = keys('Reunião Agendada SQL', 'data_agendamento_reuniao_sql')
  const sal = keys('SAL', 'data_sal')
  const vendas = new Set(range ? scoped.filter(r => r.status_atual === 'Ganho' && noPeriodo(r.data_venda, range)).map(dealKey) : [])
  return { mql: mql.size, sql: sql.size, sal: sal.size, vendas: vendas.size,
    mqlSql: taxaMesmosNegocios(mql, sql), sqlVenda: taxaMesmosNegocios(sql, vendas), salVenda: taxaMesmosNegocios(sal, vendas),
    receita: receitaMissao(scoped, range), semDataCriacao }
}
