import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

export interface RawMetaTimeRow {
  nome_colaborador: string | null
  marca: string | null
  funcao: 'SDR' | 'Closer' | 'Repasse' | null
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
  meta_cof: number | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

export interface MetaTime {
  metaSql: number
  metaReuniao: number
  metaCof: number
  metaFinanceira: number
  metaQtdVendas: number
}

const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])
const VAZIO: MetaTime = { metaSql: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0 }

/** Soma meta de SDR + Closer por marca real. Chamador filtra as marcas que precisa. */
export function resumirTimePorMarca(rows: RawMetaTimeRow[]): Map<string, MetaTime> {
  const map = new Map<string, MetaTime>()
  for (const r of rows) {
    if (!r.nome_colaborador || !r.funcao || r.funcao === 'Repasse') continue
    if (!r.marca || MARCAS_EXCLUIR.has(r.marca)) continue
    const cur = map.get(r.marca) ?? { ...VAZIO }
    cur.metaSql += r.meta_sql ?? 0
    cur.metaReuniao += r.meta_reuniao_realizada ?? 0
    cur.metaCof += r.meta_cof ?? 0
    cur.metaFinanceira += r.meta_financeira ?? 0
    cur.metaQtdVendas += r.meta_qtd_vendas ?? 0
    map.set(r.marca, cur)
  }
  return map
}

async function fetchMetas(mesesKeys: string[]): Promise<{ rows: RawMetaTimeRow[]; error: string | null }> {
  if (mesesKeys.length === 0) return { rows: [], error: null }
  const mesesInicio = mesesKeys.map(k => `${k}-01`)
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, marca, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas')
    .in('mes_referencia', mesesInicio)
    .in('funcao', ['SDR', 'Closer'])
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaTimeRow[], error: null }
}

export function useMetasTimeResumo({ mesesKeys }: { mesesKeys: string[] }) {
  const chave = mesesKeys.join(',')
  const [porMarca, setPorMarca] = useState<Map<string, MetaTime>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetas(chave ? chave.split(',') : [])
    if (err) { setError(err); setLoading(false); return }
    setPorMarca(resumirTimePorMarca(rows))
    setLoading(false)
  }, [chave])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const onRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [fetchAll])

  return { porMarca, loading, error }
}
