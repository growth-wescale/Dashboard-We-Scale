// supabase/functions/gravar-repasse/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Publica uma versão nova do repasse da taxa de franquia (quanto fica com a We Scale
// e quanto vai pra marca). Uma ação só, uma função SQL só (publicar_repasse_versao):
// grava tudo ou nada. Versão publicada nunca muda — triggers no banco bloqueiam.
// Mesmo esquema de sessão e permissão de gravar-meta: login vive no Supabase de
// Marketing, e a permissão sai de tem_permissao('acao.repasse-editar') de lá.
type Payload = {
  acao: 'publicar'
  vigenteDesde: string
  motivo: string
  marcas: { marca: string; pctWeScale: number }[]
}

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
    body: JSON.stringify({ chave: 'acao.repasse-editar' }),
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
  if (!podeEditar) return respond({ error: 'Seu acesso não permite alterar o repasse das taxas.' }, 403)

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return respond({ error: 'JSON inválido' }, 400)
  }

  if (payload.acao !== 'publicar') return respond({ error: 'ação desconhecida' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.vigenteDesde ?? '')) return respond({ error: 'data de vigência inválida' }, 400)
  if (!Array.isArray(payload.marcas) || payload.marcas.length === 0) return respond({ error: 'informe ao menos uma marca' }, 400)

  const { data, error } = await admin.rpc('publicar_repasse_versao', { p: payload, p_autor: email ?? null })
  if (error) return respond({ error: error.message }, 400)
  return respond({ ok: true, ...(data as Record<string, unknown>) }, 200)
})
