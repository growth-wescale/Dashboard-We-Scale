import type { Marca } from '@/lib/types'

export const SLUG_TO_MARCA: Record<string, Marca> = {
  'oral-unic':  'Oral Unic',
  'inpot':      'Inpot',
  'eletrovias': 'Eletrovias',
  'liso-laser': 'Lisô Laser',
  'b2case':     'B2Case',
  'viva':       'Viva',
}

export function getMtdDates() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${d}`, mes: `${y}-${m}-01` }
}

export function getPrevMonthDates(startDate: string) {
  const [y, m] = startDate.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  const mStr = String(pm).padStart(2, '0')
  const lastDay = new Date(py, pm, 0).getDate()
  return { start: `${py}-${mStr}-01`, end: `${py}-${mStr}-${String(lastDay).padStart(2, '0')}` }
}

export function monthLabel(startDate: string) {
  const [y, m] = startDate.split('-').map(Number)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[m - 1]} ${y}`
}
