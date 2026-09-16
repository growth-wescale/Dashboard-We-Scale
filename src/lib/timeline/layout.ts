import { toLocalDate } from '@/lib/dateUtils'
import { STAGE_LABEL } from '@/lib/metrics'
import { MARGENS, type NivelZoom } from './zoom'
import { MS_DIA, type Camada, type Desvio, type Fase, type Momento, type Timeline } from './tipos'

export interface Viewport { k: number; x0: number; largura: number }

export const PISTA = {
  Y: 184, H: 32, MARGEM_ESQ: MARGENS.ESQ, MARGEM_DIR: MARGENS.DIR,
  NO_Y_CIMA: 88, NO_Y_BAIXO: 282, RAIO: 26, RAIO_TERMINAL: 32, GAP_MIN: 190,
  BOLINHA_GAP: 14, TOQUES_Y: 232, MARCADOR_Y: 126, EIXO_Y: 352,
  ALTURA: 370, ALTURA_MICRO: 400, CLUSTER_PX: 26,
} as const

export const CORES = {
  MQL: 'var(--ws-text-primary)', SDR: 'var(--ws-vinho-b)', Closer: 'var(--ws-verde)',
  Desfecho: '#E0A928', // sem token de design system pra esse dourado
  ganho: '#E0A928', // idem
  perda: 'var(--status-risco)', noShow: 'var(--status-atencao)', desconhecida: '#9CA3AF',
  hoje: 'var(--ws-border-strong)', reaberto: 'var(--ws-border-strong)',
} as const

export function corDaCamada(c: Camada): string { return CORES[c] }

