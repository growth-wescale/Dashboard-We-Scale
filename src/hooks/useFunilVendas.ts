import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { FunnelRow } from '@/lib/funnelTypes'

/**
 * Lê a base do funil de Vendas (view `vw_funil_vendas`, no Supabase de Expansão).
 *
 * Traz as linhas SEM filtro de data e deixa o recorte por período para a camada
 * `metrics.ts`. Isso é de propósito: o hook antigo filtrava no servidor com um
 * `.or()` sobre cinco colunas de data, e qualquer etapa fora dessa lista sumia
 * do funil. Além disso o modo safra precisa de deals cujo MQL está na janela
 * mas cuja etapa aconteceu fora dela — impossível de expressar num filtro só.
 *
 * São ~4,6 mil linhas; a view já exclui deals de teste, status Excluído e
 * funis fora do escopo comercial.
 */

const PAGE_SIZE = 1000

/** Colunas explícitas: `select('*')` traria payload à toa e esconde quebras. */
const COLS = [
  'id_lead', 'ciclo', 'eh_reciclagem', 'eh_ciclo_atual',
  'marca', 'nome_funil', 'etapa_funil', 'status_atual',
  'nome_sdr', 'nome_closer',
  'fonte_macro', 'sub_fonte', 'utm_source', 'utm_medium', 'utm_campaign',
  'valor_contrato', 'quantidade_unidades', 'motivo_perda',
  'data_criacao_negociacao', 'data_criacao_original',
  'data_novo_mql', 'data_tentando_contato', 'data_contato_efetivo',
  'data_interesse_reuniao', 'data_conexao',
  'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_no_show',
  'data_sal', 'data_oportunidade', 'data_comite', 'data_pre_contrato',
  'data_venda', 'data_perdido',
].join(',')

export interface UseFunilVendasResult {
  data: FunnelRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

async function fetchAll(marca?: string): Promise<{ rows: FunnelRow[]; error: string | null }> {
  const out: FunnelRow[] = []

  for (let page = 0; ; page++) {
    let q = supabaseVendas
      .from('vw_funil_vendas')
      .select(COLS)
      .order('data_criacao_negociacao', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (marca) q = q.eq('marca', marca)

    const { data, error } = await q
    if (error) return { rows: [], error: error.message }

    const rows = (data ?? []) as unknown as FunnelRow[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { rows: out, error: null }
}

export function useFunilVendas(marca?: string): UseFunilVendasResult {
  const [data, setData] = useState<FunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    const { rows, error: err } = await fetchAll(marca)
    setError(err)
    if (!err) setData(rows)
    setLoading(false)
  }, [marca])

  useEffect(() => {
    let cancelled = false
    const run = (showLoading: boolean) => { if (!cancelled) void load(showLoading) }

    run(true)

    // Mesmo protocolo dos hooks existentes: botão de refresh global + polling.
    const onRefresh = () => run(false)
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => run(false), 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [load])

  return { data, loading, error, reload: () => void load(false) }
}
