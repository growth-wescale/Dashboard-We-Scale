import { dayOfMonth, daysInMonth, toLocalDate } from '@/lib/dateUtils'
import { dealKey, eventsInStage, isSale, saleUnits, toWindow } from '@/lib/metrics'
import type { FunnelEventRow, StageKey, ViewModes } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { mesAnterior } from '@/lib/mtd'

/**
 * Séries acumuladas dia a dia do gráfico "Comparativo Month-to-Date" da aba
 * Performance (SDR e Closer).
 *
 * Cada ponto da série é o MESMO número que o card daria com o período "dia 1
 * até o dia N" daquele mês — mesmas regras de contagem dos cards:
 * - MQL pela data de MQL da linha do deal (`countStage`);
 * - SQL/Diagnóstico/SAL/COF/No Show pelos eventos (`eventsInStage`, com a trava
 *   de funil da SQL e o recorte por ciclo); em "Deals únicos" cada
 *   (deal, ciclo) conta uma vez no mês, no dia da 1ª passagem;
 * - Fechamentos pela trava de venda (`status_atual = 'Ganho'`), em negócios ou
 *   unidades conforme o toggle; Receita soma `valor_contrato`.
 *
 * "Deals criados no período" (safra) não se aplica aqui: o comparativo é sempre
 * pela data de cada etapa.
 */

export type MetricaMtd = 'mql' | 'sql' | 'diag' | 'sal' | 'noShow' | 'cof' | 'fech' | 'receita'

const ETAPA_DA_METRICA: Partial<Record<MetricaMtd, StageKey>> = {
  sql: 'Reunião Agendada SQL',
  diag: 'Diagnóstico',
  sal: 'SAL',
  cof: 'Oportunidade COF',
  noShow: 'No Show',
}

export interface MesMtd {
  /** 'YYYY-MM' */
  mesKey: string
  /** Quantos dias do mês entram na série (1..dias). */
  dias: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Mês de referência + os `n - 1` anteriores. O de referência vai até `diaRef`;
 * os anteriores até o mesmo dia (ou o último dia deles, se forem mais curtos).
 */
export function mesesDoComparativo(mesRef: string, diaRef: number, n = 4): MesMtd[] {
  const dia = Math.max(1, Math.min(diaRef, daysInMonth(mesRef)))
  const meses: MesMtd[] = []
  let k = mesRef
  for (let i = 0; i < n; i++) {
    meses.push({ mesKey: k, dias: Math.min(dia, daysInMonth(k)) })
    k = mesAnterior(k)
  }
  return meses
}

/**
 * Mês e dia de referência a partir do fim da janela filtrada: com um mês
 * selecionado, ele mesmo (até hoje se estiver em curso, inteiro se fechado);
 * em qualquer outro recorte, o mês do último dia do período.
 */
export function referenciaMtd(mesUnico: string | null, fimJanela: string): { mesKey: string; dia: number } {
  const mesKey = mesUnico ?? fimJanela.slice(0, 7)
  const fimMes = fimJanela.slice(0, 7)
  const dia = fimMes === mesKey ? dayOfMonth(fimJanela) : fimMes > mesKey ? daysInMonth(mesKey) : 1
  return { mesKey, dia: Math.max(1, dia) }
}

export interface ContextoMtd {
  /** Linhas de vw_funil_vendas já recortadas pelos filtros da barra. */
  scoped: FunnelRow[]
  eventos: FunnelEventRow[]
  modes: ViewModes
  /** Recorte dos eventos pelos ciclos do escopo (`noEscopoDoCiclo`). */
  extra?: (e: FunnelEventRow) => boolean
}

interface Item { dia: number; valor: number }

function itensDoMes(metrica: MetricaMtd, mes: MesMtd, ctx: ContextoMtd): Item[] {
  const de = `${mes.mesKey}-01`
  const ate = `${mes.mesKey}-${pad(mes.dias)}`
  const dentro = (v: string | null | undefined): number | null => {
    const d = toLocalDate(v)
    return d && d >= de && d <= ate ? dayOfMonth(d) : null
  }

  if (metrica === 'mql') {
    const out: Item[] = []
    for (const r of ctx.scoped) {
      const d = dentro(r.data_novo_mql)
      if (d != null) out.push({ dia: d, valor: 1 })
    }
    return out
  }

  if (metrica === 'fech' || metrica === 'receita') {
    const out: Item[] = []
    for (const r of ctx.scoped) {
      if (!isSale(r)) continue
      const d = dentro(r.data_venda)
      if (d == null) continue
      const valor = metrica === 'receita'
        ? Number(r.valor_contrato ?? 0) || 0
        : ctx.modes.salesMode === 'units' ? saleUnits(r) : 1
      out.push({ dia: d, valor })
    }
    return out
  }

  const etapa = ETAPA_DA_METRICA[metrica]
  if (!etapa) return []
  const win = toWindow(null, null, [{ from: de, to: ate }])
  // Busca todas as passagens; a deduplicação de "Deals únicos" é feita abaixo,
  // pelo dia da 1ª passagem de cada (deal, ciclo) no mês.
  const evs = eventsInStage(
    ctx.eventos, etapa, win,
    { ...ctx.modes, eventSource: 'passages', funnelView: 'stageDate' },
    { extra: ctx.extra },
  )
  if (ctx.modes.eventSource === 'passages') {
    return evs.flatMap(e => {
      const d = dentro(e.dia)
      return d == null ? [] : [{ dia: d, valor: 1 }]
    })
  }
  const primeiro = new Map<string, number>()
  for (const e of evs) {
    const d = dentro(e.dia)
    if (d == null) continue
    const k = dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })
    const atual = primeiro.get(k)
    if (atual == null || d < atual) primeiro.set(k, d)
  }
  return [...primeiro.values()].map(dia => ({ dia, valor: 1 }))
}

/** Série acumulada (índice 0 = dia 1) de uma métrica num mês. */
export function serieMtd(metrica: MetricaMtd, mes: MesMtd, ctx: ContextoMtd): number[] {
  const porDia = new Array<number>(mes.dias).fill(0)
  for (const it of itensDoMes(metrica, mes, ctx)) porDia[it.dia - 1] += it.valor
  let acc = 0
  return porDia.map(v => (acc += v))
}
