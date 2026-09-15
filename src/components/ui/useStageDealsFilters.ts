import { useMemo, useState } from 'react'
import type { StageDeal } from '@/lib/metrics'
import { ordenarOpcoes } from './MultiSelect'

// Mesmo componente e lógica da barra de filtros da Visão Macro (MultiSelect):
// opções vêm sempre dos deals do próprio recorte (nunca lista fixa), e cada
// campo aceita marcar vários valores ao mesmo tempo.

export interface StageDealsFilterState {
  marca: string[]
  funil: string[]
  fonte: string[]
  sdr: string[]
  closer: string[]
}

export const EMPTY_STAGE_DEALS_FILTERS: StageDealsFilterState = { marca: [], funil: [], fonte: [], sdr: [], closer: [] }

/**
 * Estado de filtro da lista de deals. Fica fora do painel pra quem monta o
 * drawer poder mostrar "X de Y deals" no próprio cabeçalho.
 */
export function useStageDealsFilters(deals: StageDeal[]) {
  const [filters, setFilters] = useState<StageDealsFilterState>(EMPTY_STAGE_DEALS_FILTERS)

  const options = useMemo(() => ({
    marca: ordenarOpcoes([...new Set(deals.map(d => d.row.marca?.trim()).filter((v): v is string => !!v))]),
    funil: ordenarOpcoes([...new Set(deals.map(d => d.row.nome_funil?.trim()).filter((v): v is string => !!v))]),
    fonte: ordenarOpcoes([...new Set(deals.map(d => d.row.fonte_macro?.trim()).filter((v): v is string => !!v))]),
    sdr: ordenarOpcoes([...new Set(deals.map(d => d.row.nome_sdr?.trim()).filter((v): v is string => !!v))]),
    closer: ordenarOpcoes([...new Set(deals.map(d => d.row.nome_closer?.trim()).filter((v): v is string => !!v))]),
  }), [deals])

  const filtered = useMemo(() => deals.filter(({ row: r }) => {
    if (filters.marca.length && !filters.marca.includes(r.marca ?? '')) return false
    if (filters.funil.length && !filters.funil.includes(r.nome_funil ?? '')) return false
    if (filters.fonte.length && !filters.fonte.includes(r.fonte_macro ?? '')) return false
    if (filters.sdr.length && !filters.sdr.includes(r.nome_sdr ?? '')) return false
    if (filters.closer.length && !filters.closer.includes(r.nome_closer ?? '')) return false
    return true
  }), [deals, filters])

  return { filters, setFilters, options, filtered }
}

export type StageDealsFilters = ReturnType<typeof useStageDealsFilters>
