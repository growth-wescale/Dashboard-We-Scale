import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface FbPageDailyRow {
  dia: string
  page_id: string
  page_name: string | null
  marca: string
  tipo: 'marca' | 'ceo' | 'institucional'
  fan_count: number | null
  follows_total: number | null
  follows_daily: number | null
  views_total: number | null
  post_engagements: number | null
  video_views: number | null
  video_view_time_ms: number | null
}

export interface FbPostRow {
  post_id: string
  page_id: string
  page_name: string | null
  marca: string
  tipo: string
  created_time: string
  message: string | null
  permalink_url: string | null
  capa_url: string | null
  media_type: string | null
  reactions_count: number
  comments_count: number
  shares_count: number
}

interface Filters {
  marca?: string
  dataInicio?: string
  dataFim?: string
}

interface Result {
  daily: FbPageDailyRow[]
  posts: FbPostRow[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useFacebookPages(filters: Filters = {}): Result {
  const [daily, setDaily] = useState<FbPageDailyRow[]>([])
  const [posts, setPosts] = useState<FbPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAllPages<T>(table: string, timeCol: string): Promise<T[]> {
      const all: T[] = []
      let page = 0
      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        let q = supabase.from(table).select('*').order(timeCol, { ascending: false }).range(from, to)
        if (filters.marca)      q = q.eq('marca', filters.marca)
        if (filters.dataInicio) q = q.gte(timeCol, filters.dataInicio)
        if (filters.dataFim) {
          const inclusive = timeCol === 'created_time' ? filters.dataFim + 'T23:59:59' : filters.dataFim
          q = q.lte(timeCol, inclusive)
        }
        const { data, error } = await q
        if (error) throw error
        all.push(...((data ?? []) as T[]))
        if (!data || data.length < PAGE_SIZE) break
        page++
      }
      return all
    }

    async function fetchBoth(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)
      try {
        const [d, p] = await Promise.all([
          fetchAllPages<FbPageDailyRow>('fb_page_daily', 'dia'),
          fetchAllPages<FbPostRow>('fb_posts', 'created_time'),
        ])
        if (cancelled) return
        setDaily(d)
        setPosts(p)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
        setLoading(false)
      }
    }

    fetchBoth()

    const handleRefresh = () => { if (!cancelled) fetchBoth(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchBoth(false) }, 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [filters.marca, filters.dataInicio, filters.dataFim])

  return { daily, posts, loading, error }
}
