import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Realizado (unidades e faturamento) por marca num mês específico. Cruza
 * `vw_funil_vendas` filtrado por `status_atual = 'Ganho'` + `data_venda` no
 * intervalo do mês. Cobre Inbound + Prospecção Ativa (todas as origens).
 *
 * Uso: cross com metas em `DB_Metas_Marca` na página Campanha de Metas
 * (`/gp-setembro`).
 */

export interface RealizadoMarca {
  marca: string
  qtd: number             // soma de quantidade_unidades (>=1 por deal ganho)
  faturamento: number     // soma de valor_contrato
}

interface RawWin {
  marca: string | null
  quantidade_unidades: number | null
  valor_contrato: number | null
}

function ultimoDiaMes(mesReferencia: string): string {
  // mesReferencia = 'YYYY-MM-01' → devolve 'YYYY-MM-<último dia>'
  const d = new Date(mesReferencia + 'T00:00:00')
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0) // day 0 do próximo mês = último do atual
  const yyyy = fim.getFullYear()
  const mm = String(fim.getMonth() + 1).padStart(2, '0')
  const dd = String(fim.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function fetchRealizado(mesReferencia: string): Promise<{ rows: RawWin[]; error: string | null }> {
  const inicio = mesReferencia
  const fim = ultimoDiaMes(mesReferencia)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('marca, quantidade_unidades, valor_contrato')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fim + 'T23:59:59')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawWin[], error: null }
}

function aggregate(rows: RawWin[]): Map<string, RealizadoMarca> {
  const map = new Map<string, RealizadoMarca>()
  for (const r of rows) {
    if (!r.marca) continue
    const cur = map.get(r.marca) ?? { marca: r.marca, qtd: 0, faturamento: 0 }
    const q = Number(r.quantidade_unidades)
    // saleUnits behavior: null/0/negativo contam como 1 unidade (venda fechada sem produto)
    cur.qtd += Number.isFinite(q) && q > 0 ? q : 1
    cur.faturamento += Number(r.valor_contrato) || 0
    map.set(r.marca, cur)
  }
  return map
}

export interface UseRealizadoPorMarcaResult {
  porMarca: Map<string, RealizadoMarca>
  loading: boolean
  error: string | null
  reload: () => void
}

export function useRealizadoPorMarca(mesReferencia: string): UseRealizadoPorMarcaResult {
  const [porMarca, setPorMarca] = useState<Map<string, RealizadoMarca>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchRealizado(mesReferencia)
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
  return { porMarca: stable, loading, error, reload: () => fetchAll(true) }
}
