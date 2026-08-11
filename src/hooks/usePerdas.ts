import { useEffect, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

// vw_perdas — uma linha por evento de perda (não por deal).
// Só colunas usadas na página.
export interface PerdaEvento {
  id_evento: number
  id_deal: string
  marca: string | null
  etapa_canonica: string | null
  ordem_funil: number | null
  camada: 'SDR' | 'Closer' | null
  responsavel: string | null
  motivo_perda: string | null
  data_evento: string | null
  dia: string | null   // 'YYYY-MM-DD'
  mes: string | null   // 'YYYY-MM-01'
}

interface Filters {
  marca?: string
  dataInicio?: string  // 'YYYY-MM-DD'
  dataFim?: string     // 'YYYY-MM-DD'
}

interface UseResult {
  data: PerdaEvento[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000
const SELECT = [
  'id_evento', 'id_deal', 'marca', 'etapa_canonica', 'ordem_funil',
  'camada', 'responsavel', 'motivo_perda', 'data_evento', 'dia', 'mes',
].join(', ')

async function fetchPerdas(filters: Filters): Promise<{ rows: PerdaEvento[]; error: string | null }> {
  const all: PerdaEvento[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabaseVendas
      .from('vw_perdas')
      .select(SELECT)
      .order('data_evento', { ascending: false })
      .range(from, to)
      // Exclui funis legados 'Oral Unic'/'Inpot' (marcas antigas usadas como nome de funil).
      // Não usamos allowlist rigoroso aqui pra não descartar perdas com nome_funil=null.
      .not('nome_funil', 'in', '("Oral Unic","Inpot")')

    if (filters.marca) q = q.eq('marca', filters.marca)
    if (filters.dataInicio) q = q.gte('dia', filters.dataInicio)
    if (filters.dataFim)    q = q.lte('dia', filters.dataFim)

    const { data: rows, error: err } = await q
    if (err) return { rows: [], error: err.message }

    all.push(...((rows ?? []) as unknown as PerdaEvento[]))
    if (!rows || rows.length < PAGE_SIZE) break
    page++
  }
  return { rows: all, error: null }
}

export function usePerdas(filters: Filters = {}): UseResult {
  const [data, setData] = useState<PerdaEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchPerdas(filters)
    if (err) { setError(err); setLoading(false); return }
    setData(rows)
    setLoading(false)
  }, [filters.marca, filters.dataInicio, filters.dataFim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 60000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [filters.marca, filters.dataInicio, filters.dataFim]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error }
}
