import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { marcasDoBloqueio, type BloqueioLogRow, type BloqueioRow, type MarcaBloqueio } from '@/lib/distribuicao/bloqueio'

// Leitura da aba Bloqueio de Leads. Só views (supabaseVendas é anon; as tabelas têm RLS sem
// policy). Escrita é só pela Edge Function gravar-bloqueio-lead (useGravarBloqueio).

export interface DadosBloqueios {
  bloqueios: BloqueioRow[]
  log: BloqueioLogRow[]
  /** Marcas que dá pra escolher (regras vigentes, sem as de teste). */
  marcas: MarcaBloqueio[]
}

const VAZIO: DadosBloqueios = { bloqueios: [], log: [], marcas: [] }
/** O histórico geral mostra as ações mais recentes; o de cada lead vem completo no painel do lead. */
export const LIMITE_LOG = 500

async function buscar(): Promise<{ dados: DadosBloqueios; error: string | null }> {
  const [bloqueios, log, regras] = await Promise.all([
    supabaseVendas.from('vw_distribuicao_bloqueios').select('*').order('atualizado_em', { ascending: false }).order('email'),
    supabaseVendas.from('vw_distribuicao_bloqueio_log').select('*').order('em', { ascending: false }).order('id', { ascending: false }).limit(LIMITE_LOG),
    supabaseVendas.from('vw_distribuicao_regras').select('marca, marca_rd, vigente_ate').is('vigente_ate', null),
  ])
  const erro = [bloqueios, log, regras].find(r => r.error)?.error?.message ?? null
  if (erro) return { dados: VAZIO, error: erro }
  return {
    dados: {
      bloqueios: (bloqueios.data ?? []) as BloqueioRow[],
      log: (log.data ?? []) as BloqueioLogRow[],
      marcas: marcasDoBloqueio((regras.data ?? []) as Array<{ marca: string; marca_rd: string; vigente_ate: string | null }>),
    },
    error: null,
  }
}

export function useBloqueios() {
  const [dados, setDados] = useState<DadosBloqueios>(VAZIO)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const r = await buscar()
    setError(r.error)
    if (!r.error) setDados(r.dados)
    setLoading(false)
  }, [])

  useEffect(() => {
    let vivo = true
    const carregar = () => { if (vivo) refetch().catch(() => {}) }
    carregar()
    window.addEventListener('dashboard:refresh', carregar)
    const timer = setInterval(carregar, 60_000)
    return () => { vivo = false; clearInterval(timer); window.removeEventListener('dashboard:refresh', carregar) }
  }, [refetch])

  return { ...dados, loading, error, refetch }
}
