import type { Marca } from '@/lib/types'

export const MISSAO = {
  ano: 2026,
  inicio: '2026-10-01',
  fim: '2026-12-31',
  receitaAnual: 4_932_000,
  receitaTrimestre: 2_068_360,
} as const

export const MESES_MISSAO = [
  { inicio: '2026-10-01', fim: '2026-10-31', label: 'Outubro', peso: .4, dias: 31 },
  { inicio: '2026-11-01', fim: '2026-11-30', label: 'Novembro', peso: .4, dias: 30 },
  { inicio: '2026-12-01', fim: '2026-12-31', label: 'Dezembro', peso: .2, dias: 31 },
] as const

export interface MetaMissao {
  marca: Marca
  investimento: number
  cpmql: number
  mqlSql: number
  sqlVenda: number
  salVenda: number
}

export const METAS_MISSAO: readonly MetaMissao[] = [
  { marca: 'Inpot', investimento: 90_000, cpmql: 220, mqlSql: 26, sqlVenda: 10, salVenda: 16 },
  { marca: 'Eletrovias', investimento: 76_000, cpmql: 37, mqlSql: 26, sqlVenda: 5, salVenda: 10 },
  { marca: 'Lisô Laser', investimento: 72_000, cpmql: 300, mqlSql: 10, sqlVenda: 16.7, salVenda: 16 },
]
