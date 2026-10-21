import { useCallback } from 'react'
import { marketingDataClient, partnerMarketingCacheScope } from '@/lib/partnerMarketingSources'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import type { Lead, Marca } from '@/lib/types'

export function marcasLeadsSop(marca: string): string[] {
  if (marca === 'Odonto Scale') return ['Odonto Scale', 'Odonto Legacy']
  if (marca === 'We Scale') return ['We Scale', 'Scale Partner']
  return [marca]
}

// Exclusivo S&OP: aliases da mesma marca, em uma consulta. O dedupe existente
// da página continua sendo aplicado dentro de cada janela, depois da união.
export function useSopLeads({ marca, dataInicio, dataFim }: { marca: Marca; dataInicio: string; dataFim: string }) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: Lead[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await marketingDataClient().from('leads').select('*')
        .in('marca', marcasLeadsSop(marca)).gte('dia', dataInicio).lte('dia', dataFim)
        .order('dia', { ascending: false }).order('id', { ascending: true })
        .range(from, from + 999).abortSignal(signal)
      if (error) throw new Error(error.message)
      const lote = (data ?? []) as Lead[]
      rows.push(...lote.map(r => marcasLeadsSop(marca).length > 1
        ? { ...r, email: r.email?.trim().toLowerCase() ?? r.email }
        : r))
      if (!data || data.length < 1000) return rows
    }
  }, [marca, dataInicio, dataFim])
  return useConsultaFiltrada(JSON.stringify(['sop:leads' + partnerMarketingCacheScope(), marca, dataInicio, dataFim]), fetch, true)
}
