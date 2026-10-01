import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { emJanelas, janelasKey, type Janela } from '@/constants/metasCampanhaF1'
import { saleUnits } from '@/lib/metrics'
import { nomesComMeta, perfilPiloto } from '@/lib/pilotos'
import { useRosterVendas } from '@/hooks/useRosterVendas'

/**
 * Metas mensais dos closers da Campanha de Metas. Os pilotos do mês são quem
 * tem meta de Closer em `DB_Metas_Performance` naquele mês (não uma lista
 * fixa); agrega meta_financeira e meta_qtd_vendas somando todas as marcas de
 * cada closer. Perfil (foto/cor/escuderia) em `src/lib/pilotos.ts`. Também busca realizado (vendas) por closer via `vw_funil_vendas`.
 *
 * `janelas` (opcional) recorta o REALIZADO para a união desses intervalos de
 * data (usado pelo seletor de voltas da Campanha de Metas). A meta continua
 * sendo a do mês inteiro — quem escala pra volta é a página. Sem `janelas`
 * (ex.: `GpStrip`), o realizado é o mês todo.
 *
 * Não confundir com `useMetasPerformance` (que é a base geral, sem filtrar
 * closers específicos e sem agregar por pessoa) ou `useMetaPorMarca` (que é
 * meta por marca da franqueadora — dimensão diferente, agrega por marca em
 * vez de por pessoa).
 */

export interface CloserMeta {
  nome: string
  iniciais: string
  cor: string
  foto?: string
  escuderia?: string
  metaFinanceira: number
  metaQtdVendas: number
  realizado: number
  realizadoQtd: number
  pctAtingimento: number   // realizado/meta em %; 0 se meta for 0
}

interface RawMetaRow {
  nome_colaborador: string | null
  funcao: string | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

interface RawVendaRow {
  nome_closer: string | null
  valor_contrato: number | null
  quantidade_unidades: number | null
  data_venda: string | null
}

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

async function fetchMetasCloser(mesRef: string): Promise<{ rows: RawMetaRow[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, funcao, meta_financeira, meta_qtd_vendas')
    .eq('mes_referencia', mesRef)
    .eq('funcao', 'Closer')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaRow[], error: null }
}

function ultimoDiaMes(mesRef: string): string {
  const d = new Date(mesRef + 'T00:00:00')
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const y = fim.getFullYear()
  const m = String(fim.getMonth() + 1).padStart(2, '0')
  const dd = String(fim.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

async function fetchRealizadoCloser(mesRef: string): Promise<{ rows: RawVendaRow[]; error: string | null }> {
  const inicio = mesRef
  const fim = ultimoDiaMes(mesRef)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_closer, valor_contrato, quantidade_unidades, data_venda')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fim + 'T23:59:59')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawVendaRow[], error: null }
}

function aggregate(
  metasRows: RawMetaRow[],
  vendasRows: RawVendaRow[],
  fotos: ReadonlyMap<string, string | null>,
  janelas?: readonly Janela[],
): CloserMeta[] {
  // Pilotos do mês = quem tem meta de Closer no mês (soma todas as marcas).
  const nomes = nomesComMeta(metasRows, 'Closer')
  const chaves = new Set(nomes.map(normalizeNome))

  const metasMap = new Map<string, { fin: number; qtd: number }>()
  for (const r of metasRows) {
    if (!r.nome_colaborador || r.funcao !== 'Closer') continue
    const key = normalizeNome(r.nome_colaborador)
    const cur = metasMap.get(key) ?? { fin: 0, qtd: 0 }
    cur.fin += Number(r.meta_financeira) || 0
    cur.qtd += Number(r.meta_qtd_vendas) || 0
    metasMap.set(key, cur)
  }

  const realizadoMap = new Map<string, { fin: number; qtd: number }>()
  for (const r of vendasRows) {
    if (!r.nome_closer) continue
    if (!emJanelas(r.data_venda, janelas)) continue
    const key = normalizeNome(r.nome_closer)
    if (!chaves.has(key)) continue
    const cur = realizadoMap.get(key) ?? { fin: 0, qtd: 0 }
    cur.fin += Number(r.valor_contrato) || 0
    cur.qtd += saleUnits(r)
    realizadoMap.set(key, cur)
  }

  return nomes.map(nome => {
    const key = normalizeNome(nome)
    const perfil = perfilPiloto(nome, fotos.get(nome))
    const meta = metasMap.get(key) ?? { fin: 0, qtd: 0 }
    const real = realizadoMap.get(key) ?? { fin: 0, qtd: 0 }
    return {
      ...perfil,
      metaFinanceira: meta.fin,
      metaQtdVendas: meta.qtd,
      realizado: real.fin,
      realizadoQtd: real.qtd,
      pctAtingimento: meta.fin > 0 ? (real.fin / meta.fin) * 100 : 0,
    }
  })
}

export interface UseMetasClosersResult {
  closers: CloserMeta[]
  loading: boolean
  error: string | null
  reload: () => void
  metasCadastradas: boolean  // true se algum closer tem meta > 0 no mês
}

export function useMetasClosers(mesRef: string, janelas?: readonly Janela[]): UseMetasClosersResult {
  const [rawMetas, setRawMetas] = useState<RawMetaRow[]>([])
  const [rawVendas, setRawVendas] = useState<RawVendaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [metas, vendas] = await Promise.all([fetchMetasCloser(mesRef), fetchRealizadoCloser(mesRef)])
    if (metas.error) { setError(metas.error); setLoading(false); return }
    if (vendas.error) { setError(vendas.error); setLoading(false); return }
    setRawMetas(metas.rows)
    setRawVendas(vendas.rows)
    setLoading(false)
  }, [mesRef])

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

  // Trocar de volta só re-agrega (não refetcha) — a query já traz o mês todo.
  const { data: roster } = useRosterVendas()
  const fotos = useMemo(() => new Map(roster.map(r => [r.nome, r.foto])), [roster])
  const jKey = janelasKey(janelas)
  const closers = useMemo(
    () => aggregate(rawMetas, rawVendas, fotos, janelas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawMetas, rawVendas, fotos, jKey],
  )
  const metasCadastradas = useMemo(
    () => closers.some(c => c.metaFinanceira > 0 || c.metaQtdVendas > 0),
    [closers],
  )
  return { closers, loading, error, reload: () => fetchAll(true), metasCadastradas }
}
