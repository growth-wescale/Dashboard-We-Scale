import { useMemo } from 'react'
import { useMediaData } from '@/hooks/useMediaData'
import { isMediaLegacy } from '@/lib/oralUnicMapping'
import type { MediaDailyRaw } from '@/lib/types'

/**
 * Investimento em campanhas de COMUNIDADE (Legacy).
 *
 * Comunidade vive dentro da conta Oral Unic — as campanhas usam prefixos
 * `[LEGACY]` / `[CMD]` (ver `isMediaLegacy`). Não confundir com Consultoria
 * (bucket `[ODL]/[OS]`, atendido por `useMediaOdontoLegacy`) nem com Franquia
 * Oral Unic (o resto).
 *
 * Base do cálculo de Custo/membro do slide Odonto Legacy no S&OP: numerador
 * é o invest daqui, denominador é o total de membros da comunidade.
 */
interface Filters {
  dataInicio?: string
  dataFim?: string
}

interface Result {
  data: MediaDailyRaw[]
  loading: boolean
  error: string | null
}

export function useMediaComunidadeLegacy(filters: Filters = {}): Result {
  const oralUnicAll = useMediaData({ marca: 'Oral Unic', dataInicio: filters.dataInicio, dataFim: filters.dataFim })

  const data = useMemo(
    () => oralUnicAll.data.filter(r => isMediaLegacy(r.campanha)),
    [oralUnicAll.data],
  )

  return {
    data,
    loading: oralUnicAll.loading,
    error: oralUnicAll.error,
  }
}
