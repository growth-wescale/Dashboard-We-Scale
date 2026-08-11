// Cálculo de horas úteis entre duas datas.
// Regra simples: seg–sex, 09:00–18:00 (horário local do navegador).
// Feriados não são considerados (fora do escopo, e o app de referência também ignora).

const WORK_START_HOUR = 9
const WORK_END_HOUR   = 18
const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR

/** Diferença em horas úteis entre `start` e `end`. Se `end` < `start`, retorna 0. */
export function businessHoursBetween(start: Date | string, end: Date | string): number {
  const a = typeof start === 'string' ? new Date(start) : start
  const b = typeof end   === 'string' ? new Date(end)   : end
  if (b.getTime() <= a.getTime()) return 0

  let total = 0
  const cursor = new Date(a)

  while (cursor < b) {
    const dow = cursor.getDay() // 0=domingo, 6=sábado
    if (dow >= 1 && dow <= 5) {
      const dayStart = new Date(cursor); dayStart.setHours(WORK_START_HOUR, 0, 0, 0)
      const dayEnd   = new Date(cursor); dayEnd.setHours(WORK_END_HOUR, 0, 0, 0)

      // Ponto efetivo de início neste dia = max(cursor, dayStart)
      const from = cursor.getTime() > dayStart.getTime() ? cursor : dayStart
      // Ponto efetivo de fim = min(b, dayEnd)
      const to   = b.getTime()      < dayEnd.getTime()   ? b       : dayEnd

      const diffMs = to.getTime() - from.getTime()
      if (diffMs > 0) total += diffMs / 3_600_000
    }
    // Avança para o dia seguinte, 00:00
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(0, 0, 0, 0)
  }

  return total
}

/** Mesmo cálculo, retornando em dias úteis (fracionários — 4h = 0,44 dia útil). */
export function businessDaysBetween(start: Date | string, end: Date | string): number {
  return businessHoursBetween(start, end) / WORK_HOURS_PER_DAY
}
