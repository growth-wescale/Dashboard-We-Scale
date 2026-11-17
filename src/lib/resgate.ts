import type { FunnelRow } from './funnelTypes'

/**
 * Resgate = negócio perdido e reaberto num dia (Brasília) diferente do dia da
 * perda. A regra mora em `vw_funil_vendas.eh_resgate` (docs/sql/2026-11-17-resgate.sql);
 * aqui só se lê a coluna — pop-ups de deal e Corrida usam esta função.
 */
export function ehResgate(row: { eh_resgate?: boolean | null }): boolean {
  return row.eh_resgate === true
}

/**
 * Início do leadtime geral do negócio. No ciclo 1 é o MQL (senão a criação).
 * Do ciclo 2 em diante é a criação original do negócio: o MQL do ciclo pode ter
 * entrado de novo depois da reabertura e não é o começo da história.
 */
export function inicioLeadtimeGeral(
  row: Pick<FunnelRow, 'ciclo' | 'data_novo_mql' | 'data_criacao_original'>,
): string | null {
  if (row.ciclo > 1) return row.data_criacao_original ?? null
  return row.data_novo_mql ?? row.data_criacao_original ?? null
}

/** Início do leadtime pós-reativação: a reabertura, só em resgate. */
export function inicioPosReativacao(
  row: Pick<FunnelRow, 'eh_resgate' | 'data_criacao_negociacao'>,
): string | null {
  return ehResgate(row) ? (row.data_criacao_negociacao ?? null) : null
}

/** Dias entre a perda anterior e a reabertura; null se faltar data ou vier fora de ordem. */
export function diasParado(
  row: Pick<FunnelRow, 'data_perda_anterior' | 'data_criacao_negociacao'>,
): number | null {
  if (!row.data_perda_anterior || !row.data_criacao_negociacao) return null
  const t0 = new Date(row.data_perda_anterior).getTime()
  const t1 = new Date(row.data_criacao_negociacao).getTime()
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null
  return Math.round((t1 - t0) / 86_400_000)
}
