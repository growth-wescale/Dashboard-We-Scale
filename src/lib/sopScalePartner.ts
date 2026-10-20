import { toLocalDate } from '@/lib/dateUtils'
import { mapFonte } from '@/lib/vendasUtils'
import type { Lead } from '@/lib/types'

export interface SopPartnerSale {
  id_lead: string
  ciclo: number
  marca: string | null
  status_atual: string | null
  data_venda: string | null
  valor_contrato: number | null
  utm_source: string | null
}

export function partnerSalesInPeriod(rows: SopPartnerSale[], start: string, end: string, fonte = '__all__') {
  const seen = new Set<string>()
  return rows.filter(row => {
    const day = toLocalDate(row.data_venda)
    if (!['We Scale', 'Scale Partner'].includes(row.marca ?? '') || row.status_atual !== 'Ganho' || !day || day < start || day > end) return false
    if (fonte !== '__all__' && mapFonte(row.utm_source) !== fonte) return false
    const key = `${row.id_lead}:${row.ciclo}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function partnerEventCounts(leads: Lead[]) {
  const groups = [
    { label: 'Scale Partner Odonto', rows: [] as Lead[] },
    { label: 'Scale Partner (geral)', rows: [] as Lead[] },
    { label: 'Sem evento identificado', rows: [] as Lead[] },
  ]
  for (const lead of leads) {
    // A importação RD preserva o conjunto em utm_term, não em adset.
    const adset = String(lead.dados_extras?.adset || lead.dados_extras?.utm_term || '').toUpperCase()
    const group = adset.includes('ODONTOLOGIA') ? 0 : adset.includes('LLK') ? 1 : 2
    groups[group].rows.push(lead)
  }
  return groups.map(group => ({ ...group, n: group.rows.length }))
}
