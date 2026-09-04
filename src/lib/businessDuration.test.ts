import { describe, it, expect } from 'vitest'
import { businessMinutesBetween, formatBusinessDuration } from '@/lib/businessDuration'

// 2026-09-07 é segunda-feira; 2026-09-11 sexta; 2026-09-14 a segunda seguinte.
describe('businessMinutesBetween', () => {
  it('mesmo dia útil, dentro da janela 08h-18h: diferença crua', () => {
    const min = businessMinutesBetween('2026-09-07T11:00:00-03:00', '2026-09-07T11:30:00-03:00')
    expect(min).toBe(30)
  })

  it('início antes das 08h é grudado no início do expediente', () => {
    const min = businessMinutesBetween('2026-09-07T06:00:00-03:00', '2026-09-07T09:00:00-03:00')
    expect(min).toBe(60) // só 08h-09h conta
  })

  it('fim depois das 18h é grudado no fim do expediente', () => {
    const min = businessMinutesBetween('2026-09-07T17:30:00-03:00', '2026-09-07T20:00:00-03:00')
    expect(min).toBe(30) // só 17h30-18h conta
  })

  it('atravessa um fim de semana: sexta 17h -> segunda 09h = 1h + 1h', () => {
    const min = businessMinutesBetween('2026-09-11T17:00:00-03:00', '2026-09-14T09:00:00-03:00')
    expect(min).toBe(120)
  })

  it('início já depois do expediente: só conta o dia seguinte', () => {
    const min = businessMinutesBetween('2026-09-07T19:00:00-03:00', '2026-09-08T09:00:00-03:00')
    expect(min).toBe(60) // nada de segunda à noite, só terça 08h-09h
  })

  it('datas nulas ou inválidas devolvem null', () => {
    expect(businessMinutesBetween(null, '2026-09-07T11:00:00-03:00')).toBeNull()
    expect(businessMinutesBetween('2026-09-07T11:00:00-03:00', null)).toBeNull()
    expect(businessMinutesBetween(undefined, undefined)).toBeNull()
  })

  it('fim antes ou igual ao início devolve 0', () => {
    expect(businessMinutesBetween('2026-09-07T11:00:00-03:00', '2026-09-07T10:00:00-03:00')).toBe(0)
    expect(businessMinutesBetween('2026-09-07T11:00:00-03:00', '2026-09-07T11:00:00-03:00')).toBe(0)
  })
})

describe('formatBusinessDuration', () => {
  it('formata em dias úteis (10h = 1d) + horas + minutos, omitindo unidades zeradas', () => {
    expect(formatBusinessDuration(336)).toBe('5h 36min')
    expect(formatBusinessDuration(970)).toBe('1d 6h 10min')
    expect(formatBusinessDuration(7400)).toBe('12d 3h 20min')
  })

  it('omite "0h" quando há dia mas zero horas — nunca "1d 0h 32min"', () => {
    expect(formatBusinessDuration(632)).toBe('1d 32min') // 600 + 32
  })

  it('menos de 1h mostra só minutos', () => {
    expect(formatBusinessDuration(45)).toBe('45min')
  })

  it('nulo, zero ou negativo mostra travessão', () => {
    expect(formatBusinessDuration(null)).toBe('—')
    expect(formatBusinessDuration(0)).toBe('—')
    expect(formatBusinessDuration(-10)).toBe('—')
  })
})
