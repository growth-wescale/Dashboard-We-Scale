// supabase/functions/distribuir-lead/contato.ts
// Lead que volta (reconversão): reaproveitar o contato do RD e avisar no deal novo que o lead já
// tem deal aberto. Regra de 28/10/2026, ver docs/sql/2026-10-28-distribuicao-reconversao.sql.
//
// Por que existe: `POST /deals` com `contacts[]` SEMPRE cria contato novo no RD, mesmo com e-mail já
// cadastrado (medido em 27/10). A automação antiga do RD Marketing reaproveitava o contato. Agora o
// deal nasce sem contato e é ligado ao contato existente por `PUT /contacts/:id` com `deal_ids`
// (a doc não diz se substitui ou soma, então vai sempre a lista inteira). Se a ligação falhar, cria
// um contato novo pro deal não ficar sem contato.
import { jsonAscii, semToken } from './rd.ts'

export type ContatoRd = { id: string; integrationId: string | null; criadoEm: string | null; deals: string[] }

export type DealAberto = {
  id_deal: string
  nome: string | null
  marca: string | null
  funil: string | null
  etapa: string | null
  responsavel: string | null
  nome_sdr: string | null
  por_email: boolean
  por_tel: boolean
}

export type Reconversao = {
  deals: DealAberto[]
  sdr: string | null
  deal_do_sdr: string | null
  sdr_inelegiveis: string[]
}

const BASE = 'https://crm.rdstation.com/api/v1'
export const linkDeal = (id: string) => `https://crm.rdstation.com/app/deals/${id}`

/** "E-mail", "Telefone" ou "E-mail e Telefone". */
export function identificadoPor(porEmail: boolean, porTel: boolean): string {
  if (porEmail && porTel) return 'E-mail e Telefone'
  return porTel ? 'Telefone' : 'E-mail'
}

/** Anotação do deal novo. null quando o lead não tinha deal aberto. `rodape` troca a última linha (retroativo). */
export function montarNotaReconversao(r: Reconversao | null | undefined, sdrDoDeal: string | null, rodape?: string): string | null {
  if (!r || !r.deals?.length) return null
  const porEmail = r.deals.some(d => d.por_email)
  const porTel = r.deals.some(d => d.por_tel)
  const um = r.deals.length === 1
  const linhas = [
    `ATENÇÃO: este MQL já tem ${um ? 'um deal aberto' : `${r.deals.length} deals abertos`}.`,
    `Identificado por: ${identificadoPor(porEmail, porTel)}.`,
    '',
  ]
  for (const d of r.deals) {
    const partes = [
      d.marca ? `marca ${d.marca}` : null,
      d.funil ? `funil ${d.funil}` : null,
      d.etapa ? `etapa ${d.etapa}` : null,
      d.responsavel ? `responsável ${d.responsavel}` : null,
    ].filter(Boolean)
    linhas.push(`• ${d.nome ?? 'Deal'}: ${partes.join(' · ')} (mesmo ${identificadoPor(d.por_email, d.por_tel).toLowerCase()})`)
    linhas.push(`  ${linkDeal(d.id_deal)}`)
  }
  linhas.push('')
  if (rodape) {
    linhas.push(rodape)
  } else if (r.sdr && r.sdr === sdrDoDeal) {
    linhas.push(`Este deal foi para ${r.sdr}, SDR que já atendeu este lead.`)
  } else if (r.sdr_inelegiveis?.length) {
    linhas.push(`Distribuído pelo rodízio: ${r.sdr_inelegiveis.join(', ')}.`)
  } else {
    linhas.push('Distribuído pelo rodízio: o deal anterior não tem SDR.')
  }
  return linhas.join('\n')
}

/** Contato que fica: o ligado ao RD Marketing (integration_id); empate, o mais antigo. */
export function escolherContato(lista: ContatoRd[]): ContatoRd | null {
  if (!lista.length) return null
  return [...lista].sort((a, b) => {
    const ia = a.integrationId ? 0 : 1
    const ib = b.integrationId ? 0 : 1
    if (ia !== ib) return ia - ib
    return String(a.criadoEm ?? '9999').localeCompare(String(b.criadoEm ?? '9999'))
  })[0]
}

type Opts = { fetchImpl?: typeof fetch; timeoutMs?: number }

