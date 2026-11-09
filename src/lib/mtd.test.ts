import { describe, expect, it } from 'vitest'
import { janelaMtd, mesAnterior, metaInteira, variacaoPct } from './mtd'

describe('janelaMtd', () => {
  it('mês em curso: fator pelos dias corridos e mesmo trecho do mês anterior', () => {
    const j = janelaMtd('2026-11', '2026-11-09')
    expect(j.dia).toBe(9)
    expect(j.fator).toBeCloseTo(9 / 30)
    expect(j.atual).toEqual({ from: '2026-11-01', to: '2026-11-09' })
    expect(j.anterior).toEqual({ from: '2026-10-01', to: '2026-10-09', mesKey: '2026-10' })
  })
  it('mês fechado: fator 1 e mês anterior inteiro (limitado ao tamanho dele)', () => {
    const j = janelaMtd('2026-03', '2026-03-31')
    expect(j.fator).toBe(1)
    expect(j.anterior).toEqual({ from: '2026-02-01', to: '2026-02-28', mesKey: '2026-02' })
  })
  it('janela terminando depois do mês conta o mês inteiro', () => {
    expect(janelaMtd('2026-10', '2026-11-09').fator).toBe(1)
  })
  it('virada de ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(janelaMtd('2026-01', '2026-01-05').anterior.from).toBe('2025-12-01')
  })
})

describe('metaInteira / variacaoPct', () => {
  it('arredonda pra cima sem falso arredondamento de ponto flutuante', () => {
    expect(metaInteira(35.4)).toBe(36)
    expect(metaInteira(36.0000000001)).toBe(36)
    expect(metaInteira(0)).toBe(0)
  })
  it('variação sem base vira null', () => {
    expect(variacaoPct(10, 8)).toBe(25)
    expect(variacaoPct(5, 0)).toBeNull()
  })
})
