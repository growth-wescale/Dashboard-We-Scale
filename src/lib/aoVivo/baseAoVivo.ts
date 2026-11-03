import {
  aplicarMudancas, colecaoDaBase, paraArrays,
  type Colecao, type DefinicaoBase, type PacoteBase, type PacoteMudancas,
} from './colecao'
import type { RegistroLocal } from './armazemLocal'

/**
 * Uma base ao vivo (vendas ou etapas) no navegador: guarda a coleção em
 * memória e no armazenamento local, e sabe se atualizar pelo banco.
 *
 * Ordem ao abrir uma aba:
 *   1. memória (troca de aba): mostra na hora;
 *   2. armazenamento local (F5, outro dia): mostra na hora, confere em seguida;
 *   3. banco (1º acesso neste navegador): `dash_base`, uma chamada só.
 * Depois disso só pede o que mudou (`dash_mudancas`), quando o canal avisa
 * que o banco mudou ou na conferência periódica — ver `canal.ts`.
 *
 * Rede, armazenamento e usuário entram por `DependenciasBase` para os testes
 * rodarem sem navegador.
 */

export interface DependenciasBase {
  /** Chama uma RPC do Supabase de Expansão e devolve o JSON; lança em erro. */
  rpc: (nome: 'dash_base' | 'dash_mudancas', args: Record<string, unknown>, sinal: AbortSignal) => Promise<unknown>
  ler: (nome: string) => Promise<RegistroLocal | null>
  gravar: (registro: RegistroLocal) => Promise<void>
  /** Usuário logado agora (null = ninguém: não lê nem grava nada local). */
  usuario: () => Promise<string | null>
  /** Avisos de uso: o canal só fica aberto enquanto alguma base está em uso. */
  ativou?: (base: BaseAoVivo<unknown>) => void
  desativou?: (base: BaseAoVivo<unknown>) => void
  agora?: () => number
  esperar?: (ms: number) => Promise<void>
  /** Atraso da gravação local depois de uma mudança (junta rajadas). Padrão 5 s. */
  atrasoGravacaoMs?: number
}

export interface EstadoBase<T> {
  linhas: readonly T[]
  /** Ainda sem nenhuma linha para mostrar (1ª carga neste navegador). */
  carregando: boolean
  /** Última tentativa falhou; `linhas` seguem sendo as últimas boas. */
  erro: string | null
  versao: number | null
  /** Quando conferiu com o banco pela última vez (ms). */
  conferidoEm: number | null
  /** Última mudança no banco (ISO), como o banco informou. */
  atualizadoEm: string | null
  /** Veio do armazenamento local e ainda não foi conferida com o banco. */
  doArmazem: boolean
}

export interface BaseAoVivo<T> {
  readonly nome: string
  obter: () => EstadoBase<T>
  assinar: (ouvinte: () => void) => () => void
  /** Garante dados (memória → local → banco) e busca o que mudou. Nunca lança. */
  sincronizar: () => Promise<void>
  /** Esquece a coleção da memória (logout). O armazenamento local é apagado à parte. */
  limpar: () => void
  /** Componentes usando a base agora. */
  emUso: () => number
}

/** Tentativas por chamada, contando a primeira, e tempo máximo de cada uma. */
const TENTATIVAS = 3
const TEMPO_BASE_MS = 45_000
const TEMPO_MUDANCAS_MS = 20_000
/** Ao voltar para uma aba, só confere de novo se a última conferência tiver mais que isso. */
const CONFERENCIA_RECENTE_MS = 15_000

export const ESTADO_VAZIO: EstadoBase<never> = Object.freeze({
  linhas: Object.freeze([]) as readonly never[],
  carregando: false,
  erro: null,
  versao: null,
  conferidoEm: null,
  atualizadoEm: null,
  doArmazem: false,
})

function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

