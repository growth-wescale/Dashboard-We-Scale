// supabase/functions/distribuir-lead/rd.ts
// Cria o deal no RD Station CRM a partir do objeto `deal` que a RPC distribuicao_processar
// devolve. Só este arquivo conhece IDs de campo do CRM.
//
// Retry: até 3 tentativas (config retries_rd) SÓ para 429 (respeita Retry-After) e 5xx, que o RD
// garante não ter aplicado. 4xx devolve erro na hora (campo obrigatório, etapa inexistente, token
// inválido não melhoram repetindo). TIMEOUT NÃO REPETE: o RD pode ter criado o deal mesmo sem
// responder a tempo, e repetir criaria um segundo — fica em 'erro' pra alguém conferir no CRM
// antes de reprocessar. 2xx com corpo sem id também não repete.
// Toda mensagem de erro passa por `semToken()`: o token vai na query string e o Deno inclui a URL
// inteira em erros de rede ("error sending request for url (...?token=XXX)"); sem isso o token
// iria parar em erro_rd (view lida pela chave anon), em sync_execucao e no Teams.

export type DealPronto = {
  name: string
  deal_stage_id: string
  user_id: string
  campaign_id: string | null
  marca_rd: string
  nome_sdr: string | null
  contato: { nome: string; email: string; telefone: string | null }
  utm: { source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null }
  cidade: string | null
  estado: string | null
  capital: string | null
  /** Conversão registrada no RD Marketing depois do deal (dispara a automação da COF). null = não envia. */
  conversao_cof?: string | null
  /** Anotação a criar no deal (já com {nome}/{email}/{sdr} trocados). */
  nota?: string | null
  /** Tarefa a criar pro dono do deal. */
  tarefa?: TarefaRegra | null
  /** { "<custom_field_id do CRM>": valor } — resolvido pela regra da marca (campos_extra). */
  campos_extra: Record<string, unknown>
}

// IDs dos campos personalizados do deal no RD CRM (levantados em 16/10/2026).
export const CF = {
  marca: '69600aafd006b100155e4066',
  fonteMacro: '6a8c4f1b06873300248bbff5',
  cidade: '699f1fb06dd7650019c8a725',
  estado: '699f1fbcea4328001396ecba',
  utmSource: '691b38dca83bd300133d2337',
  utmMedium: '691b38e90402180013d39e51',
  utmCampaign: '691b390066b68c0016ea0877',
  utmTerm: '691b390891e1f0001577ddfd',
  utmContent: '691b391254af6f00182abd23',
} as const

type CustomField = { custom_field_id: string; value: string | string[] }

export type RdDealBody = {
  deal: { name: string; deal_stage_id: string; user_id: string; deal_custom_fields: CustomField[] }
  contacts: Array<{ name: string; emails: Array<{ email: string }>; phones?: Array<{ phone: string; type: string }> }>
  campaign?: { _id: string }
}

function texto(v: unknown): string | null {
  if (v == null) return null
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : null
  const s = String(v).trim()
  return s ? s : null
}

export function montarCorpoDeal(deal: DealPronto): RdDealBody {
  const cf: CustomField[] = [
    { custom_field_id: CF.marca, value: deal.marca_rd },
    { custom_field_id: CF.fonteMacro, value: 'Inbound' },
  ]
  const fixos: Array<[string, unknown]> = [
    [CF.cidade, deal.cidade], [CF.estado, deal.estado],
    [CF.utmSource, deal.utm?.source], [CF.utmMedium, deal.utm?.medium], [CF.utmCampaign, deal.utm?.campaign],
    [CF.utmTerm, deal.utm?.term], [CF.utmContent, deal.utm?.content],
  ]
  for (const [id, v] of fixos) { const t = texto(v); if (t) cf.push({ custom_field_id: id, value: t }) }
  for (const [id, v] of Object.entries(deal.campos_extra ?? {})) {
    if (cf.some(c => c.custom_field_id === id)) continue
    if (Array.isArray(v)) { if (v.length) cf.push({ custom_field_id: id, value: v.map(String) }) }
    else { const t = texto(v); if (t) cf.push({ custom_field_id: id, value: t }) }
  }
  const body: RdDealBody = {
    deal: { name: deal.name, deal_stage_id: deal.deal_stage_id, user_id: deal.user_id, deal_custom_fields: cf },
    contacts: [{
      name: deal.contato.nome,
      emails: [{ email: deal.contato.email }],
      ...(deal.contato.telefone ? { phones: [{ phone: deal.contato.telefone, type: 'cellphone' }] } : {}),
    }],
  }
  if (deal.campaign_id) body.campaign = { _id: deal.campaign_id }
  return body
}

export type ResultadoRd = { id?: string; erro?: string; tentativas: number; status?: number }

