import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { AtribuicaoRow, ResultadoAtribuicao } from '@/lib/distribuicao/regras'

// Log de atribuições paginado NO BANCO: só a página visível é carregada, com a contagem total
// dos filtros (count exact). Ordem total (recebido_em, id) pra páginas não se sobreporem.

export const TAMANHOS_PAGINA = [10, 25, 50, 100] as const

export interface FiltrosLog {
  marca: string
  resultado: ResultadoAtribuicao | ''
  sdr: string
  busca: string
}

/** Busca livre vira um OR do PostgREST; vírgula e parênteses quebram a sintaxe, então saem. */
export function termoBusca(q: string): string {
  return q.trim().replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function useLogAtribuicoes(filtros: FiltrosLog, pagina: number, tamanho: number) {
  const [linhas, setLinhas] = useState<AtribuicaoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chaveAtiva = useRef('')
  const chave = JSON.stringify([filtros, pagina, tamanho])

  const carregar = useCallback(async (mostrarLoading: boolean) => {
    chaveAtiva.current = chave
    if (mostrarLoading) setLoading(true)
    let q = supabaseVendas.from('vw_distribuicao_atribuicoes').select('*', { count: 'exact' })
    if (filtros.marca) q = q.eq('marca', filtros.marca)
    if (filtros.resultado) q = q.eq('resultado', filtros.resultado)
    if (filtros.sdr) q = q.eq('nome_sdr', filtros.sdr)
    const t = termoBusca(filtros.busca)
    if (t) q = q.or(`lead_email.ilike.*${t}*,lead_nome.ilike.*${t}*,id_deal.eq.${t}`)
    const de = pagina * tamanho
    const { data, error: err, count } = await q
      .order('recebido_em', { ascending: false }).order('id', { ascending: false })
      .range(de, de + tamanho - 1)
    if (chaveAtiva.current !== chave) return // resposta de um filtro antigo
    setError(err?.message ?? null)
    if (!err) { setLinhas((data ?? []) as AtribuicaoRow[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregar(true).catch(() => {})
    const timer = setInterval(() => { carregar(false).catch(() => {}) }, 60_000)
    const onRefresh = () => { carregar(false).catch(() => {}) }
    window.addEventListener('dashboard:refresh', onRefresh)
    return () => { clearInterval(timer); window.removeEventListener('dashboard:refresh', onRefresh) }
  }, [carregar])

  return { linhas, total, loading, error, refetch: () => carregar(false) }
}
