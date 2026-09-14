import { describe, expect, it } from 'vitest'
import { diffPermissoes, fmtUltimoAcesso, statusDoUsuario, traduzirErroAcesso } from './acessosAdmin'

describe('statusDoUsuario', () => {
  it('sem papel vem antes de tudo', () => {
    expect(statusDoUsuario({ papelId: null, ativo: false, convitePendente: true })).toBe('sem-acesso')
  })
  it('desativado vence convite pendente', () => {
    expect(statusDoUsuario({ papelId: 'p', ativo: false, convitePendente: true })).toBe('desativado')
  })
  it('pendente e ativo', () => {
    expect(statusDoUsuario({ papelId: 'p', ativo: true, convitePendente: true })).toBe('pendente')
    expect(statusDoUsuario({ papelId: 'p', ativo: true, convitePendente: false })).toBe('ativo')
  })
})

describe('diffPermissoes', () => {
  it('separa o que entra e o que sai', () => {
    expect(diffPermissoes(['aba.a', 'aba.b'], ['aba.b', 'aba.c', 'aba.c'])).toEqual({ adicionar: ['aba.c'], remover: ['aba.a'] })
  })
  it('sem mudança', () => {
    expect(diffPermissoes(['x'], ['x'])).toEqual({ adicionar: [], remover: [] })
  })
})

describe('traduzirErroAcesso', () => {
  it('códigos conhecidos viram frase', () => {
    expect(traduzirErroAcesso({ code: '23505', message: 'duplicate key' })).toBe('Já existe um papel com esse nome.')
    expect(traduzirErroAcesso({ code: '23503' })).toMatch(/ainda tem pessoas/)
  })
  it('trava do banco passa a mensagem adiante', () => {
    expect(traduzirErroAcesso({ code: 'P0001', message: 'Precisa sobrar pelo menos um administrador ativo.' }))
      .toBe('Precisa sobrar pelo menos um administrador ativo.')
  })
})

describe('fmtUltimoAcesso', () => {
  const agora = new Date('2026-09-14T15:00:00-03:00')
  it('datas relativas', () => {
    expect(fmtUltimoAcesso(null, agora)).toBe('nunca')
    expect(fmtUltimoAcesso('2026-09-14T00:30:00-03:00', agora)).toBe('hoje')
    expect(fmtUltimoAcesso('2026-09-13T23:59:00-03:00', agora)).toBe('ontem')
    expect(fmtUltimoAcesso('2026-09-04T10:00:00-03:00', agora)).toBe('há 10 dias')
    expect(fmtUltimoAcesso('2026-07-01T10:00:00-03:00', agora)).toBe('01/07/2026')
  })
})
