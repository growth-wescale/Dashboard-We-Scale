import { describe, it, expect } from 'vitest'
import { toLocalDate, toLocalYearMonth } from '@/lib/dateUtils'

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
