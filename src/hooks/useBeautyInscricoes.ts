import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { parseBeautyInscricoes, type BeautyInscricaoDia } from '@/lib/beautyInscricoes'
import { useConsultaFiltrada } from './useConsultaFiltrada'

export const beautyOuroEnabled = import.meta.env.VITE_BEAUTY_OURO_ENABLED === 'true'

export function useBeautyInscricoes(enabled: boolean) {
  const fetchRows = useCallback(async (signal: AbortSignal): Promise<BeautyInscricaoDia[]> => {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) throw new Error('Entre novamente para consultar Beauty.')
    const response = await fetch('/api/beauty-ouro/v1/read', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: 'inscricoes', route: '/sop-marketing' }),
    })
    if (!response.ok) throw new Error('Não foi possível consultar as inscrições de Beauty. Atualize os dados para tentar novamente.')
    return parseBeautyInscricoes(await response.json())
  }, [])
  return useConsultaFiltrada('sop:beauty-inscricoes:v1', fetchRows, enabled && beautyOuroEnabled)
}
