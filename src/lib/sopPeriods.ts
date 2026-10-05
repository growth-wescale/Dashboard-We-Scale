import { isoDate } from '@/lib/dateUtils'

/**
 * Fim do recorte exibido nos comparativos da S&OP.
 * Meses fechados usam o período inteiro; o mês corrente usa o mesmo dia do mês
 * de hoje para manter a comparação MTD equivalente.
 */
export function sopComparisonEnd(
  monthKey: string,
  isClosed: boolean,
  closedEnd: string,
  today = new Date(),
): string {
  if (isClosed) return closedEnd

  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return isoDate(new Date(year, month - 1, Math.min(today.getDate(), lastDay)))
}

/** Evita custos infinitos quando a base do indicador é zero. */
export function safeUnitCost(total: number, quantity: number): number | null {
  return quantity > 0 ? total / quantity : null
}

/** Semanas de calendário que cobrem um mês fechado sem deixar dias de fora. */
export function closedMonthWeekRanges(monthKey: string): Array<{ start: string; end: string }> {
  const [year, month] = monthKey.split('-').map(Number)
  const monthEnd = new Date(year, month, 0)
  const cursor = new Date(year, month - 1, 1)
  const ranges: Array<{ start: string; end: string }> = []

  while (cursor <= monthEnd) {
    const start = new Date(cursor)
    const daysToSunday = (7 - start.getDay()) % 7
    const end = new Date(start)
    end.setDate(start.getDate() + daysToSunday)
    if (end > monthEnd) end.setTime(monthEnd.getTime())
    ranges.push({ start: isoDate(start), end: isoDate(end) })
    cursor.setTime(end.getTime())
    cursor.setDate(cursor.getDate() + 1)
  }

  return ranges
}

/** Retorna a chave YYYY-MM quando o intervalo cobre exatamente um mês calendário. */
export function fullCalendarMonthKey(start: string, end: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start)
  if (!match || match[3] !== '01') return null

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null

  const expectedEnd = isoDate(new Date(year, month, 0))
  return end === expectedEnd ? `${match[1]}-${match[2]}` : null
}
