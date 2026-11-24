import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import { agruparGravacoesPorDeal, type GravacaoDeal } from '@/lib/gravacoesDeal'

/**
 * Lê `vw_deal_gravacoes` (Supabase de Expansão): as gravações do MeetRox de
 * cada negócio, para a coluna "Gravações" dos pop-ups de deal.
 *
 * Pequena (~1,4 mil linhas em nov/26), lida inteira e guardada no mesmo cache
 * em memória dos outros hooks: todos os pop-ups abertos compartilham uma carga.
 * Só busca com `ativo` (o pop-up aberto), para não pesar a abertura das abas.
 *
 * `pronto` = carregou ao menos uma vez sem erro; antes disso a coluna mostra
 * "…" em vez de "—" (que diria "sem gravação").
 */

const CHAVE = 'vw_deal_gravacoes'
const COLS = 'id_deal,call_id,tipo,eh_live,call_timestamp,closer,titulo,url'
const IDADE_REVALIDAR_MS = 60_000

async function fetchAll(): Promise<GravacaoDeal[]> {
  const { rows, error } = await buscarTodasPaginas<GravacaoDeal>(async (de, ate, contar) => {
    const { data, error: err, count } = await supabaseVendas
      .from('vw_deal_gravacoes')
      .select(COLS, contar ? { count: 'exact' } : undefined)
      // (id_deal, call_id) é a chave: ordem total, sem linha repetida/pulada entre páginas.
      .order('id_deal', { ascending: true })
      .order('call_id', { ascending: true })
      .range(de, ate)
    return { rows: (data ?? []) as unknown as GravacaoDeal[], error: err?.message ?? null, total: count }
  }, { tamanhoPagina: 1000, concorrencia: 2 })

  if (error) throw new Error(error)
  for (const r of rows) r.call_id = Number(r.call_id)
  return rows
}

export function useGravacoesDeal(ativo = true): { porDeal: Map<string, GravacaoDeal[]>; pronto: boolean } {
  const [data, setData] = useState<GravacaoDeal[]>(() => lerCache<GravacaoDeal[]>(CHAVE)?.valor ?? [])
  const [pronto, setPronto] = useState(() => !!lerCache(CHAVE))
  const montado = useRef(true)

  const load = useCallback(async () => {
    try {
      const rows = await carregarComCache(CHAVE, fetchAll)
      if (!montado.current) return
      setData(rows)
      setPronto(true)
    } catch {
      // Sem a view a coluna fica em "…"; o resto do pop-up segue normal.
    }
  }, [])

  useEffect(() => {
    montado.current = true
    if (ativo) {
      const emCache = lerCache<GravacaoDeal[]>(CHAVE)
      if (emCache) { setData(emCache.valor); setPronto(true) }
      if (!emCache || Date.now() - emCache.atualizadoEm > IDADE_REVALIDAR_MS) void load()
    }
    return () => { montado.current = false }
  }, [ativo, load])

  const porDeal = useMemo(() => agruparGravacoesPorDeal(data), [data])
  return { porDeal, pronto }
}
