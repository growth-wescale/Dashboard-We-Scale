import { describe, expect, it } from 'vitest'
import { attributePartnerCampaigns } from './partnerCampaignAttribution'
import type { Campaign } from './campaignTypes'
import type { Lead } from './types'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'

const template = (): Campaign[] => [{ id: 'c', name: 'Campanha', status: 'ativa', objetivo: '', spend: 100, impressions: 1000, clicks: 50, ctr: 5, cpm: 100, cpc: 2, lpv: 30, leads: 20, mql: 99, sql: 99, cpmql: 1, cpsql: 1, adsets: [{ id: 's', name: 'Conjunto', publico: '', spend: 100, impressions: 1000, clicks: 50, ctr: 5, cpm: 100, mql: 99, sql: 99, cpmql: 1, freq: 0, ads: [{ id: 'a', name: 'Anúncio', spend: 100, impressions: 1000, clicks: 50, ctr: 5, mql: 99, cpmql: 1, hue: 0 }] }] }]
const contact = (campaign: string | null, content?: string) => ({ utm_campaign: campaign, dados_extras: { utm_content: content } }) as unknown as Lead
describe('atribuição comercial Partner', () => {
  it('conserva totais em cada nível sem transformar leads de mídia em MQL', () => {
    const original = template()
    const result = attributePartnerCampaigns(original, [contact(' campanha ', 'Anúncio'), contact('Campanha'), contact(null), contact('Não reconhecida')], [{ utm_campaign: 'Campanha' }] as VwMarketingFunil[])
    expect(result.reduce((s,c)=>s+c.mql,0)).toBe(4)
    expect(result.flatMap(c=>c.adsets).reduce((s,c)=>s+c.mql,0)).toBe(4)
    expect(result.flatMap(c=>c.adsets.flatMap(s=>s.ads)).reduce((s,c)=>s+c.mql,0)).toBe(4)
    expect(result[0].mql).toBe(2); expect(result[0].leads).toBe(20); expect(result[0].sql).toBe(1)
    expect(result.reduce((s,c)=>s+c.spend,0)).toBe(100)
    expect(result.find(c=>c.attributionOnly)?.mql).toBe(2)
    expect(original[0].mql).toBe(99)
  })
  it('nome de anúncio ambíguo não inventa conjunto; termo exato resolve', () => {
    const original = template(); original[0].adsets.push({ ...original[0].adsets[0], id: 's2', name: 'Outro' })
    const a=attributePartnerCampaigns(original,[contact('Campanha','Anúncio')],[])
    expect(a[0].adsets.find(s=>s.attributionOnly)?.mql).toBe(1)
    const row=contact('Campanha','Anúncio');row.dados_extras!.utm_term='Conjunto'
    const b=attributePartnerCampaigns(original,[row],[])
    expect(b[0].adsets[0].ads[0].mql).toBe(1)
  })
  it('ausência de mídia não apaga os MQLs nem gera investimento', () => {
    const result=attributePartnerCampaigns([], [contact(null)], [])
    expect(result[0].mql).toBe(1);expect(result[0].spend).toBe(0);expect(result[0].attributionOnly).toBe(true)
  })
})