async function chamar(token: string, metodo: string, caminho: string, body: unknown, o: Opts): Promise<{ ok: boolean; status: number; json: unknown; erro?: string }> {
  const f = o.fetchImpl ?? fetch
  const sep = caminho.includes('?') ? '&' : '?'
  for (let i = 1; i <= 2; i++) {
    let resp: Response
    try {
      resp = await f(`${BASE}/${caminho}${sep}token=${encodeURIComponent(token)}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: jsonAscii(body) }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 12_000),
      })
    } catch (e) {
      return { ok: false, status: 0, json: null, erro: `${metodo} ${caminho.split('?')[0]}: ${semToken((e as Error)?.message ?? String(e), token)}`.slice(0, 300) }
    }
    const txt = semToken(await resp.text(), token)
    let json: unknown = null
    try { json = JSON.parse(txt) } catch { json = null }
    if (resp.ok) return { ok: true, status: resp.status, json }
    if (!(resp.status === 429 || resp.status >= 500) || i === 2) {
      return { ok: false, status: resp.status, json, erro: `${metodo} ${caminho.split('?')[0]}: HTTP ${resp.status} ${txt.slice(0, 200)}` }
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  return { ok: false, status: 0, json: null, erro: 'sem resposta' }
}

/** Contatos do CRM com exatamente este e-mail. Lança erro se o RD não respondeu. */
export async function buscarContatosPorEmail(token: string, email: string, o: Opts = {}): Promise<ContatoRd[]> {
  const alvo = email.trim().toLowerCase()
  const r = await chamar(token, 'GET', `contacts?email=${encodeURIComponent(alvo)}&limit=50`, undefined, o)
  if (!r.ok) throw new Error(r.erro ?? 'falha ao buscar contato')
  // deno-lint-ignore no-explicit-any
  const lista = ((r.json as any)?.contacts ?? []) as any[]
  return lista
    // deno-lint-ignore no-explicit-any
    .filter(c => (c.emails ?? []).some((e: any) => String(e?.email ?? '').trim().toLowerCase() === alvo))
    .map(c => ({
      id: String(c._id ?? c.id),
      integrationId: c.integration_id ?? null,
      criadoEm: c.created_at ?? null,
      // deno-lint-ignore no-explicit-any
      deals: (c.deals ?? []).map((d: any) => String(d._id ?? d.id)).filter(Boolean),
    }))
}

/** Liga o deal ao contato mandando a lista inteira de deals. Devolve erro ou null. */
export async function ligarDealAoContato(token: string, contato: ContatoRd, idDeal: string, o: Opts = {}): Promise<string | null> {
  const ids = Array.from(new Set([...contato.deals, idDeal]))
  const r = await chamar(token, 'PUT', `contacts/${contato.id}`, { contact: { deal_ids: ids } }, o)
  if (!r.ok) return r.erro ?? 'falha ao ligar contato'
  // deno-lint-ignore no-explicit-any
  const devolvidos = ((r.json as any)?.deal_ids ?? null) as string[] | null
  if (Array.isArray(devolvidos) && !devolvidos.map(String).includes(idDeal)) return `PUT contacts/${contato.id}: deal não apareceu em deal_ids`
  return null
}

/** Tira deals de um contato (usado no retroativo: o contato duplicado fica sem deal). */
export async function definirDealsDoContato(token: string, idContato: string, ids: string[], o: Opts = {}): Promise<string | null> {
  const r = await chamar(token, 'PUT', `contacts/${idContato}`, { contact: { deal_ids: ids } }, o)
  return r.ok ? null : (r.erro ?? 'falha')
}

/** Plano B: cria um contato novo já ligado ao deal (o que acontecia antes de 28/10). */
export async function criarContatoNoDeal(
  token: string, c: { nome: string; email: string; telefone: string | null }, idDeal: string, o: Opts = {},
): Promise<{ id?: string; erro?: string }> {
  const r = await chamar(token, 'POST', 'contacts', {
    contact: {
      name: c.nome,
      emails: [{ email: c.email }],
      ...(c.telefone ? { phones: [{ phone: c.telefone, type: 'cellphone' }] } : {}),
      deal_ids: [idDeal],
    },
  }, o)
  // deno-lint-ignore no-explicit-any
  if (r.ok) return { id: String((r.json as any)?._id ?? (r.json as any)?.id ?? '') || undefined }
  return { erro: r.erro }
}