function esperaMs(resp: Response | null, tentativa: number): number {
  const ra = resp?.headers.get('Retry-After')
  const s = ra ? Number(ra) : NaN
  if (!Number.isNaN(s) && s > 0) return Math.min(s, 30) * 1000
  return Math.min(1000 * 2 ** tentativa, 10_000)
}

/** Apaga o token de qualquer texto que possa ir pro log, pra view ou pro Teams. */
export function semToken(texto: string, token: string): string {
  let t = texto
  if (token) t = t.split(token).join('[token]')
  return t.replace(/token=[^&\s)]+/g, 'token=[token]')
}

function ehTimeout(e: unknown): boolean {
  const n = (e as { name?: string })?.name ?? ''
  return n === 'TimeoutError' || n === 'AbortError'
}

export async function criarDealNoRd(
  token: string, deal: DealPronto, opts: { tentativas?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoRd> {
  const max = Math.max(1, opts.tentativas ?? 3)
  const timeoutMs = opts.timeoutMs ?? 15_000
  const f = opts.fetchImpl ?? fetch
  const body = JSON.stringify(montarCorpoDeal(deal))
  let ultimoErro = 'sem tentativa'
  for (let i = 1; i <= max; i++) {
    let resp: Response | null = null
    try {
      resp = await f(`https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      const msg = semToken((e as Error)?.message ?? String(e), token)
      if (ehTimeout(e)) {
        return { erro: `timeout após ${timeoutMs / 1000}s sem resposta do RD: conferir no RD se o deal foi criado antes de reprocessar`, tentativas: i }
      }
      ultimoErro = `rede: ${msg}`
      if (i < max) await new Promise(r => setTimeout(r, esperaMs(null, i)))
      continue
    }
    const txt = semToken(await resp.text(), token)
    if (resp.ok) {
      let id: unknown = null
      try { const j = JSON.parse(txt); id = j?.id ?? j?._id } catch { id = null }
      if (id) return { id: String(id), tentativas: i, status: resp.status }
      return { erro: `resposta ${resp.status} sem id: ${txt.slice(0, 300)}`, tentativas: i, status: resp.status }
    }
    ultimoErro = `HTTP ${resp.status}: ${txt.slice(0, 500)}`
    const repete = resp.status === 429 || resp.status >= 500
    if (!repete) return { erro: ultimoErro, tentativas: i, status: resp.status }
    if (i < max) await new Promise(r => setTimeout(r, esperaMs(resp, i)))
  }
  return { erro: ultimoErro, tentativas: max }
}

// ---- Passos que as automações do RD faziam dentro do deal (nota e tarefa) ----
// Melhor esforço: o deal já existe; falha vira extras_erro + alerta, nunca desfaz o deal.
// Repete só 429/5xx (até 2 vezes); timeout não repete (evita nota/tarefa em dobro).

export type TarefaRegra = { assunto: string; tipo?: string; horas?: number }

async function postRd(token: string, caminho: string, body: unknown, f: typeof fetch, timeoutMs = 15_000): Promise<string | null> {
  for (let i = 1; i <= 2; i++) {
    let resp: Response
    try {
      resp = await f(`https://crm.rdstation.com/api/v1/${caminho}?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      return `${caminho}: ${semToken((e as Error)?.message ?? String(e), token)}`.slice(0, 300)
    }
    if (resp.ok) return null
    const txt = semToken(await resp.text(), token)
    if (!(resp.status === 429 || resp.status >= 500) || i === 2) return `${caminho}: HTTP ${resp.status} ${txt.slice(0, 250)}`
    await new Promise(r => setTimeout(r, 1500))
  }
  return null
}

/** Data e hora (Brasília) daqui a `horas` horas, no formato que a API de tarefas do RD pede. */
export function prazoBrt(horas: number, agora = new Date()): { date: string; hour: string } {
  const alvo = new Date(agora.getTime() + horas * 3_600_000 - 3 * 3_600_000) // UTC-3 (sem horário de verão)
  const iso = alvo.toISOString()
  return { date: iso.slice(0, 10), hour: iso.slice(11, 16) }
}

export async function criarNotaNoRd(token: string, idDeal: string, userId: string, texto: string, fetchImpl: typeof fetch = fetch) {
  return await postRd(token, 'activities', { activity: { deal_id: idDeal, user_id: userId, text: texto } }, fetchImpl)
}

export async function criarTarefaNoRd(token: string, idDeal: string, userId: string, t: TarefaRegra, fetchImpl: typeof fetch = fetch, agora = new Date()) {
  const { date, hour } = prazoBrt(Number(t.horas) > 0 ? Number(t.horas) : 1, agora)
  return await postRd(token, 'tasks', {
    task: { deal_id: idDeal, user_ids: [userId], subject: t.assunto, type: t.tipo || 'call', date, hour },
  }, fetchImpl)
}
