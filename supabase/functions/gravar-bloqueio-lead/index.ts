// supabase/functions/gravar-bloqueio-lead/index.ts
// Único caminho de ESCRITA da lista de bloqueio de leads (aba Bloqueio de Leads). Mesmo molde de
// gravar-distribuicao: valida a sessão do usuário no Supabase de Marketing (onde vive o login) e
// exige a ação `acao.bloqueio-leads-editar` via tem_permissao (quem só tem a aba vê a lista, mas não
// grava). Também confere minhas_permissoes(): conta ativa e sem limite de marca (mesma regra
// de pode() no front). A regra fica no banco (distribuicao_bloqueio_salvar); o autor é o e-mail do login.
// Spec: docs/superpowers/specs/2026-11-23-bloqueio-de-leads-design.md
//
// POST { email, marcas: string[], marcas_antes: string[], motivo }  (Authorization: Bearer <access_token do Marketing>)
//   marcas = todas as marcas em que o e-mail fica bloqueado; [] = desbloquear.
//   marcas_antes = o que a tela mostrava; se o bloqueio mudou nesse meio-tempo, o banco recusa.
//   → 200 { ok, email, acao: 'bloqueio' | 'alteracao' | 'desbloqueio', marcas, log_id }
//   → 400 { error } (validação do banco: e-mail inválido, marca desconhecida, motivo, nada mudou)
// Publicada com verify_jwt desligado: o token é do Marketing, não deste projeto.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { acessoPermiteBloquear, lerEntrada } from './entrada.ts'

// Ação à parte da aba: quem só tem aba.bloqueio-leads vê a lista, mas não grava.
const PERMISSAO = 'acao.bloqueio-leads-editar'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function validarSessao(
  admin: ReturnType<typeof createClient>, token: string,
): Promise<{ ok: boolean; email?: string; pode?: boolean }> {
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
    body: JSON.stringify({ chave: PERMISSAO }),
  })
  const temPermissao = perm.ok && (await perm.json().catch(() => false)) === true

  const minhas = await fetch(`${marketingUrl}/rest/v1/rpc/minhas_permissoes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string, 'Content-Type': 'application/json' },
    body: '{}',
  })
  // Falha ao conferir = sem acesso.
  const semLimite = minhas.ok && acessoPermiteBloquear(await minhas.json().catch(() => null))
  return { ok: true, email: user.email, pode: temPermissao && semLimite }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return respond({ error: 'sem sessão' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { ok, email, pode } = await validarSessao(admin, token)
  if (!ok || !email) return respond({ error: 'sessão inválida' }, 401)
  if (!pode) return respond({ error: 'Seu acesso permite ver a lista, mas não bloquear leads.' }, 403)

  let body: unknown
  try { body = await req.json() } catch { return respond({ error: 'JSON inválido' }, 400) }
  const entrada = lerEntrada(body)
  if (!entrada.ok) return respond({ error: entrada.erro }, 400)

  const { data, error } = await admin.rpc('distribuicao_bloqueio_salvar', {
    p_email: entrada.email, p_marcas: entrada.marcas, p_motivo: entrada.motivo, p_autor: email, p_marcas_antes: entrada.marcasAntes,
  })
  // 409 quando o bloqueio mudou desde que a tela abriu (errcode 40001): a tela recarrega a lista.
  if (error) return respond({ error: error.message }, error.code === '40001' ? 409 : 400)
  return respond({ ok: true, ...(data as Record<string, unknown>) }, 200)
})
