// supabase/functions/distribuir-lead/index.ts
// Recebe o webhook de conversão do RD Marketing e cria o deal no RD CRM com o SDR escolhido
// pelo peso da meta. Spec: docs/superpowers/specs/2026-10-16-distribuicao-leads-sdr-design.md
//
// Fluxo por conversão:
//   1. autentica (?chave= = Vault distribuicao_webhook_chave) e normaliza o payload
//   2. rpc distribuicao_processar(payload): roteia, dedup, barreira, escolhe, grava o registro
//   3. se 'atribuido'/'fallback': POST /deals no RD CRM (rd.ts) → rpc distribuicao_fechar
//   4. erro ou fallback → alerta no Teams; 1 linha em sync_execucao (job distribuir_lead,
//      status 'success' ou 'failure' — a tabela tem CHECK e descarta qualquer outro valor)
// Responde 200 sempre que o registro foi gravado (o RD reenvia quando não recebe 2xx, e
// reenvio viraria 'duplicado' de qualquer jeito). 500 só se nem gravar deu.
//
// ?reprocessar=<id>: refaz só o passo 3 sobre o registro em 'erro' (rpc distribuicao_reabrir).
//
// Formatos aceitos: o da API 2.0 ({event_identifier, contact{...}}) e o legado da tela do RD
// ({leads:[{uuid,email,name,custom_fields{...},last_conversion{content:{identificador}}}]}) — este
// último vira o primeiro, com os campos personalizados achatados em cf_<nome>. Observado em
// 16/10/2026: o webhook criado pela tela manda o legado, inclusive eventos do CRM ("Tarefa
// atualizada no RD Station CRM") como conversão — sem regra vigente, são ignorados sem log.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { criarDealNoRd, type DealPronto } from './rd.ts'

const DASHBOARD_URL = 'https://dashboard.srv1816822.hstgr.cloud/distribuicao-leads'

// deno-lint-ignore no-explicit-any
type Sb = any
type Conversao = { event_identifier: string | null; contact: Record<string, unknown>; event_type?: string; raw: unknown }

const segredos = new Map<string, string>()
async function segredo(sb: Sb, nome: string): Promise<string> {
  const cache = segredos.get(nome)
  if (cache) return cache
  const { data, error } = await sb.rpc('get_secret', { secret_name: nome })
  if (error || !data) throw new Error(`get_secret ${nome}: ${error?.message || 'vazio'}`)
  segredos.set(nome, data as string)
  return data as string
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Aceita o formato da API 2.0 e o legado (leads[]); devolve uma conversão por lead. */
export function normalizarPayloads(body: unknown): Conversao[] {
  // deno-lint-ignore no-explicit-any
  const b = body as any
  if (b && Array.isArray(b.leads)) {
    return b.leads.map((l: Record<string, unknown>) => {
      const contact: Record<string, unknown> = { ...l }
      const cfs = (l.custom_fields ?? {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(cfs)) contact[k.startsWith('cf_') ? k : `cf_${slug(k)}`] = v
      delete contact.custom_fields
      // deno-lint-ignore no-explicit-any
      const lc = (l.last_conversion ?? {}) as any
      const ident = lc?.conversion_identifier ?? lc?.content?.identificador ?? lc?.content?.identifier ?? lc?.identificador ?? lc?.identifier ?? null
      return { event_identifier: ident ? String(ident) : null, contact, event_type: 'WEBHOOK.CONVERTED', raw: l }
    })
  }
  if (b && typeof b === 'object' && ('event_identifier' in b || 'contact' in b)) {
    return [{ event_identifier: b.event_identifier ?? null, contact: (b.contact ?? {}) as Record<string, unknown>, event_type: b.event_type, raw: b }]
  }
  return []
}

async function logar(sb: Sb, iniciadoEm: string, status: string, checkpoint: Record<string, unknown>, erro?: string) {
  try {
    await sb.from('sync_execucao').insert({ job: 'distribuir_lead', iniciado_em: iniciadoEm, terminado_em: new Date().toISOString(), status, erro: erro ?? null, checkpoint })
  } catch (_) { /* log nunca derruba a execução */ }
}

async function alertarTeams(sb: Sb, titulo: string, texto: string) {
  try {
    const url = await segredo(sb, 'teams_alertas_url')
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, texto, link: DASHBOARD_URL }), signal: AbortSignal.timeout(8_000),
    })
  } catch (_) { /* alerta é melhor esforço */ }
}

async function configInt(sb: Sb, chave: string, padrao: number): Promise<number> {
  const { data } = await sb.from('distribuicao_config').select('valor').eq('chave', chave).maybeSingle()
  const n = Number(data?.valor)
  return Number.isFinite(n) && n > 0 ? n : padrao
}

/** Passo 3: POST no RD + fechar o registro + alerta. Devolve o que foi gravado. */
async function criarEFechar(sb: Sb, atribuicaoId: number, marca: string, deal: DealPronto, resultado: string, tentativasAnteriores = 0) {
  const token = await segredo(sb, 'rd_token')
  const tentativas = await configInt(sb, 'retries_rd', 3)
  const r = await criarDealNoRd(token, deal, { tentativas })
  const totalTentativas = tentativasAnteriores + r.tentativas
  await sb.rpc('distribuicao_fechar', { p_id: atribuicaoId, p_id_deal: r.id ?? null, p_erro: r.erro ?? null, p_tentativas: totalTentativas })
  if (r.erro) {
    await alertarTeams(sb, 'Distribuição de leads · erro ao criar deal',
      `${marca} · ${deal.contato.email} · ${r.erro.slice(0, 300)} · registro #${atribuicaoId} (reprocessar no dashboard)`)
  } else if (resultado === 'fallback') {
    await alertarTeams(sb, 'Distribuição de leads · responsável padrão',
      `${marca} · ${deal.contato.email} · nenhum SDR elegível, deal ${r.id} foi para o responsável padrão · registro #${atribuicaoId}`)
  }
  return { id_deal: r.id ?? null, erro: r.erro ?? null, tentativas: totalTentativas }
}

