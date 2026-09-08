import { describe, it, expect } from 'vitest'
import { leadtimeDias, fmtDias, fmtDuracao } from './dealDrawerShared'

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

  it('formata via fmtDias: horas abaixo de 1 dia, dias acima (usado só na lista de etapas)', () => {
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-01T06:00:00Z', AGORA))).toBe('6h')
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-04T00:00:00Z', AGORA))).toBe('3.0d')
    expect(fmtDias(leadtimeDias(null, null, AGORA))).toBe('—')
  })
})

describe('fmtDuracao', () => {
  it('quebra em dia / hora / minuto', () => {
    // 4,3 dias = 4d 7h 12min
    expect(fmtDuracao(4.3)).toBe('4d 7h 12min')
  })

  it('omite o dia quando é zero, mas mantém hora + minuto', () => {
    expect(fmtDuracao(0.25)).toBe('6h 0min')
  })

  it('mostra só minutos abaixo de 1 hora', () => {
    expect(fmtDuracao(20 / 1440)).toBe('20min')
  })

  it('mantém "0h" quando há dias (Dia, Hora e Minuto sempre juntos acima de 1 dia)', () => {
    expect(fmtDuracao(2 + 5 / 1440)).toBe('2d 0h 5min')
  })

  it('arredonda para o minuto mais próximo', () => {
    expect(fmtDuracao(1 + 89 / 86400)).toBe('1d 0h 1min') // 89s -> ~1min
  })

  it('null / NaN / não-positivo → "—" ou "0min"', () => {
    expect(fmtDuracao(null)).toBe('—')
    expect(fmtDuracao(NaN)).toBe('—')
    expect(fmtDuracao(0)).toBe('0min')
    expect(fmtDuracao(-1)).toBe('0min')
  })
})
