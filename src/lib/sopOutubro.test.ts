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
    expect(COMUNIDADE_LEGACY_OUTUBRO.total).toBe(186)
    expect(COMUNIDADE_LEGACY_OUTUBRO.sampleN).toBe(24)
    expect(COMUNIDADE_LEGACY_OUTUBRO.origens).toEqual([])
    expect(COMUNIDADE_LEGACY_OUTUBRO.quadrantes.map(x => x.pct)).toEqual([25, 16.67, 16.67, 41.67])
  })
})
