import { describe, it, expect } from 'vitest'
import { leadtimeDias, fmtDias } from './dealDrawerShared'

const DIA = 86_400_000
const AGORA = new Date('2026-09-08T12:00:00Z').getTime()

describe('leadtimeDias', () => {
  it('conta os dias corridos entre início (MQL) e a data de referência da linha', () => {
    expect(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-11T00:00:00Z', AGORA)).toBe(10)
  })

  it('sem referência, mede do início até agora (deal ainda vivo)', () => {
    expect(leadtimeDias(new Date(AGORA - 3 * DIA).toISOString(), null, AGORA)).toBeCloseTo(3, 5)
  })

  it('retorna null quando falta o início', () => {
    expect(leadtimeDias(null, '2026-08-11T00:00:00Z', AGORA)).toBeNull()
    expect(leadtimeDias(undefined, '2026-08-11T00:00:00Z', AGORA)).toBeNull()
  })

  it('retorna null quando a referência é anterior ao início (evento fora de ordem)', () => {
    expect(leadtimeDias('2026-08-11T00:00:00Z', '2026-08-01T00:00:00Z', AGORA)).toBeNull()
  })

  it('retorna null para datas inválidas', () => {
    expect(leadtimeDias('não é data', '2026-08-11T00:00:00Z', AGORA)).toBeNull()
    expect(leadtimeDias('2026-08-01T00:00:00Z', 'lixo', AGORA)).toBeNull()
  })

  it('formata via fmtDias: horas abaixo de 1 dia, dias acima', () => {
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-01T06:00:00Z', AGORA))).toBe('6h')
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-04T00:00:00Z', AGORA))).toBe('3.0d')
    expect(fmtDias(leadtimeDias(null, null, AGORA))).toBe('—')
  })
})
