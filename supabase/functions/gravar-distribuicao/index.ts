// supabase/functions/gravar-distribuicao/index.ts
// Único caminho de ESCRITA da configuração da distribuição de leads. Mesmo molde de gravar-meta:
// valida a sessão do usuário no Supabase de Marketing (onde vive o login) e exige a permissão
// `acao.distribuicao-editar` via tem_permissao — checagem no servidor, não só no botão.
//
// Ações (POST, Authorization: Bearer <access_token do Marketing>):
//   { acao: 'publicar_regra', regra: {...}, motivo }   → rpc distribuicao_publicar_regra
//   { acao: 'disponibilidade', ...p }                   → rpc distribuicao_alterar_disponibilidade
//   { acao: 'reprocessar', id }                         → distribuir-lead?reprocessar=<id> (chave do Vault)
import { createClient } from 'jsr:@supabase/supabase-js@2'

type Payload =
  | { acao: 'publicar_regra'; regra: Record<string, unknown>; motivo?: string }
  | { acao: 'disponibilidade'; subacao: 'fora_agora' | 'voltou' | 'agendar' | 'cancelar'; nome_sdr?: string; inicio?: string; fim?: string; motivo?: string; id?: number }
  | { acao: 'reprocessar'; id: number }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function validarSessao(
  admin: ReturnType<typeof createClient>, token: string,
): Promise<{ ok: boolean; email?: string; podeEditar?: boolean }> {
  const { data: marketingUrl } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_url' })
  const { data: marketingAnonKey } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_anon_key' })
  if (!marketingUrl || !marketingAnonKey) return { ok: false }

  const resp = await fetch(`${marketingUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string },
  })
  if (!resp.ok) return { ok: false }
  const user = await resp.json()

  const perm = await fetch(`${marketingUrl}/rest/v1/rpc/tem_permissao`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave: 'acao.distribuicao-editar' }),
  })
  const podeEditar = perm.ok && (await perm.json().catch(() => false)) === true
  return { ok: true, email: user.email, podeEditar }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return respond({ error: 'sem sessão' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { ok, email, podeEditar } = await validarSessao(admin, token)
  if (!ok) return respond({ error: 'sessão inválida' }, 401)
  if (!podeEditar) return respond({ error: 'Seu acesso não permite configurar a distribuição de leads.' }, 403)
  const autor = email ?? 'desconhecido'

  let payload: Payload
  try { payload = (await req.json()) as Payload } catch { return respond({ error: 'JSON inválido' }, 400) }

  if (payload.acao === 'publicar_regra') {
    if (!payload.regra || typeof payload.regra !== 'object') return respond({ error: 'regra obrigatória' }, 400)
    const p = { ...payload.regra, motivo: payload.motivo ?? payload.regra.motivo ?? null }
    const { data, error } = await admin.rpc('distribuicao_publicar_regra', { p, p_autor: autor })
    if (error) return respond({ error: error.message }, 400)
    return respond({ ok: true, ...(data as Record<string, unknown>) }, 200)
  }

  if (payload.acao === 'disponibilidade') {
    const p = { acao: payload.subacao, nome_sdr: payload.nome_sdr, inicio: payload.inicio, fim: payload.fim, motivo: payload.motivo, id: payload.id }
    const { data, error } = await admin.rpc('distribuicao_alterar_disponibilidade', { p, p_autor: autor })
    if (error) return respond({ error: error.message }, 400)
    return respond({ ok: true, ...(data as Record<string, unknown>) }, 200)
  }

  if (payload.acao === 'reprocessar') {
    if (!Number.isInteger(payload.id) || payload.id <= 0) return respond({ error: 'id inválido' }, 400)
    const { data: chave } = await admin.rpc('get_secret', { secret_name: 'distribuicao_webhook_chave' })
    if (!chave) return respond({ error: 'chave do webhook ausente no Vault' }, 500)
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/distribuir-lead?chave=${encodeURIComponent(chave as string)}&reprocessar=${payload.id}&autor=${encodeURIComponent(autor)}`
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60_000) })
    const j = await r.json().catch(() => ({}))
    return respond(j, r.ok ? 200 : r.status)
  }

  return respond({ error: 'ação desconhecida' }, 400)
})
