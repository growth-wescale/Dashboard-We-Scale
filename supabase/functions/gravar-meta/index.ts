// supabase/functions/gravar-meta/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface Payload {
  acao: 'salvar_rascunho' | 'publicar'
  mesReferencia: string
  diaViradaSemana: string
  semanas: Array<{ numero: number; inicio: string; fim: string }>
  marcas: Array<{
    marca: string
    ticketMedio: number
    etapas: Array<{
      etapa: string
      modo: 'fixo' | 'derivado' | 'desligado'
      valorFixo?: number
      etapaOrigem?: string
      taxa?: number
      taxaOrigem?: 'mes_anterior' | 'historico_crm' | 'manual'
    }>
    pessoas: Array<{ nome: string; funcao: 'SDR' | 'Closer'; peso: number }>
  }>
  distribuicaoSemanal: Array<{ nomePessoa: string; semanaNumero: number; etapa: string; valor: number }>
  linhasEspelho: Array<Record<string, unknown>>
  autor: string | null
}

async function validarSessao(
  admin: ReturnType<typeof createClient>, token: string,
): Promise<{ ok: boolean; email?: string }> {
  const { data: marketingUrl } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_url' })
  const { data: marketingAnonKey } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_anon_key' })
  if (!marketingUrl || !marketingAnonKey) return { ok: false }

  const resp = await fetch(`${marketingUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string },
  })
  if (!resp.ok) return { ok: false }
  const user = await resp.json()
  return { ok: true, email: user.email }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return new Response(JSON.stringify({ error: 'sem sessão' }), { status: 401 })

  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pela
  // plataforma pro projeto Expansão (o mesmo onde esta função é implantada) —
  // nenhum Vault aqui, mesmo padrão comprovado no espelhar-rd (index.ts,
  // Deno.serve). Vault entra só pro que NÃO é auto-injetado (§ acima).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { ok, email } = await validarSessao(admin, token)
  if (!ok) return new Response(JSON.stringify({ error: 'sessão inválida' }), { status: 401 })

  const payload = (await req.json()) as Payload

  const { error: erroMes } = await admin.from('meta_mes').upsert({
    mes_referencia: payload.mesReferencia,
    dia_virada_semana: payload.diaViradaSemana,
    status: payload.acao === 'publicar' ? 'publicado' : 'rascunho',
    publicado_em: payload.acao === 'publicar' ? new Date().toISOString() : null,
    publicado_por: payload.acao === 'publicar' ? email : null,
  }, { onConflict: 'mes_referencia' })
  if (erroMes) return new Response(JSON.stringify({ error: erroMes.message }), { status: 500 })

  // Semanas: apaga e reinsere (o gerente pode ter mudado o dia de virada no meio da montagem).
  await admin.from('meta_semana').delete().eq('mes_referencia', payload.mesReferencia)
  if (payload.semanas.length > 0) {
    const { error: erroSemanas } = await admin.from('meta_semana').insert(
      payload.semanas.map(s => ({ mes_referencia: payload.mesReferencia, numero: s.numero, data_inicio: s.inicio, data_fim: s.fim })),
    )
    if (erroSemanas) return new Response(JSON.stringify({ error: erroSemanas.message }), { status: 500 })
  }

  for (const m of payload.marcas) {
    const { data: marcaRow, error: erroMarca } = await admin
      .from('meta_marca')
      .upsert({ mes_referencia: payload.mesReferencia, marca: m.marca, ticket_medio: m.ticketMedio }, { onConflict: 'mes_referencia,marca' })
      .select('id')
      .single()
    if (erroMarca || !marcaRow) return new Response(JSON.stringify({ error: erroMarca?.message ?? 'falha ao gravar marca' }), { status: 500 })

    await admin.from('meta_marca_etapa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.etapas.length > 0) {
      await admin.from('meta_marca_etapa').insert(
        m.etapas.map(e => ({
          meta_marca_id: marcaRow.id, etapa: e.etapa, modo: e.modo,
          valor_fixo: e.valorFixo ?? null, etapa_origem: e.etapaOrigem ?? null,
          taxa: e.taxa ?? null, taxa_origem: e.taxaOrigem ?? null,
        })),
      )
    }

    await admin.from('meta_pessoa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.pessoas.length > 0) {
      await admin.from('meta_pessoa').insert(
        m.pessoas.map(p => ({ meta_marca_id: marcaRow.id, nome: p.nome, funcao: p.funcao, peso: p.peso })),
      )
    }
  }

  if (payload.acao === 'publicar' && payload.linhasEspelho.length > 0) {
    await admin.from('DB_Metas_Performance').delete().eq('mes_referencia', payload.mesReferencia)
    const { error: erroEspelho } = await admin.from('DB_Metas_Performance').insert(payload.linhasEspelho)
    if (erroEspelho) return new Response(JSON.stringify({ error: erroEspelho.message }), { status: 500 })
  }

  await admin.from('meta_log').insert({
    mes_referencia: payload.mesReferencia,
    entidade: 'meta_mes',
    entidade_ref: payload.mesReferencia,
    campo: 'status',
    valor_anterior: null,
    valor_novo: payload.acao === 'publicar' ? 'publicado' : 'rascunho',
    autor: email ?? null,
  })

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
