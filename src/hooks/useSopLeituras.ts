import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface UseSopLeiturasResult {
  chips: string[]
  setChips: (chips: string[]) => void
  loading: boolean
}

export function useSopLeituras(slideId: string, semanaInicio: string): UseSopLeiturasResult {
  const [chips, setChipsLocal] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('sop_leituras')
      .select('chips')
      .eq('marca', slideId)
      .eq('semana_inicio', semanaInicio)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setChipsLocal((data?.chips as string[] | null) ?? [])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [slideId, semanaInicio])

  const setChips = useCallback((newChips: string[]) => {
    setChipsLocal(newChips)
    supabase
      .from('sop_leituras')
      .upsert({ marca: slideId, semana_inicio: semanaInicio, chips: newChips }, { onConflict: 'marca,semana_inicio' })
  }, [slideId, semanaInicio])

  return { chips, setChips, loading }
}
