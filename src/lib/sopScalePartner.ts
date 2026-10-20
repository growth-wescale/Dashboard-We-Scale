import { toLocalDate } from '@/lib/dateUtils'
import { mapFonte } from '@/lib/vendasUtils'
import type { Lead } from '@/lib/types'

export interface SopPartnerSale {
  id_lead: string
  ciclo: number
  marca: string | null
  nome_negociacao: string | null
  status_atual: string | null
  data_venda: string | null
  valor_contrato: number | null
  utm_source: string | null
}

export interface SopPartnerContact {
  nome: string | null
  crm_deal_id: string | null
  empresa: string | null
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

export function partnerBuyer(sale: SopPartnerSale, contacts: SopPartnerContact[]) {
  const contact = contacts.find(c => c.crm_deal_id === sale.id_lead)
  const nome = contact?.nome?.trim() || sale.nome_negociacao?.replace(/^Scale Partner\s*[-–:]\s*/i, '').trim() || 'Nome não informado'
  // Só separa a empresa quando o nome cadastrado do contato é o prefixo exato
  // da negociação. Sem essa confirmação, mantém a negociação inteira.
  const prefix = contact?.nome?.trim()
  const suffix = prefix && sale.nome_negociacao?.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? sale.nome_negociacao.slice(prefix.length).match(/^\s+[-–]\s+(.+)$/)?.[1]?.trim()
    : null
  return {
    nome,
    empresa: contact?.empresa?.trim() || suffix || 'Não informada',
    empresaNaNegociacao: !contact?.empresa?.trim() && !!suffix,
    negociacao: sale.nome_negociacao,
  }
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
