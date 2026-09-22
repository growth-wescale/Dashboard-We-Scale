/**
 * Agregação dos modos Aging e Atual da Visão Macro: onde estão os negócios em
 * aberto e há quanto tempo.
 *
 * Os dois modos fazem a MESMA leitura — a etapa CORRENTE de cada deal vivo — e
 * diferem só no recorte:
 *
 *   • **Atual**: todo negócio em aberto, não importa quando entrou no funil.
 *   • **Aging**: só os negócios criados (MQL) no período filtrado, e onde eles
 *     estão HOJE. É a safra do período, não o histórico de passagens.
 *
 * Antes de 17/09/2026 o Aging lia `vw_deal_etapa_periodos` (tempo parado por
 * etapa) sem nenhum recorte de período, o que devolvia praticamente a mesma
 * lista do Atual — os dois modos mostravam o mesmo número.
 *
 * Módulo puro de propósito: não importa o cliente Supabase, para poder ser
 * testado sem variável de ambiente e sem rede.
 */

import { STAGE_DATE_FIELD, currentStage, isInWindow } from '@/lib/metrics'
import type { PeriodWindow, StageDeal, StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

export interface EtapaLeadtimeAgg {
  deals: number
  /** Média de dias parados NESSA etapa (desde a entrada nela). */
  mediaEtapa: number | null
  /** Média de dias desde que o deal virou MQL (idade total no funil). */
  mediaAndamento: number | null
}

const DIA_MS = 86_400_000

const media = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null

/**
 * Negócio em aberto no recorte.
 *
 * `win = null` (modo Atual) aceita qualquer negócio vivo. Com `win` (modo
 * Aging) exige MQL dentro do período: é a mesma data que o toggle "Deals
 * criados no período" já usa como safra. Deal sem MQL — caso típico da
 * Prospecção Ativa, que nasce direto numa etapa de prospecção — fica de fora
 * do Aging por não ter data de criação de lead para comparar.
 */
function vivoNoRecorte(r: FunnelRow, win: PeriodWindow | null): boolean {
  if (!r.eh_ciclo_atual || r.status_atual !== 'Em andamento') return false
  if (win && !isInWindow(r.data_novo_mql, win)) return false
  return true
}

const diasDesde = (iso: string | null | undefined, agora: number): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const dias = (agora - t) / DIA_MS
  // Data futura/relógio torto: não inventar aging.
  return dias >= 0 ? dias : null
}

/**
 * Agrega os negócios vivos do recorte pela etapa em que estão AGORA.
 *
 * A etapa sai de `currentStage`, não de `resolveStage(etapa_funil)`, para
 * "Reunião Agendada SQL" contar só no funil do Closer — o SDR tem uma etapa
 * com o mesmo nome.
 */
export function computeEtapaAtual(
  rows: FunnelRow[],
  win: PeriodWindow | null,
  agora = Date.now(),
): Map<StageKey, EtapaLeadtimeAgg> {
  const buckets = new Map<StageKey, { etapa: number[]; andamento: number[]; deals: number }>()

  for (const r of rows) {
    if (!vivoNoRecorte(r, win)) continue

    const etapa = currentStage(r)
    if (!etapa) continue

    const b = buckets.get(etapa) ?? { etapa: [], andamento: [], deals: 0 }
    b.deals += 1

    const naEtapa = diasDesde(r[STAGE_DATE_FIELD[etapa]], agora)
    if (naEtapa !== null) b.etapa.push(naEtapa)

    const emAndamento = diasDesde(r.data_novo_mql, agora)
    if (emAndamento !== null) b.andamento.push(emAndamento)

    buckets.set(etapa, b)
  }

  return new Map(
    [...buckets.entries()].map(([etapa, b]) => [
      etapa,
      { deals: b.deals, mediaEtapa: media(b.etapa), mediaAndamento: media(b.andamento) },
    ]),
  )
}

/**
 * Deals por trás do número de uma etapa nos modos Aging e Atual — espelha
 * exatamente o mesmo filtro de `computeEtapaAtual`, para o popup nunca mostrar
 * uma lista diferente do número que a pessoa clicou.
 */
export function dealsInEtapaAtual(
  rows: FunnelRow[],
  stage: StageKey,
  win: PeriodWindow | null,
): StageDeal[] {
  return rows
    .filter(r => vivoNoRecorte(r, win) && currentStage(r) === stage)
    .map(row => ({ row, dataEtapa: row[STAGE_DATE_FIELD[stage]] }))
}
