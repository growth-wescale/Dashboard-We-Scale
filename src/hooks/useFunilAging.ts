import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { EtapaPeriodoRow } from '@/lib/funnelTypes'

export { computeAging, type AgingPorEtapa } from '@/lib/aging'

/**
 * Períodos de etapa em aberto (view `vw_deal_etapa_periodos`), base do modo Aging.
 *
 * Busca apenas linhas com `data_saida is null` — o deal ainda está naquela etapa.
 *
 * ATENÇÃO: esta view não fecha o período quando o deal é perdido, então ela
 * sozinha inclui negócio morto. Quem consome precisa cruzar com os deals vivos
 * (`status_atual = 'Em andamento'` e `eh_ciclo_atual`) antes de calcular
 * qualquer estatística — ver `computeAging`. Sem esse cruzamento, "Tentando
 * Contato" mostra 1.959 deals parados há 95 dias em vez de 105 há 10 dias.
 */

const PAGE_SIZE = 1000

export interface LeadtimeStat {
  etapa: string | null
  marca: string | null
  p50: number | null
  p75: number | null
}

export interface UseFunilAgingResult {
  periodos: EtapaPeriodoRow[]
  benchmark: LeadtimeStat[]
  loading: boolean
  error: string | null
}

async function fetchPeriodos(): Promise<{ rows: EtapaPeriodoRow[]; error: string | null }> {
  const out: EtapaPeriodoRow[] = []

  for (let page = 0; ; page++) {
    const { data, error } = await supabaseVendas
      .from('vw_deal_etapa_periodos')
      .select('deal_id,etapa,data_entrada,data_saida,e_ultima_passagem')
      .is('data_saida', null)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) return { rows: [], error: error.message }

    const rows = (data ?? []) as unknown as EtapaPeriodoRow[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { rows: out, error: null }
}

export function useFunilAging(enabled: boolean): UseFunilAgingResult {
  const [periodos, setPeriodos] = useState<EtapaPeriodoRow[]>([])
  const [benchmark, setBenchmark] = useState<LeadtimeStat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    setLoading(true)

    const [p, b] = await Promise.all([
      fetchPeriodos(),
      supabaseVendas.from('vw_leadtime_stats').select('etapa,marca,p50,p75'),
    ])

    if (p.error) { setError(p.error); setLoading(false); return }
    if (b.error) { setError(b.error.message); setLoading(false); return }

    setPeriodos(p.rows)
    setBenchmark((b.data ?? []) as unknown as LeadtimeStat[])
    setError(null)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  return { periodos, benchmark, loading, error }
}
