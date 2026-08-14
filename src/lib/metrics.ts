/**
 * ==========================================================================
 *  metrics.ts — camada única de contagem do funil de Vendas
 * ==========================================================================
 *
 * Antes desta camada cada aba reimplementava "contar SQL/SAL/Reunião/Venda"
 * do seu jeito, e os mesmos rótulos davam números diferentes. Aqui toda
 * contagem passa por um lugar só, parametrizada por três toggles:
 *
 *   salesMode    'deals'     nº de negócios ganhos
 *                'units'     soma de quantidade_unidades
 *
 *   funnelView   'stageDate' o deal conta se a data DA ETAPA cai no período
 *                'cohort'    o deal conta se o MQL dele cai no período
 *                            (safra), independente de quando atingiu a etapa
 *
 *   eventSource  'unique'    1x por deal/etapa/mês
 *                'passages'  todas as passagens, incluindo revisitas
 *
 * Contagens sobre a tabela flat (vw_funil_vendas) usam countStage/countSales.
 * Contagens de passagem usam countStageEvents sobre vw_funil_etapas_v2.
 *
 * Portado do dashboard Lovable. Ver
 * docs/superpowers/specs/2026-08-14-funil-vendas-supabase-design.md
 */

import { toLocalDate, toLocalYearMonth } from '@/lib/dateUtils'
import { normalizeSubFonte } from '@/lib/fonteMapping'
import type { FunnelRow } from '@/lib/funnelTypes'

/* ── Toggles ─────────────────────────────────────────────────────────────── */

export type SalesMode = 'deals' | 'units'
export type FunnelView = 'stageDate' | 'cohort'
export type EventSource = 'unique' | 'passages'

export interface ViewModes {
  salesMode: SalesMode
  funnelView: FunnelView
  eventSource: EventSource
}

export const DEFAULT_VIEW_MODES: ViewModes = {
  salesMode: 'deals',
  funnelView: 'stageDate',
  eventSource: 'unique',
}

/* ── Janela de período ───────────────────────────────────────────────────── */

export interface PeriodWindow {
  /** Conjunto de 'YYYY-MM'. Vazio = qualquer mês. */
  activePeriods: Set<string>
  dateRange: { from: string; to: string } | null
}

export function toWindow(
  activePeriods?: Set<string> | null,
  dateRange?: { from: string; to: string } | null,
): PeriodWindow {
  return { activePeriods: activePeriods ?? new Set<string>(), dateRange: dateRange ?? null }
}

/** A data cai na janela? Sempre avaliada em horário de Brasília. */
export function isInWindow(dateStr: string | null | undefined, win: PeriodWindow): boolean {
  if (win.dateRange) {
    const d = toLocalDate(dateStr)
    return !!d && d >= win.dateRange.from && d <= win.dateRange.to
  }
  const ym = toLocalYearMonth(dateStr)
  return !!ym && (win.activePeriods.size === 0 || win.activePeriods.has(ym))
}

/* ── Catálogo de etapas ──────────────────────────────────────────────────── */

/** Etapa canônica -> coluna de data em vw_funil_vendas. */
export const STAGE_DATE_FIELD = {
  'MQL': 'data_novo_mql',
  'Tentando Contato': 'data_tentando_contato',
  'Contato Efetivo': 'data_contato_efetivo',
  'Interesse Reunião': 'data_interesse_reuniao',
  'Conexão': 'data_conexao',
  'Reunião Agendada SQL': 'data_agendamento_reuniao_sql',
  'Diagnóstico': 'data_reuniao_realizada',
  'SAL': 'data_sal',
  'Oportunidade COF': 'data_oportunidade',
  'Comitê': 'data_comite',
  'Pré-Contrato': 'data_pre_contrato',
  'Fechamento': 'data_venda',
  // Fora da sequência do funil: o deal volta dela para o fluxo normal.
  'No Show': 'data_no_show',
} as const

export type StageKey = keyof typeof STAGE_DATE_FIELD

/** As 12 etapas do funil, na ordem. 'No Show' fica de fora de propósito. */
export const STAGE_ORDER: StageKey[] = [
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
]

/** Rótulo curto para a UI (a barra do funil não comporta o nome canônico). */
export const STAGE_LABEL: Record<StageKey, string> = {
  'MQL': 'MQL',
  'Tentando Contato': 'Tentando contato',
  'Contato Efetivo': 'Contato efetivo',
  'Interesse Reunião': 'Interesse reunião',
  'Conexão': 'Conexão',
  'Reunião Agendada SQL': 'SQL · Reunião agendada',
  'Diagnóstico': 'Diagnóstico',
  'SAL': 'SAL',
  'Oportunidade COF': 'Oportunidade · COF',
  'Comitê': 'Comitê',
  'Pré-Contrato': 'Pré-Contrato',
  'Fechamento': 'Fechamento',
  'No Show': 'No-show',
}

const COHORT_ROOT_FIELD = STAGE_DATE_FIELD['MQL']

