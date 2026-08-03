import { useEffect, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

export interface VwMarketingFunil {
  id_lead: string
  marca: string | null
  data_criacao_negociacao: string | null
  data_mql: string | null
  data_tentando_contato: string | null
  data_contato_efetivo: string | null
  data_sql: string | null
  data_diagnostico: string | null
  data_sal: string | null
  data_oportunidade: string | null
  data_venda: string | null
  data_perdido: string | null
  data_no_show: string | null
  status_atual: 'Em andamento' | 'Ganho' | 'Perdido' | 'Excluído' | null
  motivo_perda: string | null
  valor_contrato: number | null
  quantidade_unidades: number | null
  fonte: string | null
  fonte_macro: string | null
  sub_fonte: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  funil: string | null
  etapa_funil: string | null
}

interface Filters {
  marca?: string
  dataInicio?: string
  dataFim?: string
}

interface UseVendasFunilResult {
  data: VwMarketingFunil[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000

async function fetchVendasRows(filters: Filters): Promise<{ rows: VwMarketingFunil[]; error: string | null }> {
  const allRows: VwMarketingFunil[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabaseVendas
      .from('vw_marketing_funil')
      .select('*')
      .order('data_criacao_negociacao', { ascending: false })
      .range(from, to)

    // Exclude Prospecção Ativa from all queries
    q = q.neq('funil', 'Prospecção Ativa')

    if (filters.marca === 'Odonto Scale') {
      // OS lives in funil='Odonto Scale', not in marca column
      q = q.eq('funil', 'Odonto Scale')
    } else if (filters.marca) {
      q = q.eq('marca', filters.marca)
    }

    if (filters.dataInicio) q = q.or(
      `data_criacao_negociacao.gte.${filters.dataInicio},data_sql.gte.${filters.dataInicio},data_diagnostico.gte.${filters.dataInicio},data_sal.gte.${filters.dataInicio},data_venda.gte.${filters.dataInicio}`,
    )
    if (filters.dataFim) q = q.lte('data_criacao_negociacao', filters.dataFim + 'T23:59:59')

    const { data: rows, error: err } = await q
    if (err) return { rows: [], error: err.message }

    allRows.push(...((rows ?? []) as VwMarketingFunil[]))
    if (!rows || rows.length < PAGE_SIZE) break
    page++
  }

  return { rows: allRows, error: null }
}

export function useVendasFunil(filters: Filters = {}): UseVendasFunilResult {
  const [data, setData] = useState<VwMarketingFunil[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchVendasRows(filters)
    if (err) { setError(err); setLoading(false); return }
    setData(rows)
    setLoading(false)
  }, [filters.marca, filters.dataInicio, filters.dataFim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)
      const { rows, error: err } = await fetchVendasRows(filters)
      if (cancelled) return
      if (err) { setError(err); setLoading(false); return }
      if (!cancelled) { setData(rows); setLoading(false) }
    }

    run()

    const handleRefresh = () => { fetchAll(false) }
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
