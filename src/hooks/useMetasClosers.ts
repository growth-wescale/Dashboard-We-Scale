import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Metas mensais dos closers da campanha F1 GP We Scale. Filtra
 * `DB_Metas_Performance` pela lista canônica de 4 closers ativos, agrega
 * meta_financeira e meta_qtd_vendas somando todas as marcas de cada closer no
 * mês. Também busca realizado (vendas) por closer via `vw_funil_vendas`.
 *
 * Não confundir com `useMetasPerformance` (que é a base geral, sem filtrar
 * closers específicos e sem agregar por pessoa) ou `useMetasMarca` (que é
 * meta por marca da franqueadora — dimensão diferente).
 */

/** Lista canônica de closers ativos (setembro/2026). Ver
 *  `feedback_closers_ativos.md`. Filtragem por nome protege contra ruído no
 *  cadastro de DB_Metas_Performance (ex.: Vanessa Daniel aparece como Closer
 *  em ago/2026 mas é SDR na realidade). */
export const CLOSERS_ATIVOS: ReadonlyArray<{
  nome: string
  iniciais: string
  cor: string
}> = [
  { nome: 'Jéssica',         iniciais: 'JES', cor: '#2563EB' }, // azul
  { nome: 'Douglas',         iniciais: 'DOU', cor: '#E10600' }, // F1 red
  { nome: 'Aurélio Briano',  iniciais: 'AUR', cor: '#F97316' }, // laranja
  { nome: 'Bruna',           iniciais: 'BRU', cor: '#C6D32D' }, // verde-limão
]

export interface CloserMeta {
  nome: string
  iniciais: string
  cor: string
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
}

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

const CLOSER_NOMES_SET = new Set(CLOSERS_ATIVOS.map(c => normalizeNome(c.nome)))

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
    .select('nome_closer, valor_contrato, quantidade_unidades')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fim + 'T23:59:59')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawVendaRow[], error: null }
}

function aggregate(
  metasRows: RawMetaRow[],
  vendasRows: RawVendaRow[],
): CloserMeta[] {
  // Agrega metas por nome_colaborador (soma todas as marcas)
  const metasMap = new Map<string, { fin: number; qtd: number }>()
  for (const r of metasRows) {
    if (!r.nome_colaborador) continue
    const key = normalizeNome(r.nome_colaborador)
    if (!CLOSER_NOMES_SET.has(key)) continue
    const cur = metasMap.get(key) ?? { fin: 0, qtd: 0 }
    cur.fin += Number(r.meta_financeira) || 0
    cur.qtd += Number(r.meta_qtd_vendas) || 0
    metasMap.set(key, cur)
  }

  // Agrega realizado por nome_closer
  const realizadoMap = new Map<string, { fin: number; qtd: number }>()
  for (const r of vendasRows) {
    if (!r.nome_closer) continue
    const key = normalizeNome(r.nome_closer)
    if (!CLOSER_NOMES_SET.has(key)) continue
    const cur = realizadoMap.get(key) ?? { fin: 0, qtd: 0 }
    cur.fin += Number(r.valor_contrato) || 0
    const q = Number(r.quantidade_unidades)
    cur.qtd += Number.isFinite(q) && q > 0 ? q : 1
    realizadoMap.set(key, cur)
  }

  return CLOSERS_ATIVOS.map(c => {
    const key = normalizeNome(c.nome)
    const meta = metasMap.get(key) ?? { fin: 0, qtd: 0 }
    const real = realizadoMap.get(key) ?? { fin: 0, qtd: 0 }
    const pct = meta.fin > 0 ? (real.fin / meta.fin) * 100 : 0
    return {
      nome: c.nome,
      iniciais: c.iniciais,
      cor: c.cor,
      metaFinanceira: meta.fin,
      metaQtdVendas: meta.qtd,
      realizado: real.fin,
      realizadoQtd: real.qtd,
      pctAtingimento: pct,
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

export function useMetasClosers(mesRef: string): UseMetasClosersResult {
  const [closers, setClosers] = useState<CloserMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const [metas, vendas] = await Promise.all([fetchMetasCloser(mesRef), fetchRealizadoCloser(mesRef)])
    if (metas.error) { setError(metas.error); setLoading(false); return }
    if (vendas.error) { setError(vendas.error); setLoading(false); return }
    setClosers(aggregate(metas.rows, vendas.rows))
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

  const stable = useMemo(() => closers, [closers])
  const metasCadastradas = useMemo(
    () => closers.some(c => c.metaFinanceira > 0 || c.metaQtdVendas > 0),
    [closers],
  )
  return { closers: stable, loading, error, reload: () => fetchAll(true), metasCadastradas }
}