export function criarBaseAoVivo<T>(def: DefinicaoBase<T>, deps: DependenciasBase): BaseAoVivo<T> {
  const agora = deps.agora ?? Date.now
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const atrasoGravacao = deps.atrasoGravacaoMs ?? 5_000
  // Registro local de outro formato (colunas mudaram, mudou a montagem) é ignorado.
  const formato = `${def.nome}:1:${def.colunas.join(',')}`

  let colecao: Colecao<T> | null = null
  let estado: EstadoBase<T> = ESTADO_VAZIO
  // Sobe a cada limpar(): resposta pedida antes disso é descartada.
  let geracao = 0
  let emVoo: Promise<void> | null = null
  let deNovo = false
  let gravacao: ReturnType<typeof setTimeout> | null = null
  const ouvintes = new Set<() => void>()

  function publicar(parcial: Partial<EstadoBase<T>>) {
    estado = { ...estado, ...parcial }
    for (const ouvinte of [...ouvintes]) ouvinte()
  }

  function usar(nova: Colecao<T>, doArmazem: boolean) {
    colecao = nova
    publicar({
      linhas: nova.linhas,
      versao: nova.versao,
      atualizadoEm: nova.atualizadoEm,
      carregando: false,
      erro: null,
      doArmazem,
      ...(doArmazem ? {} : { conferidoEm: agora() }),
    })
  }

  async function chamar<R>(nome: 'dash_base' | 'dash_mudancas', args: Record<string, unknown>, tempoMs: number): Promise<R> {
    let ultimo: unknown
    for (let t = 0; t < TENTATIVAS; t++) {
      if (t > 0) await esperar(800 * t)
      const controle = new AbortController()
      const timer = setTimeout(() => controle.abort(), tempoMs)
      try {
        return (await deps.rpc(nome, args, controle.signal)) as R
      } catch (e) {
        ultimo = controle.signal.aborted ? new Error(`O banco não respondeu em ${tempoMs / 1000} s`) : e
      } finally {
        clearTimeout(timer)
      }
    }
    throw ultimo
  }

  function agendarGravacao() {
    if (gravacao) clearTimeout(gravacao)
    gravacao = setTimeout(() => {
      gravacao = null
      void gravarAgora()
    }, atrasoGravacao)
  }

  async function gravarAgora() {
    const c = colecao
    if (!c) return
    try {
      const usuario = await deps.usuario()
      if (!usuario || c !== colecao) return
      await deps.gravar({
        nome: def.nome, formato, usuario,
        epoca: c.epoca, versao: c.versao,
        cols: [...def.colunas], linhas: paraArrays(c, def.colunas),
        atualizadoEm: c.atualizadoEm, salvoEm: agora(),
      })
    } catch {
      // armazenamento local é só aceleração
    }
  }

  async function lerArmazem(g: number): Promise<boolean> {
    try {
      const [registro, usuario] = await Promise.all([deps.ler(def.nome), deps.usuario()])
      if (g !== geracao) return false
      if (colecao) return true
      if (!registro || registro.formato !== formato || !usuario || registro.usuario !== usuario) return false
      usar(colecaoDaBase(def, {
        base: def.nome, epoca: registro.epoca, versao: registro.versao,
        cols: registro.cols, linhas: registro.linhas, atualizado_em: registro.atualizadoEm,
      }), true)
      return true
    } catch {
      return false
    }
  }

  async function baixarTudo(g: number) {
    if (!estado.linhas.length) publicar({ carregando: true })
    const pacote = await chamar<PacoteBase>('dash_base', { p_base: def.nome }, TEMPO_BASE_MS)
    if (g !== geracao) return
    usar(colecaoDaBase(def, pacote), false)
    agendarGravacao()
  }

  async function rodar() {
    const g = geracao
    if (!colecao && !(await lerArmazem(g))) {
      if (g === geracao) await baixarTudo(g)
      return
    }
    if (g !== geracao || !colecao) return
    const atual = colecao
    const pacote = await chamar<PacoteMudancas>(
      'dash_mudancas', { p_base: def.nome, p_desde: atual.versao, p_epoca: atual.epoca }, TEMPO_MUDANCAS_MS)
    if (g !== geracao || colecao !== atual) return
    const resultado = aplicarMudancas(def, atual, pacote)
    if (resultado === 'reset') {
      await baixarTudo(g)
    } else if (resultado !== atual) {
      usar(resultado, false)
      agendarGravacao()
    } else {
      publicar({ conferidoEm: agora(), erro: null, doArmazem: false })
    }
  }

  function sincronizar(): Promise<void> {
    if (emVoo) {
      // Pedido no meio de outra rodada (aviso novo do banco): roda de novo no fim.
      deNovo = true
      return emVoo
    }
    emVoo = (async () => {
      try {
        do {
          deNovo = false
          await rodar()
        } while (deNovo)
      } catch (e) {
        publicar({ erro: mensagem(e), carregando: false })
      } finally {
        emVoo = null
      }
    })()
    return emVoo
  }

  const base: BaseAoVivo<T> = {
    nome: def.nome,
    obter: () => estado,
    assinar(ouvinte) {
      ouvintes.add(ouvinte)
      if (ouvintes.size === 1) {
        deps.ativou?.(base as BaseAoVivo<unknown>)
        const recente = estado.conferidoEm !== null && agora() - estado.conferidoEm < CONFERENCIA_RECENTE_MS
        if (!recente) void sincronizar()
      }
      return () => {
        if (!ouvintes.delete(ouvinte)) return
        if (ouvintes.size === 0) deps.desativou?.(base as BaseAoVivo<unknown>)
      }
    },
    sincronizar,
    limpar() {
      geracao++
      colecao = null
      deNovo = false
      if (gravacao) { clearTimeout(gravacao); gravacao = null }
      publicar(ESTADO_VAZIO)
      if (ouvintes.size > 0) void sincronizar()
    },
    emUso: () => ouvintes.size,
  }
  return base
}
