import type { FunnelRow } from '@/lib/funnelTypes'
import type { EventCountOptions, FunnelEventRow, PeriodWindow, ViewModes } from '@/lib/metrics'
import { dealKey, eventsInStage, isInWindow, toWindow } from '@/lib/metrics'
import { toLocalDate } from '@/lib/dateUtils'

/**
 * Reuniões (sessões) ao lado do Diagnóstico.
 *
 * Desde nov/2026 a R1 da Eletrovias é feita em grupo ("LIVE"): uma reunião,
 * vários Diagnósticos. O Diagnóstico continua igual; aqui contamos as reuniões:
 * cada R1 individual conta 1, cada LIVE conta 1.
 *
 * De qual LIVE veio cada Diagnóstico vem de `vw_reuniao_live` (gravação do
 * MeetRox que foi a R1 do negócio, achada pelo e-mail dos convidados — ver
 * docs/sql/2026-11-24-reuniao-live.sql). Negócio LIVE sem gravação vira "LIVE
 * estimada": um grupo por Closer + dia do Diagnóstico.
 *
 * Regras (docs/superpowers/specs/2026-11-24-reunioes-live-design.md):
 * - parte dos MESMOS eventos de Diagnóstico do card (`eventsInStage` com o
 *   mesmo `opts`), então segue todos os filtros e o modo Passagens/únicos;
 * - a sessão de LIVE conta no período da LIVE (os Diagnósticos dela ficam na
 *   data deles); na safra, conta se tiver ≥1 negócio da safra;
 * - no filtro de Closer, a sessão vale para QUEM CONDUZIU (igual ao bloco do
 *   MeetRox); individual e estimada, para o `nome_closer` do negócio.
 */

/** Linha de `vw_reuniao_live`. */
export interface ReuniaoLiveRow {
  id_deal: string
  ciclo: number
  tipo_r1: string | null
  data_diagnostico: string | null
  /** Nulo = negócio LIVE sem gravação encontrada. */
  call_id: number | null
  call_timestamp: string | null
  /** Quem gravou a LIVE (nome do RD). */
  closer: string | null
  titulo: string | null
  url: string | null
  convidados_externos: number | null
}

export type TipoReuniao = 'individual' | 'live' | 'live-estimada'

export interface NegocioDaReuniao { row: FunnelRow; dataDiagnostico: string | null }

export interface Reuniao {
  chave: string
  tipo: TipoReuniao
  /** Dia do Diagnóstico (individual/estimada) ou início da gravação (LIVE). */
  data: string
  /** Quem conduziu (LIVE) ou `nome_closer` do negócio. */
  closer: string | null
  /** `nome_sdr` distintos dos negócios ('' = sem SDR). */
  sdrs: string[]
  negocios: NegocioDaReuniao[]
  live?: { callId: number; titulo: string | null; url: string | null; convidadosExternos: number | null }
}

/** Diagnóstico de LIVE no recorte cuja sessão não conta nele. */
export interface DiagDeLiveForaDoRecorte extends NegocioDaReuniao {
  dataLive: string
  closerLive: string | null
  /** 'periodo' = a LIVE foi em outro período; 'closer' = outra pessoa conduziu. */
  motivo: 'periodo' | 'closer'
}

export interface ResumoReunioes {
  /** Só as que contam no recorte: LIVEs primeiro, depois individuais; mais recentes no topo. */
  reunioes: Reuniao[]
  total: number
  /** LIVE gravada + estimada. */
  deLive: number
  /** Igual ao card de Diagnóstico (`countStageEvents`). */
  diagnosticos: number
  diagsDeLiveForaDoRecorte: DiagDeLiveForaDoRecorte[]
  /** Chave = `nome_sdr` cru ('' = sem SDR). A sessão conta 1 por SDR. */
  porSdr: Map<string, number>
  /** Chave = Closer da reunião ('' = sem Closer). */
  porCloser: Map<string, number>
}

/** A LIVE começou em novembro/2026; antes disso todo Diagnóstico é R1 individual. */
export const PISO_LIVE = '2026-11-01'

const JANELA_ABERTA = toWindow()

