/**
 * Canal ao vivo das abas de Vendas.
 *
 * Toda vez que `dash_sincronizar()` grava uma mudança, o banco manda pelo
 * Realtime do Supabase (Broadcast, canal público `dashboard-vendas`, evento
 * `versao`) só o número da versão nova — nenhum dado. Cada base em uso que
 * estiver atrás dessa versão pede o que mudou.
 *
 * O aviso acelera, mas não é a garantia: sem canal (rede do escritório
 * bloqueando WebSocket, Realtime fora) a página confere sozinha a cada 30 s;
 * com canal, a cada 5 min. Também confere ao voltar para a aba, quando a
 * internet volta e no botão Atualizar.
 *
 * O canal só fica aberto enquanto alguma base está em uso; fecha 1 min depois
 * da última sair (trocar de aba não derruba a conexão).
 */

export type StatusCanal = 'desligado' | 'conectando' | 'ao-vivo' | 'sem-canal'

export interface AvisoVersao {
  versao?: unknown
  epoca?: unknown
}

export interface ConexaoCanal {
  fechar: () => void
}

/** O que o canal precisa de uma base. */
export interface Sincronizavel {
  obter: () => { versao: number | null }
  sincronizar: () => Promise<void>
}

export interface DependenciasCanal {
  /**
   * Abre o canal. `aoStatus` recebe o status do Supabase ('SUBSCRIBED',
   * 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED').
   */
  abrir: (aoAviso: (aviso: AvisoVersao) => void, aoStatus: (status: string) => void) => ConexaoCanal
  /** Agenda e devolve o cancelamento. Padrão: setTimeout. */
  agendar?: (fn: () => void, ms: number) => () => void
  agora?: () => number
  /** Eventos do navegador; ausente nos testes. */
  janela?: Pick<Window, 'addEventListener' | 'removeEventListener'> & { document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> }
}

export interface Canal {
  ativar: (base: Sincronizavel) => void
  desativar: (base: Sincronizavel) => void
  status: () => StatusCanal
  assinarStatus: (ouvinte: () => void) => () => void
  /** Confere agora todas as bases em uso. */
  conferir: () => void
}

export const CONFERENCIA_COM_CANAL_MS = 5 * 60_000
export const CONFERENCIA_SEM_CANAL_MS = 30_000
export const ESPERA_FECHAR_MS = 60_000
/** Avisos em rajada viram uma busca só. */
export const JUNTAR_AVISOS_MS = 300
export const REABRIR_MS = 5_000
/** Ao voltar para a aba, só confere se a última conferência tiver mais que isso. */
const CONFERIR_AO_VOLTAR_MS = 10_000

