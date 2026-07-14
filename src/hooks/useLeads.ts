import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead, Marca } from '@/lib/types'

interface Filters {
  marca?: Marca
  dataInicio?: string   // ISO date
  dataFim?: string
}

interface UseLeadsResult {
  data: Lead[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useLeads(filters: Filters = {}): UseLeadsResult {
  const [data, setData] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setError(null)

      const allRows: Lead[] = []
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let q = supabase
          .from('leads')
          .select('*')
          .order('dia', { ascending: false })
          .range(from, to)

        if (filters.marca)      q = q.eq('marca', filters.marca)
        if (filters.dataInicio) q = q.gte('dia', filters.dataInicio)
        if (filters.dataFim)    q = q.lte('dia', filters.dataFim)

        const { data: rows, error: err } = await q

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        allRows.push(...((rows ?? []) as Lead[]))

        if (!rows || rows.length < PAGE_SIZE) break
        page++
      }

      if (!cancelled) {
        setData(allRows)
        setLoading(false)
      }
    }

    fetchAll()

    const channel = supabase
      .channel(`leads-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => {
        if (!cancelled) fetchAll()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [filters.marca, filters.dataInicio, filters.dataFim])

  return { data, loading, error }
}
