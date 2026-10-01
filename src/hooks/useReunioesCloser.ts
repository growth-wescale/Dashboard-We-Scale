import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { normalizeMarcaRaw } from '@/constants/brands'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import type { ReuniaoRow } from '@/lib/reunioesCloser'

/**
 * Lê `vw_closer_reunioes` (Supabase de Expansão): uma linha por reunião
 * gravada no MeetRox, com o tipo (R1–R5) e a marca/origem/SDR do negócio.
 *
 * Traz a base inteira (~1,4 mil linhas em out/26, crescendo ~150/mês) e deixa
 * período e filtros para `filtrarReunioes` — mesmo desenho de
 * `useFunilVendas`, e a troca de período não refaz consulta.
 *
 * A view existe porque `DB_Reunioes_MeetRox` tem RLS só para `authenticated`
 * e o cliente de Expansão é sempre `anon` (ver docs/sql/2026-10-01-closer-reunioes-meetrox.sql).
 */

const CHAVE = 'vw_closer_reunioes'

const COLS = [
  'call_id', 'tipo', 'call_timestamp', 'duracao_min', 'ai_score', 'closer',
  'id_deal', 'deal_no_funil', 'negociacao', 'titulo', 'url',
  'marca', 'origem_comercial', 'fonte_macro', 'utm_source', 'sub_fonte_crm',
  'nome_sdr', 'status_atual',
].join(',')

/** O MeetRox sincroniza a cada 5 min; rebuscar antes disso é carga à toa. */
const IDADE_REVALIDAR_MS = 60_000

async function fetchAll(): Promise<ReuniaoRow[]> {
  const { rows, error } = await buscarTodasPaginas<ReuniaoRow>(async (de, ate, contar) => {
    const { data, error: err, count } = await supabaseVendas
      .from('vw_closer_reunioes')
      .select(COLS, contar ? { count: 'exact' } : undefined)
      // call_id é a chave: ordem total, sem linha repetida/pulada entre páginas.
      .order('call_id', { ascending: true })
      .range(de, ate)
    return { rows: (data ?? []) as unknown as ReuniaoRow[], error: err?.message ?? null, total: count }
  }, { tamanhoPagina: 1000, concorrencia: 2 })

  if (error) throw new Error(error)
  // Mesmos aliases de marca do resto das abas de Vendas ('Odonto Legacy',
  // 'Scale Partner'...). `duracao_min` chega como string (numeric do Postgres).
  for (const r of rows) {
    r.marca = normalizeMarcaRaw(r.marca) ?? r.marca
    if (r.duracao_min != null) r.duracao_min = Number(r.duracao_min)
  }
  return rows
}

export function useReunioesCloser(): { data: ReuniaoRow[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<ReuniaoRow[]>(() => lerCache<ReuniaoRow[]>(CHAVE)?.valor ?? [])
  const [loading, setLoading] = useState(() => !lerCache(CHAVE))
  const [error, setError] = useState<string | null>(null)
  const montado = useRef(true)

  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    try {
      const rows = await carregarComCache(CHAVE, fetchAll)
      if (!montado.current) return
      setData(rows)
      setError(null)
    } catch (e) {
      if (!montado.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (montado.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    montado.current = true
    const emCache = lerCache<ReuniaoRow[]>(CHAVE)
    if (!emCache) void load(true)
    else if (Date.now() - emCache.atualizadoEm > IDADE_REVALIDAR_MS) void load(false)

    const onRefresh = () => void load(false)
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => void load(false), 300_000)
    return () => {
      montado.current = false
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [load])

  return { data, loading, error }
}
