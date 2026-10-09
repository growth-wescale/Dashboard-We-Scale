import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/types'
import { useConsultaFiltrada } from './useConsultaFiltrada'

/** Só cadastros explicitamente conciliados. O período é o da participação,
 * não o dia de criação do lead (que pode preceder o evento).
 * Mantém autenticação/RLS e não interfere nas consultas dos KPIs por marca.
 */
export function useLeadsEventos(enabled: boolean) {
  const fetch = useCallback(async (signal: AbortSignal) => {
    const rows: Lead[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('leads').select('*')
        .not('dados_extras->eventos_marketing', 'is', null)
        .order('id', { ascending: true }).range(from, from + 999).abortSignal(signal)
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as Lead[]))
      if (!data || data.length < 1000) return rows
    }
  }, [])
  return useConsultaFiltrada('marketing:leads-eventos', fetch, enabled)
}
