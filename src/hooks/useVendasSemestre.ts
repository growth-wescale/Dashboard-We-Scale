import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Vendas do H2 2026 (jul-dez) por marca × mês. Usado no bloco "Vendas do
 * semestre" da página /okrs. Consolidado (Inbound + Prospecção Ativa) —
 * PA tem 0 vendas hoje, então soma = Inbound, mas mantém a soma pra o dia
 * em que PA começar a ganhar.
 *
 * Estratégia idêntica ao useHistoricoAtingimento: 1 query em DB_Metas_Performance
 * + 1 em vw_funil_vendas, agrega client-side. Ambos no Supabase de Expansão.
 */

export const MESES_H2_2026 = [
  { key: '2026-07-01', mesKey: '2026-07', label: 'JUL' },
  { key: '2026-08-01', mesKey: '2026-08', label: 'AGO' },
  { key: '2026-09-01', mesKey: '2026-09', label: 'SET' },
  { key: '2026-10-01', mesKey: '2026-10', label: 'OUT' },
  { key: '2026-11-01', mesKey: '2026-11', label: 'NOV' },
  { key: '2026-12-01', mesKey: '2026-12', label: 'DEZ' },
] as const

export interface VendaMes {
  label: string
  mesKey: string
  qtdRealizada: number
  receitaRealizada: number
  metaQtd: number
  metaReceita: number
}

export interface VendaMarca {
  marca: string
  meses: VendaMes[]
  totalQtd: number
  totalReceita: number
  totalMetaQtd: number
  totalMetaReceita: number
}

export interface VendasSemestre {
  porMarca: VendaMarca[]
  total: VendaMarca         // consolidado (soma de todas as marcas)
}

// Mesma exclusão do useMetasPerformance/useMetaResumo — evita dupla contagem.
const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])

interface RawMeta {
  marca: string | null
  mes_referencia: string
  funcao: string | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

interface RawVenda {
  marca: string | null
  data_venda: string | null
  valor_contrato: number | null
}

async function fetchMetas(): Promise<{ rows: RawMeta[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('marca, mes_referencia, funcao, meta_financeira, meta_qtd_vendas')
    .in('mes_referencia', MESES_H2_2026.map(m => m.key))
    .in('funcao', ['SDR', 'Closer'])
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMeta[], error: null }
}

async function fetchVendas(): Promise<{ rows: RawVenda[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('marca, data_venda, valor_contrato')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', MESES_H2_2026[0].key)
    .lte('data_venda', '2026-12-31T23:59:59')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawVenda[], error: null }
}

function mesKeyDaData(dt: string): string | null {
  if (!dt || dt.length < 7) return null
  return dt.substring(0, 7)   // 'YYYY-MM'
}

function novaVendaMes(m: typeof MESES_H2_2026[number]): VendaMes {
  return { label: m.label, mesKey: m.mesKey, qtdRealizada: 0, receitaRealizada: 0, metaQtd: 0, metaReceita: 0 }
}

function novaMarca(marca: string): VendaMarca {
  return {
    marca,
    meses: MESES_H2_2026.map(novaVendaMes),
    totalQtd: 0, totalReceita: 0, totalMetaQtd: 0, totalMetaReceita: 0,
  }
}

function recalcTotais(v: VendaMarca): void {
  v.totalQtd = v.meses.reduce((s, m) => s + m.qtdRealizada, 0)
  v.totalReceita = v.meses.reduce((s, m) => s + m.receitaRealizada, 0)
  v.totalMetaQtd = v.meses.reduce((s, m) => s + m.metaQtd, 0)
  v.totalMetaReceita = v.meses.reduce((s, m) => s + m.metaReceita, 0)
}

function aggregate(metas: RawMeta[], vendas: RawVenda[]): VendasSemestre {
  const marcas = new Map<string, VendaMarca>()

  for (const r of metas) {
    if (!r.marca || MARCAS_EXCLUIR.has(r.marca)) continue
    const mesKey = r.mes_referencia.substring(0, 7)
    const mesIdx = MESES_H2_2026.findIndex(m => m.mesKey === mesKey)
    if (mesIdx < 0) continue
    const bucket = marcas.get(r.marca) ?? novaMarca(r.marca)
    bucket.meses[mesIdx].metaQtd += Number(r.meta_qtd_vendas) || 0
    bucket.meses[mesIdx].metaReceita += Number(r.meta_financeira) || 0
    marcas.set(r.marca, bucket)
  }

  for (const v of vendas) {
    if (!v.marca || MARCAS_EXCLUIR.has(v.marca) || !v.data_venda) continue
    const mesKey = mesKeyDaData(v.data_venda)
    if (!mesKey) continue
    const mesIdx = MESES_H2_2026.findIndex(m => m.mesKey === mesKey)
    if (mesIdx < 0) continue
    const bucket = marcas.get(v.marca) ?? novaMarca(v.marca)
    bucket.meses[mesIdx].qtdRealizada += 1
    bucket.meses[mesIdx].receitaRealizada += Number(v.valor_contrato) || 0
    marcas.set(v.marca, bucket)
  }

  const porMarca = Array.from(marcas.values())
  porMarca.forEach(recalcTotais)
  porMarca.sort((a, b) => a.marca.localeCompare(b.marca, 'pt-BR'))

  const total = novaMarca('Consolidado')
  for (const m of porMarca) {
    m.meses.forEach((mes, i) => {
      total.meses[i].qtdRealizada += mes.qtdRealizada
      total.meses[i].receitaRealizada += mes.receitaRealizada
      total.meses[i].metaQtd += mes.metaQtd
      total.meses[i].metaReceita += mes.metaReceita
    })
  }
  recalcTotais(total)

  return { porMarca, total }
}

export interface UseVendasSemestreResult {
  data: VendasSemestre
  loading: boolean
  error: string | null
}

const VAZIO: VendasSemestre = { porMarca: [], total: { marca: 'Consolidado', meses: MESES_H2_2026.map(novaVendaMes), totalQtd: 0, totalReceita: 0, totalMetaQtd: 0, totalMetaReceita: 0 } }

export function useVendasSemestre(): UseVendasSemestreResult {
  const [data, setData] = useState<VendasSemestre>(VAZIO)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [m, v] = await Promise.all([fetchMetas(), fetchVendas()])
    if (m.error) { setError(m.error); setLoading(false); return }
    if (v.error) { setError(v.error); setLoading(false); return }
    setData(aggregate(m.rows, v.rows))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const stable = useMemo(() => data, [data])
  return { data: stable, loading, error }
}
