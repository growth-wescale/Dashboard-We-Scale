import { expect, it } from 'vitest'
import { attributeLisoCampaigns } from './lisoCampaignAttribution'
import type { Campaign } from './campaignTypes'
import type { Lead, MediaDailyRaw } from './types'
const campaigns = [{ id: 'c', name: 'Search', spend: 100, mql: 999, sql: 999, adsets: [] }] as unknown as Campaign[]
const leads = [{ utm_campaign: '123', dados_extras: { lead_type: 'MQL' } }] as unknown as Lead[]
const media = [{ campanha_id: '123', campanha: 'Search' }] as (MediaDailyRaw & { campanha_id: string })[]
it('atribui ID exato da ouro sem estimar MQL e preserva os objetos originais', () => {
  const result = attributeLisoCampaigns(campaigns, leads, [], media)
  expect(result[0].mql).toBe(1)
  expect(result[0].spend).toBe(100)
  expect(result.flatMap(c => c.adsets.flatMap(s => s.ads)).reduce((n, a) => n + a.mql, 0)).toBe(1)
  expect(leads[0].utm_campaign).toBe('123')
  expect(campaigns[0].mql).toBe(999)
})
it('ID com nomes ambíguos conserva MQL sem inventar campanha', () => {
  const result = attributeLisoCampaigns(campaigns, leads, [], [...media, { ...media[0], campanha: 'Outra' }])
  expect(result[0].mql).toBe(0)
  expect(result.find(c => c.attributionOnly)?.mql).toBe(1)
})
