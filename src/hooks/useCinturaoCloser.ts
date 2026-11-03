import { useMemo } from 'react'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { useMetasSDRs } from '@/hooks/useMetasSDRs'
import { useCorridaPerformance } from '@/hooks/useCorridaPerformance'
import { mesDoCinturao, nomeDoMes } from '@/constants/metasCampanhaF1'
import { campeaoCloser, campeaoSdr } from '@/lib/octogono'

/**
 * Cinturão · Closer exibido no mês `mes`: o campeão do mês inteiro (sem recorte
 * de round) se o mês já fechou, ou o campeão do mês anterior se ainda está em
 * curso. Regra em `mesDoCinturao` + `campeaoCloser`.
 */
export function useCinturaoCloser(mes: string) {
  const mesCinturao = mesDoCinturao(mes)
  const { closers, loading, error } = useMetasClosers(mesCinturao)
  const campeao = useMemo(() => campeaoCloser(closers), [closers])
  return { campeao, mesCinturao, nomeMesCinturao: nomeDoMes(mesCinturao), loading, error }
}

/** Cinturão · SDR, mesma regra de mês do Closer: % da meta de SQL do mês inteiro. */
export function useCinturaoSdr(mes: string) {
  const mesCinturao = mesDoCinturao(mes)
  const { sdrs, loading: l1, error: e1 } = useMetasSDRs(mesCinturao)
  const pilotos = useMemo(() => ({ sdr: sdrs.map(s => s.nome), closer: [] as string[] }), [sdrs])
  const { sdrRealizado, loading: l2, error: e2 } = useCorridaPerformance(mesCinturao, pilotos)
  const campeao = useMemo(() => campeaoSdr(sdrs, sdrRealizado), [sdrs, sdrRealizado])
  return { campeao, mesCinturao, nomeMesCinturao: nomeDoMes(mesCinturao), loading: l1 || l2, error: e1 || e2 }
}
