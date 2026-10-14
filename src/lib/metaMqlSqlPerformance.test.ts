import { describe, expect, it } from 'vitest'
import { metaMqlSqlPerformance, METAS_MQL_SQL_PERFORMANCE } from './metaMqlSqlPerformance'

describe('meta MQL SQL exclusiva Performance', () => {
  it.each(Object.entries(METAS_MQL_SQL_PERFORMANCE))('usa referência de %s', (marca, meta) => {
    expect(metaMqlSqlPerformance([{ marca, mql: 10 }])).toBe(meta)
  })
  it('pondera pelo MQL e não pela média simples', () => {
    expect(metaMqlSqlPerformance([{ marca: 'Inpot', mql: 100 }, { marca: 'Eletrovias', mql: 300 }])).toBe(20.75)
  })
  it('volume zero não pesa; vazio e marca sem meta ficam pendentes', () => {
    expect(metaMqlSqlPerformance([])).toBeNull()
    expect(metaMqlSqlPerformance([{ marca: 'Inpot', mql: 0 }])).toBeNull()
    expect(metaMqlSqlPerformance([{ marca: 'Inpot', mql: 1 }, { marca: 'Outra', mql: 1 }])).toBeNull()
  })
})
