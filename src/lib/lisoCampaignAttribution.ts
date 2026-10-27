import type { Lead, MediaDailyRaw } from './types'
import type { Campaign } from './campaignTypes'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { attributePartnerCampaigns } from './partnerCampaignAttribution'

type GoldMedia = MediaDailyRaw & { campanha_id?: string; grupo_id?: string; anuncio_id?: string }
/** Resolve somente IDs exatos presentes na mídia filtrada. Ausência/ambiguidade
 * permanece sem atribuição; nunca distribui MQL por gasto ou leads de plataforma. */
export function attributeLisoCampaigns(campaigns: Campaign[], leads: Lead[], sql: VwMarketingFunil[], media: GoldMedia[]) {
  function normalize<T extends { utm_campaign: string | null; utm_term?: unknown; utm_content?: unknown }>(row: T): T {
    const campaignRows = media.filter(m => m.campanha_id === row.utm_campaign)
    const names = new Set(campaignRows.map(m => m.campanha).filter(Boolean))
    const campaign = names.size === 1 ? [...names][0]! : row.utm_campaign
    const scoped = media.filter(m => m.campanha === campaign)
    const resolve = (value: unknown, id: 'grupo_id' | 'anuncio_id', name: 'conjunto' | 'anuncio') => {
      if (typeof value !== 'string' || !value) return value
      const found = new Set(scoped.filter(m => m[id] === value).map(m => m[name]).filter(Boolean))
      return found.size === 1 ? [...found][0] : value
    }
    return { ...row, utm_campaign: campaign, utm_term: resolve(row.utm_term, 'grupo_id', 'conjunto'), utm_content: resolve(row.utm_content, 'anuncio_id', 'anuncio') }
  }
  return attributePartnerCampaigns(campaigns, leads.map(row => {
    const resolved = normalize({ utm_campaign: row.utm_campaign, utm_term: row.dados_extras?.utm_term, utm_content: row.dados_extras?.utm_content })
    return { ...row, utm_campaign: resolved.utm_campaign, dados_extras: { ...row.dados_extras, utm_term: resolved.utm_term, utm_content: resolved.utm_content } }
  }), sql.map(normalize))
}
