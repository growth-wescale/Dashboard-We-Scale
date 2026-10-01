import { describe, expect, it } from 'vitest'
import { nomesComMeta, perfilPiloto } from '@/lib/pilotos'

describe('perfilPiloto', () => {
  it('quem já tem perfil F1 mantém foto, cor e escuderia', () => {
    expect(perfilPiloto('Douglas')).toMatchObject({ nome: 'Douglas', iniciais: 'DOU', cor: '#006F62', foto: '/assets/vendedores/douglas.png', escuderia: 'Aston Martin' })
  })

  it('piloto novo ganha iniciais, uma cor estável e a foto do cadastro', () => {
    const p = perfilPiloto('Paula Marinheiro', 'https://x/paula.jpeg')
    expect(p).toMatchObject({ nome: 'Paula Marinheiro', iniciais: 'PAU', foto: 'https://x/paula.jpeg' })
    expect(p.cor).toMatch(/^#[0-9A-F]{6}$/i)
    expect(perfilPiloto('Paula Marinheiro').cor).toBe(p.cor)
    expect(perfilPiloto('Ângela').iniciais).toBe('ANG')
  })
})

describe('nomesComMeta', () => {
  it('lista quem tem linha da função no mês, sem repetir, com o nome como está no banco', () => {
    const rows = [
      { nome_colaborador: 'Bruna', funcao: 'Closer' },
      { nome_colaborador: ' Bruna ', funcao: 'Closer' },
      { nome_colaborador: 'Paula Marinheiro', funcao: 'Closer' },
      { nome_colaborador: 'Thiago', funcao: 'SDR' },
      { nome_colaborador: null, funcao: 'Closer' },
    ]
    expect(nomesComMeta(rows, 'Closer')).toEqual(['Bruna', 'Paula Marinheiro'])
    expect(nomesComMeta(rows, 'SDR')).toEqual(['Thiago'])
  })
})
