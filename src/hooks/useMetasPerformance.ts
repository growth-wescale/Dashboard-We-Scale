import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

export type FuncaoMeta = 'SDR' | 'Closer'

// Linha bruta em DB_Metas_Performance (só as colunas usadas)
interface RawMetaRow {
  nome_colaborador: string | null
  marca: string | null
  mes_referencia: string | null // 'YYYY-MM-DD'
  funcao: FuncaoMeta | 'Repasse' | null
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
  meta_cof: number | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

// Meta agregada por (colaborador, funcao) no mês solicitado
export interface MetaAgregada {
  nome: string
  funcao: FuncaoMeta
  metaSql: number
  metaAgendamento: number
  metaReuniao: number
  metaCof: number
  metaFinanceira: number
  metaQtdVendas: number
}

interface Filters {
  mesKey: string   // 'YYYY-MM'
  marca?: string   // opcional; se passar, só linhas dessa marca (usado no modo por marca)
}

interface UseMetasResult {
  data: MetaAgregada[]
  loading: boolean
  error: string | null
}

// Marcas que representam agregados/categorias especiais na tabela — excluídas pra
// evitar dupla contagem quando somamos as metas por marca real (decisão P6).
const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])

async function fetchMetas(mesKey: string, marca?: string): Promise<{ rows: RawMetaRow[]; error: string | null }> {
  const mesInicio = `${mesKey}-01`
  let q = supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, marca, mes_referencia, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas')
    .eq('mes_referencia', mesInicio)
    .in('funcao', ['SDR', 'Closer'])
  if (marca) q = q.eq('marca', marca)
  const { data, error } = await q
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaRow[], error: null }
}

function aggregate(rows: RawMetaRow[]): MetaAgregada[] {
  const bucket = new Map<string, MetaAgregada>()
  for (const r of rows) {
    if (!r.nome_colaborador || !r.funcao || r.funcao === 'Repasse') continue
    if (r.marca && MARCAS_EXCLUIR.has(r.marca)) continue

    const key = `${r.nome_colaborador}::${r.funcao}`
    const cur = bucket.get(key) ?? {
      nome: r.nome_colaborador,
      funcao: r.funcao as FuncaoMeta,
      metaSql: 0, metaAgendamento: 0, metaReuniao: 0,
      metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0,
    }
    cur.metaSql         += r.meta_sql               ?? 0
    cur.metaAgendamento += r.meta_agendamento       ?? 0
    cur.metaReuniao     += r.meta_reuniao_realizada ?? 0
    cur.metaCof         += r.meta_cof               ?? 0
    cur.metaFinanceira  += r.meta_financeira        ?? 0
    cur.metaQtdVendas   += r.meta_qtd_vendas        ?? 0
    bucket.set(key, cur)
  }
  return Array.from(bucket.values())
}

export function useMetasPerformance({ mesKey, marca }: Filters): UseMetasResult {
  const [rawRows, setRawRows] = useState<RawMetaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetas(mesKey, marca)
    if (err) { setError(err); setLoading(false); return }
    setRawRows(rows)
    setLoading(false)
  }, [mesKey, marca])

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

  const data = useMemo(() => aggregate(rawRows), [rawRows])
  return { data, loading, error }
}

// Helper: pega meta de uma pessoa/função específica (útil pra ranking)
export function findMeta(metas: MetaAgregada[], nome: string, funcao: FuncaoMeta): MetaAgregada | null {
  const nn = nome.trim().toLowerCase()
  return metas.find(m => m.funcao === funcao && m.nome.trim().toLowerCase() === nn) ?? null
}

/* ── Meta somada de vários meses (card "Meta do período" da Visão Macro) ──── */

export interface MetaResumo {
  metaFinanceira: number
  metaQtdVendas: number
}

async function fetchMetasMeses(mesesKeys: string[]): Promise<{ rows: RawMetaRow[]; error: string | null }> {
  if (mesesKeys.length === 0) return { rows: [], error: null }
  const mesesInicio = mesesKeys.map(k => `${k}-01`)
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, marca, mes_referencia, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas')
    .in('mes_referencia', mesesInicio)
    .in('funcao', ['SDR', 'Closer'])
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaRow[], error: null }
}

const VAZIO_META: MetaResumo = { metaFinanceira: 0, metaQtdVendas: 0 }

/** Soma por marca — sempre todas as marcas presentes nas linhas; o chamador
 *  filtra/soma o subconjunto que precisar (ex.: as marcas selecionadas no filtro). */
function resumirPorMarca(rows: RawMetaRow[]): Map<string, MetaResumo> {
  const map = new Map<string, MetaResumo>()
  for (const r of rows) {
    if (!r.nome_colaborador || !r.funcao || r.funcao === 'Repasse') continue
    if (!r.marca || MARCAS_EXCLUIR.has(r.marca)) continue
    const cur = map.get(r.marca) ?? { ...VAZIO_META }
    cur.metaFinanceira += r.meta_financeira ?? 0
    cur.metaQtdVendas += r.meta_qtd_vendas ?? 0
    map.set(r.marca, cur)
  }
  return map
}

interface ResumoFilters {
  /** Meses cobertos pelo período selecionado ('YYYY-MM'). Vazio = sem meta (ex.: modo Dia). */
  mesesKeys: string[]
}

interface UseMetaResumoResult {
  /** Meta por marca (chave = `marca` canônica do banco). Marca ausente = sem meta cadastrada. */
  porMarca: Map<string, MetaResumo>
  loading: boolean
  error: string | null
}

/**
 * Meta por marca dos meses cobertos pelo período selecionado — sempre busca
 * todas as marcas (a tabela é pequena, poucas linhas por mês); o card de Meta
 * soma/filtra o subconjunto das marcas selecionadas no filtro compartilhado.
 */
export function useMetaResumo({ mesesKeys }: ResumoFilters): UseMetaResumoResult {
  // Chave estável pro efeito: `mesesKeys` é recriado a cada render pelo chamador.
  const chave = mesesKeys.join(',')
  const [porMarca, setPorMarca] = useState<Map<string, MetaResumo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetasMeses(chave ? chave.split(',') : [])
    if (err) { setError(err); setLoading(false); return }
    setPorMarca(resumirPorMarca(rows))
    setLoading(false)
  }, [chave])

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

  return { porMarca, loading, error }
}
