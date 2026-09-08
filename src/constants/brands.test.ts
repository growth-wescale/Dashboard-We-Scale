import { describe, it, expect } from 'vitest'
import { BRAND_LIST, BRAND_ACCENT, marcaLabel, opcoesMarcaDisponiveis } from '@/constants/brands'

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

describe('opcoesMarcaDisponiveis', () => {
  it('sem recorte de dados, mostra todas as marcas (comportamento anterior)', () => {
    expect(opcoesMarcaDisponiveis(undefined, TODAS).map(b => b.key)).toEqual(TODAS)
  })

  it('Consolidado (tudo marcado) restringe às marcas do recorte atual', () => {
    // Caso do bug reportado: toggle Prospecção Ativa não tem Eletrovias/Viva.
    const disponiveis = ['oral-unic', 'odonto-scale', 'inpot', 'liso-laser', 'b2case']
    const opcoes = opcoesMarcaDisponiveis(disponiveis, TODAS).map(b => b.key)
    expect(opcoes).toEqual(disponiveis)
    expect(opcoes).not.toContain('eletrovias')
    expect(opcoes).not.toContain('viva')
  })

  it('seleção estrita (não é Consolidado) entra na lista mesmo fora do recorte', () => {
    // Usuário isolou Eletrovias de propósito; toggle muda e Eletrovias some
    // dos dados — a opção não pode sumir da lista sem o usuário poder desmarcar.
    const disponiveis = ['oral-unic', 'odonto-scale']
    const opcoes = opcoesMarcaDisponiveis(disponiveis, ['eletrovias']).map(b => b.key)
    expect(opcoes).toEqual(expect.arrayContaining(['eletrovias', 'oral-unic', 'odonto-scale']))
  })

  it('preserva a ordem de exibição de BRAND_LIST, não a ordem do recorte', () => {
    const disponiveisForaDeOrdem = ['viva', 'oral-unic']
    const opcoes = opcoesMarcaDisponiveis(disponiveisForaDeOrdem, TODAS).map(b => b.key)
    expect(opcoes).toEqual(['oral-unic', 'viva'])
  })
})
