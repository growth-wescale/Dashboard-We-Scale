/**
 * Agregação do modo Aging — quanto tempo os deals estão parados em cada etapa.
 *
 * Módulo puro de propósito: não importa o cliente Supabase, para poder ser
 * testado sem variável de ambiente e sem rede.
 */

import type { EtapaPeriodoRow } from '@/lib/funnelTypes'

export interface AgingPorEtapa {
  etapa: string
  deals: number
  /** Dias parados — mediana. */
  p50: number | null
  p75: number | null
}

const DIA_MS = 86_400_000

/** Percentil por interpolação linear. Espera a lista já ordenada. */
function percentil(ordenados: number[], p: number): number | null {
  if (ordenados.length === 0) return null
  const idx = (ordenados.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return ordenados[lo]
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo)
}

/**
 * Agrega o aging por etapa, contando APENAS deals vivos.
 *
 * `dealsVivos` deve conter os `id_lead` em andamento no ciclo atual, já
 * filtrados por marca e fonte. O cruzamento não é opcional: a view
 * `vw_deal_etapa_periodos` não fecha o período quando o deal é perdido, então
 * sem ele "Tentando Contato" aparece com 1.959 deals parados há 95 dias em vez
 * dos 105 há 10 dias que são a realidade operacional.
 */
export function computeAging(
  periodos: EtapaPeriodoRow[],
  dealsVivos: Set<string>,
  agora = Date.now(),
): AgingPorEtapa[] {
  const porEtapa = new Map<string, number[]>()

  for (const p of periodos) {
    if (!p.etapa || !p.data_entrada) continue
    if (!dealsVivos.has(String(p.deal_id))) continue

    const entrada = new Date(p.data_entrada).getTime()
    if (Number.isNaN(entrada)) continue

    const dias = (agora - entrada) / DIA_MS
    if (dias < 0) continue // relógio torto ou data futura: não inventar aging

    const lista = porEtapa.get(p.etapa)
    if (lista) lista.push(dias)
    else porEtapa.set(p.etapa, [dias])
  }

  return [...porEtapa.entries()]
    .map(([etapa, dias]) => {
      dias.sort((a, b) => a - b)
      return { etapa, deals: dias.length, p50: percentil(dias, 0.5), p75: percentil(dias, 0.75) }
    })
    .sort((a, b) => b.deals - a.deals)
}
