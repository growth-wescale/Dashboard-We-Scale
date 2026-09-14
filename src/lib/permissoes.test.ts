import { describe, expect, it } from 'vitest'
import {
  ABAS, ACESSO_VAZIO, ACOES, parseMinhasPermissoes, pode, permissaoDaRota, primeiraRotaPermitida,
  type EstadoAcesso,
} from './permissoes'

const base: EstadoAcesso = { registrado: true, ativo: true, papel: 'X', acessoTotal: false, marca: null, permissoes: [] }

describe('parseMinhasPermissoes', () => {
  it('lê o jsonb do banco', () => {
    expect(parseMinhasPermissoes({
      registrado: true, ativo: true, papel: 'Cliente da marca', acesso_total: false, marca: 'inpot',
      permissoes: ['aba.visao-geral', 42, 'aba.saude-marca'],
    })).toEqual({
      registrado: true, ativo: true, papel: 'Cliente da marca', acessoTotal: false, marca: 'inpot',
      permissoes: ['aba.visao-geral', 'aba.saude-marca'],
    })
  })

  it('formato estranho vira sem acesso', () => {
    expect(parseMinhasPermissoes(null)).toEqual(ACESSO_VAZIO)
    expect(parseMinhasPermissoes('x')).toEqual(ACESSO_VAZIO)
    expect(parseMinhasPermissoes({ registrado: 'true', acesso_total: true })).toEqual(ACESSO_VAZIO)
  })
})

describe('pode', () => {
  it('conta sem registro ou desativada não pode nada, nem com acesso total', () => {
    expect(pode(ACESSO_VAZIO, 'aba.visao-geral')).toBe(false)
    expect(pode({ ...base, ativo: false, acessoTotal: true }, 'aba.visao-geral')).toBe(false)
  })

  it('acesso total pode tudo, inclusive chave que não está na lista', () => {
    expect(pode({ ...base, acessoTotal: true }, 'acao.usuarios-gerenciar')).toBe(true)
  })

  it('segue a lista do papel', () => {
    const e = { ...base, permissoes: ['aba.visao-macro'] }
    expect(pode(e, 'aba.visao-macro')).toBe(true)
    expect(pode(e, 'aba.performance')).toBe(false)
  })

  it('usuário travado numa marca só vê as abas que sabem travar, mesmo que o papel marque outras', () => {
    const e = { ...base, marca: 'inpot', permissoes: ['aba.visao-geral', 'aba.visao-macro', 'acao.assistente-ia'] }
    expect(pode(e, 'aba.visao-geral')).toBe(true)
    expect(pode(e, 'aba.visao-macro')).toBe(false)
    expect(pode(e, 'acao.assistente-ia')).toBe(false)
  })
})

describe('permissaoDaRota', () => {
  it('mapeia cada aba do catálogo pela rota', () => {
    for (const a of ABAS) expect(permissaoDaRota(a.rota)).toBe(a.chave)
  })

  it('casos especiais', () => {
    expect(permissaoDaRota('/acessos')).toBe('acao.usuarios-gerenciar')
    expect(permissaoDaRota('/copa-b2b')).toBe('aba.okrs')
    expect(permissaoDaRota('/cadencias')).toBeNull()
    expect(permissaoDaRota('/rota-que-nao-existe')).toBeNull()
  })
})

describe('primeiraRotaPermitida', () => {
  it('segue a ordem do menu', () => {
    expect(primeiraRotaPermitida({ ...base, permissoes: ['aba.metas', 'aba.visao-macro'] })).toBe('/funil-vendas')
  })

  it('só gerencia usuários → cai na tela de acessos', () => {
    expect(primeiraRotaPermitida({ ...base, permissoes: ['acao.usuarios-gerenciar'] })).toBe('/acessos')
  })

  it('nada liberado → null', () => {
    expect(primeiraRotaPermitida({ ...base, permissoes: ['acao.okrs-editar'] })).toBeNull()
    expect(primeiraRotaPermitida(ACESSO_VAZIO)).toBeNull()
  })
})

describe('catálogo', () => {
  it('chaves únicas e no formato que o banco aceita', () => {
    const chaves = [...ABAS.map(a => a.chave), ...ACOES.map(a => a.chave)]
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const c of chaves) expect(c).toMatch(/^(aba|acao)\.[a-z0-9-]+$/)
  })
})
