/**
 * Agregação dos modos Aging e Atual — quanto tempo os deals estão parados em
 * cada etapa, e há quanto tempo estão no funil desde que viraram MQL.
 *
 * Módulo puro de propósito: não importa o cliente Supabase, para poder ser
 * testado sem variável de ambiente e sem rede.
 */

import { resolveStage } from '@/lib/metrics'
import type { StageDeal, StageKey } from '@/lib/metrics'
import type { EtapaPeriodoRow, FunnelRow } from '@/lib/funnelTypes'

export interface AgingPorEtapa {
  etapa: string
  deals: number
  /** Média de dias parados NESSA etapa. */
  mediaEtapa: number | null
  /** Média de dias desde que o deal virou MQL (idade total no funil). */
  mediaAndamento: number | null
}

const DIA_MS = 86_400_000

const media = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null

/**
 * Agrega o aging por etapa, contando APENAS deals vivos.
 *
 * `dealsVivos` deve conter os `id_lead` em andamento no ciclo atual, já
 * filtrados por marca e fonte. O cruzamento não é opcional: a view
 * `vw_deal_etapa_periodos` não fecha o período quando o deal é perdido, então
 * sem ele "Tentando Contato" aparece com 1.959 deals parados há 95 dias em vez
 * dos 105 há 10 dias que são a realidade operacional.
 *
 * `mqlPorDeal` (id_lead -> data ISO do MQL) alimenta `mediaAndamento`; deal
 * sem MQL conhecido só não entra nessa média — ainda conta em `deals`.
 *
 * Agrupa pela etapa CANÔNICA (`resolveStage`), não pela string crua da view —
 * senão variantes do mesmo rótulo (ex.: "SQL" vs "Reunião Agendada") viram
 * grupos separados e a contagem por etapa fica errada.
 */
export function computeAging(
  periodos: EtapaPeriodoRow[],
  dealsVivos: Set<string>,
  mqlPorDeal: Map<string, string>,
  agora = Date.now(),
): AgingPorEtapa[] {
  const porEtapa = new Map<string, { etapa: number[]; andamento: number[] }>()

  for (const p of periodos) {
    if (!p.etapa || !p.data_entrada) continue
    const dealId = String(p.deal_id)
    if (!dealsVivos.has(dealId)) continue

    const entrada = new Date(p.data_entrada).getTime()
    if (Number.isNaN(entrada)) continue

    const diasEtapa = (agora - entrada) / DIA_MS
    if (diasEtapa < 0) continue // relógio torto ou data futura: não inventar aging

    const chave = resolveStage(p.etapa) ?? p.etapa
    const bucket = porEtapa.get(chave) ?? { etapa: [], andamento: [] }
    bucket.etapa.push(diasEtapa)

    const mqlIso = mqlPorDeal.get(dealId)
    if (mqlIso) {
      const mql = new Date(mqlIso).getTime()
      const diasAndamento = (agora - mql) / DIA_MS
      if (!Number.isNaN(mql) && diasAndamento >= 0) bucket.andamento.push(diasAndamento)
    }

    porEtapa.set(chave, bucket)
  }

  return [...porEtapa.entries()].map(([etapa, b]) => ({
    etapa,
    deals: b.etapa.length,
    mediaEtapa: media(b.etapa),
    mediaAndamento: media(b.andamento),
  }))
}

/**
 * Deals por trás do número de uma etapa no modo Aging — espelha exatamente o
 * mesmo filtro do loop de `computeAging` (deal vivo, `data_entrada` válida, sem
 * data futura, etapa canônica), só que preservando a `FunnelRow` para o popup.
 *
 * `vivosRowById` (id_lead -> linha) faz o papel do `dealsVivos` do
 * `computeAging`: só entram deals em andamento no ciclo atual, já filtrados por
 * marca e fonte. `dataEtapa` carrega a entrada na etapa, base do "parado na
 * etapa" mostrado no popup.
 */
export function dealsInAging(
  periodos: EtapaPeriodoRow[],
  vivosRowById: Map<string, FunnelRow>,
  stage: StageKey,
  agora = Date.now(),
): StageDeal[] {
  const out: StageDeal[] = []

  for (const p of periodos) {
    if (!p.etapa || !p.data_entrada) continue

    const row = vivosRowById.get(String(p.deal_id))
    if (!row) continue

    const entrada = new Date(p.data_entrada).getTime()
    if (Number.isNaN(entrada)) continue
    if ((agora - entrada) / DIA_MS < 0) continue

    if ((resolveStage(p.etapa) ?? p.etapa) !== stage) continue

    out.push({ row, dataEtapa: p.data_entrada })
  }

  return out
}
