import { describe, expect, it } from 'vitest'
import {
  FILTROS_VAZIOS, SEM_LIMITE_DE_MARCA, diffPermissoes, filtrarUsuarios, fmtUltimoAcesso, ordenarUsuarios,
  proximaOrdem, resumoMarcas, statusDoUsuario, temFiltroAtivo, traduzirErroAcesso, type LinhaUsuarioLista,
} from './acessosAdmin'

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

describe('resumoMarcas', () => {
  const r = (s: string) => s.toUpperCase()
  it('resume a lista', () => {
    expect(resumoMarcas(null, r)).toBe('Todas as marcas')
    expect(resumoMarcas(['inpot'], r)).toBe('INPOT')
    expect(resumoMarcas(['inpot', 'viva'], r)).toBe('INPOT, VIVA')
    expect(resumoMarcas(['inpot', 'viva', 'b2case', 'liso'], r)).toBe('INPOT, VIVA +2')
  })
})

function u(email: string, extra: Partial<LinhaUsuarioLista> = {}): LinhaUsuarioLista {
  return { email, papelId: 'legado', papelNome: 'Acesso total (legado)', marcas: null, ativo: true, convitePendente: false, ultimoLogin: null, ...extra }
}

const lista: LinhaUsuarioLista[] = [
  u('carla@wescale.com.br', { ultimoLogin: '2026-09-10T10:00:00Z' }),
  u('ana@inpot.com.br', { papelId: 'cliente', papelNome: 'Cliente da marca', marcas: ['inpot', 'liso-laser'], ultimoLogin: '2026-09-14T10:00:00Z' }),
  u('bruno@wescale.com.br', { ativo: false, ultimoLogin: '2026-08-01T10:00:00Z' }),
  u('dani@wescale.com.br', { convitePendente: true }),
  u('edu@gmail.com', { papelId: null, papelNome: null }),
]

describe('filtrarUsuarios', () => {
  it('sem filtro devolve todos', () => {
    expect(filtrarUsuarios(lista, FILTROS_VAZIOS)).toHaveLength(5)
    expect(temFiltroAtivo(FILTROS_VAZIOS)).toBe(false)
  })
  it('por situação (várias)', () => {
    expect(filtrarUsuarios(lista, { ...FILTROS_VAZIOS, status: ['desativado', 'sem-acesso'] }).map(x => x.email))
      .toEqual(['bruno@wescale.com.br', 'edu@gmail.com'])
  })
  it('por tipo de acesso', () => {
    expect(filtrarUsuarios(lista, { ...FILTROS_VAZIOS, papeis: ['cliente'] }).map(x => x.email)).toEqual(['ana@inpot.com.br'])
  })
  it('por marca: basta ter uma das marcas; "todas as marcas" casa com quem não tem limite', () => {
    expect(filtrarUsuarios(lista, { ...FILTROS_VAZIOS, marcas: ['liso-laser'] }).map(x => x.email)).toEqual(['ana@inpot.com.br'])
    expect(filtrarUsuarios(lista, { ...FILTROS_VAZIOS, marcas: [SEM_LIMITE_DE_MARCA] })).toHaveLength(4)
  })
  it('filtros se somam e a busca ignora maiúsculas', () => {
    const f = { ...FILTROS_VAZIOS, busca: ' WESCALE ', status: ['ativo' as const, 'pendente' as const] }
    expect(filtrarUsuarios(lista, f).map(x => x.email)).toEqual(['carla@wescale.com.br', 'dani@wescale.com.br'])
    expect(temFiltroAtivo(f)).toBe(true)
  })
})

describe('ordenarUsuarios', () => {
  it('último acesso: mais recente primeiro e "nunca" sempre no fim', () => {
    const desc = ordenarUsuarios(lista, { coluna: 'ultimoLogin', direcao: 'desc' }).map(x => x.email)
    expect(desc.slice(0, 3)).toEqual(['ana@inpot.com.br', 'carla@wescale.com.br', 'bruno@wescale.com.br'])
    const asc = ordenarUsuarios(lista, { coluna: 'ultimoLogin', direcao: 'asc' }).map(x => x.email)
    expect(asc.slice(0, 3)).toEqual(['bruno@wescale.com.br', 'carla@wescale.com.br', 'ana@inpot.com.br'])
    expect(asc.slice(3)).toEqual(['dani@wescale.com.br', 'edu@gmail.com'])
  })
  it('situação segue a ordem ativo → nunca entrou → desativado → sem acesso', () => {
    expect(ordenarUsuarios(lista, { coluna: 'status', direcao: 'asc' }).map(x => x.email))
      .toEqual(['ana@inpot.com.br', 'carla@wescale.com.br', 'dani@wescale.com.br', 'bruno@wescale.com.br', 'edu@gmail.com'])
  })
  it('tipo de acesso: sem tipo fica no fim nas duas direções; não altera a lista original', () => {
    const copia = [...lista]
    expect(ordenarUsuarios(lista, { coluna: 'papel', direcao: 'desc' }).at(-1)?.email).toBe('edu@gmail.com')
    expect(lista).toEqual(copia)
  })
  it('e-mail', () => {
    expect(ordenarUsuarios(lista, { coluna: 'email', direcao: 'desc' })[0].email).toBe('edu@gmail.com')
  })
})

describe('proximaOrdem', () => {
  it('mesma coluna inverte, coluna nova começa crescente (último acesso começa pelo mais recente)', () => {
    expect(proximaOrdem({ coluna: 'email', direcao: 'asc' }, 'email')).toEqual({ coluna: 'email', direcao: 'desc' })
    expect(proximaOrdem({ coluna: 'email', direcao: 'asc' }, 'papel')).toEqual({ coluna: 'papel', direcao: 'asc' })
    expect(proximaOrdem({ coluna: 'email', direcao: 'asc' }, 'ultimoLogin')).toEqual({ coluna: 'ultimoLogin', direcao: 'desc' })
  })
})
