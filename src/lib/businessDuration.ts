/**
 * Duração entre duas datas contando só horário comercial: segunda a sexta,
 * 08h-18h, horário de Brasília. Usado pelos cards de leadtime da Performance
 * (aba SDR) — pedido explícito do Junior, mesma régua do dashboard antigo.
 *
 * Não reaproveita `src/lib/businessHours.ts` (09h-18h, fuso do NAVEGADOR, hoje
 * só usado por Análise de Perda) — mudar a janela ali alteraria os números já
 * publicados daquela aba, fora do escopo deste pedido.
 *
 * América/São_Paulo é UTC-3 fixo, sem horário de verão desde 2019 — dá pra
 * usar um deslocamento constante em vez de `Intl.DateTimeFormat`, e ler os
 * campos com os acessores `getUTC*` (sem depender do fuso da máquina que
 * roda o código). Mesma premissa já usada em `dateUtils.ts`.
 */

const WORK_START_HOUR = 8
const WORK_END_HOUR = 18
const DAY_MINUTES = (WORK_END_HOUR - WORK_START_HOUR) * 60 // 600 = 1 "dia útil"
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

function toBrtShifted(d: Date): Date {
  return new Date(d.getTime() - BRT_OFFSET_MS)
}

/**
 * Minutos de horário comercial (seg-sex, 08h-18h BRT) entre `start` e `end`.
 * `null` se alguma data faltar ou for inválida. `0` se `end` <= `start`.
 */
export function businessMinutesBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  if (b.getTime() <= a.getTime()) return 0

  const aShift = toBrtShifted(a)
  const bShift = toBrtShifted(b)

  let totalMin = 0
  const cursor = new Date(Date.UTC(aShift.getUTCFullYear(), aShift.getUTCMonth(), aShift.getUTCDate()))

  while (cursor.getTime() <= bShift.getTime()) {
    const dow = cursor.getUTCDay() // 0 = domingo
    if (dow >= 1 && dow <= 5) {
      const dayStart = new Date(cursor.getTime() + WORK_START_HOUR * 3_600_000)
      const dayEnd = new Date(cursor.getTime() + WORK_END_HOUR * 3_600_000)
      const from = aShift.getTime() > dayStart.getTime() ? aShift : dayStart
      const to = bShift.getTime() < dayEnd.getTime() ? bShift : dayEnd
      const diffMs = to.getTime() - from.getTime()
      if (diffMs > 0) totalMin += diffMs / 60_000
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return totalMin
}

/**
 * "1d 6h 10min" — 1 dia = `DAY_MINUTES` (10h úteis), não 24h corridas.
 * Omite unidades zeradas ("1d 32min", nunca "1d 0h 32min"), exceto minutos:
 * sempre aparece, mesmo "0min", quando é a única unidade não-zero disponível.
 */
export function formatBusinessDuration(totalMinutes: number | null): string {
  if (totalMinutes == null || totalMinutes <= 0) return '—'
  const mins = Math.round(totalMinutes)
  const days = Math.floor(mins / DAY_MINUTES)
  const hours = Math.floor((mins % DAY_MINUTES) / 60)
  const minutes = mins % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`)
  return parts.join(' ')
}