export function criarCanal(deps: DependenciasCanal): Canal {
  const agendar = deps.agendar ?? ((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  })
  const agora = deps.agora ?? Date.now

  const ativas = new Set<Sincronizavel>()
  const ouvintesStatus = new Set<() => void>()
  let estado: StatusCanal = 'desligado'
  let conexao: ConexaoCanal | null = null
  let jaConectou = false
  let maiorAviso = 0
  let ultimaConferencia = 0
  let cancelarConferencia: (() => void) | null = null
  let cancelarFechamento: (() => void) | null = null
  let cancelarAviso: (() => void) | null = null
  let cancelarReabertura: (() => void) | null = null
  let ouvindoJanela = false

  function mudarStatus(novo: StatusCanal) {
    if (novo === estado) return
    estado = novo
    for (const ouvinte of [...ouvintesStatus]) ouvinte()
    programarConferencia()
  }

  function conferir() {
    ultimaConferencia = agora()
    for (const base of [...ativas]) void base.sincronizar()
  }

  function programarConferencia() {
    cancelarConferencia?.()
    cancelarConferencia = null
    if (!ativas.size || estado === 'desligado') return
    const ms = estado === 'ao-vivo' ? CONFERENCIA_COM_CANAL_MS : CONFERENCIA_SEM_CANAL_MS
    cancelarConferencia = agendar(() => {
      cancelarConferencia = null
      conferir()
      programarConferencia()
    }, ms)
  }

  function aoAviso(aviso: AvisoVersao) {
    const versao = Number(aviso?.versao)
    if (!Number.isFinite(versao)) return
    maiorAviso = Math.max(maiorAviso, versao)
    if (cancelarAviso) return
    cancelarAviso = agendar(() => {
      cancelarAviso = null
      for (const base of [...ativas]) {
        const local = base.obter().versao
        if (local === null || local < maiorAviso) void base.sincronizar()
      }
    }, JUNTAR_AVISOS_MS)
  }

  function abrir() {
    cancelarReabertura?.()
    cancelarReabertura = null
    mudarStatus(jaConectou ? 'sem-canal' : 'conectando')
    const minha: { c: ConexaoCanal | null } = { c: null }
    const aoStatus = (s: string) => {
      if (conexao !== minha.c) return // resposta de uma conexão já fechada
      if (s === 'SUBSCRIBED') {
        const reconectou = jaConectou && estado !== 'ao-vivo'
        jaConectou = true
        mudarStatus('ao-vivo')
        // Avisos que chegaram enquanto estava fora se perderam: confere já.
        if (reconectou) conferir()
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        // O Supabase tenta de novo sozinho; enquanto isso, conferência de 30 s.
        mudarStatus('sem-canal')
      } else if (s === 'CLOSED') {
        // Fechado sem ter sido pedido: reabre daqui a pouco.
        mudarStatus('sem-canal')
        conexao?.fechar()
        conexao = null
        if (ativas.size) cancelarReabertura = agendar(() => { cancelarReabertura = null; if (ativas.size && !conexao) abrir() }, REABRIR_MS)
      }
    }
    try {
      minha.c = deps.abrir(aoAviso, aoStatus)
      conexao = minha.c
    } catch {
      conexao = null
      mudarStatus('sem-canal')
      cancelarReabertura = agendar(() => { cancelarReabertura = null; if (ativas.size && !conexao) abrir() }, REABRIR_MS)
    }
  }

  function fechar() {
    cancelarConferencia?.(); cancelarConferencia = null
    cancelarAviso?.(); cancelarAviso = null
    cancelarReabertura?.(); cancelarReabertura = null
    const c = conexao
    conexao = null
    c?.fechar()
    ouvirJanela(false)
    mudarStatus('desligado')
  }

  const aoVoltar = () => {
    if (deps.janela?.document?.visibilityState !== 'visible') return
    if (agora() - ultimaConferencia > CONFERIR_AO_VOLTAR_MS) conferir()
  }
  const aoInternetVoltar = () => conferir()
  const aoAtualizar = () => conferir()

  function ouvirJanela(ligar: boolean) {
    const j = deps.janela
    if (!j || ligar === ouvindoJanela) return
    ouvindoJanela = ligar
    if (ligar) {
      j.document?.addEventListener('visibilitychange', aoVoltar)
      j.addEventListener('online', aoInternetVoltar)
      j.addEventListener('dashboard:refresh', aoAtualizar)
    } else {
      j.document?.removeEventListener('visibilitychange', aoVoltar)
      j.removeEventListener('online', aoInternetVoltar)
      j.removeEventListener('dashboard:refresh', aoAtualizar)
    }
  }

  return {
    ativar(base) {
      cancelarFechamento?.()
      cancelarFechamento = null
      ativas.add(base)
      ouvirJanela(true)
      if (!conexao && !cancelarReabertura) abrir()
      else programarConferencia()
    },
    desativar(base) {
      if (!ativas.delete(base) || ativas.size) return
      cancelarFechamento?.()
      cancelarFechamento = agendar(() => {
        cancelarFechamento = null
        if (!ativas.size) fechar()
      }, ESPERA_FECHAR_MS)
    },
    status: () => estado,
    assinarStatus(ouvinte) {
      ouvintesStatus.add(ouvinte)
      return () => { ouvintesStatus.delete(ouvinte) }
    },
    conferir,
  }
}
