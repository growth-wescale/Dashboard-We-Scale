import { useCallback } from 'react'
import { marketingDataClient, partnerMarketingCacheScope } from '@/lib/partnerMarketingSources'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import type { MediaDailyRaw, Marca, Canal } from '@/lib/types'

interface Filters { partnerOuro?: boolean; marca?: Marca; canal?: Canal; dataInicio?: string; dataFim?: string; enabled?: boolean }

export function useMediaData({ marca, canal, dataInicio, dataFim, enabled = true, partnerOuro = false }: Filters = {}) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: MediaDailyRaw[] = []
    for (let from = 0; ; from += 1000) {
      if (signal.aborted) throw new Error('Consulta cancelada.')
      let q = marketingDataClient(partnerOuro).from('media_daily_raw').select('*').order('dia', { ascending: false }).range(from, from + 999).abortSignal(signal)
      if (marca) q = q.eq('marca', marca)
      if (canal) q = q.eq('canal', canal)
      if (dataInicio) q = q.gte('dia', dataInicio)
      if (dataFim) q = q.lte('dia', dataFim)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as MediaDailyRaw[]))
      if (!data || data.length < 1000) return rows
    }
  }, [marca, canal, dataInicio, dataFim, partnerOuro])
  return useConsultaFiltrada(JSON.stringify(['marketing:media' + partnerMarketingCacheScope(partnerOuro), marca, canal, dataInicio, dataFim]), fetch, enabled)
}

/** Parcela Partner da ouro apenas nos consumidores de Marketing que optam. */
export function useMarketingMediaData(filters: Filters = {}) {
  return useMediaData({ ...filters, partnerOuro: true })
}
