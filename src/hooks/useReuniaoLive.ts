import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import type { ReuniaoLiveRow } from '@/lib/reunioesLive'

/**
 * Lê `vw_reuniao_live` (Supabase de Expansão): cada negócio de LIVE (R1 em
 * grupo) ligado à gravação do MeetRox que foi a R1 dele. Base da linha
 * "em N reuniões · M de LIVE" ao lado do Diagnóstico (ver `resumirReunioes`).
 *
 * Tabela pequena (dezenas de linhas por mês), lida inteira, mesmo desenho de
 * `useReunioesCloser`. Fica fora do `dash_*` de propósito: o MeetRox sincroniza
 * a cada 5 min e não deve virar dependência do `dash_sincronizar`.
 *
 * `pronto` = carregou ao menos uma vez sem erro. Antes disso a tela não mostra
 * a linha: sem a view, todo negócio LIVE viraria "LIVE estimada".
 */

const CHAVE = 'vw_reuniao_live'

const COLS = [
  'id_deal', 'ciclo', 'tipo_r1', 'data_diagnostico', 'call_id', 'call_timestamp',
  'closer', 'titulo', 'url', 'convidados_externos',
].join(',')

const IDADE_REVALIDAR_MS = 60_000

async function fetchAll(): Promise<ReuniaoLiveRow[]> {
  const { rows, error } = await buscarTodasPaginas<ReuniaoLiveRow>(async (de, ate, contar) => {
    const { data, error: err, count } = await supabaseVendas
      .from('vw_reuniao_live')
      .select(COLS, contar ? { count: 'exact' } : undefined)
      // (id_deal, ciclo) é a chave: ordem total, sem linha repetida/pulada entre páginas.
      .order('id_deal', { ascending: true })
      .order('ciclo', { ascending: true })
      .range(de, ate)
    return { rows: (data ?? []) as unknown as ReuniaoLiveRow[], error: err?.message ?? null, total: count }
  }, { tamanhoPagina: 1000, concorrencia: 2 })

  if (error) throw new Error(error)
  for (const r of rows) {
    r.ciclo = Number(r.ciclo)
    if (r.call_id != null) r.call_id = Number(r.call_id)
  }
  return rows
}

export function useReuniaoLive(): { data: ReuniaoLiveRow[]; pronto: boolean; error: string | null } {
  const [data, setData] = useState<ReuniaoLiveRow[]>(() => lerCache<ReuniaoLiveRow[]>(CHAVE)?.valor ?? [])
  const [pronto, setPronto] = useState(() => !!lerCache(CHAVE))
  const [error, setError] = useState<string | null>(null)
  const montado = useRef(true)

  const load = useCallback(async () => {
    try {
      const rows = await carregarComCache(CHAVE, fetchAll)
      if (!montado.current) return
      setData(rows)
      setPronto(true)
      setError(null)
    } catch (e) {
      if (!montado.current) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    montado.current = true
    const emCache = lerCache<ReuniaoLiveRow[]>(CHAVE)
    if (!emCache || Date.now() - emCache.atualizadoEm > IDADE_REVALIDAR_MS) void load()

    const onRefresh = () => void load()
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => void load(), 300_000)
    return () => {
      montado.current = false
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [load])

  return { data, pronto, error }
}
