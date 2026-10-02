import { BRAND_LIST } from '@/constants/brands'
import { deduplicateLeads, isLeadMql } from './leadUtils'
import { filterMediaByMarcas } from './visaoGeralMedia'
import type { Lead, MediaDailyRaw } from './types'

export const MQL_CHART_BRANDS = BRAND_LIST.filter(b => !b.vendasOnly)
export const FOLLOW_PAGE = '__page__'
export const ALL_BRANDS = '__all__'

/** A lista vazia aqui significa SEM acesso, nunca um consolidado irrestrito. */
export function resolveMqlChartBrands(selection: string, pageKeys: string[], allowedKeys: string[]): string[] {
  const allowed = MQL_CHART_BRANDS.map(b => b.key).filter(k => allowedKeys.includes(k))
  if (selection === ALL_BRANDS || (selection === FOLLOW_PAGE && pageKeys.length === 0)) return allowed
  const requested = selection === FOLLOW_PAGE ? pageKeys : [selection]
  return allowed.filter(k => requested.includes(k))
}

export interface MqlVolumeDay {
  date: string
  mql: number
  investment: number
  cpmql: number | null
}

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN
}

/** Mesma classificação e ordem de deduplicação do KPI de MQL da Visão Geral. */
export function buildMqlVolume(
  media: MediaDailyRaw[], leads: Lead[], brandKeys: string[],
  range: { start: string; end: string }, today: string,
) {
  const start = parseDate(range.start)
  const end = Math.min(parseDate(range.end), parseDate(today))
  const days: MqlVolumeDay[] = []
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return { days, mql: 0, investment: 0, cpmql: null }
  }
  for (let time = start; time <= end; time += 86_400_000) {
    days.push({ date: new Date(time).toISOString().slice(0, 10), mql: 0, investment: 0, cpmql: null })
  }
  const byDay = new Map(days.map(day => [day.date, day]))
  const marcas = MQL_CHART_BRANDS.filter(b => brandKeys.includes(b.key)).map(b => b.marca!)
  for (const row of filterMediaByMarcas(media, marcas)) {
    const day = byDay.get(row.dia)
    if (day) day.investment += row.spend_brl
  }
  const scoped = leads.filter(row => marcas.includes(row.marca) && byDay.has(row.dia))
  for (const row of deduplicateLeads(scoped).filter(isLeadMql)) byDay.get(row.dia)!.mql++
  let mql = 0, investment = 0
  for (const day of days) {
    day.cpmql = day.mql > 0 ? day.investment / day.mql : null
    mql += day.mql
    investment += day.investment
  }
  // Razão dos totais; nunca a média dos custos de cada marca/dia.
  return { days, mql, investment, cpmql: mql > 0 ? investment / mql : null }
}
