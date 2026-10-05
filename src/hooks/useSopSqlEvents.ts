import { useCallback } from 'react'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { FunnelEventRow } from '@/lib/metrics'

interface Filters {
  dataInicio: string
  dataFim: string
  enabled?: boolean
}

const PAGE_SIZE = 1000
const COLS = 'id_deal,dia,etapa_canonica,id_etapa,nome_funil,ciclo,rn_deal_etapa_mes,marca_deal'

export function useSopSqlEvents({ dataInicio, dataFim, enabled = true }: Filters) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: FunnelEventRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      if (signal.aborted) throw new Error('Consulta cancelada.')
      const { data, error } = await supabaseVendas
        .from('vw_funil_etapas_v2')
        .select(COLS)
        .eq('etapa_canonica', 'Reunião Agendada SQL')
        .gte('dia', dataInicio)
        .lte('dia', dataFim)
        .order('dia', { ascending: false })
        .order('id_deal', { ascending: true })
        .order('id_etapa', { ascending: true })
        .order('nome_funil', { ascending: true })
        .order('ciclo', { ascending: true })
        .order('rn_deal_etapa_mes', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .abortSignal(signal)

      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as unknown as FunnelEventRow[]))
      if (!data || data.length < PAGE_SIZE) return rows
    }
  }, [dataInicio, dataFim])

  return useConsultaFiltrada(
    JSON.stringify(['expansao:sop_sql_events', dataInicio, dataFim]),
    fetch,
    enabled,
  )
}
