import { describe, expect, it } from 'vitest'
import { partnerEventCounts, partnerSalesInPeriod, type SopPartnerSale } from './sopScalePartner'
import type { Lead } from './types'

const sale = (patch: Partial<SopPartnerSale> = {}): SopPartnerSale => ({
  id_lead: 'deal-a', ciclo: 1, marca: 'Scale Partner',
  status_atual: 'Ganho', data_venda: '2026-10-09T18:00:00Z', valor_contrato: 2997, utm_source: 'instagram', ...patch,
})

describe('Scale Partner exclusivo S&OP', () => {
  it('conta ganhos por negócio/ciclo e data da venda em Brasília, não por data de captação', () => {
    const rows = [sale(), sale(), sale({ ciclo: 2 }), sale({ id_lead: 'antigo', data_venda: '2026-10-01T02:00:00Z' }),
      sale({ id_lead: 'virada', data_venda: '2026-11-01T02:59:59Z' }),
      sale({ id_lead: 'seguinte', data_venda: '2026-11-01T03:00:00Z' }),
      sale({ id_lead: 'revertido', status_atual: 'Perdido' }), sale({ id_lead: 'sem-data', data_venda: null }),
      sale({ id_lead: 'outra-marca', marca: 'Lisô Laser' }), sale({ id_lead: 'alias', marca: 'We Scale' })]
    expect(partnerSalesInPeriod(rows, '2026-10-01', '2026-10-31').map(r => `${r.id_lead}:${r.ciclo}`))
      .toEqual(['deal-a:1', 'deal-a:2', 'virada:1', 'alias:1'])
  })
  it('respeita fonte e mantém venda sem valor sem inventar receita', () => {
    const rows = [sale(), sale({ id_lead: 'b', valor_contrato: null, utm_source: null })]
    expect(partnerSalesInPeriod(rows, '2026-10-01', '2026-10-19', 'Digital · Pago')).toHaveLength(1)
    expect(partnerSalesInPeriod(rows, '2026-10-01', '2026-10-19').reduce((sum, r) => sum + (r.valor_contrato ?? 0), 0)).toBe(2997)
  })
  it('usa adset/UTM confirmadas sem jogar ADV+, Saúde/Beleza ou ausências em geral', () => {
    const lead = (dados_extras: Record<string, unknown>) => ({ dados_extras }) as Lead
    const groups = partnerEventCounts([lead({ adset: 'ODONTOLOGIA' }), lead({ utm_term: '50_ODONTOLOGIA_EVT_SCALEPARTNER' }),
      lead({ utm_term: '50_LLK_EVT_SCALEPARTNER' }), lead({ utm_term: '50_ADV+' }), lead({ utm_term: 'SAUDE-BELEZA' }), lead({})])
    expect(groups.map(g => g.n)).toEqual([2, 1, 3])
    expect(groups.reduce((n, g) => n + g.n, 0)).toBe(6)
    expect(groups.some(g => g.label.includes('Beauty'))).toBe(false)
  })
})
