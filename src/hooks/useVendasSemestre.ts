import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { METAS_VENDA_FRANQUIA, MARCAS_FRANQUIA, type MarcaFranquia, type MesKey } from '@/constants/metasVendaFranquia'

/**
 * Vendas do H2 2026 (jul-dez) por marca × mês. Usado no bloco "Vendas do
 * semestre" da página /okrs. Consolidado (Inbound + Prospecção Ativa).
 *
 * META vem da planilha "Meta - Venda de Franquia.xlsx" (hardcoded em
 * `src/constants/metasVendaFranquia.ts`) — decisão do Junior em 03/09/2026.
 * Isolado dessa página só, DB_Metas_Performance segue alimentando as
 * outras views (Visão Macro, CampanhaMetas).
 *
 * REALIZADO continua vindo de vw_funil_vendas (status='Ganho') — a xlsx
 * ainda não preenche vendas realizadas.
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

interface RawVenda {
  marca: string | null
  data_venda: string | null
  valor_contrato: number | null
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

function aggregate(vendas: RawVenda[]): VendasSemestre {
  const marcas = new Map<string, VendaMarca>()

  // 1. Meta: preenche todas as 6 marcas de franquia B2B com meta da planilha
  for (const marca of MARCAS_FRANQUIA) {
    const bucket = novaMarca(marca)
    bucket.meses.forEach((mes, i) => {
      const mesKey = MESES_H2_2026[i].mesKey as MesKey
      const m = METAS_VENDA_FRANQUIA[marca as MarcaFranquia][mesKey]
      mes.metaQtd = m?.meta_qtd ?? 0
      mes.metaReceita = m?.meta_receita ?? 0
    })
    marcas.set(marca, bucket)
  }

  // 2. Realizado: soma vendas do CRM (só marcas de franquia)
  const marcasSet = new Set<string>(MARCAS_FRANQUIA)
  for (const v of vendas) {
    if (!v.marca || !v.data_venda || !marcasSet.has(v.marca)) continue
    const mesKey = mesKeyDaData(v.data_venda)
    if (!mesKey) continue
    const mesIdx = MESES_H2_2026.findIndex(m => m.mesKey === mesKey)
    if (mesIdx < 0) continue
    const bucket = marcas.get(v.marca)!
    bucket.meses[mesIdx].qtdRealizada += 1
    bucket.meses[mesIdx].receitaRealizada += Number(v.valor_contrato) || 0
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
    const v = await fetchVendas()
    if (v.error) { setError(v.error); setLoading(false); return }
    setData(aggregate(v.rows))
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
