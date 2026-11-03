import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from './types'
import { toLocalDate } from './dateUtils'
import { vinculosInpot } from './vinculosInpot'
import { marketingMqlRows } from './leadUtils'

type Origem = { marca: string; id_lead: string; fonte_macro: string | null; ciclo: number }
export type CoberturaInbound = { inbound: number | null; semOrigem: number }

function dealId(row: Lead) {
  const extra = row.dados_extras
  const vinculados = extra?.crm_deal_ids
  const id = extra?.id_deal ?? extra?.crm_deal_id ?? (Array.isArray(vinculados) && vinculados.length === 1 ? vinculados[0] : null)
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

type Atribuicao = { marca: string; lead_email: string | null; recebido_em: string; id_deal: string }
const emailKey = (email: string | null) => email?.trim().toLowerCase() || null

export function indiceDistribuicao(rows: Atribuicao[]) {
  const index = new Map<string, Set<string>>()
  for (const row of rows) {
    const email = emailKey(row.lead_email)
    const day = toLocalDate(row.recebido_em)
    if (!email || !day || !row.id_deal) continue
    const key = JSON.stringify([row.marca, day, email])
    const ids = index.get(key) ?? new Set<string>()
    ids.add(row.id_deal)
    index.set(key, ids)
  }
  return index
}

async function vinculosDistribuicao(db: SupabaseClient, marca: string, rows: Lead[], signal: AbortSignal) {
  const dias = rows.filter(row => !dealId(row) && emailKey(row.email) && row.dia).map(row => row.dia).sort()
  if (!dias.length) return indiceDistribuicao([])
  const atribuicoes: Atribuicao[] = []
  for (let offset = 0; offset < 5000; offset += 500) {
    const res = await db.from('vw_distribuicao_atribuicoes').select('marca,lead_email,recebido_em,id_deal')
      .eq('marca', marca).not('id_deal', 'is', null)
      .gte('recebido_em', dias[0] + 'T00:00:00-03:00')
      .lt('recebido_em', new Date(Date.parse(dias[dias.length - 1] + 'T00:00:00-03:00') + 86400000).toISOString())
      .order('recebido_em').order('id').range(offset, offset + 499).abortSignal(signal)
    signal.throwIfAborted()
    if (res.error || !res.data) return indiceDistribuicao([])
    atribuicoes.push(...res.data)
    if (res.data.length < 500) return indiceDistribuicao(atribuicoes)
  }
  return indiceDistribuicao([])
}

function idConfirmado(row: Lead, index: Map<string, Set<string>>) {
  const direto = dealId(row)
  if (direto) return direto
  const ids = index.get(JSON.stringify([row.marca, row.dia, emailKey(row.email)]))
  return ids?.size === 1 ? [...ids][0] : null
}

// Same MQL population as the total. Only an exact, same-brand CRM deal ID
// can supply Fonte Macro. A missing match never borrows another person's origin.
export async function consultarInbound(db: SupabaseClient, leads: Lead[], marcas: string[], signal: AbortSignal) {
  const result: Record<string, CoberturaInbound> = {}
  for (const marca of marcas) {
    const rows = marketingMqlRows(leads.filter(row => row.marca === marca))
    const index = await vinculosDistribuicao(db, marca, rows, signal)
    const diretos = rows.map(row => idConfirmado(row, index))
    const historicos = marca === 'Inpot' ? await vinculosInpot(db, rows.filter((row, i) =>
      !diretos[i] && !index.get(JSON.stringify([row.marca, row.dia, emailKey(row.email)]))?.size
    ), signal) : new Map<string, string>()
    const vinculados = rows.map((row, i) => diretos[i] ?? historicos.get(row.id) ?? null)
    const ids = [...new Set(vinculados.filter((id): id is string => id !== null))]
    const porId = new Map<string, Origem>()
    let disponivel = true
    for (let i = 0; i < ids.length; i += 60) {
      signal.throwIfAborted()
      const resposta = await db.from('vw_funil_vendas').select('id_lead,marca,fonte_macro,ciclo')
        .eq('marca', marca).eq('eh_ciclo_atual', true).in('id_lead', ids.slice(i, i + 60))
        .order('ciclo', { ascending: false }).limit(1000).abortSignal(signal)
      if (resposta.error || !resposta.data || resposta.data.length === 1000) { disponivel = false; break }
      for (const row of resposta.data as Origem[]) if (!porId.has(row.id_lead)) porId.set(row.id_lead, row)
    }
    const origens = vinculados.map(id => porId.get(id ?? '')?.fonte_macro?.trim().toLowerCase())
    const semOrigem = origens.filter(origem => !origem).length
    const confirmados = new Set(vinculados.filter((_, i) => origens[i] === 'inbound'))
    result[marca] = {
      inbound: disponivel && (!rows.length || porId.size > 0) ? confirmados.size : null,
      semOrigem: disponivel ? semOrigem : rows.length,
    }
  }
  return result
}
