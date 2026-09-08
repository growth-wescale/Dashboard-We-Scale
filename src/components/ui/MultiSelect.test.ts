import { describe, it, expect } from 'vitest'
import { mesmoConjunto, acoesRodape } from './MultiSelect'

describe('mesmoConjunto', () => {
  it('ignora ordem', () => {
    expect(mesmoConjunto(['a', 'b'], ['b', 'a'])).toBe(true)
  })
  it('tamanhos diferentes = diferente', () => {
    expect(mesmoConjunto(['a'], ['a', 'b'])).toBe(false)
  })
  it('mesmo tamanho, conteúdo diferente = diferente', () => {
    expect(mesmoConjunto(['a', 'b'], ['a', 'c'])).toBe(false)
  })
})

describe('acoesRodape', () => {
  const OPTS = ['a', 'b', 'c']

  it('seleção parcial: os dois botões ativos', () => {
    expect(acoesRodape(['a'], OPTS)).toEqual({ selecionarTudoAtivo: true, limparAtivo: true })
  })

  it('nada selecionado: só "Selecionar tudo" ativo', () => {
    expect(acoesRodape([], OPTS)).toEqual({ selecionarTudoAtivo: true, limparAtivo: false })
  })

  it('tudo selecionado: só "Limpar" ativo', () => {
    expect(acoesRodape(OPTS, OPTS)).toEqual({ selecionarTudoAtivo: false, limparAtivo: true })
  })

  it('sem opções: nada ativo', () => {
    expect(acoesRodape([], [])).toEqual({ selecionarTudoAtivo: false, limparAtivo: false })
  })
})
