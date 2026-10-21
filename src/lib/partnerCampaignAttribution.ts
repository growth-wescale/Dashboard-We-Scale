import type { Campaign, AdSet, Ad } from './campaignTypes'
import type { Lead } from './types'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'

const key = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase() : ''
const unique = <T extends { name: string }>(rows: T[], value: unknown) => {
  const found = key(value) ? rows.filter(r => key(r.name) === key(value)) : []
  return found.length === 1 ? found[0] : undefined
}
function emptyAd(id: string): Ad {
  return { id, name: '(Sem anúncio atribuído)', attributionOnly: true, commercialAttribution: true, spend: 0, impressions: 0, clicks: 0, ctr: 0, mql: 0, cpmql: 0, hue: 0 }
}
function emptySet(id: string): AdSet {
  return { id, name: '(Sem conjunto atribuído)', attributionOnly: true, commercialAttribution: true, publico: '', spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, mql: 0, sql: 0, cpmql: 0, freq: 0, ads: [] }
}
function emptyCampaign(): Campaign {
  return { id: 'partner-unattributed', name: '(Sem campanha atribuída)', attributionOnly: true, commercialAttribution: true, status: 'ativa', objetivo: '', spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, cpc: 0, lpv: 0, leads: 0, mql: 0, sql: 0, cpmql: 0, cpsql: 0, adsets: [] }
}
/** Não distribui qualificação por gasto ou leads dos anúncios. Conserva cada
 * contato/SQL uma única vez em cada nível, inclusive atribuição ausente. */
export function attributePartnerCampaigns(original: Campaign[], mql: Lead[], sql: VwMarketingFunil[]): Campaign[] {
  const campaigns = original.map(c => ({ ...c, mql: 0, sql: 0, commercialAttribution: true, adsets: c.adsets.map(s => ({ ...s, mql: 0, sql: 0, commercialAttribution: true, ads: s.ads.map(a => ({ ...a, mql: 0, commercialAttribution: true })) })) })) as Campaign[]
  const target = (campaign: unknown, term: unknown, content: unknown) => {
    let c = unique(campaigns.filter(r => !r.attributionOnly), campaign)
    if (!c) { c = campaigns.find(r => r.attributionOnly); if (!c) { c = emptyCampaign(); campaigns.push(c) } }
    let s = unique(c.adsets.filter(r => !r.attributionOnly), term) ?? unique(c.adsets.filter(r => !r.attributionOnly), content)
    if (!s) {
      const matching = c.adsets.filter(r => !r.attributionOnly).flatMap(set => set.ads.filter(a => key(content) && key(a.name) === key(content)).map(ad => ({ set, ad })))
      if (matching.length === 1) s = matching[0].set
    }
    if (!s) { s = c.adsets.find(r => r.attributionOnly); if (!s) { s = emptySet(`${c.id}-unattributed`); c.adsets.push(s) } }
    let a = unique(s.ads.filter(r => !r.attributionOnly), content)
    if (!a) { a = s.ads.find(r => r.attributionOnly); if (!a) { a = emptyAd(`${s.id}-unattributed`); s.ads.push(a) } }
    return { c, s, a }
  }
  for (const r of mql) { const { c, s, a } = target(r.utm_campaign, r.dados_extras?.utm_term, r.dados_extras?.utm_content); c.mql++; s.mql++; a.mql++ }
  for (const r of sql) { const { c, s } = target(r.utm_campaign, r.utm_term, r.utm_content); c.sql++; s.sql++ }
  for (const c of campaigns) {
    c.cpmql = c.mql ? c.spend / c.mql : 0; c.cpsql = c.sql ? c.spend / c.sql : 0
    for (const s of c.adsets) { s.cpmql = s.mql ? s.spend / s.mql : 0; for (const a of s.ads) a.cpmql = a.mql ? a.spend / a.mql : 0 }
  }
  return campaigns
}
