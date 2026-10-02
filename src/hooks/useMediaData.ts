import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import type { MediaDailyRaw, Marca, Canal } from '@/lib/types'

interface Filters { marca?: Marca; canal?: Canal; dataInicio?: string; dataFim?: string; enabled?: boolean }

export function useMediaData({ marca, canal, dataInicio, dataFim, enabled = true }: Filters = {}) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: MediaDailyRaw[] = []
    for (let from = 0; ; from += 1000) {
      if (signal.aborted) throw new Error('Consulta cancelada.')
      let q = supabase.from('media_daily_raw').select('*').order('dia', { ascending: false }).range(from, from + 999).abortSignal(signal)
      if (marca) q = q.eq('marca', marca)
      if (canal) q = q.eq('canal', canal)
      if (dataInicio) q = q.gte('dia', dataInicio)
      if (dataFim) q = q.lte('dia', dataFim)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as MediaDailyRaw[]))
      if (!data || data.length < 1000) return rows
    }
  }, [marca, canal, dataInicio, dataFim])
  return useConsultaFiltrada(JSON.stringify(['marketing:media', marca, canal, dataInicio, dataFim]), fetch, enabled)
}
