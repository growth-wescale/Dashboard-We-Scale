import { describe, it, expect } from 'vitest'
import { chavePessoa, nomesInativos, saiuDoTime } from '@/lib/equipe'
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

  it('só quem tem ativo = false saiu do time', () => {
    const inativos = nomesInativos(roster)
    expect(saiuDoTime('Aurélio Briano', inativos)).toBe(true)
    expect(saiuDoTime('ROMULO', inativos)).toBe(true)
    expect(saiuDoTime('Douglas', inativos)).toBe(false)
    // fora do cadastro não é "inativo"
    expect(saiuDoTime('Fulano', inativos)).toBe(false)
  })

  it('sem cadastro carregado ninguém some', () => {
    expect(saiuDoTime('Rômulo', undefined)).toBe(false)
    expect(saiuDoTime('Rômulo', new Set())).toBe(false)
  })
})
