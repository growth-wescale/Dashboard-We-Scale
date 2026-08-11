import type { Marca } from '@/lib/types'

// Fonte única das marcas ativas do dashboard.
// Antes vivia como `BRANDS`/`BRAND_DEFS` duplicado em 7 páginas com pequenas variações.

export interface BrandDef {
  /** Slug usado em rotas, seletores e chaves internas. */
  key: string
  /** Rótulo exibido na UI. */
  label: string
  /** Marca canônica (na coluna `marca` do banco). Undefined = consolidado. */
  marca: Marca | undefined
  /** Cor principal (accent) da marca. */
  accent: string
  /** Cor escura (usada em headers/footers com contraste). */
  dark: string
}

/** Marca especial que representa "consolidado" (todas as marcas). */
export const BRAND_OVERVIEW: BrandDef = {
  key: 'overview', label: 'Consolidado', marca: undefined,
  accent: '#2ABCB5', dark: '#1A847F',
}

/** Marcas reais (sem consolidado). Ordem = ordem de exibição. */
export const BRAND_LIST: BrandDef[] = [
  { key: 'oral-unic',    label: 'Oral Unic',    marca: 'Oral Unic',    accent: '#7F0C72', dark: '#540247' },
  { key: 'odonto-scale', label: 'Odonto Scale', marca: 'Odonto Scale', accent: '#0EA5E9', dark: '#075985' },
  { key: 'inpot',        label: 'Inpot',        marca: 'Inpot',        accent: '#C6D32D', dark: '#0B3120' },
  { key: 'eletrovias',   label: 'Eletrovias',   marca: 'Eletrovias',   accent: '#ED6D3A', dark: '#4E2800' },
  { key: 'liso-laser',   label: 'Lisô Laser',   marca: 'Lisô Laser',   accent: '#FF6643', dark: '#6E1D61' },
  { key: 'b2case',       label: 'B2Case',       marca: 'B2Case',       accent: '#0169F2', dark: '#040492' },
  { key: 'viva',         label: 'Viva',         marca: 'Viva',         accent: '#FF0069', dark: '#141414' },
]

/** Lista completa com consolidado no topo (usada nos dropdowns das páginas de Vendas). */
export const BRANDS_WITH_OVERVIEW: BrandDef[] = [BRAND_OVERVIEW, ...BRAND_LIST]

/** Só marcas reais, sem Odonto Scale — usada em Marketing (Odonto Legacy fica dentro de Oral Unic). */
export const BRAND_LIST_MARKETING: BrandDef[] = BRAND_LIST.filter(b => b.key !== 'odonto-scale')

/** Retorna a BrandDef pelo key (ou undefined). */
export function findBrand(key: string | undefined): BrandDef | undefined {
  if (!key) return undefined
  if (key === 'overview') return BRAND_OVERVIEW
  return BRAND_LIST.find(b => b.key === key)
}

/** Retorna a BrandDef pelo nome da marca canônica. */
export function findBrandByMarca(marca: string | null | undefined): BrandDef | undefined {
  if (!marca) return undefined
  return BRAND_LIST.find(b => b.marca === marca)
}

/** Mapa slug→cor (accent). Substitui MARCA_COR em types.ts que estava desatualizado. */
export const BRAND_ACCENT: Record<string, string> = Object.fromEntries(
  BRAND_LIST.map(b => [b.marca!, b.accent]),
)
