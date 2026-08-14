import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { FunnelEventRow } from '@/lib/metrics'

/**
 * Eventos de passagem por etapa (view `vw_funil_etapas_v2`).
 *
 * Só é usado quando o toggle de contagem está em "Volume de passagens" — por
 * isso o hook aceita `enabled` e não busca nada quando desligado: são ~19 mil
 * eventos que não fazem falta no modo padrão.
 *
 * A view não expõe fonte_macro nem utm_source. O filtro de fonte é aplicado
 * depois, cruzando `id_deal` com o conjunto já filtrado de `vw_funil_vendas`.
 */

const PAGE_SIZE = 1000

const COLS = [
  'id_deal', 'dia', 'marca', 'etapa_canonica', 'nome_funil', 'ciclo', 'rn_deal_etapa_mes',
].join(',')

interface Params {
  enabled: boolean
  marca?: string
  inicio: string
  /** Omitido no modo safra: o evento pode ser posterior à janela do MQL. */
  fim?: string
}

export interface UseFunilEventosResult {
  data: FunnelEventRow[]
  loading: boolean
  error: string | null
}

async function fetchAll(p: Params): Promise<{ rows: FunnelEventRow[]; error: string | null }> {
  const out: FunnelEventRow[] = []

  for (let page = 0; ; page++) {
    let q = supabaseVendas
      .from('vw_funil_etapas_v2')
      .select(COLS)
      .gte('dia', p.inicio)
      .order('dia', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (p.fim) q = q.lte('dia', p.fim)
    if (p.marca) q = q.eq('marca', p.marca)

    const { data, error } = await q
    if (error) return { rows: [], error: error.message }

    const rows = (data ?? []) as unknown as FunnelEventRow[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { rows: out, error: null }
}

export function useFunilEventos(p: Params): UseFunilEventosResult {
  const [data, setData] = useState<FunnelEventRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { enabled, marca, inicio, fim } = p

  const load = useCallback(async () => {
    if (!enabled) { setData([]); setError(null); setLoading(false); return }
    setLoading(true)
    const { rows, error: err } = await fetchAll({ enabled, marca, inicio, fim })
    setError(err)
    if (!err) setData(rows)
    setLoading(false)
  }, [enabled, marca, inicio, fim])

  useEffect(() => { void load() }, [load])

  return { data, loading, error }
}
