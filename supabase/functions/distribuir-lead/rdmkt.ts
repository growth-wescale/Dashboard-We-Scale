// supabase/functions/distribuir-lead/rdmkt.ts
// Registra no RD Station Marketing a conversão da COF (ex. cof_eletrovias) depois que o deal foi
// criado no CRM. A automação da COF de cada marca dispara só por essa conversão, então a barreira
// de MQL fica num lugar só (a regra da distribuição) e o e-mail sai sempre com a marca certa.
// Usa a Chave de API (Vault rdmkt_api_key): só aceita eventos de conversão, sem OAuth.
// Doc: https://developers.rdstation.com/reference/conversao
// Retry igual ao do CRM: só 429/5xx e erro de rede; timeout não repete (pode ter registrado).
import { semToken } from './rd.ts'

export type ConversaoCof = { identificador: string; email: string; nome: string | null }
export type ResultadoCof = { ok: boolean; erro?: string; tentativas: number }

export function montarCorpoConversao(c: ConversaoCof) {
  return {
    event_type: 'CONVERSION',
    event_family: 'CDP',
    payload: { conversion_identifier: c.identificador, email: c.email, ...(c.nome ? { name: c.nome } : {}) },
  }
}

export async function enviarConversaoCof(
  apiKey: string, c: ConversaoCof, opts: { tentativas?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoCof> {
  const max = Math.max(1, opts.tentativas ?? 3)
  const timeoutMs = opts.timeoutMs ?? 15_000
  const f = opts.fetchImpl ?? fetch
  const body = JSON.stringify(montarCorpoConversao(c))
  let ultimoErro = 'sem tentativa'
  for (let i = 1; i <= max; i++) {
    let resp: Response | null = null
    try {
      resp = await f(`https://api.rd.services/platform/conversions?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      const n = (e as { name?: string })?.name ?? ''
      if (n === 'TimeoutError' || n === 'AbortError') {
        return { ok: false, erro: `timeout após ${timeoutMs / 1000}s: conferir no RD Marketing se a conversão ${c.identificador} entrou no lead antes de reenviar`, tentativas: i }
      }
      ultimoErro = `rede: ${semToken((e as Error)?.message ?? String(e), apiKey).replace(/api_key=[^&\s)]+/g, 'api_key=[chave]')}`
      if (i < max) await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** i, 10_000)))
      continue
    }
    const txt = semToken(await resp.text(), apiKey)
    if (resp.ok) return { ok: true, tentativas: i }
    ultimoErro = `HTTP ${resp.status}: ${txt.slice(0, 400)}`
    if (!(resp.status === 429 || resp.status >= 500)) return { ok: false, erro: ultimoErro, tentativas: i }
    const ra = Number(resp.headers.get('Retry-After'))
    if (i < max) await new Promise(r => setTimeout(r, !Number.isNaN(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : Math.min(1000 * 2 ** i, 10_000)))
  }
  return { ok: false, erro: ultimoErro, tentativas: max }
}
