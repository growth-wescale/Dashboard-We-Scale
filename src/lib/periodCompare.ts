export interface DateRange {
  start: string
  end: string
}

function clampDay(y: number, m: number, day: number): number {
  const maxDay = new Date(y, m, 0).getDate()
  return Math.min(day, maxDay)
}

function shiftMonth(iso: string, monthsBack: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  let ny = y
  let nm = m - monthsBack
  while (nm <= 0) { nm += 12; ny -= 1 }
  const nd = clampDay(ny, nm, d)
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

export function previousMonthSameRange(range: DateRange): DateRange {
  return { start: shiftMonth(range.start, 1), end: shiftMonth(range.end, 1) }
}

export function computeDeltaPct(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null
  if (prev === 0) return null
  return +(((cur - prev) / prev) * 100).toFixed(1)
}

export function formatCompareLabel(range: DateRange): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
  }
  if (range.start === range.end) return fmt(range.start)
  return `${fmt(range.start)}–${fmt(range.end)}`
}
