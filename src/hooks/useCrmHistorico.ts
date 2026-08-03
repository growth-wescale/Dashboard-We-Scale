import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface CrmHistoricoRow {
  snapshot_date: string
  marca: string | null
  deal_id: string
  etapa_categoria: string | null
  deal_status: string | null
}

interface UseCrmHistoricoResult {
  data: CrmHistoricoRow[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useCrmHistorico(dataInicio: string): UseCrmHistoricoResult {
  const [data, setData] = useState<CrmHistoricoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)

      const allRows: CrmHistoricoRow[] = []
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to   = from + PAGE_SIZE - 1

        const { data: rows, error: err } = await supabase
          .from('crm_funil_historico')
          .select('snapshot_date, marca, deal_id, etapa_categoria, deal_status')
          .gte('snapshot_date', dataInicio)
          .range(from, to)

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        allRows.push(...((rows ?? []) as CrmHistoricoRow[]))

        if (!rows || rows.length < PAGE_SIZE) break
        page++
      }

      if (!cancelled) {
        setData(allRows)
        setLoading(false)
      }
    }

    fetchAll()

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)

    return () => {
      cancelled = true
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [dataInicio])

  return { data, loading, error }
}
