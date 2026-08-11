import { useEffect, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

// vw_funil_compat = mesmo grão de vw_marketing_funil (1 linha por deal)
// + nome_sdr, nome_closer. Colunas de data usam nomes diferentes em compat
// (data_novo_mql, data_agendamento_reuniao_sql, data_reuniao_realizada).
// Preservamos os nomes originais da view aqui.
export interface FunilCompatRow {
  id_lead: string
  marca: string | null
  nome_sdr: string | null
  nome_closer: string | null
  data_criacao_negociacao: string | null
  data_novo_mql: string | null
  data_tentando_contato: string | null
  data_contato_efetivo: string | null
  data_agendamento_reuniao_sql: string | null
  data_reuniao_realizada: string | null
  data_sal: string | null
  data_oportunidade: string | null
  data_venda: string | null
  data_perdido: string | null
  data_no_show: string | null
  status_atual: 'Em andamento' | 'Ganho' | 'Perdido' | 'Excluído' | null
  motivo_perda: string | null
  valor_contrato: number | null
  funil: string | null
}

interface Filters {
  marca?: string
  dataInicio?: string
  dataFim?: string
}

interface UseResult {
  data: FunilCompatRow[]
  loading: boolean
  error: string | null
}

const PAGE_SIZE = 1000
const SELECT = [
  'id_lead', 'marca', 'nome_sdr', 'nome_closer',
  'data_criacao_negociacao', 'data_novo_mql', 'data_tentando_contato',
  'data_contato_efetivo', 'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_sal',
  'data_oportunidade', 'data_venda', 'data_perdido', 'data_no_show',
  'status_atual', 'motivo_perda', 'valor_contrato', 'funil',
].join(', ')

async function fetchRows(filters: Filters): Promise<{ rows: FunilCompatRow[]; error: string | null }> {
  const all: FunilCompatRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabaseVendas
      .from('vw_funil_compat')
      .select(SELECT)
      .order('data_criacao_negociacao', { ascending: false })
      .range(from, to)

    // Allowlist rigoroso alinhado ao app de referência (P7)
    if (filters.marca === 'Odonto Scale') {
      q = q.eq('funil', 'Odonto Scale')
    } else {
      q = q.in('funil', ['SDR', 'Closer', 'Prospecção Ativa', 'Odonto Scale'])
      if (filters.marca) q = q.eq('marca', filters.marca)
      // No consolidado, ignora deals sem marca (67 nulls + 12 vazios detectados na auditoria)
      else q = q.not('marca', 'is', null).neq('marca', '')
    }
    // Excluir deals de teste sem tocar na base
    q = q.or('nome_negociacao.is.null,nome_negociacao.not.ilike.%teste%')

    if (filters.dataInicio) q = q.or(
      `data_criacao_negociacao.gte.${filters.dataInicio},data_agendamento_reuniao_sql.gte.${filters.dataInicio},data_reuniao_realizada.gte.${filters.dataInicio},data_sal.gte.${filters.dataInicio},data_venda.gte.${filters.dataInicio}`,
    )
    if (filters.dataFim) q = q.lte('data_criacao_negociacao', filters.dataFim + 'T23:59:59')

    const { data: rows, error: err } = await q
    if (err) return { rows: [], error: err.message }

    all.push(...((rows ?? []) as unknown as FunilCompatRow[]))
    if (!rows || rows.length < PAGE_SIZE) break
    page++
  }
  return { rows: all, error: null }
}

export function usePerformanceEquipe(filters: Filters = {}): UseResult {
  const [data, setData] = useState<FunilCompatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchRows(filters)
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
