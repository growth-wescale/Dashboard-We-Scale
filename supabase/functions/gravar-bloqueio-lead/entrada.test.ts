import { describe, expect, it } from 'vitest'
import { lerEntrada } from './entrada.ts'

describe('lerEntrada', () => {
  it('aceita e-mail, marcas e motivo', () => {
    expect(lerEntrada({ email: ' Fulano@Ex.com ', marcas: ['Inpot', 'Viva'], motivo: 'sem perfil' }))
      .toEqual({ ok: true, email: ' Fulano@Ex.com ', marcas: ['Inpot', 'Viva'], motivo: 'sem perfil' })
  })
  it('aceita lista vazia (desbloqueio)', () => {
    expect(lerEntrada({ email: 'a@b.co', marcas: [], motivo: 'liberado' })).toMatchObject({ ok: true, marcas: [] })
  })
  it('recusa corpo que não é objeto', () => {
    expect(lerEntrada(null)).toEqual({ ok: false, erro: 'corpo inválido' })
    expect(lerEntrada('x')).toEqual({ ok: false, erro: 'corpo inválido' })
  })
  it('recusa e-mail ausente ou não texto', () => {
    expect(lerEntrada({ marcas: [], motivo: 'x' })).toEqual({ ok: false, erro: 'e-mail obrigatório' })
    expect(lerEntrada({ email: 3, marcas: [], motivo: 'x' })).toEqual({ ok: false, erro: 'e-mail obrigatório' })
  })
  it('recusa marcas que não são lista de textos', () => {
    expect(lerEntrada({ email: 'a@b.co', marcas: 'Inpot', motivo: 'x' })).toEqual({ ok: false, erro: 'marcas deve ser uma lista' })
    expect(lerEntrada({ email: 'a@b.co', marcas: ['Inpot', 2], motivo: 'x' })).toEqual({ ok: false, erro: 'marcas deve ser uma lista' })
  })
  it('recusa motivo ausente', () => {
    expect(lerEntrada({ email: 'a@b.co', marcas: [] })).toEqual({ ok: false, erro: 'motivo obrigatório' })
  })
})
