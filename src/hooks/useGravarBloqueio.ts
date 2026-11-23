import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import type { AcaoBloqueio } from '@/lib/distribuicao/bloqueio'

// Escrita da lista de bloqueio: tudo passa pela Edge Function gravar-bloqueio-lead (Expansão), que
// valida a sessão e a ação acao.bloqueio-leads-editar no Marketing antes de chamar a RPC. A chave anon
// nunca escreve nada.
const GRAVAR_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-bloqueio-lead`

export interface SalvarBloqueioInput {
  email: string
  /** Todas as marcas em que o e-mail fica bloqueado. [] = desbloquear. */
  marcas: string[]
  /** O que a tela mostrava: se o bloqueio mudou nesse meio-tempo, o banco recusa (conflito). */
  marcasAntes: string[]
  motivo: string
}

export async function salvarBloqueio(input: SalvarBloqueioInput): Promise<{ ok: boolean; error: string | null; acao: AcaoBloqueio | null; conflito: boolean }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa', acao: null, conflito: false }
  try {
    const resp = await fetch(GRAVAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: input.email, marcas: input.marcas, marcas_antes: input.marcasAntes, motivo: input.motivo }),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}`, acao: null, conflito: resp.status === 409 }
    return { ok: true, error: null, acao: (json?.acao ?? null) as AcaoBloqueio | null, conflito: false }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'falha de rede', acao: null, conflito: false }
  }
}
