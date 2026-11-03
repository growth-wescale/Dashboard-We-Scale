/**
 * Canal ao vivo das abas de Vendas.
 *
 * Toda vez que `dash_sincronizar()` grava uma mudança, o banco manda pelo
 * Realtime do Supabase (Broadcast, canal público `dashboard-vendas`, evento
 * `versao`) só o número da versão nova e a época — nenhum dado. Cada base em
 * uso que estiver atrás dessa versão (ou em outra época) pede o que mudou.
 *
 * O aviso acelera, mas não é a garantia: sem canal (rede do escritório
 * bloqueando WebSocket, Realtime fora) a página confere sozinha a cada 30 s;
 * com canal, a cada 5 min. Também confere ao voltar para a aba, quando a
 * internet volta e no botão Atualizar.
 *
 * O canal é público (a chave anon pode publicar nele): aviso só dispara busca
 * de mudanças, que é barata, e no máximo uma a cada 5 s.
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
  obter: () => { versao: number | null; epoca: number | null }
  sincronizar: () => Promise<void>
}

export interface DependenciasCanal {
  /**
   * Abre o canal. `aoStatus` recebe o status do Supabase ('SUBSCRIBED',
   * 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED') — às vezes na hora, dentro do
   * próprio `fechar()`.
   */
  abrir: (aoAviso: (aviso: AvisoVersao) => void, aoStatus: (status: string) => void) => ConexaoCanal
  /** Agenda e devolve o cancelamento. Padrão: setTimeout. */
  agendar?: (fn: () => void, ms: number) => () => void
  agora?: () => number
  /** Sorteio para espalhar as buscas depois de um aviso. Padrão: Math.random. */
  aleatorio?: () => number
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
/** Espalha as buscas dos painéis abertos depois de um aviso (não chegam todas juntas no banco). */
export const ESPALHAR_AVISOS_MS = 1_500
/** Intervalo mínimo entre buscas disparadas por aviso. */
export const INTERVALO_MIN_AVISOS_MS = 5_000
export const REABRIR_MS = 5_000
/** Ao voltar para a aba, só confere se a última conferência tiver mais que isso. */
const CONFERIR_AO_VOLTAR_MS = 10_000

export function criarCanal(deps: DependenciasCanal): Canal {
  const agendar = deps.agendar ?? ((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  })
  const agora = deps.agora ?? Date.now
  const aleatorio = deps.aleatorio ?? Math.random

  const ativas = new Set<Sincronizavel>()
  const ouvintesStatus = new Set<() => void>()
  let estado: StatusCanal = 'desligado'
  let conexao: ConexaoCanal | null = null
  let jaConectou = false
  let maiorAviso = 0
  let epocaAviso: number | null = null
  let ultimoDisparo = -Infinity
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
    const epoca = Number(aviso?.epoca)
    if (aviso?.epoca !== undefined && Number.isFinite(epoca)) epocaAviso = epoca
    if (cancelarAviso) return
    const espera = Math.max(
      JUNTAR_AVISOS_MS + aleatorio() * ESPALHAR_AVISOS_MS,
      ultimoDisparo + INTERVALO_MIN_AVISOS_MS - agora(),
    )
    cancelarAviso = agendar(() => {
      cancelarAviso = null
      ultimoDisparo = agora()
      const alvo = maiorAviso
      const epocaAlvo = epocaAviso
      // Zera depois de usar: um aviso forjado com versão enorme não fica valendo para sempre.
      maiorAviso = 0
      epocaAviso = null
      for (const base of [...ativas]) {
        const local = base.obter()
        const atras = local.versao === null || local.versao < alvo
        const outraEpoca = epocaAlvo !== null && local.epoca !== null && local.epoca !== epocaAlvo
        if (atras || outraEpoca) void base.sincronizar()
      }
    }, espera)
  }

  function agendarReabertura() {
    cancelarReabertura?.()
    cancelarReabertura = agendar(() => {
      cancelarReabertura = null
      if (ativas.size && !conexao) abrir()
    }, REABRIR_MS)
  }

  function abrir() {
    cancelarReabertura?.()
    cancelarReabertura = null
    mudarStatus(jaConectou ? 'sem-canal' : 'conectando')
    const minha: { c: ConexaoCanal | null } = { c: null }
    // Status que chega antes de `abrir` devolver a conexão espera ela existir.
    let pronto = false
    const pendentes: string[] = []
    const aoStatus = (s: string) => {
      if (!pronto) { pendentes.push(s); return }
      if (conexao !== minha.c) return // conexão já fechada ou trocada
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
        // Fechado sem ter sido pedido. Solta a conexão ANTES de fechar: o
        // removeChannel do Supabase devolve outro CLOSED na hora, e com a
        // conexão ainda presa aqui isso virava um laço sem fim.
        const c = conexao
        conexao = null
        c?.fechar()
        mudarStatus('sem-canal')
        if (ativas.size) agendarReabertura()
      }
    }
    try {
      minha.c = deps.abrir(aoAviso, aoStatus)
      conexao = minha.c
    } catch {
      conexao = null
      mudarStatus('sem-canal')
      agendarReabertura()
      return
    }
    pronto = true
    for (const s of pendentes.splice(0)) aoStatus(s)
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
