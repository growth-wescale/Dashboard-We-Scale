import type { Lead } from '@/lib/types'

export function isLeadMql(r: { dados_extras: Record<string, unknown> | null }): boolean {
  const de = r.dados_extras
  // Fall back to lead_type_original for imports that use that field (e.g. Odonto Scale historical)
  const lt = de?.['lead_type'] ?? de?.['lead_type_original']
  return typeof lt === 'string' && lt.toUpperCase() === 'MQL'
}

export function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter(r => {
    const key = (r.email && r.email !== '') ? r.email
      : (r.telefone && r.telefone !== '') ? r.telefone
      : null
    if (key === null) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
