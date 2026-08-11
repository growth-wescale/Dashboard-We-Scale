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
    return [...legacyOwnMarca.data, ...fromOralUnic]
  }, [legacyOwnMarca.data, oralUnicAll.data])

  return {
    data,
    loading: legacyOwnMarca.loading || oralUnicAll.loading,
    error: legacyOwnMarca.error ?? oralUnicAll.error,
  }
}
