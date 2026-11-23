import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import type { AcaoBloqueio } from '@/lib/distribuicao/bloqueio'

// Escrita da lista de bloqueio: tudo passa pela Edge Function gravar-bloqueio-lead (Expansão), que
// valida a sessão e a permissão aba.bloqueio-leads no Marketing antes de chamar a RPC. A chave anon
// nunca escreve nada.
const GRAVAR_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-bloqueio-lead`

export interface SalvarBloqueioInput {
  email: string
  /** Todas as marcas em que o e-mail fica bloqueado. [] = desbloquear. */
  marcas: string[]
  motivo: string
}

export async function salvarBloqueio(input: SalvarBloqueioInput): Promise<{ ok: boolean; error: string | null; acao: AcaoBloqueio | null }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa', acao: null }
  try {
    const resp = await fetch(GRAVAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}`, acao: null }
    return { ok: true, error: null, acao: (json?.acao ?? null) as AcaoBloqueio | null }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'falha de rede', acao: null }
  }
}
