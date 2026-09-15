import { useMemo, useState } from 'react'
import type { StageDeal } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { ordenarOpcoes } from './MultiSelect'

// Filtros da lista de deals dos popups. Mesma lógica da barra de filtros da
// Visão Macro (MultiSelect): opções vêm sempre dos deals do próprio recorte
// (nunca lista fixa), cada campo aceita vários valores, e as opções de um
// campo são CRUZADAS com os demais — só aparece o valor que ainda produz
// alguma linha na tabela, igual ao "estilo Excel" da FilterBar.

export interface StageDealsFilterState {
  marca: string[]
  funil: string[]
  fonte: string[]
  sdr: string[]
  closer: string[]
}

export type StageDealsCampo = keyof StageDealsFilterState

export const STAGE_DEALS_CAMPOS: StageDealsCampo[] = ['marca', 'funil', 'fonte', 'sdr', 'closer']

export const EMPTY_STAGE_DEALS_FILTERS: StageDealsFilterState = { marca: [], funil: [], fonte: [], sdr: [], closer: [] }

/** De onde sai o valor de cada campo na linha do deal. */
const VALOR_DO_CAMPO: Record<StageDealsCampo, (r: FunnelRow) => string | null | undefined> = {
  marca: r => r.marca,
  funil: r => r.nome_funil,
  fonte: r => r.fonte_macro,
  sdr: r => r.nome_sdr,
  closer: r => r.nome_closer,
}

const valor = (r: FunnelRow, campo: StageDealsCampo) => VALOR_DO_CAMPO[campo](r)?.trim() ?? ''

/** Deal passa nos campos pedidos (todos, ou todos menos `exceto`). */
function passa(r: FunnelRow, filters: StageDealsFilterState, exceto?: StageDealsCampo): boolean {
  for (const campo of STAGE_DEALS_CAMPOS) {
    if (campo === exceto) continue
    const sel = filters[campo]
    if (sel.length && !sel.includes(valor(r, campo))) return false
  }
  return true
}

/** Linhas que a tabela mostra: todos os filtros aplicados. */
export function filtrarStageDeals(deals: StageDeal[], filters: StageDealsFilterState): StageDeal[] {
  return deals.filter(d => passa(d.row, filters))
}

/**
 * Opções de cada filtro, cruzadas com os OUTROS filtros ativos: a lista de
 * SDR só mostra quem aparece nas linhas que sobram depois de Marca/Funil/
 * Fonte/Closer, e assim por diante. O valor já marcado continua na lista
 * mesmo que não sobre linha (escape hatch pra conseguir desmarcar) — mesma
 * regra de `funilFilterOptions` na barra do dashboard.
 */
export function opcoesCruzadas(
  deals: StageDeal[], filters: StageDealsFilterState,
): Record<StageDealsCampo, string[]> {
  const out = {} as Record<StageDealsCampo, string[]>
  for (const campo of STAGE_DEALS_CAMPOS) {
    const vistos = new Set<string>(filters[campo])
    for (const { row } of deals) {
      if (!passa(row, filters, campo)) continue
      const v = valor(row, campo)
      if (v) vistos.add(v)
    }
    out[campo] = ordenarOpcoes([...vistos])
  }
  return out
}

/**
 * Estado de filtro da lista de deals. Fica fora do painel pra quem monta o
 * drawer poder mostrar "X de Y deals" no próprio cabeçalho.
 */
export function useStageDealsFilters(deals: StageDeal[]) {
  const [filters, setFilters] = useState<StageDealsFilterState>(EMPTY_STAGE_DEALS_FILTERS)
  const options = useMemo(() => opcoesCruzadas(deals, filters), [deals, filters])
  const filtered = useMemo(() => filtrarStageDeals(deals, filters), [deals, filters])
  return { filters, setFilters, options, filtered }
}

export type StageDealsFilters = ReturnType<typeof useStageDealsFilters>
