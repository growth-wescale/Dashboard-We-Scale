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
import { rowsInLoss, countStage, currentStage } from '@/lib/metrics'
import { businessDaysBetween } from '@/lib/businessHours'

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
