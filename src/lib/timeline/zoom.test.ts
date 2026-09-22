import { describe, it, expect } from 'vitest'
import { nivelDeZoom, kAjuste, clampK, clampX0, ZOOM, MARGENS } from '@/lib/timeline/zoom'

describe('nivelDeZoom (histerese)', () => {
  it('entra em macro abaixo de 9 e só sai acima de 12', () => {
    expect(nivelDeZoom(8, 'etapas')).toBe('macro')
    expect(nivelDeZoom(10, 'macro')).toBe('macro')
    expect(nivelDeZoom(10, 'etapas')).toBe('etapas')
    expect(nivelDeZoom(13, 'macro')).toBe('etapas')
  })
  it('entra em micro acima de 90 e só sai abaixo de 70', () => {
    expect(nivelDeZoom(95, 'etapas')).toBe('micro')
    expect(nivelDeZoom(80, 'micro')).toBe('micro')
    expect(nivelDeZoom(80, 'etapas')).toBe('etapas')
    expect(nivelDeZoom(60, 'micro')).toBe('etapas')
  })
})

describe('kAjuste / clamps', () => {
  it('ajuste faz o deal inteiro caber na largura útil', () => {
    expect(kAjuste(30, 1000)).toBeCloseTo((1000 - MARGENS.ESQ - MARGENS.DIR) / 30, 5)
    expect(kAjuste(0, 1000)).toBe(kAjuste(1, 1000)) // mínimo 1 dia
  })
  it('k fica entre o mínimo (60% do ajuste) e K_MAX', () => {
    expect(clampK(1, 10)).toBe(6)
    expect(clampK(9999, 10)).toBe(ZOOM.K_MAX)
    expect(clampK(50, 10)).toBe(50)
  })
  it('x0 nunca deixa a pista sair da tela', () => {
    expect(clampX0(-50, 2000, 1000)).toBe(0)
    expect(clampX0(5000, 2000, 1000)).toBe(1000)
    expect(clampX0(10, 500, 1000)).toBe(0) // conteúdo menor que a tela: sem pan
  })
})