export interface ChevronLayout { fase: Fase; x: number; w: number; cor: string; label: string; labelVisivel: boolean }
export interface NoLayout {
  id: string
  momento: Momento | null
  fase: Fase | null
  xReal: number
  x: number
  y: number
  fileira: 'cima' | 'baixo' | 'pista'
  raio: number
  cor: string
  titulo: string
  detalhe: string
  terminal: boolean
  desvio?: Desvio
  /** Chave pro ícone (etapa canônica, tipo do nó, ou fase no macro). */
  icone: string
}
export interface ToqueLayout { id: string; momento: Momento; x: number; y: number; cor: string; contorno: string | null; vazado: boolean; cluster: Momento[] }
export interface MarcadorLayout { id: string; momento: Momento; x: number; y: number; label: string }
export interface EixoTick { x: number; label: string }
export interface LayoutPista {
  chevrons: ChevronLayout[]
  nos: NoLayout[]
  toques: ToqueLayout[]
  marcadores: MarcadorLayout[]
  eixo: EixoTick[]
  larguraConteudo: number
  altura: number
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "7 ago" no dia de Brasília. */
export function rotuloDia(d: Date): string {
  const iso = toLocalDate(d.toISOString()) ?? d.toISOString().slice(0, 10)
  const [, m, dia] = iso.split('-')
  return `${Number(dia)} ${MESES[Number(m) - 1]}`
}
function rotuloHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}
export function fmtDiasCurto(dias: number): string {
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))}H`
  const n = Math.round(dias)
  return n === 1 ? '1 DIA' : `${n} DIAS`
}
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const LARGURA_CHAR = 7.2

/**
 * Rótulo do nó: quando o momento tem etapa canônica (`etapa`/`no_show`), usa
 * sempre `STAGE_LABEL` — a mesma fonte única de nomenclatura das outras abas
 * de Vendas ("SQL", não "Reunião Agendada SQL") — em vez do `titulo` cru do
 * momento, que pode não ter passado por essa normalização.
 */
function tituloDoNo(m: Momento): string {
  return m.etapa ? STAGE_LABEL[m.etapa] : m.titulo
}

function corDoNo(m: Momento): string {
  if (m.tipo === 'no_show') return CORES.noShow
  if (m.tipo === 'perda') return CORES.perda
  if (m.tipo === 'ganho') return CORES.ganho
  if (m.tipo === 'retomada') return CORES.reaberto
  if (m.tipo === 'etapa' && !m.etapa) return CORES.desconhecida
  return corDaCamada(m.camada)
}

export function layoutPista(tl: Timeline, vp: Viewport, nivel: NivelZoom): LayoutPista {
  const x = (t: Date) => PISTA.MARGEM_ESQ + ((t.getTime() - tl.inicio.getTime()) / MS_DIA) * vp.k - vp.x0
  const diasTotal = Math.max(1, (tl.fim.getTime() - tl.inicio.getTime()) / MS_DIA)

  // chevrons
  const chevrons: ChevronLayout[] = tl.fases.map(f => {
    const w = Math.max(PISTA.H, x(f.fim) - x(f.inicio))
    const label = f.tipo === 'MQL' ? 'MQL'
      : f.tipo === 'Reaberto' ? `REABERTO EM ${fmtDiasCurto(f.duracaoDias)}`
      : [f.tipo.toUpperCase(), fmtDiasCurto(f.duracaoDias), f.ator?.toUpperCase()].filter(Boolean).join(' · ')
    const cor = f.tipo === 'Reaberto' ? CORES.reaberto : corDaCamada(f.tipo)
    return { fase: f, x: x(f.inicio), w, cor, label, labelVisivel: w >= label.length * LARGURA_CHAR + 24 }
  })

  // nós
  const trechoPorNo = new Map(tl.trechos.map(t => [t.deId, t]))
  const nos: NoLayout[] = []
  const ultimoX: Record<'cima' | 'baixo', number> = { cima: -Infinity, baixo: -Infinity }
  let proxima: 'cima' | 'baixo' = 'cima'
  const posicionar = (xReal: number): { x: number; y: number; fileira: 'cima' | 'baixo' } => {
    const fileira = proxima
    proxima = fileira === 'cima' ? 'baixo' : 'cima'
    const xPos = Math.max(xReal, ultimoX[fileira] + PISTA.GAP_MIN)
    ultimoX[fileira] = xPos
    return { x: xPos, y: fileira === 'cima' ? PISTA.NO_Y_CIMA : PISTA.NO_Y_BAIXO, fileira }
  }

  if (nivel === 'macro') {
    for (const f of tl.fases) {
      if (f.tipo !== 'SDR' && f.tipo !== 'Closer') continue
      const meio = new Date((f.inicio.getTime() + f.fim.getTime()) / 2)
      const partes = [plural(f.etapas, 'etapa', 'etapas'), plural(f.toques, 'toque', 'toques')]
      if (f.noShows) partes.push(plural(f.noShows, 'no-show', 'no-shows'))
      if (f.reunioes) partes.push(plural(f.reunioes, 'reunião', 'reuniões'))
      const p = posicionar(x(meio))
      nos.push({ id: `fase:${f.tipo}:${f.inicio.getTime()}`, momento: null, fase: f, xReal: x(meio), ...p, raio: PISTA.RAIO, cor: corDaCamada(f.tipo),
        titulo: [f.tipo, f.ator].filter(Boolean).join(' · '), detalhe: partes.join(' · '), terminal: false, icone: f.tipo })
    }
  } else {
    for (const n of tl.nos) {
      if (n.id === tl.desfecho.momentoId) continue // vira o nó terminal
      const tr = trechoPorNo.get(n.id)
      const partes: string[] = [nivel === 'micro' ? `${rotuloDia(n.instante)} ${rotuloHora(n.instante)}` : rotuloDia(n.instante)]
      if (nivel === 'micro' && n.ator) partes.push(n.ator)
      if (nivel === 'etapas' && tr) {
        if (tr.toques) partes.push(plural(tr.toques, 'toque', 'toques') + (tr.atrasados ? ` · ${plural(tr.atrasados, 'atrasado', 'atrasados')}` : ''))
        if (tr.reunioes) partes.push(plural(tr.reunioes, 'reunião', 'reuniões'))
      }
      if (n.detalhe && (n.tipo === 'perda' || n.tipo === 'retomada' || n.tipo === 'etapa')) partes.push(n.detalhe)
      const p = posicionar(x(n.instante))
      nos.push({ id: n.id, momento: n, fase: null, xReal: x(n.instante), ...p, raio: PISTA.RAIO, cor: corDoNo(n), titulo: tituloDoNo(n), detalhe: partes.join(' · '),
        terminal: false, desvio: n.desvio, icone: n.tipo === 'etapa' ? (n.etapa ?? 'desconhecida') : n.tipo })
    }
  }
  // terminal
  const term = tl.desfecho
  const momentoTerm = tl.momentos.find(m => m.id === term.momentoId) ?? null
  const xTerm = x(term.instante)
  nos.push({
    id: `terminal:${term.tipo}`, momento: momentoTerm, fase: null, xReal: xTerm, x: xTerm, y: PISTA.Y, fileira: 'pista',
    raio: PISTA.RAIO_TERMINAL, cor: term.tipo === 'ganho' ? CORES.ganho : term.tipo === 'perda' ? CORES.perda : CORES.hoje,
    titulo: term.tipo === 'ganho' ? 'Ganho' : term.tipo === 'perda' ? 'Perdido' : 'Hoje',
    detalhe: term.tipo === 'em_andamento' ? `${fmtDiasCurto(diasTotal).toLowerCase()} no funil` : [rotuloDia(term.instante), momentoTerm?.detalhe].filter(Boolean).join(' · '),
    terminal: true, icone: term.tipo,
  })

  // toques + marcadores (micro)
  const toques: ToqueLayout[] = []
  const marcadores: MarcadorLayout[] = []
  if (nivel === 'micro') {
    const micro = tl.momentos.filter(m => m.tipo === 'tarefa' || m.tipo === 'reuniao').sort((a, b) => a.instante.getTime() - b.instante.getTime())
    for (const m of micro) {
      const xm = x(m.instante)
      const ultimo = toques[toques.length - 1]
      const atrasada = m.meta?.kind === 'tarefa' && m.meta.atrasada
      const vazado = m.meta?.kind === 'tarefa' && !m.meta.concluida
      if (ultimo && xm - ultimo.x < PISTA.CLUSTER_PX) {
        ultimo.cluster.push(m)
        if (atrasada) ultimo.contorno = CORES.noShow
        continue
      }
      toques.push({ id: m.id, momento: m, x: xm, y: PISTA.TOQUES_Y, cor: corDaCamada(m.camada), contorno: atrasada ? CORES.noShow : null, vazado, cluster: [m] })
    }
    for (const m of tl.momentos) {
      if (m.tipo !== 'troca_responsavel' && m.tipo !== 'mudanca_funil' && m.tipo !== 'mudanca_campo') continue
      marcadores.push({ id: m.id, momento: m, x: x(m.instante), y: PISTA.MARCADOR_Y, label: `${m.titulo}: ${m.detalhe ?? ''}` })
    }
  }

  // eixo do tempo
  const eixo: EixoTick[] = []
  const passoDias = vp.k >= 90 ? 1 : vp.k >= 12 ? 7 : 0
  if (passoDias > 0) {
    for (let t = new Date(tl.inicio); t <= tl.fim; t = new Date(t.getTime() + passoDias * MS_DIA)) eixo.push({ x: x(t), label: rotuloDia(t) })
  } else {
    const ini = toLocalDate(tl.inicio.toISOString())!.slice(0, 7)
    const fimM = toLocalDate(tl.fim.toISOString())!.slice(0, 7)
    for (let ym = ini; ym <= fimM;) {
      const [y, m] = ym.split('-').map(Number)
      const primeiro = new Date(`${ym}-01T03:00:00Z`)
      if (primeiro >= tl.inicio) eixo.push({ x: x(primeiro), label: `${MESES[m - 1]} ${String(y).slice(2)}` })
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
    if (eixo.length === 0) eixo.push({ x: x(tl.fim), label: `${MESES[tl.fim.getMonth()]} ${String(tl.fim.getFullYear()).slice(2)}` })
  }

  const maxX = Math.max(x(tl.fim), ...nos.map(n => n.x)) + PISTA.MARGEM_DIR + vp.x0
  return { chevrons, nos, toques, marcadores, eixo, larguraConteudo: maxX + 160, altura: nivel === 'micro' ? PISTA.ALTURA_MICRO : PISTA.ALTURA }
}
