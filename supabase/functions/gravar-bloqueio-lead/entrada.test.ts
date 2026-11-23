import { describe, expect, it } from 'vitest'
import { acessoPermiteBloquear, lerEntrada } from './entrada.ts'

const ok = { email: ' Fulano@Ex.com ', marcas: ['Inpot', 'Viva'], marcas_antes: [], motivo: 'sem perfil' }

describe('lerEntrada', () => {
  it('aceita e-mail, marcas, marcas que a tela mostrava e motivo', () => {
    expect(lerEntrada(ok)).toEqual({ ok: true, email: ' Fulano@Ex.com ', marcas: ['Inpot', 'Viva'], marcasAntes: [], motivo: 'sem perfil' })
  })
  it('aceita lista vazia (desbloqueio)', () => {
    expect(lerEntrada({ ...ok, marcas: [], marcas_antes: ['Inpot'] })).toMatchObject({ ok: true, marcas: [], marcasAntes: ['Inpot'] })
  })
  it('recusa corpo que não é objeto', () => {
    expect(lerEntrada(null)).toEqual({ ok: false, erro: 'corpo inválido' })
    expect(lerEntrada('x')).toEqual({ ok: false, erro: 'corpo inválido' })
  })
  it('recusa e-mail ausente ou não texto', () => {
    expect(lerEntrada({ ...ok, email: undefined })).toEqual({ ok: false, erro: 'e-mail obrigatório' })
    expect(lerEntrada({ ...ok, email: 3 })).toEqual({ ok: false, erro: 'e-mail obrigatório' })
  })
  it('recusa marcas que não são lista de textos', () => {
    expect(lerEntrada({ ...ok, marcas: 'Inpot' })).toEqual({ ok: false, erro: 'marcas deve ser uma lista' })
    expect(lerEntrada({ ...ok, marcas: ['Inpot', 2] })).toEqual({ ok: false, erro: 'marcas deve ser uma lista' })
  })
  it('exige as marcas que a tela mostrava', () => {
    expect(lerEntrada({ ...ok, marcas_antes: undefined })).toEqual({ ok: false, erro: 'marcas_antes deve ser uma lista' })
  })
  it('recusa motivo ausente', () => {
    expect(lerEntrada({ ...ok, motivo: undefined })).toEqual({ ok: false, erro: 'motivo obrigatório' })
  })
})

describe('acessoPermiteBloquear', () => {
  const base = { registrado: true, ativo: true, acesso_total: false, marcas: null, permissoes: ['aba.bloqueio-leads'] }
  it('conta ativa sem limite de marca passa', () => expect(acessoPermiteBloquear(base)).toBe(true))
  it('acesso total passa mesmo com marca', () => expect(acessoPermiteBloquear({ ...base, acesso_total: true, marcas: ['inpot'] })).toBe(true))
  it('limitado a marcas não passa', () => {
    expect(acessoPermiteBloquear({ ...base, marcas: ['inpot'] })).toBe(false)
    expect(acessoPermiteBloquear({ ...base, marca: 'inpot' })).toBe(false)
  })
  it('conta sem registro, desativada ou resposta estranha não passa', () => {
    expect(acessoPermiteBloquear({ ...base, registrado: false })).toBe(false)
    expect(acessoPermiteBloquear({ ...base, ativo: false })).toBe(false)
    expect(acessoPermiteBloquear(null)).toBe(false)
    expect(acessoPermiteBloquear('x')).toBe(false)
  })
})
