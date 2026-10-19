import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import type { ModoRegra, PessoaPeso, TarefaRegra } from '@/lib/distribuicao/regras'

// Escrita da configuração da distribuição de leads: tudo passa pela Edge Function
// gravar-distribuicao (Expansão), que valida a sessão e a permissão acao.distribuicao-editar
// no Marketing antes de chamar as RPCs. A chave anon nunca escreve nada.
const GRAVAR_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-distribuicao`

type Resposta = { ok: boolean; error: string | null; data: Record<string, unknown> | null }

async function chamar(body: Record<string, unknown>): Promise<Resposta> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa', data: null }
  const resp = await fetch(GRAVAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await resp.json().catch(() => null)
  if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}`, data: null }
  return { ok: true, error: null, data: json }
}

export interface RegraInput {
  marca: string
  marca_rd: string
  modo: ModoRegra
  evento_identificador: string
  id_funil: string
  id_etapa: string
  campaign_id: string | null
  barreira_campo: string | null
  barreira_valores_barrados: string[]
  responsavel_padrao_user_id: string
  nome_formato: string | null
  campos_extra: Record<string, string>
  time_proprio: PessoaPeso[] | null
  conversao_cof: string | null
  nota_deal: string | null
  tarefa: TarefaRegra | null
}

/** Publica a PRÓXIMA versão da regra da marca (a vigente é encerrada). Motivo obrigatório a partir da v2. */
export async function publicarRegra(regra: RegraInput, motivo: string): Promise<{ ok: boolean; error: string | null; versao: number | null }> {
  const r = await chamar({ acao: 'publicar_regra', regra, motivo })
  return { ok: r.ok, error: r.error, versao: typeof r.data?.versao === 'number' ? r.data.versao : null }
}

export type DisponibilidadeInput =
  | { subacao: 'fora_agora'; nome_sdr: string; motivo?: string }
  | { subacao: 'voltou'; nome_sdr: string }
  | { subacao: 'agendar'; nome_sdr: string; inicio: string; fim: string; motivo?: string }
  | { subacao: 'cancelar'; id: number }

export async function alterarDisponibilidade(input: DisponibilidadeInput): Promise<{ ok: boolean; error: string | null }> {
  const r = await chamar({ acao: 'disponibilidade', ...input })
  return { ok: r.ok, error: r.error }
}

/** Reenvia ao RD um registro em erro (mesmo SDR, mesmo deal pronto). */
export async function reprocessar(id: number): Promise<{ ok: boolean; error: string | null; idDeal: string | null }> {
  const r = await chamar({ acao: 'reprocessar', id })
  const ok = r.ok && r.data?.ok !== false
  return { ok, error: r.error ?? (ok ? null : String(r.data?.erro ?? 'falhou')), idDeal: typeof r.data?.id_deal === 'string' ? r.data.id_deal : null }
}
