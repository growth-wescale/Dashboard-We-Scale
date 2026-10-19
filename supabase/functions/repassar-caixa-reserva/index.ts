// supabase/functions/repassar-caixa-reserva/index.ts — Supabase de Expansão.
// Busca na caixa reserva (Edge Function caixa-reserva-leads, Supabase de MARKETING) as conversões
// pendentes, entrega cada uma à distribuir-lead e confirma o resultado na caixa. Chamada pelo pg_cron
// a cada 2 min (invocar_repasse_caixa_reserva). A distribuir-lead ignora conversão já recebida
// (distribuicao_conversao_vista), então entregar o que já tinha chegado pelo webhook direto não
// duplica deal; o que se perdeu numa queda da API vira deal assim que a API volta.
// Autenticação: ?chave= = Vault distribuicao_webhook_chave (a mesma da distribuir-lead).
// Para falar com a caixa: Vault caixa_reserva_chave (gerada no Marketing, copiada para cá).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { entregue, FALHAS_SEGUIDAS_PARA_PARAR, semChave } from './repasse.ts'

const CAIXA = 'https://jmuluoksnlqrvzbcltim.supabase.co/functions/v1/caixa-reserva-leads'
const DESTINO = 'https://cygxmduuwlwfbodfrlkr.supabase.co/functions/v1/distribuir-lead'
const PRAZO_MS = 110_000

// deno-lint-ignore no-explicit-any
type Sb = any

async function segredo(sb: Sb, nome: string): Promise<string> {
  const { data, error } = await sb.rpc('get_secret', { secret_name: nome })
  if (error || !data) throw new Error(`get_secret ${nome}: ${error?.message || 'vazio'}`)
  return data as string
}

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function logar(sb: Sb, iniciadoEm: string, status: string, checkpoint: Record<string, unknown>, erro?: string) {
  try {
    await sb.from('sync_execucao').insert({ job: 'repassar_caixa_reserva', iniciado_em: iniciadoEm, terminado_em: new Date().toISOString(), status, erro: erro ?? null, checkpoint })
  } catch (_) { /* log nunca derruba a execução */ }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)
  const iniciadoEm = new Date().toISOString()
  const t0 = Date.now()
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  let chaveDist = ''
  try { chaveDist = await segredo(sb, 'distribuicao_webhook_chave') } catch (_) { /* cai no 401 */ }
  if (!chaveDist || (url.searchParams.get('chave') ?? '') !== chaveDist) return respond({ error: 'não autorizado' }, 401)

  let chaveCaixa: string
  try { chaveCaixa = await segredo(sb, 'caixa_reserva_chave') } catch (e) { return respond({ error: (e as Error).message }, 500) }

  // 1. pendentes da caixa
  let linhas: Array<{ id: number; corpo: unknown; corpo_texto: string | null }> = []
  try {
    const r = await fetch(`${CAIXA}?listar=1&chave=${encodeURIComponent(chaveCaixa)}`, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`caixa respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
    linhas = (await r.json())?.linhas ?? []
  } catch (e) {
    const msg = semChave((e as Error)?.message ?? String(e))
    await logar(sb, iniciadoEm, 'failure', { etapa: 'listar' }, msg)
    return respond({ error: msg }, 502)
  }
  if (linhas.length === 0) return respond({ ok: true, lidos: 0 }, 200)

  // 2. entrega uma a uma; 3 falhas seguidas = API fora, para e deixa pra próxima rodada
  const resultados: Array<{ id: number; entregue: boolean; status: number; erro: string | null }> = []
  let seguidas = 0
  for (const l of linhas) {
    if (Date.now() - t0 > PRAZO_MS || seguidas >= FALHAS_SEGUIDAS_PARA_PARAR) break
    let status = 0, erro: string | null = null
    try {
      const r = await fetch(`${DESTINO}?chave=${encodeURIComponent(chaveDist)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: l.corpo ? JSON.stringify(l.corpo) : (l.corpo_texto ?? ''),
        signal: AbortSignal.timeout(25_000),
      })
      status = r.status
      const texto = await r.text()
      if (!entregue(status)) erro = semChave(texto.slice(0, 300))
    } catch (e) {
      erro = semChave(((e as Error)?.message ?? String(e)).slice(0, 300))
    }
    const ok = entregue(status)
    seguidas = ok ? 0 : seguidas + 1
    resultados.push({ id: l.id, entregue: ok, status, erro })
  }

  // 3. confirma na caixa (se falhar, a caixa entrega de novo na próxima rodada: sem dano)
  let confirmados = 0
  try {
    const r = await fetch(`${CAIXA}?confirmar=1&chave=${encodeURIComponent(chaveCaixa)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultados }), signal: AbortSignal.timeout(20_000),
    })
    confirmados = (await r.json())?.atualizados ?? 0
  } catch (_) { /* próxima rodada reentrega */ }

  const entregues = resultados.filter(r => r.entregue).length
  const falhas = resultados.length - entregues
  const resumo = { lidos: linhas.length, entregues, falhas, confirmados, parou_por_falhas: seguidas >= FALHAS_SEGUIDAS_PARA_PARAR, ms: Date.now() - t0 }
  if (falhas > 0) await logar(sb, iniciadoEm, 'failure', resumo, resultados.find(r => !r.entregue)?.erro ?? 'falha')
  return respond({ ok: true, ...resumo }, 200)
})
