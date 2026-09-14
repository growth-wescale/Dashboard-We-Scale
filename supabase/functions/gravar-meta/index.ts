// supabase/functions/gravar-meta/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Duas ações. Cada uma é UMA função SQL (uma transação só — ou grava tudo, ou nada):
//  - publicar: cria a próxima versão do mês (V1, V2…) com tudo que o Hub montou.
//    Versão publicada nunca muda: triggers no banco bloqueiam UPDATE/DELETE.
//  - ativar:   escolhe qual versão o dashboard usa. Regrava DB_Metas_Performance
//    (o espelho que todas as telas leem) a partir das linhas CONGELADAS da versão —
//    reativar a V1 devolve exatamente os números da V1, mesmo que o motor mude.
type Payload =
  | {
    acao: 'publicar'
    mesReferencia: string
    diaViradaSemana: string
    semanas: unknown[]
    marcas: unknown[]
    distribuicaoSemanal: unknown[]
    linhasEspelho: unknown[]
    rotulo?: string
    motivo?: string
    ativar?: boolean
  }
  | { acao: 'ativar'; versaoId: number }

// CORS: a chamada vem do navegador (origem do dashboard), com Authorization
// customizado e cross-origin — o browser manda um preflight OPTIONS antes do
// POST real. Sem esses headers em TODA resposta (inclusive erro), o preflight
// falha e o POST nunca sai (causa documentada da Supabase pra esse exato caso).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function validarSessao(
  admin: ReturnType<typeof createClient>, token: string,
): Promise<{ ok: boolean; email?: string; podePublicar?: boolean }> {
  const { data: marketingUrl } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_url' })
  const { data: marketingAnonKey } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_anon_key' })
  if (!marketingUrl || !marketingAnonKey) return { ok: false }

  const resp = await fetch(`${marketingUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string },
  })
  if (!resp.ok) return { ok: false }
  const user = await resp.json()

  // Permissão vem do controle de acessos, no mesmo Supabase do login (Marketing).
  // Qualquer falha na consulta = sem permissão.
  const perm = await fetch(`${marketingUrl}/rest/v1/rpc/tem_permissao`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave: 'acao.metas-publicar' }),
  })
  const podePublicar = perm.ok && (await perm.json().catch(() => false)) === true
  return { ok: true, email: user.email, podePublicar }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return respond({ error: 'sem sessão' }, 401)

  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pela
  // plataforma pro projeto Expansão (o mesmo onde esta função é implantada).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { ok, email, podePublicar } = await validarSessao(admin, token)
  if (!ok) return respond({ error: 'sessão inválida' }, 401)
  if (!podePublicar) return respond({ error: 'Seu acesso não permite publicar ou ativar metas.' }, 403)

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return respond({ error: 'JSON inválido' }, 400)
  }

  if (payload.acao === 'ativar') {
    if (typeof payload.versaoId !== 'number') return respond({ error: 'versaoId obrigatório' }, 400)
    const { error } = await admin.rpc('ativar_meta_versao', { p_versao_id: payload.versaoId, p_autor: email ?? null })
    if (error) return respond({ error: error.message }, 500)
    return respond({ ok: true }, 200)
  }

  if (payload.acao === 'publicar') {
    if (!/^\d{4}-\d{2}-01$/.test(payload.mesReferencia ?? '')) return respond({ error: 'mesReferencia inválido' }, 400)
    const { data, error } = await admin.rpc('publicar_meta_versao', {
      p: payload, p_autor: email ?? null, p_ativar: payload.ativar !== false,
    })
    if (error) return respond({ error: error.message }, 500)
    return respond({ ok: true, ...(data as Record<string, unknown>) }, 200)
  }

  return respond({ error: 'ação desconhecida' }, 400)
})
