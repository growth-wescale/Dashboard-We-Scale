import { describe, it, expect } from 'vitest'
import { EX_INTEGRANTES, chavePessoa, equipeAtiva, nomeNaVisao, saiuDoTime } from '@/lib/equipe'
import type { MembroRoster } from '@/hooks/useRosterVendas'

const roster: MembroRoster[] = [
  { nome: 'Douglas', cargo: 'Closer', foto: null, ativo: true },
  { nome: 'Aurélio Briano', cargo: 'Closer', foto: null, ativo: false },
  { nome: 'Rômulo', cargo: 'Closer', foto: null, ativo: false },
]

describe('equipe', () => {
  it('chavePessoa ignora acento, caixa e espaço', () => {
    expect(chavePessoa('  Rômulo ')).toBe('romulo')
    expect(chavePessoa(null)).toBe('')
  })

  it('fora do time = inativo ou fora do cadastro', () => {
    const equipe = equipeAtiva(roster)
    expect(saiuDoTime('Aurélio Briano', equipe)).toBe(true)
    expect(saiuDoTime('ROMULO', equipe)).toBe(true)
    expect(saiuDoTime('Fulano', equipe)).toBe(true)
    expect(saiuDoTime('douglas', equipe)).toBe(false)
    // nome vazio não é pessoa
    expect(saiuDoTime('  ', equipe)).toBe(false)
  })

  it('nomeNaVisao troca quem não é do time pela linha Ex-integrantes', () => {
    const equipe = equipeAtiva(roster)
    expect(nomeNaVisao('Rômulo', equipe)).toBe(EX_INTEGRANTES)
    expect(nomeNaVisao('Douglas', equipe)).toBe('Douglas')
  })

  it('sem cadastro carregado ninguém some', () => {
    expect(saiuDoTime('Rômulo', undefined)).toBe(false)
    expect(saiuDoTime('Rômulo', new Set())).toBe(false)
  })
})
