import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import type { FunnelEventRow } from '@/lib/metrics'
import type { OrigemComercial } from '@/lib/funnelTypes'

/**
 * Eventos de passagem por etapa (view `vw_funil_etapas_v2`).
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
 * NÃO filtrar por data no servidor. Com filtro de data a chave de cache muda
 * a cada troca de período, forçando re-fetch de ~19 mil eventos a cada seleção
 * (cada página da view leva ~450ms). A troca de período já é filtrada no
 * cliente via `isInWindow`/`win` — igual ao que `vw_funil_vendas` faz. A base
 * inteira (~19k) chega em ~1s pelo parallel fetch; depois disso qualquer troca
 * de período é instantânea.
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
  'id_deal', 'dia', 'etapa_canonica', 'id_etapa', 'nome_funil', 'ciclo', 'rn_deal_etapa_mes', 'marca_deal',
].join(',')

interface Params {
  enabled: boolean
  origem: OrigemComercial
}

export interface UseFunilEventosResult {
  data: FunnelEventRow[]
  loading: boolean
  error: string | null
}

/** Páginas simultâneas — ver `paginacao.ts`. Cada página recalcula a view
 *  inteira (~450 ms no banco), então o limite fica baixo de propósito. */
const CONCORRENCIA = 3

/** Mesma regra de `useFunilVendas`: cache novo aparece sem rebuscar. */
const IDADE_REVALIDAR_MS = 60_000

async function fetchAll(p: Params): Promise<FunnelEventRow[]> {
  const { rows, error } = await buscarTodasPaginas<FunnelEventRow>(async (de, ate, contar) => {
    // Sem filtro de data — a base inteira é carregada uma vez por origem e
    // o recorte de período é feito no cliente. Ver comentário no topo do arquivo.
    const { data, error: err, count } = await supabaseVendas
      .from('vw_funil_etapas_v2')
      .select(COLS, contar ? { count: 'exact' } : undefined)
      .eq('origem_comercial', p.origem)
      // ORDEM TOTAL, desempatando por todas as colunas selecionadas. Só com
      // `order=dia` o OFFSET repetia/pulava eventos entre páginas: set/26 Inbound
      // vinha com 81 eventos duplicados e 81 faltando (Novo MQL em deals únicos
      // 802 em vez de 818). A view tem linhas legítimas repetidas nas colunas de
      // negócio, mas `rn_deal_etapa_mes` as distingue.
      .order('dia', { ascending: false })
      .order('id_deal', { ascending: true })
      .order('id_etapa', { ascending: true })
      .order('etapa_canonica', { ascending: true })
      .order('nome_funil', { ascending: true })
      .order('ciclo', { ascending: true })
      .order('rn_deal_etapa_mes', { ascending: true })
      .range(de, ate)

    return { rows: (data ?? []) as unknown as FunnelEventRow[], error: err?.message ?? null, total: count }
  }, { tamanhoPagina: PAGE_SIZE, concorrencia: CONCORRENCIA })

  if (error) throw new Error(error)
  return rows
}

export function useFunilEventos(p: Params): UseFunilEventosResult {
  const { enabled, origem } = p
  const chave = `vw_funil_etapas_v2:${origem}`

  const [data, setData] = useState<FunnelEventRow[]>(() => (enabled ? lerCache<FunnelEventRow[]>(chave)?.valor : undefined) ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Descarta resposta de um recorte antigo (período/origem trocados no meio da
  // carga) ou que chega depois de desmontar.
  const chaveAtiva = useRef<string | null>(null)

  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    try {
      const rows = await carregarComCache(chave, () => fetchAll({ enabled, origem }))
      if (chaveAtiva.current !== chave) return
      setData(rows)
      setError(null)
    } catch (e) {
      if (chaveAtiva.current !== chave) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (chaveAtiva.current === chave) setLoading(false)
    }
  }, [chave, enabled, origem])

  useEffect(() => {
    if (!enabled) {
      chaveAtiva.current = null
      setData([]); setError(null); setLoading(false)
      return
    }
    chaveAtiva.current = chave
    const emCache = lerCache<FunnelEventRow[]>(chave)
    if (emCache) {
      setData(emCache.valor)
      setError(null)
      setLoading(false)
      if (Date.now() - emCache.atualizadoEm > IDADE_REVALIDAR_MS) void load(false)
    } else {
      void load(true)
    }
    return () => { chaveAtiva.current = null }
  }, [chave, enabled, load])

  return { data, loading, error }
}
