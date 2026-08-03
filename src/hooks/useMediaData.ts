import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { MediaDailyRaw, Marca, Canal } from '@/lib/types'

interface Filters {
  marca?: Marca
  canal?: Canal
  dataInicio?: string   // ISO date
  dataFim?: string      // ISO date
}

interface UseMediaDataResult {
  data: MediaDailyRaw[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useMediaData(filters: Filters = {}): UseMediaDataResult {
  const [data, setData] = useState<MediaDailyRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)

      const allRows: MediaDailyRaw[] = []
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let q = supabase
          .from('media_daily_raw')
          .select('*')
          .order('dia', { ascending: false })
          .range(from, to)

        if (filters.marca)      q = q.eq('marca', filters.marca)
        if (filters.canal)      q = q.eq('canal', filters.canal)
        if (filters.dataInicio) q = q.gte('dia', filters.dataInicio)
        if (filters.dataFim)    q = q.lte('dia', filters.dataFim)

        const { data: rows, error: err } = await q

        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }

        allRows.push(...((rows ?? []) as MediaDailyRaw[]))

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
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 60000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [filters.marca, filters.canal, filters.dataInicio, filters.dataFim])

  return { data, loading, error }
}
