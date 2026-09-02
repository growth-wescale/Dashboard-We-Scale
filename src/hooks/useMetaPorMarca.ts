import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Meta cadastrada (unidades e faturamento) por marca num mês específico —
 * soma direto de `DB_Metas_Performance` (funcao='Closer', onde
 * meta_qtd_vendas/meta_financeira vivem), a mesma fonte que já alimenta os
 * cards de Closer e o Grid dos SDRs na Campanha de Metas. Substitui o antigo
 * `useMetasMarca` (que lia uma tabela `DB_Metas_Marca` mockada, nunca criada
 * — a seção "Metas por Marca" agora só lê, sem edição própria).
 */

export interface MetaPorMarca {
  marca: string
  metaQtd: number
  metaFaturamento: number
}

interface RawRow {
  marca: string | null
  meta_qtd_vendas: number | null
  meta_financeira: number | null
}

async function fetchMetas(mesReferencia: string): Promise<{ rows: RawRow[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('marca, meta_qtd_vendas, meta_financeira')
    .eq('mes_referencia', mesReferencia)
    .eq('funcao', 'Closer')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawRow[], error: null }
}

function aggregate(rows: RawRow[]): Map<string, MetaPorMarca> {
  const map = new Map<string, MetaPorMarca>()
  for (const r of rows) {
    if (!r.marca) continue
    const cur = map.get(r.marca) ?? { marca: r.marca, metaQtd: 0, metaFaturamento: 0 }
    cur.metaQtd += Number(r.meta_qtd_vendas) || 0
    cur.metaFaturamento += Number(r.meta_financeira) || 0
    map.set(r.marca, cur)
  }
  return map
}

export interface UseMetaPorMarcaResult {
  porMarca: Map<string, MetaPorMarca>
  loading: boolean
  error: string | null
}

export function useMetaPorMarca(mesReferencia: string): UseMetaPorMarcaResult {
  const [porMarca, setPorMarca] = useState<Map<string, MetaPorMarca>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetas(mesReferencia)
    if (err) { setError(err); setLoading(false); return }
    setPorMarca(aggregate(rows))
    setLoading(false)
  }, [mesReferencia])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [fetchAll])

  const stable = useMemo(() => porMarca, [porMarca])
  return { porMarca: stable, loading, error }
}