/**
 * Rótulos crus que aparecem em `etapa_funil` e em `etapa_canonica`.
 * O RD guarda o SLA no nome da etapa ("Diagnóstico (1 dia)"), então sem este
 * mapa o modo "Funil Atual" não casaria nenhuma etapa.
 */
const STAGE_ALIASES: Record<string, StageKey> = {
  'Novo MQL': 'MQL',
  'Novos Leads': 'MQL',
  'Leads': 'MQL',
  'Tentando Contato (Cadência)': 'Tentando Contato',
  'SQL': 'Reunião Agendada SQL',
  'Reunião Agendada': 'Reunião Agendada SQL',
  'Reuniões Agendadas (SQL)': 'Reunião Agendada SQL',
  'No Show / Reagendamento': 'No Show',
  'Reunião Realizada': 'Diagnóstico',
  'Reuniões Realizadas': 'Diagnóstico',
  'Diagnóstico (1 dia)': 'Diagnóstico',
  'Negociação SAL': 'SAL',
  'Negociação SAL (7 dias)': 'SAL',
  'Oportunidade': 'Oportunidade COF',
  'Oportunidade COF (7 dias)': 'Oportunidade COF',
  'Comite': 'Comitê',
  'Comitê (5 dias)': 'Comitê',
  'Pré Contrato': 'Pré-Contrato',
  'Pre-Contrato': 'Pré-Contrato',
  'Pré Contrato (5 dias)': 'Pré-Contrato',
  'Documentação': 'Pré-Contrato',
  'Ganho': 'Fechamento',
  'Vendida': 'Fechamento',
  'Venda': 'Fechamento',
}

/** Resolve rótulo qualquer para etapa canônica, ou null se desconhecido. */
export function resolveStage(label: string | null | undefined): StageKey | null {
  if (!label) return null
  if (label in STAGE_DATE_FIELD) return label as StageKey
  return STAGE_ALIASES[label] ?? null
}

/* ── Vendas ──────────────────────────────────────────────────────────────── */

/**
 * Trava de venda: só é venda se o estado atual é 'Ganho'.
 * `data_venda` sozinha não basta — deals perdidos depois de um ganho
 * revertido mantêm a data preenchida.
 */
export function isSale(row: FunnelRow): boolean {
  return row.status_atual === 'Ganho'
}

/** Unidades de um deal ganho. Nulo, zero ou negativo contam como 1. */
export function saleUnits(row: FunnelRow): number {
  const q = Number(row.quantidade_unidades)
  return Number.isFinite(q) && q > 0 ? q : 1
}

function saleInWindow(r: FunnelRow, win: PeriodWindow, modes: ViewModes): boolean {
  if (modes.funnelView === 'cohort') {
    // Safra: MQL no período E venda concretizada (em qualquer data).
    return isInWindow(r[COHORT_ROOT_FIELD], win) && !!r.data_venda
  }
  return isInWindow(r.data_venda, win)
}

export function countSales(
  rows: FunnelRow[],
  win: PeriodWindow,
  modes: ViewModes,
  extra?: (r: FunnelRow) => boolean,
): number {
  let acc = 0
  for (const r of rows) {
    if (!isSale(r)) continue
    if (!saleInWindow(r, win, modes)) continue
    if (extra && !extra(r)) continue
    acc += modes.salesMode === 'units' ? saleUnits(r) : 1
  }
  return acc
}

/** Faturamento das vendas na janela. Não depende de salesMode. */
export function sumRevenue(
  rows: FunnelRow[],
  win: PeriodWindow,
  modes: ViewModes = DEFAULT_VIEW_MODES,
  extra?: (r: FunnelRow) => boolean,
): number {
  let acc = 0
  for (const r of rows) {
    if (!isSale(r)) continue
    if (!saleInWindow(r, win, modes)) continue
    if (extra && !extra(r)) continue
    acc += Number(r.valor_contrato ?? 0) || 0
  }
  return acc
}

/* ── Contagem por etapa (tabela flat) ────────────────────────────────────── */

/** Este deal conta nesta etapa, nesta janela? */
export function matchesStage(
  r: FunnelRow,
  stage: StageKey,
  win: PeriodWindow,
  modes: ViewModes,
): boolean {
  if (stage === 'Fechamento') return isSale(r) && saleInWindow(r, win, modes)

  const field = STAGE_DATE_FIELD[stage]
  if (modes.funnelView === 'cohort') {
    return isInWindow(r[COHORT_ROOT_FIELD], win) && !!r[field]
  }
  return isInWindow(r[field], win)
}

export function countStage(
  rows: FunnelRow[],
  stage: StageKey,
  win: PeriodWindow,
  modes: ViewModes,
  extra?: (r: FunnelRow) => boolean,
): number {
  // Fechamento é venda: delega para respeitar salesMode e a trava de Ganho.
  if (stage === 'Fechamento') return countSales(rows, win, modes, extra)

  let acc = 0
  for (const r of rows) {
    if (extra && !extra(r)) continue
    if (matchesStage(r, stage, win, modes)) acc += 1
  }
  return acc
}

