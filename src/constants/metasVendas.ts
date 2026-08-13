import type { Marca } from '@/lib/types'

// Meta de vendas por marca por mês (chave: YYYY-MM)
// Alimenta o funil inverso do S&OP: quantos leads/opps preciso em cada etapa pra bater a meta
export const META_VENDAS: Record<string, Partial<Record<Marca, number>>> = {
  '2026-07': {
    'Odonto Scale': 5,
    'B2Case': 4,
    'Inpot': 3,
    'Eletrovias': 3,
    'Viva': 1,
    'Oral Unic': 1,
    'Lisô Laser': 1,
  },
  '2026-08': {
    'Odonto Scale': 7,
    'Inpot': 5,
    'B2Case': 4,
    'Eletrovias': 3,
    'Oral Unic': 2,
    'Lisô Laser': 2,
    'Viva': 1,
  },
}

export function getMetaVendas(marca: Marca, mesKey: string): number | null {
  return META_VENDAS[mesKey]?.[marca] ?? null
}

// Vendas realizadas confirmadas manualmente para meses fechados.
// Usado no funil inverso do S&OP quando o toggle de mês fechado está ativo
// (a base do CRM tem lacunas em Julho e diverge dos números confirmados).
export const VENDAS_REALIZADAS_OVERRIDE: Record<string, Partial<Record<Marca, number>>> = {
  '2026-07': {
    'Odonto Scale': 3,
    'B2Case': 9,
    'Inpot': 1,
    'Eletrovias': 3,
    'Viva': 0,
    'Oral Unic': 0,
    'Lisô Laser': 0,
  },
}

export function getVendasRealizadasOverride(marca: Marca, mesKey: string): number | null {
  const v = VENDAS_REALIZADAS_OVERRIDE[mesKey]?.[marca]
  return v == null ? null : v
}

// Taxas de conversão históricas usadas no funil inverso de meses fechados.
// Cada valor é upper/lower (ex: taxa_venda_opp = vendas/oportunidades).
// Valores baseline — ajustar por marca conforme dados reais do CRM se necessário.
export interface FunilTaxas {
  venda_por_opp: number      // taxa Vendas / Opp
  opp_por_sal: number        // taxa Opp / SAL
  sal_por_diag: number       // taxa SAL / Diagnóstico
  diag_por_sql: number       // taxa Diagnóstico / SQL
  sql_por_mql: number        // taxa SQL / MQL
}

const TAXAS_DEFAULT: FunilTaxas = {
  venda_por_opp: 0.40,
  opp_por_sal: 0.50,
  sal_por_diag: 0.55,
  diag_por_sql: 0.60,
  sql_por_mql: 0.30,
}

// Override por marca (opcional). Se não definir, usa TAXAS_DEFAULT.
export const TAXAS_HISTORICAS_POR_MARCA: Partial<Record<Marca, Partial<FunilTaxas>>> = {
  // Exemplo:
  // 'Odonto Scale': { venda_por_opp: 0.45, opp_por_sal: 0.55 },
}

export function getFunilTaxas(marca: Marca): FunilTaxas {
  const override = TAXAS_HISTORICAS_POR_MARCA[marca] ?? {}
  return { ...TAXAS_DEFAULT, ...override }
}
