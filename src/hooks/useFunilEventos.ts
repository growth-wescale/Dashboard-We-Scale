import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { FunnelEventRow } from '@/lib/metrics'
import type { OrigemComercial } from '@/lib/funnelTypes'

/**
 * Eventos de passagem por etapa (view `vw_funil_etapas_v2`).
 *
 * Só é usado quando o toggle de contagem está em "Volume de passagens" — por
 * isso o hook aceita `enabled` e não busca nada quando desligado: são ~19 mil
 * eventos que não fazem falta no modo padrão.
 *
 * A view não expõe fonte_macro nem utm_source. O filtro de MARCA, fonte e
 * sub-fonte é aplicado depois, cruzando `id_deal` com o conjunto já filtrado
 * de `vw_funil_vendas`.
 *
 * NÃO filtrar por marca no servidor. A coluna `marca` daqui vem de
 * `deal_eventos.marca` — um retrato denormalizado gravado na ingestão, nulo em
 * ~17% dos eventos de agosto/26 (a origem `api_backfill_stage_history` nunca
 * preenche). Um `.eq('marca', ...)` descartava 87% dos eventos da janela e o
 * funil de uma marca sozinha aparecia zerado, enquanto duas marcas juntas
 * (que caem no filtro do cliente) mostravam o número certo. A marca confiável
 * é a do deal, em `vw_funil_vendas` — mesma escolha da RPC do relatório
 * diário, que lê `deal_snapshot.marca`.
 *
 * `origem_comercial` É segura no servidor, ao contrário da marca: ela não vem
 * de retrato denormalizado, e sim de um join por `id_deal` com COALESCE, então
 * nunca é nula. Conferido: 14.873 + 1.636 = 16.509, o total da view. Nenhum
 * evento se perde no filtro.
 */

const PAGE_SIZE = 1000

// id_etapa é obrigatório: etapas homônimas em funis diferentes ("Reunião
// Agendada SQL" no SDR e no Closer) só se distinguem por ele.
const COLS = [
  'id_deal', 'dia', 'etapa_canonica', 'id_etapa', 'nome_funil', 'ciclo', 'rn_deal_etapa_mes',
].join(',')

interface Params {
  enabled: boolean
  origem: OrigemComercial
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

      .eq('origem_comercial', p.origem)

    if (p.fim) q = q.lte('dia', p.fim)

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

  const { enabled, origem, inicio, fim } = p

  const load = useCallback(async () => {
    if (!enabled) { setData([]); setError(null); setLoading(false); return }
    setLoading(true)
    const { rows, error: err } = await fetchAll({ enabled, origem, inicio, fim })
    setError(err)
    if (!err) setData(rows)
    setLoading(false)
  }, [enabled, origem, inicio, fim])

  useEffect(() => { void load() }, [load])

  return { data, loading, error }
}
