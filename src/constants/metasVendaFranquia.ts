/**
 * Metas de venda de franquia · 2026 completo (jan-dez) por marca × mês.
 *
 * Fonte: planilha "Meta - Venda de Franquia.xlsx" enviada pelo Junior em
 * 03/09/2026. Substitui a meta que vinha do Supabase de Expansão
 * (`DB_Metas_Performance`) na página `/okrs` → Meta de vendas. Isolado só
 * pra essa página — as outras views (Visão Macro, CampanhaMetas) continuam
 * lendo do banco.
 *
 * Só marcas de franquia B2B. Odonto Scale/Legacy, Do Zero ao Consultório
 * e Oral Unic Legacy ficam de fora (produto/canal diferente).
 *
 * Atualização: quando a planilha mudar, atualize os valores aqui e abra
 * PR. Não há sincronização automática.
 */

export interface MetaMes {
  meta_qtd: number
  meta_receita: number
}

export type MesKey =
  | '2026-01' | '2026-02' | '2026-03' | '2026-04' | '2026-05' | '2026-06'
  | '2026-07' | '2026-08' | '2026-09' | '2026-10' | '2026-11' | '2026-12'

export const MESES_2026: MesKey[] = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
]

/** Marcas de franquia B2B com meta cadastrada na planilha. */
export const MARCAS_FRANQUIA = [
  'Oral Unic',
  'Lisô Laser',
  'Inpot',
  'B2Case',
  'Viva',
  'Eletrovias',
] as const

export type MarcaFranquia = typeof MARCAS_FRANQUIA[number]

export const METAS_VENDA_FRANQUIA: Record<MarcaFranquia, Record<MesKey, MetaMes>> = {
  'Oral Unic': {
    '2026-01': { meta_qtd: 0, meta_receita: 0 },
    '2026-02': { meta_qtd: 2, meta_receita: 149800 },
    '2026-03': { meta_qtd: 0, meta_receita: 0 },
    '2026-04': { meta_qtd: 2, meta_receita: 149800 },
    '2026-05': { meta_qtd: 0, meta_receita: 0 },
    '2026-06': { meta_qtd: 0, meta_receita: 0 },
    '2026-07': { meta_qtd: 1, meta_receita: 74900 },
    '2026-08': { meta_qtd: 1, meta_receita: 74900 },
    '2026-09': { meta_qtd: 2, meta_receita: 149800 },
    '2026-10': { meta_qtd: 0, meta_receita: 0 },
    '2026-11': { meta_qtd: 2, meta_receita: 149800 },
    '2026-12': { meta_qtd: 1, meta_receita: 74900 },
  },
  'Lisô Laser': {
    '2026-01': { meta_qtd: 0, meta_receita: 0 },
    '2026-02': { meta_qtd: 1, meta_receita: 39900 },
    '2026-03': { meta_qtd: 0, meta_receita: 0 },
    '2026-04': { meta_qtd: 0, meta_receita: 0 },
    '2026-05': { meta_qtd: 1, meta_receita: 39900 },
    '2026-06': { meta_qtd: 1, meta_receita: 39900 },
    '2026-07': { meta_qtd: 0, meta_receita: 0 },
    '2026-08': { meta_qtd: 2, meta_receita: 79800 },
    '2026-09': { meta_qtd: 2, meta_receita: 79800 },
    '2026-10': { meta_qtd: 1, meta_receita: 39900 },
    '2026-11': { meta_qtd: 1, meta_receita: 39900 },
    '2026-12': { meta_qtd: 0, meta_receita: 0 },
  },
  'Inpot': {
    '2026-01': { meta_qtd: 1, meta_receita: 74900 },
    '2026-02': { meta_qtd: 1, meta_receita: 74900 },
    '2026-03': { meta_qtd: 2, meta_receita: 149800 },
    '2026-04': { meta_qtd: 2, meta_receita: 149800 },
    '2026-05': { meta_qtd: 3, meta_receita: 224700 },
    '2026-06': { meta_qtd: 3, meta_receita: 224700 },
    '2026-07': { meta_qtd: 3, meta_receita: 224700 },
    '2026-08': { meta_qtd: 3, meta_receita: 224700 },
    '2026-09': { meta_qtd: 3, meta_receita: 224700 },
    '2026-10': { meta_qtd: 2, meta_receita: 149800 },
    '2026-11': { meta_qtd: 3, meta_receita: 224700 },
    '2026-12': { meta_qtd: 1, meta_receita: 74900 },
  },
  'B2Case': {
    '2026-01': { meta_qtd: 0, meta_receita: 0 },
    '2026-02': { meta_qtd: 0, meta_receita: 0 },
    '2026-03': { meta_qtd: 1, meta_receita: 10000 },
    '2026-04': { meta_qtd: 2, meta_receita: 20000 },
    '2026-05': { meta_qtd: 3, meta_receita: 30000 },
    '2026-06': { meta_qtd: 4, meta_receita: 40000 },
    '2026-07': { meta_qtd: 4, meta_receita: 40000 },
    '2026-08': { meta_qtd: 4, meta_receita: 40000 },
    '2026-09': { meta_qtd: 4, meta_receita: 40000 },
    '2026-10': { meta_qtd: 3, meta_receita: 30000 },
    '2026-11': { meta_qtd: 4, meta_receita: 40000 },
    '2026-12': { meta_qtd: 4, meta_receita: 40000 },
  },
  'Viva': {
    '2026-01': { meta_qtd: 0, meta_receita: 0 },
    '2026-02': { meta_qtd: 0, meta_receita: 0 },
    '2026-03': { meta_qtd: 0, meta_receita: 0 },
    '2026-04': { meta_qtd: 0, meta_receita: 0 },
    '2026-05': { meta_qtd: 1, meta_receita: 69900 },
    '2026-06': { meta_qtd: 1, meta_receita: 69900 },
    '2026-07': { meta_qtd: 0, meta_receita: 0 },
    '2026-08': { meta_qtd: 0, meta_receita: 0 },
    '2026-09': { meta_qtd: 1, meta_receita: 69900 },
    '2026-10': { meta_qtd: 0, meta_receita: 0 },
    '2026-11': { meta_qtd: 1, meta_receita: 69900 },
    '2026-12': { meta_qtd: 0, meta_receita: 0 },
  },
  'Eletrovias': {
    '2026-01': { meta_qtd: 0, meta_receita: 0 },
    '2026-02': { meta_qtd: 0, meta_receita: 0 },
    '2026-03': { meta_qtd: 0, meta_receita: 0 },
    '2026-04': { meta_qtd: 0, meta_receita: 0 },
    '2026-05': { meta_qtd: 3, meta_receita: 119700 },
    '2026-06': { meta_qtd: 6, meta_receita: 239400 },
    '2026-07': { meta_qtd: 3, meta_receita: 119700 },
    '2026-08': { meta_qtd: 3, meta_receita: 119700 },
    '2026-09': { meta_qtd: 4, meta_receita: 159600 },
    '2026-10': { meta_qtd: 2, meta_receita: 79800 },
    '2026-11': { meta_qtd: 4, meta_receita: 159600 },
    '2026-12': { meta_qtd: 3, meta_receita: 119700 },
  },
}

export function getMetaMes(marca: string, mesKey: string): MetaMes {
  const key = mesKey as MesKey
  if (!(marca in METAS_VENDA_FRANQUIA)) return { meta_qtd: 0, meta_receita: 0 }
  const mes = METAS_VENDA_FRANQUIA[marca as MarcaFranquia][key]
  return mes ?? { meta_qtd: 0, meta_receita: 0 }
}
