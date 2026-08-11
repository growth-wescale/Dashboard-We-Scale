import { useMemo } from 'react'
import { useMediaData } from '@/hooks/useMediaData'
import { isMediaOdontoLegacy } from '@/lib/oralUnicMapping'
import type { MediaDailyRaw } from '@/lib/types'

// Odonto Legacy (ex-Odonto Scale) vive em duas fontes:
// - Histórico (até 27/jul/26): marca='Odonto Scale' na tabela media_daily_raw
// - Novo (a partir de ago/26): marca='Oral Unic' filtrado por prefixo [ODL]/OS e Google Ads mapeadas
// Este hook une as duas fontes.
interface Filters {
  dataInicio?: string
  dataFim?: string
}

interface Result {
  data: MediaDailyRaw[]
  loading: boolean
  error: string | null
}

export function useMediaOdontoLegacy(filters: Filters = {}): Result {
  const legacyOwnMarca = useMediaData({ marca: 'Odonto Scale', dataInicio: filters.dataInicio, dataFim: filters.dataFim })
  const oralUnicAll   = useMediaData({ marca: 'Oral Unic',    dataInicio: filters.dataInicio, dataFim: filters.dataFim })

  const data = useMemo(() => {
    const fromOralUnic = oralUnicAll.data.filter(r => isMediaOdontoLegacy(r.campanha))
    // Dedupe por (dia, canal, campanha, conjunto, anuncio) — se uma mesma linha aparece
    // nas duas fontes durante janela transicional, evita dobrar spend/leads.
    const merged = [...legacyOwnMarca.data, ...fromOralUnic]
    const seen = new Set<string>()
    return merged.filter(r => {
      const key = `${r.dia}|${r.canal}|${r.campanha ?? ''}|${r.conjunto ?? ''}|${r.anuncio ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [legacyOwnMarca.data, oralUnicAll.data])

  return {
    data,
    loading: legacyOwnMarca.loading || oralUnicAll.loading,
    error: legacyOwnMarca.error ?? oralUnicAll.error,
  }
}
