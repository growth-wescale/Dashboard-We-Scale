import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Métricas mensais dos SDRs da campanha F1 GP We Scale. Grão SDR (quem gera
 * lead qualificado / marca reunião), separado dos closers (quem fecha venda).
 *
 * Lê `DB_Metas_Performance` filtrado por `funcao='SDR'` e agrega
 * `meta_sql` + `meta_agendamento` + `meta_reuniao_realizada` por pessoa.
 *
 * **Realizado ainda não implementado** — precisa definição do time sobre
 * qual métrica exata contar (ex.: SQL pode ser "data_sql em vw_funil_vendas"
 * OU "leads com utm_source específico" OU outra métrica). Enquanto definição
 * não chega, `realizado*` vem zero e cards mostram "aguardando métrica".
 *
 * Consumido pela seção "Grid dos SDRs" na página Campanha de Metas.
 */

/** Lista canônica de SDRs ativos (setembro/2026). Cores F1 escolhidas pra
 *  contrastar com closers (Mercedes, Aston, Williams, McLaren). */
export const SDRS_ATIVOS: ReadonlyArray<{
  nome: string
  iniciais: string
  cor: string
  foto?: string
  escuderia?: string
}> = [
  { nome: 'Sarah Padilha',   iniciais: 'SAR', cor: '#00D2BE', foto: '/assets/vendedores/sarah.png',  escuderia: 'Mercedes AMG Petronas' },
  { nome: 'Thiago',          iniciais: 'THI', cor: '#3671C6', foto: '/assets/vendedores/thiago.png', escuderia: 'Red Bull Racing' },
  { nome: 'Xayane',          iniciais: 'XAY', cor: '#B6BABD', foto: '/assets/vendedores/xayane.png', escuderia: 'Mercedes SDR' },
  { nome: 'Vanessa Daniel',  iniciais: 'VAN', cor: '#F91536', escuderia: 'Ferrari' }, // sem foto ainda
]

export interface SdrMeta {
  nome: string
  iniciais: string
  cor: string
  foto?: string
  escuderia?: string
  metaSql: number
  metaAgendamento: number
  metaReuniao: number
  /** Realizado ainda não implementado — vem 0 até definição da métrica. */
  realizadoSql: number
  realizadoReuniao: number
}

interface RawMetaRow {
  nome_colaborador: string | null
  funcao: string | null
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
}

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

const SDR_NOMES_SET = new Set(SDRS_ATIVOS.map(s => normalizeNome(s.nome)))

async function fetchMetasSdr(mesRef: string): Promise<{ rows: RawMetaRow[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada')
    .eq('mes_referencia', mesRef)
    .eq('funcao', 'SDR')
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaRow[], error: null }
}

function aggregate(rows: RawMetaRow[]): SdrMeta[] {
  const metasMap = new Map<string, { sql: number; agend: number; reun: number }>()
  for (const r of rows) {
    if (!r.nome_colaborador) continue
    const key = normalizeNome(r.nome_colaborador)
    if (!SDR_NOMES_SET.has(key)) continue
    const cur = metasMap.get(key) ?? { sql: 0, agend: 0, reun: 0 }
    cur.sql += Number(r.meta_sql) || 0
    cur.agend += Number(r.meta_agendamento) || 0
    cur.reun += Number(r.meta_reuniao_realizada) || 0
    metasMap.set(key, cur)
  }

  return SDRS_ATIVOS.map(s => {
    const key = normalizeNome(s.nome)
    const meta = metasMap.get(key) ?? { sql: 0, agend: 0, reun: 0 }
    return {
      ...s,
      metaSql: meta.sql,
      metaAgendamento: meta.agend,
      metaReuniao: meta.reun,
      realizadoSql: 0,       // placeholder — definir métrica com o time
      realizadoReuniao: 0,   // placeholder
    }
  })
}

export interface UseMetasSDRsResult {
  sdrs: SdrMeta[]
  loading: boolean
  error: string | null
  reload: () => void
  metasCadastradas: boolean
}

export function useMetasSDRs(mesRef: string): UseMetasSDRsResult {
  const [sdrs, setSdrs] = useState<SdrMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetasSdr(mesRef)
    if (err) { setError(err); setLoading(false); return }
    setSdrs(aggregate(rows))
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

  const stable = useMemo(() => sdrs, [sdrs])
  const metasCadastradas = useMemo(
    () => sdrs.some(s => s.metaSql > 0 || s.metaAgendamento > 0 || s.metaReuniao > 0),
    [sdrs],
  )
  return { sdrs: stable, loading, error, reload: () => fetchAll(true), metasCadastradas }
}
