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
