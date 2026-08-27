import { describe, it, expect } from 'vitest'
import { BRAND_LIST, opcoesMarcaDisponiveis } from '@/constants/brands'

const TODAS = BRAND_LIST.map(b => b.key)

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
