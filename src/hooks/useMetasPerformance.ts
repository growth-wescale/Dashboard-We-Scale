import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { MetaMqlMarca } from '@/lib/metaConversao'

export type FuncaoMeta = 'SDR' | 'Closer'

// Linha bruta em DB_Metas_Performance (só as colunas usadas)
export interface RawMetaRow {
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
  /** Coluna `text` no banco (ex.: "25") — precisa de Number() antes de somar. */
  meta_volume_sal: string | null
  /** Meta de MQL por SDR: só versões publicadas entre 15 e 30/10/2026 gravaram. Desde então
   *  o MQL é meta da marca (ver `fetchMetaMqlMarcas`) e esta coluna vai vazia. */
  meta_mql?: number | null
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
  metaSal: number
}

interface Filters {
  mesKey: string   // 'YYYY-MM'
  marca?: string   // opcional; se passar, só linhas dessa marca (usado no modo por marca)
}

interface UseMetasResult {
  data: MetaAgregada[]
  /** Linhas cruas (sem colapsar a marca) — usadas pela meta de conversão, que
   *  precisa cruzar pessoa × marca. Ver `metasConversao` em `metaConversao.ts`. */
  rows: RawMetaRow[]
  /** Meta de MQL de cada marca na versão ativa do mês — origem da meta de conversão MQL → SQL. */
  mqlMarca: Record<string, MetaMqlMarca>
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
    .select('nome_colaborador, marca, mes_referencia, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas, meta_volume_sal, meta_mql')
    .eq('mes_referencia', mesInicio)
    .in('funcao', ['SDR', 'Closer'])
  if (marca) q = q.eq('marca', marca)
  const { data, error } = await q
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaRow[], error: null }
}

/**
 * Meta de MQL de cada marca na versão ativa do mês: a etapa MQL de
 * `meta_marca_etapa`. Derivada do SQL → `taxa`; número fixo → `mql`; sem meta →
 * marca fora do resultado. Falha aqui não derruba as metas: devolve vazio.
 */
async function fetchMetaMqlMarcas(mesKey: string): Promise<Record<string, MetaMqlMarca>> {
  const { data: versao } = await supabaseVendas
    .from('meta_versao').select('id').eq('mes_referencia', `${mesKey}-01`).eq('ativa', true).maybeSingle()
  if (!versao) return {}
  const { data: marcas } = await supabaseVendas.from('meta_marca').select('id, marca').eq('meta_versao_id', versao.id)
  if (!marcas?.length) return {}
  const { data: etapas } = await supabaseVendas
    .from('meta_marca_etapa').select('meta_marca_id, modo, valor_fixo, taxa')
    .eq('etapa', 'MQL').in('meta_marca_id', marcas.map(m => m.id))
  const marcaPorId = new Map(marcas.map(m => [m.id, m.marca as string]))
  const out: Record<string, MetaMqlMarca> = {}
  for (const e of etapas ?? []) {
    const marca = marcaPorId.get(e.meta_marca_id)
    if (!marca) continue
    const taxa = Number(e.taxa)
    const fixo = Number(e.valor_fixo)
    if (e.modo === 'derivado' && taxa > 0) out[marca] = { taxa }
    else if (e.modo === 'fixo' && fixo > 0) out[marca] = { mql: fixo }
  }
  return out
}

export function aggregate(rows: RawMetaRow[]): MetaAgregada[] {
  const bucket = new Map<string, MetaAgregada>()
  for (const r of rows) {
    if (!r.nome_colaborador || !r.funcao || r.funcao === 'Repasse') continue
    if (r.marca && MARCAS_EXCLUIR.has(r.marca)) continue

    const key = `${r.nome_colaborador}::${r.funcao}`
    const cur = bucket.get(key) ?? {
      nome: r.nome_colaborador,
      funcao: r.funcao as FuncaoMeta,
      metaSql: 0, metaAgendamento: 0, metaReuniao: 0,
      metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0, metaSal: 0,
    }
    cur.metaSql         += r.meta_sql               ?? 0
    cur.metaAgendamento += r.meta_agendamento       ?? 0
    cur.metaReuniao     += r.meta_reuniao_realizada ?? 0
    cur.metaCof         += r.meta_cof               ?? 0
    cur.metaFinanceira  += r.meta_financeira        ?? 0
    cur.metaQtdVendas   += r.meta_qtd_vendas        ?? 0
    cur.metaSal         += Number(r.meta_volume_sal) || 0
    bucket.set(key, cur)
  }
  return Array.from(bucket.values())
}

export function useMetasPerformance({ mesKey, marca }: Filters): UseMetasResult {
  const [rawRows, setRawRows] = useState<RawMetaRow[]>([])
  const [mqlMarca, setMqlMarca] = useState<Record<string, MetaMqlMarca>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Chave ativa: resposta de um mês que já saiu da tela é descartada (ver useMetaResumo).
  const chave = `${mesKey}|${marca ?? ''}`
  const chaveAtiva = useRef<string | null>(chave)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [{ rows, error: err }, mql] = await Promise.all([
      fetchMetas(mesKey, marca),
      fetchMetaMqlMarcas(mesKey).catch(() => ({})),
    ])
    if (chaveAtiva.current !== chave) return
    if (err) { setError(err); setLoading(false); return }
    setRawRows(rows)
    setMqlMarca(mql)
    setLoading(false)
  }, [chave, mesKey, marca])

  useEffect(() => {
    chaveAtiva.current = chave
    let cancelled = false
    fetchAll(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)

    return () => {
      cancelled = true
      chaveAtiva.current = null
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [chave, fetchAll])

  const data = useMemo(() => aggregate(rawRows), [rawRows])
  return { data, rows: rawRows, mqlMarca, loading, error }
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
    .select('nome_colaborador, marca, mes_referencia, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas, meta_volume_sal, meta_mql')
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
  // Chave ativa (mesmo padrão de useFunilVendas): resposta de uma seleção que já
  // mudou é descartada. Ao marcar e desmarcar Julho com Setembro selecionado, a
  // consulta de Jul+Set chegava depois da de Set e o card ficava com a meta dos
  // dois meses somada até recarregar a página.
  const chaveAtiva = useRef<string | null>(chave)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetasMeses(chave ? chave.split(',') : [])
    if (chaveAtiva.current !== chave) return
    if (err) { setError(err); setLoading(false); return }
    setPorMarca(resumirPorMarca(rows))
    setLoading(false)
  }, [chave])

  useEffect(() => {
    chaveAtiva.current = chave
    let cancelled = false
    fetchAll(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)

    return () => {
      cancelled = true
      chaveAtiva.current = null
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [chave, fetchAll])

  return { porMarca, loading, error }
}
