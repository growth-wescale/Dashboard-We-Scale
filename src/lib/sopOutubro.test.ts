import { describe, expect, it } from 'vitest'
import { marcasLeadsSop } from '@/hooks/useSopLeads'
import { COMUNIDADE_LEGACY_ATUAL, COMUNIDADE_LEGACY_OUTUBRO } from '@/constants/comunidadeLegacy'

describe('S&OP outubro isolado', () => {
  it('reúne aliases somente das duas folhas aprovadas', () => {
    expect(marcasLeadsSop('Odonto Scale')).toEqual(['Odonto Scale', 'Odonto Legacy'])
    expect(marcasLeadsSop('We Scale')).toEqual(['We Scale', 'Scale Partner'])
    expect(marcasLeadsSop('Eletrovias')).toEqual(['Eletrovias'])
  })
  it('preserva setembro e separa total ativo da amostra de outubro', () => {
    expect(COMUNIDADE_LEGACY_ATUAL.total).toBe(190)
    expect(COMUNIDADE_LEGACY_ATUAL.ate).toBe('30/09')
    expect(COMUNIDADE_LEGACY_OUTUBRO.total).toBe(192)
    expect(COMUNIDADE_LEGACY_OUTUBRO.ate).toBe('20/10')
    expect(COMUNIDADE_LEGACY_OUTUBRO.sampleN).toBe(384)
    expect(COMUNIDADE_LEGACY_OUTUBRO.testesExcluidos).toBe(7)
    expect(COMUNIDADE_LEGACY_OUTUBRO.amostraPeriodo).toBe('04/08–20/10/2026')
    expect(COMUNIDADE_LEGACY_OUTUBRO.origens).toEqual([])
    expect(COMUNIDADE_LEGACY_OUTUBRO.quadrantes.map(x => x.pct)).toEqual([19.27, 23.44, 4.95, 52.34])
    expect(COMUNIDADE_LEGACY_OUTUBRO.quadrantes.map(x => x.aprox.split(' ')[0])).toEqual(['74', '90', '19', '201'])
    expect(COMUNIDADE_LEGACY_OUTUBRO.quadrantes.reduce((sum, x) => sum + x.pct, 0)).toBeCloseTo(100)
  })
})
