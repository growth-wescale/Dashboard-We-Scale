import type { Marca } from '@/lib/types'

export const SLUG_TO_MARCA: Record<string, Marca> = {
  'oral-unic':    'Oral Unic',
  'odonto-scale': 'Odonto Scale',
  'inpot':        'Inpot',
  'eletrovias':   'Eletrovias',
  'liso-laser':   'Lisô Laser',
  'b2case':       'B2Case',
  'viva':         'Viva',
}

/** Data ISO (YYYY-MM-DD) do Date — em fuso LOCAL, não UTC.
 *  toISOString().slice(0,10) converte para UTC e dá off-by-one perto da meia-noite.
 */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Hoje em ISO local (YYYY-MM-DD). Convém usar em vez de `new Date().toISOString().slice(0,10)`. */
export function todayLocal(): string {
  return isoDate(new Date())
}

/** { start: '2026-08-01', end: '2026-08-11' } — mês corrente do 1º ao hoje. */
export function currentMonthRange(): { start: string; end: string } {
  const t = new Date()
  const y = t.getFullYear()
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const d = String(t.getDate()).padStart(2, '0')
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${d}` }
}

export function getMtdDates() {
  const r = currentMonthRange()
  return { ...r, mes: r.start }
}

/** "Ago 2026". Formato curto (3 letras + ano). */
export function monthLabel(startDate: string) {
  const [y, m] = startDate.split('-').map(Number)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[m - 1]} ${y}`
}

/** "agosto de 2026". Formato longo por extenso (com "de"). */
export function monthLabelLong(iso: string): string {
  return new Date(iso + 'T12:00:00')
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

/** "agosto" — nome do mês por extenso, capitalized. */
export function shortMonth(iso: string): string {
  return new Date(iso + 'T12:00:00')
    .toLocaleDateString('pt-BR', { month: 'long' })
    .replace(/^\w/, c => c.toUpperCase())
}

/** "12/08/2026" a partir de "2026-08-12". */
export function fmtBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Dias no mês da chave 'YYYY-MM'. */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Dia numérico do ISO ('2026-08-11' -> 11). */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(-2))
}

// ── Conversão de timestamptz para data em Brasília ──────────────────────────
// O banco devolve timestamptz em UTC. Comparar isso direto com 'YYYY-MM-DD'
// erra por um dia perto da meia-noite: um evento das 23h BRT chega como 02h UTC
// do dia seguinte e cairia no mês errado na virada.

const BRT_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD', sem hora nem fuso — ex.: a coluna `dia` de vw_funil_etapas_v2. */
const DATA_PURA = /^\d{4}-\d{2}-\d{2}$/

/**
 * timestamptz -> 'YYYY-MM-DD' em Brasília. Null para entrada vazia ou inválida.
 *
 * Data pura (sem hora) passa direto, sem conversão de fuso — ela já é o dia
 * certo. Se cair no `new Date(value)` de baixo, o JS interpreta 'YYYY-MM-DD'
 * como meia-noite UTC (não meia-noite local!), e formatar isso em Brasília
 * (UTC-3) devolve o dia ANTERIOR — bug real: filtro de um único dia (ex.:
 * "19/08") ficava sempre vazio, porque todo evento daquele dia virava o dia
 * 18 e caía fora da janela de exatamente um dia.
 */
export function toLocalDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (DATA_PURA.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return BRT_DATE.format(d) // en-CA já formata como YYYY-MM-DD
}

/** timestamptz -> 'YYYY-MM' em Brasília. */
export function toLocalYearMonth(value: string | null | undefined): string | null {
  return toLocalDate(value)?.slice(0, 7) ?? null
}
