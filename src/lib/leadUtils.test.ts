import { describe, expect, it } from 'vitest'
import { deduplicateLeads, isLeadMql, marketingMqlRows } from './leadUtils'
import { buildMqlVolume } from './mqlVolume'
import type { Lead } from './types'

const row = (id: string, extra: Record<string, unknown> = {}, overrides: Partial<Lead> = {}): Lead => ({
  id, dia: '2026-10-10', marca: 'Eletrovias', nome: null, email: 'same@example.test', telefone: null,
  uf: null, cidade: null, formulario: null, utm_source: null, utm_medium: null, utm_campaign: null,
  row_hash: null, criado_em: '2026-10-10T12:00:00Z', dados_extras: extra, ...overrides,
})
const deal = (id: string, overrides: Partial<Lead> = {}) => row(id, { metric_grain: 'crm_deal', conta_id: 'wescale_principal_crm', id_deal: id }, overrides)

describe('MQL de Eletrovias por negociação', () => {
  it('conta negócios distintos do mesmo contato, sem contato e sem qualificação adicional', () => {
    const rows = [deal('sdr'), deal('closer'), deal('missing', { email: null }), deal('sdr')]
    expect(marketingMqlRows(rows).map(r => r.id)).toEqual(['sdr', 'closer', 'missing'])
    expect(deduplicateLeads(rows)).toEqual([])
  })
  it('LP/contatos continuam disponíveis mas não duplicam MQLs nem mudam datas de criação', () => {
    const rows = [row('lp', { metric_grain: 'contact_only', lead_type: 'MQL' }), deal('crm', { dia: '2026-10-11' })]
    expect(deduplicateLeads(rows).map(r => r.id)).toEqual(['lp'])
    expect(marketingMqlRows(rows).map(r => [r.id, r.dia])).toEqual([['crm', '2026-10-11']])
    const volume = buildMqlVolume([], rows, ['eletrovias'], { start: '2026-10-10', end: '2026-10-11' }, '2026-10-31')
    expect(volume.days.map(d => d.mql)).toEqual([0, 1])
    expect(volume.mql).toBe(1)
  })
  it.each(['Oral Unic', 'Odonto Scale', 'Lisô Laser', 'We Scale', 'Inpot', 'Eletrovias'] as const)('preserva integralmente a regra anterior para %s sem ativação', marca => {
    const rows = [row('lead', { lead_type: 'LEAD' }, { marca }), row('mql', { lead_type: 'MQL' }, { marca }), row('event', { lead_type_original: 'MQL', evento: 'evento' }, { marca })]
    expect(marketingMqlRows(rows)).toEqual(deduplicateLeads(rows).filter(isLeadMql))
    expect(marketingMqlRows(rows, true)).toEqual(deduplicateLeads(rows.filter(isLeadMql)))
  })
  it('rejeita um negócio sem ID ao invés de inventar identidade', () => {
    expect(() => marketingMqlRows([row('bad', { metric_grain: 'crm_deal' })])).toThrow('identificador')
  })
})
