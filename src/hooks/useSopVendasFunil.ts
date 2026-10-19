import { useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { useVendasFunil, type VwMarketingFunil } from './useVendasFunil'

interface Filters {
  enabled?: boolean
  marca?: string
  dataInicio?: string
  dataFim?: string
}

// Exclusivo da S&OP: o funil foi renomeado, mas o histórico conserva o nome antigo.
export async function fetchSopLegacyRows(filters: Filters, signal: AbortSignal): Promise<VwMarketingFunil[]> {
  const rows: VwMarketingFunil[] = []
  for (let from = 0; ; from += 1000) {
    if (signal.aborted) throw new Error('Consulta cancelada.')
    let q = supabaseVendas.from('vw_marketing_funil').select('*')
      .in('funil', ['Odonto Scale', 'Odonto Legacy'])
      .order('data_criacao_negociacao', { ascending: false })
      .range(from, from + 999).abortSignal(signal)

    if (filters.dataInicio) q = q.or(
      `data_criacao_negociacao.gte.${filters.dataInicio},data_sql.gte.${filters.dataInicio},data_diagnostico.gte.${filters.dataInicio},data_sal.gte.${filters.dataInicio},data_venda.gte.${filters.dataInicio}`,
    )
    if (filters.dataFim) q = q.lte('data_criacao_negociacao', filters.dataFim + 'T23:59:59')

    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as VwMarketingFunil[]))
    if (!data || data.length < 1000) return rows
  }
}

export function useSopVendasFunil(filters: Filters = {}) {
  const { marca, dataInicio, dataFim, enabled = true } = filters
  const legacy = marca === 'Odonto Scale'
  // O hook compartilhado e sua chave permanecem intactos nas demais folhas/páginas.
  const standard = useVendasFunil({ marca, dataInicio, dataFim, enabled: enabled && !legacy })
  const fetch = useCallback((signal: AbortSignal) => fetchSopLegacyRows({ dataInicio, dataFim }, signal), [dataInicio, dataFim])
  const scoped = useConsultaFiltrada(
    JSON.stringify(['expansao:sop_legacy_funil', dataInicio, dataFim]), fetch, enabled && legacy,
  )
  return legacy ? scoped : standard
}