async function processarConversao(sb: Sb, c: Conversao, iniciadoEm: string) {
  const payload = { event_type: c.event_type ?? 'WEBHOOK.CONVERTED', event_identifier: c.event_identifier, contact: c.contact }
  const { data, error } = await sb.rpc('distribuicao_processar', { p_payload: payload })
  if (error) throw new Error(`distribuicao_processar: ${error.message}`)
  // deno-lint-ignore no-explicit-any
  const r = data as any
  const resultado: string = r?.resultado
  if (resultado === 'ignorado') return { resultado, motivo: r?.motivo }
  const base = { marca: r.marca, resultado, atribuicao_id: r.atribuicao_id, motivo: r.motivo, nome_sdr: r.nome_sdr }
  if (resultado !== 'atribuido' && resultado !== 'fallback') {
    await logar(sb, iniciadoEm, 'success', base)
    return base
  }
  const t0 = Date.now()
  const fim = await criarEFechar(sb, r.atribuicao_id, r.marca, r.deal as DealPronto, resultado)
  await logar(sb, iniciadoEm, fim.erro ? 'failure' : 'success', { ...base, ...fim, dt_ms: Date.now() - t0 }, fim.erro ?? undefined)
  return { ...base, ...fim }
}

async function reprocessar(sb: Sb, id: number, autor: string, iniciadoEm: string) {
  const { data, error } = await sb.rpc('distribuicao_reabrir', { p_id: id })
  if (error) return respond({ error: error.message }, 400)
  // deno-lint-ignore no-explicit-any
  const a = data as any
  if (!a?.deal) return respond({ error: 'registro sem deal_pronto' }, 400)
  const fim = await criarEFechar(sb, id, a.marca, a.deal as DealPronto, a.nome_sdr ? 'atribuido' : 'fallback', Number(a.tentativas) || 0)
  await sb.from('distribuicao_atribuicao').update({ reprocessado_em: new Date().toISOString(), reprocessado_por: autor }).eq('id', id)
  await logar(sb, iniciadoEm, fim.erro ? 'failure' : 'success', { reprocessar: id, marca: a.marca, ...fim }, fim.erro ?? undefined)
  return respond({ ok: !fim.erro, ...fim }, 200)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)
  const iniciadoEm = new Date().toISOString()
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  let chaveOk = false
  try { chaveOk = (url.searchParams.get('chave') ?? '') === await segredo(sb, 'distribuicao_webhook_chave') } catch (_) { chaveOk = false }
  if (!chaveOk) return respond({ error: 'não autorizado' }, 401)

  const reproc = url.searchParams.get('reprocessar')
  if (reproc) {
    const id = Number(reproc)
    if (!Number.isInteger(id) || id <= 0) return respond({ error: 'reprocessar inválido' }, 400)
    return await reprocessar(sb, id, url.searchParams.get('autor') ?? 'dashboard', iniciadoEm)
  }

  // O RD valida a URL ao criar o webhook com um POST sem conversão: tem que receber 2xx.
  // Corpo vazio/ilegível ou sem conversão → 200 "ignorado" (logado só quando veio algo).
  const texto = await req.text()
  let body: unknown = null
  try { body = texto ? JSON.parse(texto) : null } catch { body = null }
  const conversoes = normalizarPayloads(body)
  if (conversoes.length === 0) {
    if (texto) await logar(sb, iniciadoEm, 'failure', { motivo: 'payload sem event_identifier/contact nem leads[]', amostra: texto.slice(0, 500) }, 'payload inesperado')
    return respond({ ok: true, resultado: 'ignorado', motivo: 'payload sem conversão' }, 200)
  }

  const resultados: unknown[] = []
  for (const c of conversoes) {
    if (!c.contact?.email) { resultados.push({ resultado: 'ignorado', motivo: 'sem e-mail' }); continue }
    if (!c.event_identifier) {
      // Formato que o normalizador não reconheceu: guarda uma amostra pra ajustar o parser.
      await logar(sb, iniciadoEm, 'failure', { motivo: 'conversão sem identificador', amostra: JSON.stringify(c.raw).slice(0, 3000) }, 'sem event_identifier')
      resultados.push({ resultado: 'ignorado', motivo: 'sem identificador de conversão' }); continue
    }
    try {
      resultados.push(await processarConversao(sb, c, iniciadoEm))
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      await logar(sb, iniciadoEm, 'failure', { evento: c.event_identifier, email: c.contact?.email }, msg)
      await alertarTeams(sb, 'Distribuição de leads · falha ao registrar', `${c.event_identifier ?? '?'} · ${c.contact?.email ?? '?'} · ${msg.slice(0, 300)}`)
      return respond({ error: msg, resultados }, 500)
    }
  }
  return respond({ ok: true, resultados }, 200)
})
