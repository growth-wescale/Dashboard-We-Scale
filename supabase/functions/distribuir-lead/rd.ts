// supabase/functions/distribuir-lead/rd.ts
// Cria o deal no RD Station CRM a partir do objeto `deal` que a RPC distribuicao_processar
// devolve. Só este arquivo conhece IDs de campo do CRM.
//
// Retry: 3 tentativas (config retries_rd) SÓ para 429 (respeita Retry-After), 5xx e timeout.
// 4xx devolve erro na hora com o corpo da resposta — campo obrigatório, etapa inexistente,
// token inválido não melhoram repetindo.

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

export async function criarDealNoRd(
  token: string, deal: DealPronto, opts: { tentativas?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoRd> {
  const max = Math.max(1, opts.tentativas ?? 3)
  const timeoutMs = opts.timeoutMs ?? 10_000
  const f = opts.fetchImpl ?? fetch
  const body = JSON.stringify(montarCorpoDeal(deal))
  let ultimoErro = 'sem tentativa'
  for (let i = 1; i <= max; i++) {
    let resp: Response | null = null
    try {
      resp = await f(`https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs),
      })
      const txt = await resp.text()
      if (resp.ok) {
        const j = JSON.parse(txt)
        const id = j?.id ?? j?._id
        if (id) return { id: String(id), tentativas: i, status: resp.status }
        return { erro: `resposta ${resp.status} sem id: ${txt.slice(0, 300)}`, tentativas: i, status: resp.status }
      }
      ultimoErro = `HTTP ${resp.status}: ${txt.slice(0, 500)}`
      const repete = resp.status === 429 || resp.status >= 500
      if (!repete) return { erro: ultimoErro, tentativas: i, status: resp.status }
    } catch (e) {
      ultimoErro = `timeout/rede: ${(e as Error)?.message ?? String(e)}`
    }
    if (i < max) await new Promise(r => setTimeout(r, esperaMs(resp, i)))
  }
  return { erro: ultimoErro, tentativas: max }
}
