import { isOralUnicMigrationLead, isOralUnicMigrationMedia } from './oralUnicOuroScope'
import { isLegacyMigrationMedia } from './legacyOuroScope'

export const previaMensal = import.meta.env.VITE_PREVIA_MENSAL === 'true' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)

export const marcasMensais = ['Inpot','B2Case','Viva','Eletrovias','Lisô Laser','Beauty Connection','Odonto Scale','Odonto Legacy','Oral Unic']
export interface PeriodoMensal { inicio: string; fim: string }

function deslocar(dia: string, dias: number) {
  const data = new Date(dia + 'T12:00:00Z')
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

// Inclusive bounds match the dashboard's date filters. Unbounded reads stop at today.
export function periodoMensal(params: URLSearchParams, hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })): PeriodoMensal | undefined {
  let inicio = '2026-11-01', fim: string | undefined
  for (const value of params.getAll('dia')) {
    const [op, dia] = value.split('.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Data de Marketing inválida.')
    if (op === 'eq' || op === 'gte' || op === 'gt') {
      const lower = op === 'gt' ? deslocar(dia, 1) : dia
      if (lower > inicio) inicio = lower
    }
    if (op === 'eq' || op === 'lte' || op === 'lt') {
      const upper = op === 'lt' ? deslocar(dia, -1) : dia
      if (!fim || upper < fim) fim = upper
    }
  }
  fim ??= inicio > hoje ? inicio : hoje
  return inicio <= fim ? { inicio, fim } : undefined
}

export function linhaMensal(row: Record<string, unknown>, table: string) {
  if (!marcasMensais.includes(String(row.marca))) return false
  if (table === 'leads') return row.marca !== 'Oral Unic' || isOralUnicMigrationLead(row)
  if (row.marca === 'Oral Unic' || row.marca === 'Odonto Scale' || row.marca === 'Odonto Legacy')
    return isOralUnicMigrationMedia(row) || isLegacyMigrationMedia(row)
  return true
}
