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
