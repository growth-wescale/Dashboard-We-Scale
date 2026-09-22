import { describe, expect, it } from 'vitest'
import {
  ABAS, ACESSO_VAZIO, ACOES, parseMinhasPermissoes, pode, permissaoDaRota, primeiraRotaPermitida, restringirMarcas,
  type EstadoAcesso,
} from './permissoes'

const base: EstadoAcesso = { registrado: true, ativo: true, papel: 'X', acessoTotal: false, marcas: null, permissoes: [] }

describe('parseMinhasPermissoes', () => {
  it('lê o jsonb do banco com lista de marcas', () => {
    expect(parseMinhasPermissoes({
      registrado: true, ativo: true, papel: 'Cliente da marca', acesso_total: false, marcas: ['inpot', 'liso-laser', 'inpot'],
      permissoes: ['aba.visao-geral', 42, 'aba.saude-marca'],
    })).toEqual({
      registrado: true, ativo: true, papel: 'Cliente da marca', acessoTotal: false, marcas: ['inpot', 'liso-laser'],
      permissoes: ['aba.visao-geral', 'aba.saude-marca'],
    })
  })

  it('formato antigo com marca única ainda funciona', () => {
    expect(parseMinhasPermissoes({ registrado: true, ativo: true, marca: 'inpot' }).marcas).toEqual(['inpot'])
  })

  it('lista vazia ou nula = sem limite de marca', () => {
    expect(parseMinhasPermissoes({ registrado: true, ativo: true, marcas: [] }).marcas).toBeNull()
    expect(parseMinhasPermissoes({ registrado: true, ativo: true, marcas: null }).marcas).toBeNull()
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

  it('limitado a marcas: só telas com filtro de marca, nenhuma ação', () => {
    const e = { ...base, marcas: ['inpot'], permissoes: ['aba.visao-macro', 'aba.sop-marketing', 'aba.okrs', 'aba.metas', 'acao.assistente-ia'] }
    expect(pode(e, 'aba.visao-macro')).toBe(true)
    expect(pode(e, 'aba.sop-marketing')).toBe(true)
    expect(pode(e, 'aba.okrs')).toBe(false)
    expect(pode(e, 'aba.metas')).toBe(false)
    expect(pode(e, 'acao.assistente-ia')).toBe(false)
  })

  it('limitado a marcas não libera tela que o papel não marca', () => {
    expect(pode({ ...base, marcas: ['inpot'], permissoes: ['aba.visao-geral'] }, 'aba.performance')).toBe(false)
  })
})

describe('restringirMarcas', () => {
  it('sem limite devolve a seleção como veio, inclusive vazia', () => {
    expect(restringirMarcas(['viva'], null)).toEqual(['viva'])
    expect(restringirMarcas([], null)).toEqual([])
  })
  it('corta o que está fora das marcas permitidas', () => {
    expect(restringirMarcas(['inpot', 'viva', 'b2case'], ['inpot', 'b2case'])).toEqual(['inpot', 'b2case'])
  })
  it('nada selecionado ou nada dentro → todas as permitidas', () => {
    expect(restringirMarcas([], ['inpot', 'b2case'])).toEqual(['inpot', 'b2case'])
    expect(restringirMarcas(['viva'], ['inpot'])).toEqual(['inpot'])
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