/** Mesma regra de countStage, devolvendo as linhas (para drawers de detalhe). */
export function rowsInStage(
  rows: FunnelRow[],
  stage: StageKey,
  win: PeriodWindow,
  modes: ViewModes,
  extra?: (r: FunnelRow) => boolean,
): FunnelRow[] {
  return rows.filter(r => (!extra || extra(r)) && matchesStage(r, stage, win, modes))
}

/**
 * Identidade de uma linha do funil.
 * `id_lead` não é único: um deal reciclado tem ciclo 1 e ciclo 2.
 */
export function dealKey(r: { id_lead?: unknown; ciclo?: unknown }): string {
  return `${String(r.id_lead ?? '')}::${String(r.ciclo ?? 1)}`
}

/** Ciclos cuja safra (MQL) cai na janela — base do modo coorte. */
export function cohortKeys(
  rows: FunnelRow[],
  win: PeriodWindow,
  extra?: (r: FunnelRow) => boolean,
): Set<string> {
  const keys = new Set<string>()
  for (const r of rows) {
    if (extra && !extra(r)) continue
    if (!isInWindow(r[COHORT_ROOT_FIELD], win)) continue
    if (r.id_lead != null) keys.add(dealKey(r))
  }
  return keys
}

/**
 * Conversão entre duas etapas.
 *
 * A taxa pode passar de 100%: o funil não é monotônico porque deals pulam
 * etapas (em agosto/26, Pré-Contrato teve 3 e Comitê 2). Quem consome não
 * deve tratar isso como erro.
 */
export function conversion(
  rows: FunnelRow[],
  from: StageKey,
  to: StageKey,
  win: PeriodWindow,
  modes: ViewModes,
  extra?: (r: FunnelRow) => boolean,
): { num: number; den: number; taxa: number | null } {
  const den = countStage(rows, from, win, modes, extra)
  const num = countStage(rows, to, win, modes, extra)
  return { num, den, taxa: den > 0 ? (num / den) * 100 : null }
}

/* ── Contagem por etapa (eventos / passagens) ────────────────────────────── */

/** Linha mínima de vw_funil_etapas_v2. */
export interface FunnelEventRow {
  id_deal: string | number | null
  dia: string | null
  marca: string | null
  etapa_canonica: string | null
  nome_funil?: string | null
  ciclo?: number | null
  /** 1 marca a primeira passagem do deal por aquela etapa no mês. */
  rn_deal_etapa_mes: number | null
}

export interface EventCountOptions {
  extra?: (e: FunnelEventRow) => boolean
  /** Safra: quando em modo coorte, conta só eventos destes deals. */
  cohortIds?: Set<string> | null
}

export function countStageEvents(
  events: FunnelEventRow[],
  stageLabel: string,
  win: PeriodWindow,
  modes: ViewModes,
  optsOrExtra?: EventCountOptions | ((e: FunnelEventRow) => boolean),
): number {
  return eventsInStage(events, stageLabel, win, modes, optsOrExtra).length
}

/** Mesma regra de countStageEvents, devolvendo os eventos. */
export function eventsInStage(
  events: FunnelEventRow[],
  stageLabel: string,
  win: PeriodWindow,
  modes: ViewModes,
  optsOrExtra?: EventCountOptions | ((e: FunnelEventRow) => boolean),
): FunnelEventRow[] {
  const opts: EventCountOptions =
    typeof optsOrExtra === 'function' ? { extra: optsOrExtra } : (optsOrExtra ?? {})
  const cohort = modes.funnelView === 'cohort' ? (opts.cohortIds ?? null) : null
  const alvo = resolveStage(stageLabel)

  return events.filter(e => {
    if (resolveStage(e.etapa_canonica) !== alvo) return false
    if (cohort) {
      if (!cohort.has(dealKey({ id_lead: e.id_deal, ciclo: e.ciclo }))) return false
    } else if (!isInWindow(e.dia, win)) return false
    if (modes.eventSource === 'unique' && (e.rn_deal_etapa_mes ?? 1) !== 1) return false
    if (opts.extra && !opts.extra(e)) return false
    return true
  })
}

/* ── Escopo (filtros) ────────────────────────────────────────────────────── */

export interface ScopeOptions {
  marcas?: string[]
  /** Valores de fonte_macro. */
  fontes?: string[]
  /** Grupos já normalizados de utm_source — ver fonteMapping. */
  subFontes?: string[]
  sdrs?: string[]
  closers?: string[]
}

/** Predicado de escopo reutilizável. Lista vazia = sem restrição. */
export function buildScopeFilter(opts: ScopeOptions): (r: FunnelRow) => boolean {
  const { marcas = [], fontes = [], subFontes = [], sdrs = [], closers = [] } = opts
  return (r: FunnelRow) => {
    if (marcas.length && !marcas.includes(r.marca ?? '')) return false
    if (fontes.length && !fontes.includes(r.fonte_macro ?? '')) return false
    if (subFontes.length && !subFontes.includes(normalizeSubFonte(r.utm_source))) return false
    if (sdrs.length && !sdrs.includes(r.nome_sdr ?? '')) return false
    if (closers.length && !closers.includes(r.nome_closer ?? '')) return false
    return true
  }
}
