import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import { supabaseVendas } from '@/lib/supabaseVendas'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import { montarVersoes, type RepasseLinha, type VersaoRepasse } from '@/lib/repasse'

/**
 * Versões do repasse da taxa de franquia (`vw_repasse_taxa`, Supabase de Expansão).
 * Tabela minúscula (marcas × versões); carregada uma vez e compartilhada entre as
 * abas pelo mesmo cache dos outros hooks de Vendas.
 */
const CHAVE = 'vw_repasse_taxa'

async function buscar(): Promise<VersaoRepasse[]> {
  const { data, error } = await supabaseVendas
    .from('vw_repasse_taxa')
    .select('versao_id, numero, vigente_desde, motivo, criado_por, criado_em, marca, pct_we_scale')
    .order('numero', { ascending: true })
    .order('marca', { ascending: true })
  if (error) throw new Error(error.message)
  return montarVersoes((data ?? []) as RepasseLinha[])
}

export function useRepasseTaxas(): { versoes: VersaoRepasse[]; loading: boolean; error: string | null; reload: () => void } {
  const [versoes, setVersoes] = useState<VersaoRepasse[]>(() => lerCache<VersaoRepasse[]>(CHAVE)?.valor ?? [])
  const [loading, setLoading] = useState(() => !lerCache(CHAVE))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setVersoes(await carregarComCache(CHAVE, buscar))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener('dashboard:refresh', onRefresh)
    return () => window.removeEventListener('dashboard:refresh', onRefresh)
  }, [load])

  return { versoes, loading, error, reload: () => void load() }
}

const GRAVAR_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-repasse`

/**
 * Publica a próxima versão. Passa pela Edge Function gravar-repasse, que valida a
 * sessão e a permissão acao.repasse-editar no Marketing — a chave anon não escreve.
 */
export async function publicarRepasse(input: {
  vigenteDesde: string
  motivo: string
  marcas: { marca: string; pctWeScale: number }[]
}): Promise<{ ok: boolean; error: string | null; numero: number | null }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa', numero: null }
  const resp = await fetch(GRAVAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ acao: 'publicar', ...input }),
  })
  const json = await resp.json().catch(() => null)
  if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}`, numero: null }
  return { ok: true, error: null, numero: typeof json?.numero === 'number' ? json.numero : null }
}
