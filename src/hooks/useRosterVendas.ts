import { useEffect, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

export type CargoVendas = 'SDR' | 'Closer' | 'SDR/Closer'

export interface MembroRoster {
  nome: string
  cargo: CargoVendas
  foto: string | null
}

interface UseRosterResult {
  data: MembroRoster[]
  loading: boolean
  error: string | null
}

async function fetchRoster(): Promise<{ rows: MembroRoster[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('nome_cargo_foto')
    .select('nome, cargo, foto')
    .in('cargo', ['SDR', 'Closer', 'SDR/Closer'])
    .order('nome', { ascending: true })

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as MembroRoster[], error: null }
}

export function useRosterVendas(): UseRosterResult {
  const [data, setData] = useState<MembroRoster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchRoster()
    if (err) { setError(err); setLoading(false); return }
    setData(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    // Roster muda pouco; refetch discreto a cada 5 min basta
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [fetchAll])

  return { data, loading, error }
}
