import { describe, expect, it } from 'vitest'
import { criarBaseAoVivo, type DependenciasBase } from './baseAoVivo'
import type { RegistroLocal } from './armazemLocal'
import type { DefinicaoBase } from './colecao'
import { asc } from './colecao'

interface Linha { id: string; v: number }

const DEF: DefinicaoBase<Linha> = {
  nome: 'teste',
  colunas: ['id', 'v'],
  chave: l => l.id,
  chaveRemovido: k => String(k),
  comparar: (a, b) => asc(a.id, b.id),
}
const FORMATO = 'teste:1:id,v:'

/**
 * Banco falso com a mesma regra de `dash_base`/`dash_mudancas`: cada linha
 * guarda a versão em que mudou; lápide some da base mas aparece nas mudanças.
 */
function bancoFalso() {
  const linhas = new Map<string, { v: number; versao: number; removido: boolean }>()
  let versao = 0
  const chamadas: string[] = []
  let falhasRestantes = 0
  let pendurar: Promise<void> | null = null
  const saude = { sincronizado_em: '2026-11-03T15:00:00+00:00', atraso_s: 30, ultimo_erro: null as string | null }
  return {
    chamadas,
    saude,
    falhar(n: number) { falhasRestantes = n },
    segurar() { let soltar!: () => void; pendurar = new Promise(r => { soltar = r }); return () => { pendurar = null; soltar() } },
    /** Muda linhas numa versão nova. Sem argumento: só a versão sobe (mudança foi na outra base). */
    publicar(mudancas: Record<string, number | null> = {}) {
      versao++
      for (const [id, v] of Object.entries(mudancas)) {
        if (v === null) { const l = linhas.get(id); if (l) { l.removido = true; l.versao = versao } }
        else linhas.set(id, { v, versao, removido: false })
      }
    },
    async rpc(nome: string, args: Record<string, unknown>): Promise<unknown> {
      chamadas.push(nome)
      if (pendurar) await pendurar
      if (falhasRestantes > 0) { falhasRestantes--; throw new Error('timeout do banco') }
      if (nome === 'dash_base') {
        return { base: 'teste', epoca: 1, versao, cols: ['id', 'v'], ...saude,
          linhas: [...linhas].filter(([, l]) => !l.removido).map(([id, l]) => [id, l.v]) }
      }
      const desde = Number(args.p_desde)
      if (desde > versao) return { base: 'teste', epoca: 1, versao, reset: true, ...saude }
      const mudou = [...linhas].filter(([, l]) => l.versao > desde)
      return { base: 'teste', epoca: 1, versao, reset: false, cols: ['id', 'v'], ...saude,
        linhas: mudou.filter(([, l]) => !l.removido).map(([id, l]) => [id, l.v]),
        removidos: mudou.filter(([, l]) => l.removido).map(([id]) => id) }
    },
  }
}

function montar(banco: ReturnType<typeof bancoFalso>, opts: {
  registro?: RegistroLocal | null
  usuario?: string | null
  ler?: DependenciasBase['ler']
} = {}) {
  const gravados: RegistroLocal[] = []
  const deps: DependenciasBase = {
    rpc: (nome, args) => banco.rpc(nome, args),
    ler: opts.ler ?? (async () => opts.registro ?? null),
    gravar: async r => { gravados.push(r) },
    usuario: async () => (opts.usuario === undefined ? 'u1' : opts.usuario),
    esperar: async () => {},
    atrasoGravacaoMs: 0,
    prazoArmazemMs: 20,
  }
  return { base: criarBaseAoVivo(DEF, deps), gravados }
}

const ids = (linhas: readonly Linha[]) => linhas.map(l => `${l.id}=${l.v}`)
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms))

