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
it('Eletrovias conserva cada MQL em campanha, conjunto e anúncio sem rateio por gasto', () => {
  const original = [{ id: 'c', name: 'ELETROVIAS_FORMS_AON - MQL', spend: 100, mql: 999, sql: 999, adsets: [
    { id: 's', name: 'Conjunto real', spend: 100, mql: 999, sql: 999, ads: [{ id: 'a', name: 'Anúncio real', spend: 100, mql: 999 }] },
  ] }] as unknown as Campaign[]
  const source = [
    { marca: 'Eletrovias', utm_campaign: '52683550378024', dados_extras: { lead_type: 'MQL', utm_term: 'set-id', utm_content: 'ad-id' } },
    { marca: 'Eletrovias', utm_campaign: 'ELETROVIAS_FORMS_AON - MQL', dados_extras: { lead_type: 'MQL' } },
    { marca: 'Eletrovias', utm_campaign: 'm_google', dados_extras: { lead_type: 'MQL' } },
    { marca: 'Eletrovias', utm_campaign: null, dados_extras: { lead_type: 'MQL' } },
  ] as unknown as Lead[]
  const result = attributeLisoCampaigns(original, source, [], [{ marca: 'Eletrovias', campanha_id: '52683550378024', campanha: original[0].name, grupo_id: 'set-id', conjunto: 'Conjunto real', anuncio_id: 'ad-id', anuncio: 'Anúncio real' }] as unknown as Parameters<typeof attributeLisoCampaigns>[3])
  expect(result.reduce((s, c) => s + c.mql, 0)).toBe(4)
  expect(result.flatMap(c => c.adsets).reduce((s, c) => s + c.mql, 0)).toBe(4)
  expect(result.flatMap(c => c.adsets.flatMap(a => a.ads)).reduce((s, c) => s + c.mql, 0)).toBe(4)
  expect(result[0].mql).toBe(2)
  expect(result[0].adsets[0].ads[0].mql).toBe(1)
  expect(result.find(c => c.attributionOnly)?.mql).toBe(2)
  expect(result.reduce((s, c) => s + c.spend, 0)).toBe(100)
  expect(source[0].utm_campaign).toBe('52683550378024')
  expect(original[0].mql).toBe(999)
})
