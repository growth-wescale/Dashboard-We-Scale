import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface KeywordRow {
  dia: string
  marca: string
  customer_id: string
  campanha: string | null
  ad_group: string | null
  keyword_text: string
  match_type: string
  status: string | null
  impressoes: number
  cliques: number
  spend_brl: number
  conversions: number
  avg_cpc: number | null
}

export interface SearchTermRow {
  dia: string
  marca: string
  customer_id: string
  campanha: string | null
  ad_group: string | null
  search_term: string
  match_type: string | null
  status: string | null
  impressoes: number
  cliques: number
  spend_brl: number
  conversions: number
}

interface Filters {
  marca?: string
  dataInicio?: string
  dataFim?: string
}

interface Result {
  keywords: KeywordRow[]
  searchTerms: SearchTermRow[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

export function useSearchTerms(filters: Filters = {}): Result {
  const [keywords, setKeywords] = useState<KeywordRow[]>([])
  const [searchTerms, setSearchTerms] = useState<SearchTermRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAllPages<T>(table: string): Promise<T[]> {
      const all: T[] = []
      let page = 0
      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        let q = supabase.from(table).select('*').order('dia', { ascending: false }).range(from, to)
        if (filters.marca)      q = q.eq('marca', filters.marca)
        if (filters.dataInicio) q = q.gte('dia', filters.dataInicio)
        if (filters.dataFim)    q = q.lte('dia', filters.dataFim)
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
        const [kw, st] = await Promise.all([
          fetchAllPages<KeywordRow>('keywords_daily'),
          fetchAllPages<SearchTermRow>('search_terms_daily'),
        ])
        if (cancelled) return
        setKeywords(kw)
        setSearchTerms(st)
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

  return { keywords, searchTerms, loading, error }
}
