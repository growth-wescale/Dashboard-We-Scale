import { describe, it, expect } from 'vitest'
import { BRAND_LIST, BRAND_ACCENT, marcaLabel, opcoesMarcaDisponiveis, normalizeMarcaRaw, findBrandByMarca } from '@/constants/brands'

const TODAS = BRAND_LIST.map(b => b.key)

describe('marcaLabel', () => {
  it('troca só o rótulo de UI de Odonto Scale, sem mexer no valor cru', () => {
    expect(marcaLabel('Odonto Scale')).toBe('Odonto Legacy')
  })

  it('a marca no banco continua Odonto Scale', () => {
    const odl = BRAND_LIST.find(b => b.key === 'odonto-scale')!
    expect(odl.marca).toBe('Odonto Scale')
    expect(odl.label).toBe('Odonto Legacy')
  })

  it('outras marcas voltam iguais', () => {
    expect(marcaLabel('Inpot')).toBe('Inpot')
    expect(marcaLabel('Oral Unic')).toBe('Oral Unic')
  })

  it('nulo/vazio vira string vazia', () => {
    expect(marcaLabel(null)).toBe('')
    expect(marcaLabel(undefined)).toBe('')
    expect(marcaLabel('')).toBe('')
  })

  it('BRAND_ACCENT resolve tanto pelo valor cru quanto pelo rótulo de UI', () => {
    expect(BRAND_ACCENT['Odonto Scale']).toBe(BRAND_ACCENT['Odonto Legacy'])
    expect(BRAND_ACCENT['Odonto Legacy']).toBeTruthy()
  })
})

describe('normalizeMarcaRaw', () => {
  it("'Odonto Legacy' (novo valor do RD desde 11/09/2026) normaliza para 'Odonto Scale'", () => {
    expect(normalizeMarcaRaw('Odonto Legacy')).toBe('Odonto Scale')
  })

  it('outras marcas voltam iguais, incluindo nulo/vazio', () => {
    expect(normalizeMarcaRaw('Oral Unic')).toBe('Oral Unic')
    expect(normalizeMarcaRaw(null)).toBe(null)
    expect(normalizeMarcaRaw(undefined)).toBe(undefined)
  })

  it("findBrandByMarca reconhece 'Odonto Legacy' como o mesmo BrandDef de 'Odonto Scale'", () => {
    expect(findBrandByMarca('Odonto Legacy')).toBe(findBrandByMarca('Odonto Scale'))
    expect(findBrandByMarca('Odonto Legacy')?.key).toBe('odonto-scale')
  })
})

describe('opcoesMarcaDisponiveis', () => {
  it('sem recorte conhecido (undefined), mostra todas as marcas', () => {
    expect(opcoesMarcaDisponiveis(undefined).map(b => b.key)).toEqual(TODAS)
  })

  it('restringe às marcas com dado no recorte — marca sem deal (ex.: We Scale) nunca aparece', () => {
    const comDado = ['oral-unic', 'odonto-scale', 'inpot', 'liso-laser', 'b2case']
    const opcoes = opcoesMarcaDisponiveis(comDado).map(b => b.key)
    expect(opcoes).toEqual(comDado)
    expect(opcoes).not.toContain('we-scale')
    expect(opcoes).not.toContain('viva')
  })

  it('recorte vazio → lista vazia (sem cair pra "todas")', () => {
    expect(opcoesMarcaDisponiveis([]).map(b => b.key)).toEqual([])
  })

  it('preserva a ordem de exibição de BRAND_LIST, não a ordem do recorte', () => {
    const opcoes = opcoesMarcaDisponiveis(['viva', 'oral-unic']).map(b => b.key)
    expect(opcoes).toEqual(['oral-unic', 'viva'])
  })
})
