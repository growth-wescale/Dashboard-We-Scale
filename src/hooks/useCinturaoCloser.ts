import { useMemo } from 'react'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { mesDoCinturao, nomeDoMes } from '@/constants/metasCampanhaF1'
import { campeaoCloser } from '@/lib/octogono'

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
