import { describe, it, expect } from 'vitest'
import { fmtDias, fmtDiasCurto, rotuloDia, rotuloDiaSemana } from './layout'

describe('formatos da linha do tempo', () => {
  it('rotuloDia usa o dia de Brasília', () => {
    expect(rotuloDia(new Date('2026-08-07T12:00:00Z'))).toBe('7 ago')
    expect(rotuloDia(new Date('2026-08-08T02:00:00Z'))).toBe('7 ago') // 23h em Brasília
  })
  it('fmtDiasCurto e fmtDias', () => {
    expect([fmtDiasCurto(0.2), fmtDiasCurto(1), fmtDiasCurto(12.4)]).toEqual(['5H', '1 DIA', '12 DIAS'])
    expect([fmtDias(0.2), fmtDias(1), fmtDias(6.6)]).toEqual(['5 h', '1 dia', '7 dias'])
  })
  it('rotuloDiaSemana', () => {
    expect(rotuloDiaSemana('2026-10-17')).toBe('sáb, 17 out')
  })
})
