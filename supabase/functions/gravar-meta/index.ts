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
  distribuicaoSemanal: Array<{ marca: string; nomePessoa: string; semanaNumero: number; etapa: string; valor: number }>
  linhasEspelho: Array<Record<string, unknown>>
  autor: string | null
}

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

// Mesma partição de PassoDistribuicaoSemanal.tsx (ETAPAS_DISTRIBUIVEIS): 'Ligações'
// e 'Reunião Agendada SQL' são etapas de SDR; 'Oportunidade COF' e 'Fechamento' são
// de Closer. Uma pessoa pode ter as duas linhas em meta_pessoa pra mesma marca
// (UNIQUE (meta_marca_id, nome, funcao) permite — ex.: "Vanessa Daniel", cargo
// SDR/Closer em nome_cargo_foto), então casar só por nome não basta: a etapa diz
// qual das duas linhas é a certa.
function funcaoDaEtapa(etapa: string): 'SDR' | 'Closer' | null {
  if (etapa === 'Ligações' || etapa === 'Reunião Agendada SQL') return 'SDR'
  if (etapa === 'Oportunidade COF' || etapa === 'Fechamento') return 'Closer'
  return null
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return respond({ error: 'sem sessão' }, 401)

  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pela
  // plataforma pro projeto Expansão (o mesmo onde esta função é implantada) —
  // nenhum Vault aqui, mesmo padrão comprovado no espelhar-rd (index.ts,
  // Deno.serve). Vault entra só pro que NÃO é auto-injetado (§ acima).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { ok, email } = await validarSessao(admin, token)
  if (!ok) return respond({ error: 'sessão inválida' }, 401)

  const payload = (await req.json()) as Payload

  const { error: erroMes } = await admin.from('meta_mes').upsert({
    mes_referencia: payload.mesReferencia,
    dia_virada_semana: payload.diaViradaSemana,
    status: payload.acao === 'publicar' ? 'publicado' : 'rascunho',
    publicado_em: payload.acao === 'publicar' ? new Date().toISOString() : null,
    publicado_por: payload.acao === 'publicar' ? email : null,
  }, { onConflict: 'mes_referencia' })
  if (erroMes) return respond({ error: erroMes.message }, 500)

  // Semanas: apaga e reinsere (o gerente pode ter mudado o dia de virada no meio da montagem).
  await admin.from('meta_semana').delete().eq('mes_referencia', payload.mesReferencia)
  const semanaIdPorNumero = new Map<number, number>()
  if (payload.semanas.length > 0) {
    const { data: semanasInseridas, error: erroSemanas } = await admin.from('meta_semana').insert(
      payload.semanas.map(s => ({ mes_referencia: payload.mesReferencia, numero: s.numero, data_inicio: s.inicio, data_fim: s.fim })),
    ).select('id, numero')
    if (erroSemanas) return respond({ error: erroSemanas.message }, 500)
    for (const s of semanasInseridas ?? []) semanaIdPorNumero.set(s.numero, s.id)
  }

  const pessoaRowsPorMarca = new Map<string, Array<{ id: number; nome: string; funcao: string }>>()

  for (const m of payload.marcas) {
    const { data: marcaRow, error: erroMarca } = await admin
      .from('meta_marca')
      .upsert({ mes_referencia: payload.mesReferencia, marca: m.marca, ticket_medio: m.ticketMedio }, { onConflict: 'mes_referencia,marca' })
      .select('id')
      .single()
    if (erroMarca || !marcaRow) return respond({ error: erroMarca?.message ?? 'falha ao gravar marca' }, 500)

    await admin.from('meta_marca_etapa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.etapas.length > 0) {
      const { error: erroEtapas } = await admin.from('meta_marca_etapa').insert(
        m.etapas.map(e => ({
          meta_marca_id: marcaRow.id, etapa: e.etapa, modo: e.modo,
          valor_fixo: e.valorFixo ?? null, etapa_origem: e.etapaOrigem ?? null,
          taxa: e.taxa ?? null, taxa_origem: e.taxaOrigem ?? null,
        })),
      )
      if (erroEtapas) return respond({ error: erroEtapas.message }, 500)
    }

    await admin.from('meta_pessoa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.pessoas.length > 0) {
      const { data: pessoasInseridas, error: erroPessoas } = await admin.from('meta_pessoa').insert(
        m.pessoas.map(p => ({ meta_marca_id: marcaRow.id, nome: p.nome, funcao: p.funcao, peso: p.peso })),
      ).select('id, nome, funcao')
      if (erroPessoas) return respond({ error: erroPessoas.message }, 500)
      pessoaRowsPorMarca.set(m.marca, pessoasInseridas ?? [])
    } else {
      pessoaRowsPorMarca.set(m.marca, [])
    }
  }

  if (payload.acao === 'publicar' && payload.linhasEspelho.length > 0) {
    await admin.from('DB_Metas_Performance').delete().eq('mes_referencia', payload.mesReferencia)
    const { error: erroEspelho } = await admin.from('DB_Metas_Performance').insert(payload.linhasEspelho)
    if (erroEspelho) return respond({ error: erroEspelho.message }, 500)
  }

  const linhasDistribuicao: Array<{ meta_pessoa_id: number; meta_semana_id: number; etapa: string; valor: number }> = []
  for (const d of payload.distribuicaoSemanal) {
    const pessoasDaMarca = pessoaRowsPorMarca.get(d.marca) ?? []
    const funcaoEsperada = funcaoDaEtapa(d.etapa)
    const pessoa = pessoasDaMarca.find(p => p.nome === d.nomePessoa && p.funcao === funcaoEsperada)
    const semanaId = semanaIdPorNumero.get(d.semanaNumero)
    if (!pessoa || !semanaId) continue // combinação não encontrada nesta publicação — não deveria acontecer se o payload é interno e consistente; ignorada em vez de falhar a publicação inteira por uma linha órfã
    linhasDistribuicao.push({ meta_pessoa_id: pessoa.id, meta_semana_id: semanaId, etapa: d.etapa, valor: d.valor })
  }
  if (linhasDistribuicao.length > 0) {
    const { error: erroDistrib } = await admin.from('meta_pessoa_semana').insert(linhasDistribuicao)
    if (erroDistrib) return respond({ error: erroDistrib.message }, 500)
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

  return respond({ ok: true }, 200)
})
