import { describe, expect, it } from 'vitest'
import { getMetaReceitaLegacy } from './metasReceitaLegacy'

describe('metas Legacy exclusivas da S&OP', () => {
  it.each([['2026-10', 29910], ['2026-11', 41874], ['2026-12', 29910]])('usa meta aprovada de %s', (mes, meta) => {
    expect(getMetaReceitaLegacy(mes).meta_receita).toBe(meta)
  })
  it('preserva agosto/setembro e não inventa meta em meses sem cadastro', () => {
    expect(getMetaReceitaLegacy('2026-08').meta_receita).toBe(39880)
    expect(getMetaReceitaLegacy('2026-09').meta_receita).toBe(69790)
    expect(getMetaReceitaLegacy('2027-01').meta_receita).toBe(0)
  })
})
