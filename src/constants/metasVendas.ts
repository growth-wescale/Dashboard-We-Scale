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
