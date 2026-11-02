import type { Lead } from '@/lib/types'

// These markers are supplied only by the opt-in Eletrovias Marketing adapter.
// Deal rows carry a metric, never a fabricated contact.
export function isMarketingDeal(r: Pick<Lead, 'marca' | 'dados_extras'>): boolean {
  return r.marca === 'Eletrovias' && r.dados_extras?.metric_grain === 'crm_deal'
}

export function isLeadMql(r: { dados_extras: Record<string, unknown> | null }): boolean {
  const de = r.dados_extras
  if (de?.metric_grain === 'contact_only') return false
  if (de?.metric_grain === 'crm_deal') return true
  // Fall back to lead_type_original for imports that use that field (e.g. Odonto Scale historical)
  const lt = de?.['lead_type'] ?? de?.['lead_type_original']
  return typeof lt === 'string' && lt.toUpperCase() === 'MQL'
}

export function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter(r => {
    if (isMarketingDeal(r)) return false
    // Leads marcados como participantes de evento (dados_extras.evento preenchido)
    // burlam o dedupe — mesmo email/telefone deve contar de novo como interação nova.
    const evento = r.dados_extras?.['evento']
    if (typeof evento === 'string' && evento.trim() !== '') return true

    const key = (r.email && r.email !== '') ? r.email
      : (r.telefone && r.telefone !== '') ? r.telefone
      : null
    if (key === null) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** MQLs have their own grain; contact cards retain the existing deduplication. */
export function marketingMqlRows(rows: Lead[], filterBeforeDedupe = false): Lead[] {
  const contacts = filterBeforeDedupe ? rows.filter(isLeadMql) : rows
  const result = deduplicateLeads(contacts).filter(isLeadMql)
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isMarketingDeal(row)) continue
    const account = row.dados_extras?.conta_id
    const deal = row.dados_extras?.id_deal
    if (typeof account !== 'string' || !account || typeof deal !== 'string' || !deal) {
      throw new Error('Negociação de Marketing sem identificador.')
    }
    const key = JSON.stringify([account, deal])
    if (!seen.has(key)) { result.push(row); seen.add(key) }
  }
  return result
}
