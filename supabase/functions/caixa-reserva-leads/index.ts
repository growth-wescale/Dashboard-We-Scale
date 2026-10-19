// supabase/functions/caixa-reserva-leads/index.ts — publicada no Supabase de MARKETING
// (jmuluoksnlqrvzbcltim), não no de Expansão: tem que continuar de pé quando a API de Expansão cai.
//
// O RD Marketing não reenvia webhook. Um 2º webhook manda cada conversão também para cá. A caixa
// só guarda; quem entrega é a repassar-caixa-reserva (Expansão), que busca aqui a cada 2 min e
// manda para a distribuir-lead. Assim nenhum segredo de Expansão mora no Marketing.
//
// Tudo exige ?chave= = Vault caixa_reserva_chave (deste projeto; a cópia em Expansão tem o mesmo nome):
//   POST                    guarda o corpo do webhook (eventos que nunca viram deal não são guardados)
//   GET  ?listar=1          pendentes com tentativa vencida e mais de 2 min de idade (máx. 50)
//   POST ?confirmar=1       {resultados:[{id, entregue, status, erro}]} → entregue ou nova tentativa
//   GET  ?status=1          pendentes e o mais antigo
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deveGuardar, esperaMinutos, identificadores } from './caixa.ts'

const ATRASO_MIN = 2   // dá tempo ao webhook direto antes de repassar
const LOTE = 50

// deno-lint-ignore no-explicit-any
type Sb = any

let chaveCache: string | null = null
async function chave(sb: Sb): Promise<string> {
  if (chaveCache) return chaveCache
  const { data, error } = await sb.rpc('caixa_reserva_segredo', { p_nome: 'caixa_reserva_chave' })
  if (error || !data) throw new Error(`segredo: ${error?.message || 'vazio'}`)
  chaveCache = data as string
  return chaveCache
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function guardar(sb: Sb, texto: string) {
  let body: unknown = null
  try { body = texto ? JSON.parse(texto) : null } catch { body = null }
  if (body === null) {
    // Corpo vazio = validação da URL pelo RD. Corpo ilegível é guardado cru para não perder nada.
    if (!texto) return respond({ ok: true, resultado: 'ignorado', motivo: 'sem corpo' }, 200)
    const { error } = await sb.from('lead_caixa_reserva').insert({ corpo_texto: texto.slice(0, 200_000) })
    if (error) return respond({ error: error.message }, 500)
    return respond({ ok: true, resultado: 'guardado', motivo: 'corpo ilegível' }, 200)
  }
  const idents = identificadores(body)
  if (!deveGuardar(idents)) return respond({ ok: true, resultado: 'ignorado', identificadores: idents }, 200)
  const { error } = await sb.from('lead_caixa_reserva').insert({ corpo: body, identificadores: idents })
  if (error) return respond({ error: error.message }, 500)
  return respond({ ok: true, resultado: 'guardado', identificadores: idents }, 200)
}

async function listar(sb: Sb) {
  const agora = Date.now()
  const { data, error } = await sb.from('lead_caixa_reserva')
    .select('id, corpo, corpo_texto, tentativas')
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', new Date(agora).toISOString())
    .lte('recebido_em', new Date(agora - ATRASO_MIN * 60_000).toISOString())
    .order('recebido_em', { ascending: true }).order('id', { ascending: true })
    .limit(LOTE)
  if (error) return respond({ error: error.message }, 500)
  return respond({ ok: true, linhas: data ?? [] }, 200)
}

type Resultado = { id: number; entregue: boolean; status?: number; erro?: string | null }

async function confirmar(sb: Sb, texto: string) {
  let corpo: { resultados?: Resultado[] } = {}
  try { corpo = JSON.parse(texto) } catch { return respond({ error: 'corpo inválido' }, 400) }
  const resultados = Array.isArray(corpo.resultados) ? corpo.resultados : []
  const { data: atuais } = await sb.from('lead_caixa_reserva').select('id, tentativas')
    .in('id', resultados.map(r => r.id).filter(Number.isInteger))
  const tent = new Map<number, number>((atuais ?? []).map((a: { id: number; tentativas: number }) => [a.id, a.tentativas]))
  let ok = 0
  for (const r of resultados) {
    if (!tent.has(r.id)) continue
    const t = (tent.get(r.id) ?? 0) + 1
    const upd = r.entregue
      ? { status: 'entregue', entregue_em: new Date().toISOString(), tentativas: t, ultimo_status: r.status ?? null, ultimo_erro: null }
      : { tentativas: t, ultimo_status: r.status ?? null, ultimo_erro: (r.erro ?? '').slice(0, 300) || null,
          proxima_tentativa_em: new Date(Date.now() + esperaMinutos(t) * 60_000).toISOString() }
    const { error } = await sb.from('lead_caixa_reserva').update(upd).eq('id', r.id).eq('status', 'pendente')
    if (!error) ok++
  }
  return respond({ ok: true, atualizados: ok }, 200)
}

async function status(sb: Sb) {
  const { count } = await sb.from('lead_caixa_reserva').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
  const { data } = await sb.from('lead_caixa_reserva').select('id, recebido_em, tentativas, ultimo_status, ultimo_erro')
    .eq('status', 'pendente').order('recebido_em', { ascending: true }).limit(1)
  return respond({ ok: true, pendentes: count ?? 0, mais_antigo: data?.[0] ?? null }, 200)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)
  let ok = false
  try { ok = (url.searchParams.get('chave') ?? '') === await chave(sb) } catch (_) { ok = false }
  if (!ok) return respond({ error: 'não autorizado' }, 401)
  try {
    if (req.method === 'GET' && url.searchParams.get('listar')) return await listar(sb)
    if (req.method === 'GET' && url.searchParams.get('status')) return await status(sb)
    if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)
    if (url.searchParams.get('confirmar')) return await confirmar(sb, await req.text())
    return await guardar(sb, await req.text())
  } catch (e) {
    return respond({ error: (e as Error)?.message ?? String(e) }, 500)
  }
})
