// Referências de pré-vendas aprovadas em 14/10/2026: 20%, exceto Inpot 23%.
// Não substituem as metas da Missão nem o cadastro comercial compartilhado.
export const METAS_MQL_SQL_PERFORMANCE: Readonly<Record<string, number>> = {
  'Oral Unic': 20, Inpot: 23, 'Lisô Laser': 20, B2Case: 20,
  Viva: 20, Eletrovias: 20, 'Odonto Scale': 20,
}

export function metaMqlSqlPerformance(volumes: ReadonlyArray<{ marca: string; mql: number }>): number | null {
  let peso = 0, soma = 0
  for (const { marca, mql } of volumes) {
    if (mql <= 0) continue
    const meta = METAS_MQL_SQL_PERFORMANCE[marca]
    // Nunca mostrar uma meta parcial quando há volume sem referência aprovada.
    if (meta === undefined) return null
    peso += mql
    soma += mql * meta
  }
  return peso > 0 ? soma / peso : null
}
