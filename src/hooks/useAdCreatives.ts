import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Cache de metadata dos anúncios Meta Ads.
 *
 * Fonte: tabela `ad_creatives` no Supabase Marketing, populada pela Edge
 * Function `ingest-meta-creatives` (roda diariamente por pg_cron).
 * A function chama a Graph API v22.0 em `/act_<id>/ads?fields=id,name,
 * creative{effective_object_story_id}` de todas as 8 contas Meta e monta
 * `post_url = https://www.facebook.com/<page_id>/posts/<post_id>`.
 *
 * Substitui o mapa manual em `src/lib/creativeAssets.ts` (que ficava
 * defasado — Oral Unic estava com só 2% de cobertura antes disso).
 *
 * Retorna Map<nome_do_anuncio, post_url> pra lookup O(1) por nome.
 * Anúncios sem `post_url` (ex.: Google Ads / RSA) ficam de fora do map —
 * o consumidor testa `map.get(name)` e cai em fallback se undefined.
 */

interface RawRow {
  ad_name: string
  post_url: string | null
}

export interface UseAdCreativesResult {
  urlByName: Map<string, string>
  loading: boolean
  error: string | null
}

export function useAdCreatives(): UseAdCreativesResult {
  const [urlByName, setUrlByName] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    // Paginação — Postgres API por padrão limita 1000 linhas; a tabela tem ~2.4k
    const all: RawRow[] = []
    const PAGE = 1000
    for (let page = 0; ; page++) {
      const { data, error: err } = await supabase
        .from('ad_creatives')
        .select('ad_name, post_url')
        .not('post_url', 'is', null)
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (err) { setError(err.message); setLoading(false); return }
      const rows = (data ?? []) as RawRow[]
      all.push(...rows)
      if (rows.length < PAGE) break
    }

    // Dedup: se mesmo nome em múltiplos ads (comum quando anúncio é duplicado),
    // fica o último — não faz diferença muita pra usuário, todos apontam pro mesmo post
    const map = new Map<string, string>()
    for (const r of all) {
      if (r.ad_name && r.post_url) map.set(r.ad_name, r.post_url)
    }
    setUrlByName(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const stable = useMemo(() => urlByName, [urlByName])
  return { urlByName: stable, loading, error }
}
