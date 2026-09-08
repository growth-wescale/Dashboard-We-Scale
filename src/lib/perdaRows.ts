/**
 * perdaRows.ts — agregações da aba Análise de Perda.
 *
 * Grão: vw_funil_vendas (via FunnelRow), mesma base de Visão Macro e
 * Performance — não vw_perdas (evento). "Perda" usa a mesma trava de
 * snapshot que Fechamento usa pra venda: isLoss/rowsInLoss em metrics.ts,
 * status_atual === 'Perdido'. Um deal perdido e depois reciclado em outro
 * ciclo não conta aqui pro ciclo antigo — mesma regra de negócio do
 * Fechamento (não existe "perda" que reabriu).
 */

import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow, ViewModes, StageKey } from '@/lib/metrics'
import { rowsInLoss, countStage, currentStage, STAGE_ORDER } from '@/lib/metrics'
import { businessDaysBetween } from '@/lib/businessHours'
import { classificarMotivo } from '@/constants/motivosPerda'
import type { CategoriaMotivo } from '@/constants/motivosPerda'

/** Deals perdidos na janela — ponto único de entrada da aba sobre rowsInLoss (metrics.ts). */
export function perdidos(rows: FunnelRow[], win: PeriodWindow, modes: ViewModes): FunnelRow[] {
  return rowsInLoss(rows, win, modes)
}

/**
 * Perdidos que chegaram em "Oportunidade" ou depois — só esses entram na
 * receita perdida. Um deal perdido em etapa anterior (ex.: Diagnóstico)
 * normalmente não tem proposta de valor real ainda, mesmo que
 * `valor_contrato` esteja preenchido.
 */
export function dealsReceitaPerdida(perdas: FunnelRow[]): FunnelRow[] {
  return perdas.filter(r => !!r.data_oportunidade)
}

export interface KpisPerda {
  perdidasDeals: number
  mqlsPeriodo: number
  taxaPerda: number
  emAberto: number
  leadtimeDias: number
  etapaTop: StageKey | null
  receitaPerdida: number
}

export function computeKpis(scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes): KpisPerda {
  const perdas = perdidos(scoped, win, modes)
  const mqlsPeriodo = countStage(scoped, 'MQL', win, modes)
  const perdidasDeals = perdas.length
  const taxaPerda = mqlsPeriodo > 0 ? (perdidasDeals / mqlsPeriodo) * 100 : 0

  const emAberto = scoped.filter(r => r.status_atual === 'Em andamento' && r.eh_ciclo_atual).length

  const leadtimes: number[] = []
  const etapaCount = new Map<StageKey, number>()
  for (const p of perdas) {
    if (p.data_novo_mql && p.data_perdido) {
      const d = businessDaysBetween(p.data_novo_mql, p.data_perdido)
      if (d > 0) leadtimes.push(d)
    }
    const stage = currentStage(p)
    if (stage) etapaCount.set(stage, (etapaCount.get(stage) ?? 0) + 1)
  }
  const leadtimeDias = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
  const etapaTop = [...etapaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const receitaPerdida = dealsReceitaPerdida(perdas).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)

  return { perdidasDeals, mqlsPeriodo, taxaPerda, emAberto, leadtimeDias, etapaTop, receitaPerdida }
}

/** Limpa o prefixo "[NOVO]" que o RD antepõe a alguns motivos, pra exibição/agrupamento. */
function limparMotivo(motivo: string): string {
  return motivo.replace(/^\[NOVO\]\s*/i, '').trim()
}

export interface MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null; deals: FunnelRow[] }

export function computeMotivos(perdas: FunnelRow[]): MotivoRow[] {
  const comMotivo = perdas.filter(p => p.motivo_perda)
  const total = comMotivo.length || 1
  const bucket = new Map<string, FunnelRow[]>()
  for (const p of comMotivo) {
    const m = limparMotivo(p.motivo_perda!)
    const cur = bucket.get(m) ?? []
    cur.push(p)
    bucket.set(m, cur)
  }
  return [...bucket.entries()]
    .map(([motivo, deals]) => ({
      motivo, qtd: deals.length, pct: (deals.length / total) * 100,
      categoria: classificarMotivo(motivo), deals,
    }))
    .sort((a, b) => b.qtd - a.qtd)
}

export interface EvitavelStats { pctEvitavel: number; qtdProcesso: number; qtdMercado: number }

export function computeEvitavel(perdas: FunnelRow[]): EvitavelStats {
  let qtdProcesso = 0, qtdMercado = 0
  for (const p of perdas) {
    const c = classificarMotivo(p.motivo_perda)
    if (c === 'processo') qtdProcesso += 1
    else if (c === 'mercado') qtdMercado += 1
  }
  const total = qtdProcesso + qtdMercado
  const pctEvitavel = total > 0 ? (qtdProcesso / total) * 100 : 0
  return { pctEvitavel, qtdProcesso, qtdMercado }
}

export interface EtapaRow { etapa: StageKey; ordem: number; qtd: number; leadtime: number; deals: FunnelRow[] }

export function computeEtapas(perdas: FunnelRow[]): EtapaRow[] {
  const bucket = new Map<StageKey, FunnelRow[]>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (!stage) continue
    const cur = bucket.get(stage) ?? []
    cur.push(p)
    bucket.set(stage, cur)
  }
  return [...bucket.entries()]
    .map(([etapa, deals]) => {
      const leadtimes = deals
        .filter(d => d.data_novo_mql && d.data_perdido)
        .map(d => businessDaysBetween(d.data_novo_mql!, d.data_perdido!))
        .filter(d => d > 0)
      const leadtime = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
      return { etapa, ordem: STAGE_ORDER.indexOf(etapa), qtd: deals.length, leadtime, deals }
    })
    .sort((a, b) => a.ordem - b.ordem)
}

export interface EtapaMeta { etapa: StageKey; ordem: number }
export interface CruzCel { motivo: string; etapa: StageKey; qtd: number; deals: FunnelRow[] }

export function computeCruzamentos(
  perdas: FunnelRow[],
): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] } {
  const motivos = computeMotivos(perdas).slice(0, 10).map(m => m.motivo)
  const motivosSet = new Set(motivos)

  const etapasMap = new Map<StageKey, number>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (stage) etapasMap.set(stage, STAGE_ORDER.indexOf(stage))
  }
  const etapas = [...etapasMap.entries()]
    .map(([etapa, ordem]) => ({ etapa, ordem }))
    .sort((a, b) => a.ordem - b.ordem)

  const cel = new Map<string, FunnelRow[]>()
  for (const p of perdas) {
    if (!p.motivo_perda) continue
    const m = limparMotivo(p.motivo_perda)
    if (!motivosSet.has(m)) continue
    const stage = currentStage(p)
    if (!stage) continue
    const key = `${m}|||${stage}`
    const cur = cel.get(key) ?? []
    cur.push(p)
    cel.set(key, cur)
  }

  const celulas: CruzCel[] = []
  for (const m of motivos) {
    for (const e of etapas) {
      const deals = cel.get(`${m}|||${e.etapa}`) ?? []
      celulas.push({ motivo: m, etapa: e.etapa, qtd: deals.length, deals })
    }
  }
  return { motivos, etapas, celulas }
}
