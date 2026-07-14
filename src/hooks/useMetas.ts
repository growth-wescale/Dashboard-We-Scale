import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Meta, Marca, Metrica } from '@/lib/types'

interface Filters {
  marca?: Marca
  mes?: string       // ISO date, ex: '2026-07-01'
  metrica?: Metrica
}

interface UseMetasResult {
  data: Meta[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useMetas(filters: Filters = {}): UseMetasResult {
  const [data, setData] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setError(null)

      const allRows: Meta[] = []
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let q = supabase
          .from('metas')
          .select('*')
          .order('mes', { ascending: false })
          .range(from, to)

        if (filters.marca)   q = q.eq('marca', filters.marca)
        if (filters.mes)     q = q.eq('mes', filters.mes)
        if (filters.metrica) q = q.eq('metrica', filters.metrica)

        const { data: rows, error: err } = await q

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        allRows.push(...((rows ?? []) as Meta[]))

        if (!rows || rows.length < PAGE_SIZE) break
        page++
      }

      if (!cancelled) {
        setData(allRows)
        setLoading(false)
      }
    }

    fetchAll()

    const timer = setInterval(() => { if (!cancelled) fetchAll() }, 60000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [filters.marca, filters.mes, filters.metrica])

  return { data, loading, error }
}