describe('base ao vivo', () => {
  it('1º acesso: baixa a base inteira numa chamada e guarda no navegador', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1, b: 2 })
    const { base, gravados } = montar(banco)
    const vistos: boolean[] = []
    // Assinar (montar o componente) já dispara a carga.
    base.assinar(() => vistos.push(base.obter().carregando))
    await tick()
    expect(banco.chamadas).toEqual(['dash_base'])
    expect(ids(base.obter().linhas)).toEqual(['a=1', 'b=2'])
    expect(vistos[0]).toBe(true)
    expect(base.obter().carregando).toBe(false)
    await tick()
    expect(gravados.at(-1)).toMatchObject({ nome: 'teste', formato: FORMATO, usuario: 'u1', versao: 1, linhas: [['a', 1], ['b', 2]] })
  })

  it('"carregando" já durante a leitura do navegador (a página não mostra zeros)', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    let soltar!: () => void
    const { base } = montar(banco, { ler: () => new Promise(r => { soltar = () => r(null) }) })
    base.assinar(() => {})
    await tick(1)
    expect(base.obter().carregando).toBe(true)
    expect(banco.chamadas).toEqual([])
    soltar()
    await tick()
    expect(base.obter().carregando).toBe(false)
    expect(ids(base.obter().linhas)).toEqual(['a=1'])
  })

  it('armazenamento do navegador que não responde não segura a carga', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco, { ler: () => new Promise(() => {}) })
    await base.sincronizar()
    expect(banco.chamadas).toEqual(['dash_base'])
    expect(ids(base.obter().linhas)).toEqual(['a=1'])
  })

  it('com base guardada no navegador: mostra na hora e só busca o que mudou', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1, b: 2 })
    banco.publicar({ b: 3, c: 4 })
    const registro: RegistroLocal = { nome: 'teste', formato: FORMATO, usuario: 'u1', epoca: 1, versao: 1,
      cols: ['id', 'v'], linhas: [['a', 1], ['b', 2]], atualizadoEm: null, salvoEm: 0 }
    const { base } = montar(banco, { registro })
    const vistas: string[][] = []
    base.assinar(() => { if (base.obter().linhas.length) vistas.push(ids(base.obter().linhas)) })
    await tick()
    await base.sincronizar()
    expect(vistas[0]).toEqual(['a=1', 'b=2'])
    expect(banco.chamadas).not.toContain('dash_base')
    expect(ids(base.obter().linhas)).toEqual(['a=1', 'b=3', 'c=4'])
    expect(base.obter().doArmazem).toBe(false)
  })

  it('base guardada de outro usuário ou de outro formato não é usada', async () => {
    for (const registro of [
      { nome: 'teste', formato: FORMATO, usuario: 'outro', epoca: 1, versao: 1, cols: ['id', 'v'], linhas: [['x', 9]], atualizadoEm: null, salvoEm: 0 },
      { nome: 'teste', formato: 'teste:1:id,v:aliases={}', usuario: 'u1', epoca: 1, versao: 1, cols: ['id', 'v'], linhas: [['x', 9]], atualizadoEm: null, salvoEm: 0 },
    ]) {
      const banco = bancoFalso()
      banco.publicar({ a: 1 })
      const { base } = montar(banco, { registro })
      await base.sincronizar()
      expect(banco.chamadas).toEqual(['dash_base'])
      expect(ids(base.obter().linhas)).toEqual(['a=1'])
    }
  })

  it('aplica inclusões, alterações e remoções do banco', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1, b: 2, c: 3 })
    const { base } = montar(banco)
    await base.sincronizar()
    const antes = base.obter().linhas
    banco.publicar({ a: 10, c: null, d: 4 })
    await base.sincronizar()
    expect(ids(base.obter().linhas)).toEqual(['a=10', 'b=2', 'd=4'])
    expect(ids(antes)).toEqual(['a=1', 'b=2', 'c=3'])
    expect(base.obter().versao).toBe(2)
  })

  it('sem mudança no banco a lista continua a mesma referência', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    const antes = base.obter().linhas
    await base.sincronizar()
    expect(base.obter().linhas).toBe(antes)
  })

  it('versão nova sem linha nova (mudança na outra base) não regrava o navegador', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base, gravados } = montar(banco)
    await base.sincronizar()
    await tick()
    const gravacoes = gravados.length
    banco.publicar()
    await base.sincronizar()
    await tick()
    expect(base.obter().versao).toBe(2)
    expect(gravados.length).toBe(gravacoes)
  })

  it('traz a saúde da sincronização do banco para o selo', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    expect(base.obter()).toMatchObject({ sincronizadoEm: '2026-11-03T15:00:00+00:00', atrasoS: 30, erroServidor: null })
    banco.saude.ultimo_erro = 'duplicate key value'
    await base.sincronizar()
    expect(base.obter().erroServidor).toBe('duplicate key value')
  })

  it('reset do banco: baixa a base inteira de novo', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const registro: RegistroLocal = { nome: 'teste', formato: FORMATO, usuario: 'u1', epoca: 1, versao: 50,
      cols: ['id', 'v'], linhas: [['velho', 0]], atualizadoEm: null, salvoEm: 0 }
    const { base } = montar(banco, { registro })
    await base.sincronizar()
    expect(banco.chamadas).toEqual(['dash_mudancas', 'dash_base'])
    expect(ids(base.obter().linhas)).toEqual(['a=1'])
  })

  it('erro mantém os últimos números bons e some quando o banco volta', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    banco.publicar({ a: 2 })
    banco.falhar(3)
    await base.sincronizar()
    expect(base.obter().erro).toMatch(/timeout/)
    expect(ids(base.obter().linhas)).toEqual(['a=1'])
    await base.sincronizar()
    expect(base.obter().erro).toBeNull()
    expect(ids(base.obter().linhas)).toEqual(['a=2'])
  })

  it('tenta de novo antes de desistir', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    banco.falhar(2)
    const { base } = montar(banco)
    await base.sincronizar()
    expect(base.obter().erro).toBeNull()
    expect(ids(base.obter().linhas)).toEqual(['a=1'])
  })

  it('pedido no meio de outra busca vira uma busca a mais, não duas em paralelo', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    banco.chamadas.length = 0
    const soltar = banco.segurar()
    const p1 = base.sincronizar()
    banco.publicar({ a: 2 })
    const p2 = base.sincronizar()
    const p3 = base.sincronizar()
    soltar()
    await Promise.all([p1, p2, p3])
    expect(banco.chamadas).toEqual(['dash_mudancas', 'dash_mudancas'])
    expect(ids(base.obter().linhas)).toEqual(['a=2'])
  })

  it('pedido no meio de uma busca que falha ainda roda no fim', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    banco.falhar(3)
    const soltar = banco.segurar()
    const p1 = base.sincronizar()
    banco.publicar({ a: 2 })
    const p2 = base.sincronizar()
    soltar()
    await Promise.all([p1, p2])
    expect(base.obter().erro).toBeNull()
    expect(ids(base.obter().linhas)).toEqual(['a=2'])
  })

  it('limpar (logout) descarta a resposta a caminho e não busca nada de novo', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    base.assinar(() => {})
    await tick()
    banco.publicar({ a: 2 })
    const soltar = banco.segurar()
    const p = base.sincronizar()
    await tick()
    banco.chamadas.length = 0
    base.limpar()
    soltar()
    await p
    await tick()
    expect(base.obter().linhas).toEqual([])
    expect(base.obter().versao).toBeNull()
    expect(banco.chamadas).toEqual([])
  })

  it('erro de uma busca de antes do logout não aparece para quem entrou depois', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    await base.sincronizar()
    banco.falhar(3)
    const soltar = banco.segurar()
    const p = base.sincronizar()
    await tick()
    base.limpar()
    soltar()
    await p
    expect(base.obter().erro).toBeNull()
  })

  it('sem usuário que possa guardar, não grava nada no navegador', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base, gravados } = montar(banco, { usuario: null })
    await base.sincronizar()
    await tick()
    expect(gravados).toEqual([])
  })

  it('montar o 1º componente já carrega; trocar de aba logo em seguida não busca de novo', async () => {
    const banco = bancoFalso()
    banco.publicar({ a: 1 })
    const { base } = montar(banco)
    const sair = base.assinar(() => {})
    await tick()
    expect(banco.chamadas).toEqual(['dash_base'])
    sair()
    base.assinar(() => {})
    await tick()
    expect(banco.chamadas).toEqual(['dash_base'])
    expect(base.emUso()).toBe(1)
  })
})
