import { describe, expect, it } from 'vitest'
import { closedMonthWeekRanges, safeUnitCost, sopComparisonEnd } from '@/lib/sopPeriods'

describe('sopComparisonEnd', () => {
  it('usa o fim completo de um mês fechado', () => {
    expect(sopComparisonEnd('2026-09', true, '2026-09-30', new Date(2026, 9, 2)))
      .toBe('2026-09-30')
  })

  it('mantém MTD equivalente no mês corrente', () => {
    expect(sopComparisonEnd('2026-10', false, '2026-10-02', new Date(2026, 9, 2)))
      .toBe('2026-10-02')
  })

  it('limita o dia ao tamanho do mês comparado', () => {
    expect(sopComparisonEnd('2026-02', false, '2026-02-28', new Date(2026, 2, 31)))
      .toBe('2026-02-28')
  })
})

describe('safeUnitCost', () => {
  it('calcula o custo quando existe volume', () => {
    expect(safeUnitCost(100, 4)).toBe(25)
  })

  it('não produz infinito quando o volume é zero', () => {
    expect(safeUnitCost(2628, 0)).toBeNull()
  })
})

describe('closedMonthWeekRanges', () => {
  it('cobre setembro fechado inteiro, incluindo os dias 28–30', () => {
    expect(closedMonthWeekRanges('2026-09')).toEqual([
      { start: '2026-09-01', end: '2026-09-06' },
      { start: '2026-09-07', end: '2026-09-13' },
      { start: '2026-09-14', end: '2026-09-20' },
      { start: '2026-09-21', end: '2026-09-27' },
      { start: '2026-09-28', end: '2026-09-30' },
    ])
  })
})
