import { describe, it, expect } from 'vitest'
import { toLocalDate, toLocalYearMonth, businessDaysInMonth } from '@/lib/dateUtils'

describe('toLocalDate', () => {
  it('converte timestamptz UTC pro dia em Brasília', () => {
    // 2026-08-19T02:00Z == 2026-08-18T23:00 em BRT (UTC-3)
    expect(toLocalDate('2026-08-19T02:00:00+00:00')).toBe('2026-08-18')
    expect(toLocalDate('2026-08-19T10:00:00+00:00')).toBe('2026-08-19')
  })

  it('data pura (sem hora) passa direto, sem subtrair fuso', () => {
    // Bug real: new Date('2026-08-19') vira meia-noite UTC, que em BRT
    // (UTC-3) é 21h do dia 18 — um evento de 19/08 virava 18/08 e sumia de
    // qualquer filtro de um único dia (19 a 19).
    expect(toLocalDate('2026-08-19')).toBe('2026-08-19')
    expect(toLocalDate('2026-01-01')).toBe('2026-01-01')
  })

  it('nulo ou vazio vira null', () => {
    expect(toLocalDate(null)).toBeNull()
    expect(toLocalDate(undefined)).toBeNull()
    expect(toLocalDate('')).toBeNull()
  })

  it('data inválida vira null', () => {
    expect(toLocalDate('não é data')).toBeNull()
  })
})

describe('toLocalYearMonth', () => {
  it('data pura preserva o mês, sem virar o mês anterior na virada', () => {
    expect(toLocalYearMonth('2026-08-01')).toBe('2026-08')
  })

  it('timestamptz perto da virada de mês usa o mês certo em Brasília', () => {
    // 2026-09-01T02:00Z == 2026-08-31T23:00 em BRT — ainda agosto.
    expect(toLocalYearMonth('2026-09-01T02:00:00+00:00')).toBe('2026-08')
  })
})

describe('businessDaysInMonth', () => {
  it('conta segunda a sábado, exclui domingo (fev/2026: começa domingo, 28 dias, 4 domingos)', () => {
    // 2026-02-01 é domingo; domingos em 1, 8, 15, 22 → 28 - 4 = 24
    expect(businessDaysInMonth('2026-02')).toBe(24)
  })

  it('mês de 31 dias começando quinta (jan/2026: domingos em 4,11,18,25)', () => {
    // 2026-01-01 é quinta; 4 domingos → 31 - 4 = 27
    expect(businessDaysInMonth('2026-01')).toBe(27)
  })

  it('mês de 31 dias começando domingo (mar/2026: domingos em 1,8,15,22,29)', () => {
    // 2026-03-01 é domingo; 5 domingos → 31 - 5 = 26
    expect(businessDaysInMonth('2026-03')).toBe(26)
  })
})
