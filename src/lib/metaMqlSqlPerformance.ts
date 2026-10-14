// Referências de pré-vendas aprovadas na planilha enviada em 14/10/2026.
// Não substituem as metas da Missão nem o cadastro comercial compartilhado.
export const METAS_MQL_SQL_PERFORMANCE: Readonly<Record<string, number>> = {
  'Oral Unic': 10, Inpot: 23, 'Lisô Laser': 15, B2Case: 15,
  Viva: 10, Eletrovias: 10, 'Odonto Scale': 8,
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
