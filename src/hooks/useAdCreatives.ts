import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET = 'ad-creative-media'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const QUERY_CHUNK = 100

export interface AdCreativePreview {
  adId: string
  adName: string
  postUrl: string | null
  mediaType: 'image' | 'video' | null
  mediaPath: string | null
  thumbnailPath: string | null
  mediaUrl: string | null
  thumbnailUrl: string | null
}

interface RawRow {
  ad_id: string
  ad_name: string
  post_url: string | null
  preview_media_type: string | null
  preview_storage_path: string | null
  preview_thumbnail_path: string | null
}

export interface UseAdCreativesResult {
  previewByName: Map<string, AdCreativePreview>
  loading: boolean
  error: string | null
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size))
  return result
}

function normalizeMediaType(value: string | null): 'image' | 'video' | null {
  if (value === 'image' || value === 'video') return value
  return null
}

/**
 * Metadados e URLs temporárias dos criativos usados no recorte atual.
 *
 * Os arquivos ficam em bucket privado. O navegador assina somente os caminhos
 * necessários para os anúncios visíveis, portanto o vídeo não depende de login
 * no Facebook e também não ganha uma URL pública permanente.
 */
export function useAdCreatives(adNames: string[]): UseAdCreativesResult {
  const [previewByName, setPreviewByName] = useState<Map<string, AdCreativePreview>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const namesKey = useMemo(
    () => [...new Set(adNames.filter(Boolean))].sort((a, b) => a.localeCompare(b)).join('\u0000'),
    [adNames],
  )

  const fetchAll = useCallback(async (showLoading = true) => {
    const names = namesKey ? namesKey.split('\u0000') : []
    if (names.length === 0) {
      setPreviewByName(new Map())
      setLoading(false)
      setError(null)
      return
    }

    if (showLoading) setLoading(true)
    setError(null)

    const rows: RawRow[] = []
    for (const group of chunks(names, QUERY_CHUNK)) {
      const { data, error: queryError } = await supabase
        .from('ad_creatives')
        .select('ad_id, ad_name, post_url, preview_media_type, preview_storage_path, preview_thumbnail_path')
        .in('ad_name', group)
      if (queryError) {
        setError(queryError.message)
        setLoading(false)
        return
      }
      rows.push(...((data ?? []) as RawRow[]))
    }

    const paths = [...new Set(rows.flatMap(row => [row.preview_storage_path, row.preview_thumbnail_path]).filter((path): path is string => Boolean(path)))]
    const signedByPath = new Map<string, string>()
    for (const group of chunks(paths, QUERY_CHUNK)) {
      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(group, SIGNED_URL_TTL_SECONDS)
      if (signError) {
        setError(signError.message)
        setLoading(false)
        return
      }
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
      }
    }

    // Um nome pode existir em anúncios duplicados. Preferimos a linha que já
    // possui mídia interna; na ausência dela, preservamos o post_url da Meta.
    const map = new Map<string, AdCreativePreview>()
    for (const row of rows) {
      if (!row.ad_name) continue
      const preview: AdCreativePreview = {
        adId: row.ad_id,
        adName: row.ad_name,
        postUrl: row.post_url,
        mediaType: normalizeMediaType(row.preview_media_type),
        mediaPath: row.preview_storage_path,
        thumbnailPath: row.preview_thumbnail_path,
        mediaUrl: row.preview_storage_path ? signedByPath.get(row.preview_storage_path) ?? null : null,
        thumbnailUrl: row.preview_thumbnail_path ? signedByPath.get(row.preview_thumbnail_path) ?? null : null,
      }
      const current = map.get(row.ad_name)
      if (!current || (!current.mediaUrl && preview.mediaUrl)) map.set(row.ad_name, preview)
    }

    setPreviewByName(map)
    setLoading(false)
  }, [namesKey])

  useEffect(() => {
    let active = true
    void fetchAll(true)
    const handleRefresh = () => { if (active) void fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { active = false; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  return { previewByName, loading, error }
}
