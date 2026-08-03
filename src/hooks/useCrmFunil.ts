import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CrmFunilRaw, Marca, Pipeline, EtapaCategoria } from '@/lib/types'

interface Filters {
  marca?: Marca
  pipeline?: Pipeline
  etapaCategoria?: EtapaCategoria
  dataInicio?: string   // ISO date, filtra data_criacao
  dataFim?: string
}

interface UseCrmFunilResult {
  data: CrmFunilRaw[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useCrmFunil(filters: Filters = {}): UseCrmFunilResult {
  const [data, setData] = useState<CrmFunilRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)

      const allRows: CrmFunilRaw[] = []
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let q = supabase
          .from('crm_funil_raw')
          .select('*')
          .order('data_criacao', { ascending: false })
          .range(from, to)

        if (filters.marca)          q = q.eq('marca', filters.marca)
        if (filters.pipeline)       q = q.eq('pipeline', filters.pipeline)
        if (filters.etapaCategoria) q = q.eq('etapa_categoria', filters.etapaCategoria)
        if (filters.dataInicio)     q = q.gte('data_criacao', filters.dataInicio)
        if (filters.dataFim)        q = q.lte('data_criacao', filters.dataFim)

        const { data: rows, error: err } = await q

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        allRows.push(...((rows ?? []) as CrmFunilRaw[]))

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
  }, [
    filters.marca,
    filters.pipeline,
    filters.etapaCategoria,
    filters.dataInicio,
    filters.dataFim,
  ])

  return { data, loading, error }
}
