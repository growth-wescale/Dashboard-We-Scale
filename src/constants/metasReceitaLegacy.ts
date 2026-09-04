/**
 * Metas de receita mensal · Odonto Legacy (marca 'Odonto Scale' no banco).
 *
 * Consumido pelo card RECEITA do slide Odonto Legacy da SOP. As outras
 * marcas de franquia B2B têm meta em `metasVendaFranquia.ts` (fonte:
 * planilha "Meta - Venda de Franquia.xlsx"), mas Odonto Legacy fica de fora
 * lá porque é produto diferente (Consultoria, não franquia). Meta abaixo
 * veio do Junior em 04/09/2026.
 */

export interface MetaReceitaLegacyMes {
  meta_receita: number
}

export const METAS_RECEITA_LEGACY: Record<string, MetaReceitaLegacyMes> = {
  '2026-08': { meta_receita: 39880 },
  '2026-09': { meta_receita: 69790 },
  '2026-10': { meta_receita: 89730 },
  '2026-11': { meta_receita: 89730 },
  '2026-12': { meta_receita: 89730 },
}

export function getMetaReceitaLegacy(mesKey: string): MetaReceitaLegacyMes {
  return METAS_RECEITA_LEGACY[mesKey] ?? { meta_receita: 0 }
}
