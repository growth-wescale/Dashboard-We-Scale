import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { CLOSERS_ATIVOS } from '@/hooks/useMetasClosers'

/**
 * % de atingimento de meta_financeira por closer × mês (mar a ago/2026).
 * Usado nos cards por piloto na Campanha de Metas para renderizar as 6 barras
 * coloridas do histórico.
 *
 * Estratégia: 1 query em DB_Metas_Performance (todos os meses) + 1 query em
 * vw_funil_vendas (todos os deals ganhos no range). Agrega client-side.
 * Filtragem por CLOSERS_ATIVOS.
 */

export interface HistoricoMes {
  mes: string           // 'YYYY-MM'
  pctAtingimento: number   // 0 se meta 0
  metaFinanceira: number
  realizado: number
}

export interface HistoricoCloser {
  nome: string
  meses: HistoricoMes[]  // ordenado mar → ago
  media: number          // média das % (só meses com meta cadastrada)
}

const MESES_HISTORICO = [
  { key: '2026-03-01', label: 'MAR' },
  { key: '2026-04-01', label: 'ABR' },
  { key: '2026-05-01', label: 'MAI' },
  { key: '2026-06-01', label: 'JUN' },
  { key: '2026-07-01', label: 'JUL' },
  { key: '2026-08-01', label: 'AGO' },
] as const

export const MESES_HISTORICO_LABELS = MESES_HISTORICO.map(m => m.label)

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

const CLOSER_NOMES_SET = new Set(CLOSERS_ATIVOS.map(c => normalizeNome(c.nome)))

function ultimoDiaMes(mesRef: string): string {
  const d = new Date(mesRef + 'T00:00:00')
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const y = fim.getFullYear()
  const m = String(fim.getMonth() + 1).padStart(2, '0')
  const dd = String(fim.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

interface RawMeta { nome_colaborador: string | null; mes_referencia: string; meta_financeira: number | null; funcao: string | null }
interface RawVenda { nome_closer: string | null; data_venda: string | null; valor_contrato: number | null }

async function fetchMetas(): Promise<{ rows: RawMeta[]; error: string | null }> {
  const mesesIn = MESES_HISTORICO.map(m => m.key)
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, mes_referencia, meta_financeira, funcao')
    .in('mes_referencia', mesesIn)
    .eq('funcao', 'Closer')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMeta[], error: null }
}

async function fetchVendas(): Promise<{ rows: RawVenda[]; error: string | null }> {
  const inicio = MESES_HISTORICO[0].key
  const fim = ultimoDiaMes(MESES_HISTORICO[MESES_HISTORICO.length - 1].key)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_closer, data_venda, valor_contrato')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fim + 'T23:59:59')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawVenda[], error: null }
}

function mesKeyDaData(dt: string): string | null {
  // dt = 'YYYY-MM-DD...' → 'YYYY-MM-01'
  if (!dt || dt.length < 7) return null
  return dt.substring(0, 7) + '-01'
}

function aggregate(metasRows: RawMeta[], vendasRows: RawVenda[]): HistoricoCloser[] {
  // Meta por (closer, mes)
  const metaMap = new Map<string, number>() // key = 'nome|mes'
  for (const r of metasRows) {
    if (!r.nome_colaborador || !r.mes_referencia) continue
    const nome = normalizeNome(r.nome_colaborador)
    if (!CLOSER_NOMES_SET.has(nome)) continue
    const key = `${nome}|${r.mes_referencia}`
    metaMap.set(key, (metaMap.get(key) ?? 0) + (Number(r.meta_financeira) || 0))
  }

  // Realizado por (closer, mes)
  const realMap = new Map<string, number>()
  for (const r of vendasRows) {
    if (!r.nome_closer || !r.data_venda) continue
    const nome = normalizeNome(r.nome_closer)
    if (!CLOSER_NOMES_SET.has(nome)) continue
    const mes = mesKeyDaData(r.data_venda)
    if (!mes) continue
    const key = `${nome}|${mes}`
    realMap.set(key, (realMap.get(key) ?? 0) + (Number(r.valor_contrato) || 0))
  }

  return CLOSERS_ATIVOS.map(c => {
    const nomeKey = normalizeNome(c.nome)
    const meses: HistoricoMes[] = MESES_HISTORICO.map(m => {
      const meta = metaMap.get(`${nomeKey}|${m.key}`) ?? 0
      const real = realMap.get(`${nomeKey}|${m.key}`) ?? 0
      return {
        mes: m.label,
        pctAtingimento: meta > 0 ? (real / meta) * 100 : 0,
        metaFinanceira: meta,
        realizado: real,
      }
    })
    const mesesComMeta = meses.filter(m => m.metaFinanceira > 0)
    const media = mesesComMeta.length > 0
      ? mesesComMeta.reduce((s, m) => s + m.pctAtingimento, 0) / mesesComMeta.length
      : 0
    return { nome: c.nome, meses, media }
  })
}

export interface UseHistoricoResult {
  historico: HistoricoCloser[]
  loading: boolean
  error: string | null
}

export function useHistoricoAtingimento(): UseHistoricoResult {
  const [historico, setHistorico] = useState<HistoricoCloser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [m, v] = await Promise.all([fetchMetas(), fetchVendas()])
    if (m.error) { setError(m.error); setLoading(false); return }
    if (v.error) { setError(v.error); setLoading(false); return }
    setHistorico(aggregate(m.rows, v.rows))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const stable = useMemo(() => historico, [historico])
  return { historico: stable, loading, error }
}
