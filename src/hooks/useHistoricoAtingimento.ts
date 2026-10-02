import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * % de atingimento de meta_financeira por closer × mês, nos 6 meses ANTES do
 * mês da campanha escolhido (setembro/2026 → mar a ago). Usado nos cards por
 * piloto e na tabela "Histórico de resultados" da Campanha de Metas.
 *
 * Estratégia: 1 query em DB_Metas_Performance (os 6 meses) + 1 query em
 * vw_funil_vendas (ganhos no range). Agrega client-side, só pros `closers`
 * do mês da campanha (quem tem meta nele).
 */

export interface HistoricoMes {
  mes: string           // rótulo, ex. 'MAR'
  pctAtingimento: number   // 0 se meta 0
  metaFinanceira: number
  realizado: number
}

export interface HistoricoCloser {
  nome: string
  meses: HistoricoMes[]  // do mais antigo pro mais recente
  media: number          // média das % (só meses com meta cadastrada)
}

const ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/** Os 6 meses antes de `mesRef` ('YYYY-MM-01'), do mais antigo pro mais recente. */
export function mesesDoHistorico(mesRef: string): Array<{ key: string; label: string }> {
  const [ano, m] = mesRef.split('-').map(Number)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ano, m - 1 - (6 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, label: ABREV[d.getMonth()] }
  })
}

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

function ultimoDiaMes(mesRef: string): string {
  const d = new Date(mesRef + 'T00:00:00')
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`
}

interface RawMeta { nome_colaborador: string | null; mes_referencia: string; meta_financeira: number | null; funcao: string | null }
interface RawVenda { nome_closer: string | null; data_venda: string | null; valor_contrato: number | null }

function mesKeyDaData(dt: string): string | null {
  if (!dt || dt.length < 7) return null
  return dt.substring(0, 7) + '-01'
}

function aggregate(metasRows: RawMeta[], vendasRows: RawVenda[], closers: readonly string[], meses: Array<{ key: string; label: string }>): HistoricoCloser[] {
  const chaves = new Set(closers.map(normalizeNome))
  const metaMap = new Map<string, number>() // 'nome|mes'
  for (const r of metasRows) {
    if (!r.nome_colaborador || !r.mes_referencia) continue
    const nome = normalizeNome(r.nome_colaborador)
    if (!chaves.has(nome)) continue
    const key = `${nome}|${r.mes_referencia}`
    metaMap.set(key, (metaMap.get(key) ?? 0) + (Number(r.meta_financeira) || 0))
  }
  const realMap = new Map<string, number>()
  for (const r of vendasRows) {
    if (!r.nome_closer || !r.data_venda) continue
    const nome = normalizeNome(r.nome_closer)
    if (!chaves.has(nome)) continue
    const mes = mesKeyDaData(r.data_venda)
    if (!mes) continue
    const key = `${nome}|${mes}`
    realMap.set(key, (realMap.get(key) ?? 0) + (Number(r.valor_contrato) || 0))
  }
  return closers.map(nomeOriginal => {
    const nomeKey = normalizeNome(nomeOriginal)
    const mesesCloser: HistoricoMes[] = meses.map(m => {
      const meta = metaMap.get(`${nomeKey}|${m.key}`) ?? 0
      const real = realMap.get(`${nomeKey}|${m.key}`) ?? 0
      return { mes: m.label, pctAtingimento: meta > 0 ? (real / meta) * 100 : 0, metaFinanceira: meta, realizado: real }
    })
    const comMeta = mesesCloser.filter(m => m.metaFinanceira > 0)
    const media = comMeta.length > 0 ? comMeta.reduce((s, m) => s + m.pctAtingimento, 0) / comMeta.length : 0
    return { nome: nomeOriginal, meses: mesesCloser, media }
  })
}

export interface UseHistoricoResult {
  historico: HistoricoCloser[]
  /** Rótulos dos 6 meses (ex. ['MAR', …, 'AGO']). */
  meses: string[]
  loading: boolean
  error: string | null
}

export function useHistoricoAtingimento(mesRef: string, closers: readonly string[]): UseHistoricoResult {
  const meses = useMemo(() => mesesDoHistorico(mesRef), [mesRef])
  const [raw, setRaw] = useState<{ metas: RawMeta[]; vendas: RawVenda[] }>({ metas: [], vendas: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [m, v] = await Promise.all([
      supabaseVendas
        .from('DB_Metas_Performance')
        .select('nome_colaborador, mes_referencia, meta_financeira, funcao')
        .in('mes_referencia', meses.map(x => x.key))
        .eq('funcao', 'Closer'),
      supabaseVendas
        .from('vw_funil_vendas')
        .select('nome_closer, data_venda, valor_contrato')
        .eq('status_atual', 'Ganho')
        .gte('data_venda', meses[0].key)
        .lte('data_venda', ultimoDiaMes(meses[meses.length - 1].key) + 'T23:59:59'),
    ])
    if (m.error) { setError(m.error.message); setLoading(false); return }
    if (v.error) { setError(v.error.message); setLoading(false); return }
    setRaw({ metas: (m.data ?? []) as RawMeta[], vendas: (v.data ?? []) as RawVenda[] })
    setLoading(false)
  }, [meses])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const closersKey = closers.join('|')
  const historico = useMemo(
    () => aggregate(raw.metas, raw.vendas, closers, meses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, closersKey, meses],
  )
  return { historico, meses: meses.map(m => m.label), loading, error }
}
