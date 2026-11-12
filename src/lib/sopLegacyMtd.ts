import { marketingMqlRows } from './leadUtils'
import type { Lead } from './types'

export function mesesMtdLegacy(corte: string) {
  const [ano, mes, dia] = corte.split('-').map(Number)
  return Array.from({ length: 4 }, (_, offset) => {
    const inicio = new Date(Date.UTC(ano, mes - 1 - offset, 1))
    const dias = Math.min(dia, new Date(Date.UTC(ano, mes - offset, 0)).getUTCDate())
    const start = inicio.toISOString().slice(0, 10)
    return { start, end: start.slice(0, 8) + String(dias).padStart(2, '0'), dias }
  })
}

export function acumuladoMqlLegacy(rows: Lead[], periodo: ReturnType<typeof mesesMtdLegacy>[number]) {
  const porDia: number[] = Array(periodo.dias).fill(0)
  const doPeriodo = rows.filter(row => row.dia >= periodo.start && row.dia <= periodo.end)
  for (const row of marketingMqlRows(doPeriodo)) porDia[Number(row.dia.slice(-2)) - 1]++
  let total = 0
  return porDia.map(n => (total += n))
}
