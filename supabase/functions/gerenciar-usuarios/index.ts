// supabase/functions/gerenciar-usuarios/index.ts — implantada no Supabase de MARKETING
// (onde vive o login). Faz o que o navegador não pode fazer com a chave pública:
//  - convidar:        manda o e-mail de convite (a pessoa cria a própria senha) e grava o papel.
//                     Conta que já existe: só grava o papel e manda link de definir senha.
//  - definir_acesso:  dá papel a uma conta que existe mas nunca teve acesso (sem e-mail).
//  - desativar:       bloqueia o login, derruba as sessões abertas. Não apaga nada.
//  - reativar:        libera o login de novo.
// Troca de papel/marca de quem já tem acesso é direto na tabela (RLS), não passa aqui.
import { createClient } from 'jsr:@supabase/supabase-js@2'

type Payload =
  | { acao: 'convidar'; email: string; papelId: string; marcas?: string[] | null; redirectTo?: string }
  | { acao: 'definir_acesso'; usuarioId: string; papelId: string; marcas?: string[] | null }
  | { acao: 'desativar'; usuarioId: string }
  | { acao: 'reativar'; usuarioId: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BANIDO_PRA_SEMPRE = '876000h' // ~100 anos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return respond({ error: 'sem sessão' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const comoQuemChamou = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: quem, error: quemErr } = await comoQuemChamou.auth.getUser(token)
  if (quemErr || !quem.user) return respond({ error: 'sessão inválida' }, 401)

  const { data: autorizado, error: permErr } = await comoQuemChamou.rpc('tem_permissao', { chave: 'acao.usuarios-gerenciar' })
  if (permErr || autorizado !== true) return respond({ error: 'Você não tem permissão para gerenciar usuários.' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return respond({ error: 'JSON inválido' }, 400)
  }

  // Papel + marcas: papel com acesso total nunca fica limitado a marcas. Lista vazia = todas.
  async function resolverPapel(papelId: string, marcas: unknown) {
    const { data, error } = await admin.from('acesso_papeis').select('id, acesso_total').eq('id', papelId).maybeSingle()
    if (error || !data) return null
    const lista = Array.isArray(marcas)
      ? [...new Set(marcas.filter((m): m is string => typeof m === 'string' && m.trim() !== '').map(m => m.trim()))]
      : []
    return { papelId: data.id as string, marcas: data.acesso_total || lista.length === 0 ? null : lista }
  }

  async function gravarAcesso(usuarioId: string, papelId: string, marcas: string[] | null) {
    const { error } = await admin.from('acesso_usuarios').upsert(
      { user_id: usuarioId, papel_id: papelId, marcas, ativo: true, convidado_por: quem.user!.id },
      { onConflict: 'user_id' },
    )
    if (error) return error.message
    const { error: banErr } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: 'none' })
    return banErr ? banErr.message : null
  }

  if (payload.acao === 'convidar') {
    const email = (payload.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return respond({ error: 'E-mail inválido.' }, 400)
    const papel = await resolverPapel(payload.papelId, payload.marcas)
    if (!papel) return respond({ error: 'Papel não encontrado.' }, 400)
    const redirectTo = typeof payload.redirectTo === 'string' && /^https?:\/\//.test(payload.redirectTo) ? payload.redirectTo : undefined

    const { data: convite, error: conviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    let usuarioId = convite?.user?.id ?? null
    let jaExistia = false

    if (conviteErr || !usuarioId) {
      // Conta já existe: acha pelo e-mail, grava o acesso e manda link pra (re)definir senha.
      let pagina = 1
      while (!usuarioId) {
        const { data: lista, error: listaErr } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
        if (listaErr) return respond({ error: listaErr.message }, 500)
        usuarioId = lista.users.find(u => (u.email ?? '').toLowerCase() === email)?.id ?? null
        if (lista.users.length < 1000) break
        pagina += 1
      }
      if (!usuarioId) return respond({ error: conviteErr?.message ?? 'Não foi possível convidar.' }, 500)
      jaExistia = true
      const publico = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      await publico.auth.resetPasswordForEmail(email, { redirectTo })
    }

    const erro = await gravarAcesso(usuarioId, papel.papelId, papel.marcas)
    if (erro) return respond({ error: erro }, 400)
    return respond({ ok: true, usuarioId, jaExistia }, 200)
  }

  if (payload.acao === 'definir_acesso') {
    const papel = await resolverPapel(payload.papelId, payload.marcas)
    if (!papel) return respond({ error: 'Papel não encontrado.' }, 400)
    const erro = await gravarAcesso(payload.usuarioId, papel.papelId, papel.marcas)
    if (erro) return respond({ error: erro }, 400)
    return respond({ ok: true }, 200)
  }

  if (payload.acao === 'desativar') {
    if (payload.usuarioId === quem.user.id) return respond({ error: 'Você não pode desativar a si mesmo.' }, 400)
    // Banco primeiro: a trava de "último administrador" pode recusar.
    const { data: linhas, error } = await admin.from('acesso_usuarios').update({ ativo: false }).eq('user_id', payload.usuarioId).select('user_id')
    if (error) return respond({ error: error.message }, 400)
    if (!linhas || linhas.length === 0) return respond({ error: 'Essa conta não tem acesso para desativar.' }, 404)
    const { error: banErr } = await admin.auth.admin.updateUserById(payload.usuarioId, { ban_duration: BANIDO_PRA_SEMPRE })
    if (banErr) return respond({ error: banErr.message }, 500)
    await admin.rpc('acesso_encerrar_sessoes', { alvo: payload.usuarioId })
    return respond({ ok: true }, 200)
  }

  if (payload.acao === 'reativar') {
    const { data: linhas, error } = await admin.from('acesso_usuarios').update({ ativo: true }).eq('user_id', payload.usuarioId).select('user_id')
    if (error) return respond({ error: error.message }, 400)
    if (!linhas || linhas.length === 0) return respond({ error: 'Essa conta não tem acesso para reativar.' }, 404)
    const { error: banErr } = await admin.auth.admin.updateUserById(payload.usuarioId, { ban_duration: 'none' })
    if (banErr) return respond({ error: banErr.message }, 500)
    return respond({ ok: true }, 200)
  }

  return respond({ error: 'ação desconhecida' }, 400)
})