export function resumirReunioes(args: {
  eventos: FunnelEventRow[]
  /** Recorte SEM o filtro de Closer (superset): acha a linha de cada evento. */
  rows: FunnelRow[]
  lives: ReuniaoLiveRow[]
  win: PeriodWindow
  modes: ViewModes
  /** O MESMO `opts` do card de Diagnóstico (com o filtro de Closer). */
  opts: EventCountOptions
  /** Igual a `opts`, mas com escopo sem o filtro de Closer. Padrão: `opts`. */
  optsSessao?: EventCountOptions
  /** Filtro de Closer da barra, aplicado a quem conduziu a LIVE. */
  closersFiltro?: string[]
}): ResumoReunioes {
  const { eventos, rows, lives, win, modes, opts, closersFiltro = [] } = args
  const safra = modes.funnelView === 'cohort'

  const linhaPorChave = new Map<string, FunnelRow>()
  for (const r of rows) linhaPorChave.set(dealKey(r), r)
  const livePorChave = new Map<string, ReuniaoLiveRow>()
  for (const l of lives) livePorChave.set(dealKey({ id_lead: l.id_deal, ciclo: l.ciclo }), l)

  const chaveDoEvento = (e: FunnelEventRow) => dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })
  const sessaoDoEvento = (e: FunnelEventRow) => {
    const l = livePorChave.get(chaveDoEvento(e))
    return l && l.call_id != null ? l : null
  }

  // ── Sessões de LIVE: membros vêm de todos os Diagnósticos do escopo, em
  //    qualquer data, pela regra de escopo SEM o filtro de Closer.
  const membros = new Map<number, { live: ReuniaoLiveRow; negocios: Map<string, NegocioDaReuniao> }>()
  for (const e of eventsInStage(eventos, 'Diagnóstico', JANELA_ABERTA, modes, args.optsSessao ?? opts)) {
    const l = sessaoDoEvento(e)
    const row = linhaPorChave.get(chaveDoEvento(e))
    if (!l || !row) continue
    const s = membros.get(l.call_id!) ?? { live: l, negocios: new Map() }
    const k = dealKey(row)
    const atual = s.negocios.get(k)
    if (!atual || (e.dia ?? '') < (atual.dataDiagnostico ?? '')) s.negocios.set(k, { row, dataDiagnostico: e.dia })
    membros.set(l.call_id!, s)
  }

  const motivoFora = (l: ReuniaoLiveRow): DiagDeLiveForaDoRecorte['motivo'] | null => {
    if (closersFiltro.length && !closersFiltro.includes(l.closer ?? '')) return 'closer'
    if (!safra && !isInWindow(l.call_timestamp, win)) return 'periodo'
    return null
  }

  const reunioes: Reuniao[] = []
  for (const [callId, s] of membros) {
    if (motivoFora(s.live)) continue
    const negocios = [...s.negocios.values()]
    reunioes.push({
      chave: `live:${callId}`, tipo: 'live', data: s.live.call_timestamp ?? '', closer: s.live.closer,
      sdrs: distintos(negocios.map(n => n.row.nome_sdr ?? '')), negocios,
      live: { callId, titulo: s.live.titulo, url: s.live.url, convidadosExternos: s.live.convidados_externos },
    })
  }

  // ── Diagnósticos do card: individuais, estimadas e os de LIVE fora do recorte.
  const diagnosticos = eventsInStage(eventos, 'Diagnóstico', win, modes, opts)
  const estimadas = new Map<string, Reuniao>()
  const fora: DiagDeLiveForaDoRecorte[] = []
  diagnosticos.forEach((e, i) => {
    const row = linhaPorChave.get(chaveDoEvento(e))
    if (!row) return
    const dia = toLocalDate(e.dia) ?? ''
    const l = sessaoDoEvento(e)
    if (l) {
      const motivo = motivoFora(l)
      if (motivo) fora.push({ row, dataDiagnostico: e.dia, dataLive: l.call_timestamp ?? '', closerLive: l.closer, motivo })
      return
    }
    const negocio = { row, dataDiagnostico: e.dia }
    if (row.tipo_r1 === 'LIVE' && dia >= PISO_LIVE) {
      const closer = row.nome_closer ?? null
      const chave = `est:${closer ?? ''}|${dia}`
      const est = estimadas.get(chave) ?? { chave, tipo: 'live-estimada', data: dia, closer, sdrs: [], negocios: [] }
      est.negocios.push(negocio)
      est.sdrs = distintos(est.negocios.map(n => n.row.nome_sdr ?? ''))
      estimadas.set(chave, est)
      return
    }
    reunioes.push({
      chave: `ind:${dealKey(row)}:${dia}:${i}`, tipo: 'individual', data: dia,
      closer: row.nome_closer ?? null, sdrs: [row.nome_sdr ?? ''], negocios: [negocio],
    })
  })
  reunioes.push(...estimadas.values())

  const ordem: Record<TipoReuniao, number> = { live: 0, 'live-estimada': 0, individual: 1 }
  reunioes.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || b.data.localeCompare(a.data))

  const porSdr = new Map<string, number>()
  const porCloser = new Map<string, number>()
  for (const r of reunioes) {
    for (const s of r.sdrs) porSdr.set(s, (porSdr.get(s) ?? 0) + 1)
    const c = r.closer ?? ''
    porCloser.set(c, (porCloser.get(c) ?? 0) + 1)
  }

  return {
    reunioes,
    total: reunioes.length,
    deLive: reunioes.filter(r => r.tipo !== 'individual').length,
    diagnosticos: diagnosticos.length,
    diagsDeLiveForaDoRecorte: fora,
    porSdr,
    porCloser,
  }
}

function distintos(xs: string[]): string[] {
  return [...new Set(xs)]
}

/**
 * A linha "em N reuniões" (e a coluna REUNIÕES) só aparece quando há algo a
 * explicar: números diferentes do Diagnóstico. Sem a base da view carregada,
 * nunca — todo negócio LIVE viraria "LIVE estimada".
 */
export function mostrarReunioes(resumo: ResumoReunioes | null | undefined, pronto: boolean): boolean {
  return pronto && !!resumo && resumo.total !== resumo.diagnosticos
}
