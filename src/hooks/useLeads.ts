import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import type { Lead, Marca } from '@/lib/types'

interface Filters { marca?: Marca; dataInicio?: string; dataFim?: string; enabled?: boolean }

export function useLeads({ marca, dataInicio, dataFim, enabled = true }: Filters = {}) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: Lead[] = []
    for (let from = 0; ; from += 1000) {
      if (signal.aborted) throw new Error('Consulta cancelada.')
      // Ordem total e estável: `dia` sozinho empata centenas de registros e o
      // OFFSET pode repetir/pular linhas entre páginas. Isso fazia S&OP e
      // Visão Geral divergirem no mesmo período conforme o range consultado.
      let q = supabase.from('leads').select('*')
        .order('dia', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + 999)
        .abortSignal(signal)
      if (marca) q = q.eq('marca', marca)
      if (dataInicio) q = q.gte('dia', dataInicio)
      if (dataFim) q = q.lte('dia', dataFim)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as Lead[]))
      if (!data || data.length < 1000) return rows
    }
  }, [marca, dataInicio, dataFim])
  return useConsultaFiltrada(JSON.stringify(['marketing:leads', marca, dataInicio, dataFim]), fetch, enabled)
}
