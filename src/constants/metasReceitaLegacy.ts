/**
 * Metas de receita mensal · Odonto Legacy (marca 'Odonto Scale' no banco).
 *
 * Consumido pelo card RECEITA do slide Odonto Legacy da SOP. As outras
 * marcas de franquia B2B têm meta em `metasVendaFranquia.ts` (fonte:
 * planilha "Meta - Venda de Franquia.xlsx"), mas Odonto Legacy fica de fora
 * lá porque é produto diferente (Consultoria, não franquia). Meta abaixo
 * Histórico de agosto/setembro preservado. Metas out–dez revisadas por
 * Gabriel em 20/10/2026, somente para a S&OP Legacy.
 */

export interface MetaReceitaLegacyMes {
  meta_receita: number
}

export const METAS_RECEITA_LEGACY: Record<string, MetaReceitaLegacyMes> = {
  '2026-08': { meta_receita: 39880 },
  '2026-09': { meta_receita: 69790 },
  '2026-10': { meta_receita: 29910 },
  '2026-11': { meta_receita: 41874 },
  '2026-12': { meta_receita: 29910 },
}

export function getMetaReceitaLegacy(mesKey: string): MetaReceitaLegacyMes {
  return METAS_RECEITA_LEGACY[mesKey] ?? { meta_receita: 0 }
}
