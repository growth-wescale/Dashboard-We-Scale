import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Lead } from '@/lib/types'
import { deduplicateLeads, isLeadMql } from '@/lib/leadUtils'
import { isLisoSopFranchiseLead } from '@/lib/lisoSopScope'

const state = vi.hoisted(() => ({ marcas: ['liso-laser'], ouro: true, leads: [] as Lead[] }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ marcas: state.marcas }) }))
vi.mock('@/hooks/useMediaData', () => ({ useMarketingMediaData: () => ({ data: [{ dia: '2026-10-20', spend_brl: 100 }], loading: false, error: null }) }))
vi.mock('@/hooks/useSopLeads', () => ({ useSopLeads: (p: { marca: string; dataInicio: string; dataFim: string }) => ({
  data: state.leads.filter(r => r.marca === p.marca && r.dia >= p.dataInicio && r.dia <= p.dataFim), loading: false, error: null,
}) }))
vi.mock('@/hooks/useSopVendasFunil', () => ({ useSopVendasFunil: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useSopSqlEvents', () => ({ useSopSqlEvents: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useSopScalePartnerSales', () => ({ useSopScalePartnerSales: () => ({ sales: [], loading: false, error: null }) }))
vi.mock('@/hooks/useBeautyInscricoes', () => ({ beautyOuroEnabled: false, useBeautyInscricoes: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMarketingFunilVendas', () => ({ useMarketingFunilVendas: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMetas', () => ({ useMetas: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMediaOdontoLegacy', () => ({ useMediaOdontoLegacy: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMediaComunidadeLegacy', () => ({ useMediaComunidadeLegacy: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useBeautyMarketing', () => ({
  get lisoOuroEnabled() { return state.ouro },
  useBeautyMarketing: (start: string, end: string, active: boolean) => ({
    enabled: state.ouro && active, start, end,
    data: [{ deals: 3, contacts: 3, spend: 60 }], loading: false, error: null,
  }),
}))

import { SopMarketing } from './SopMarketing'

function row(id: string, overrides: Partial<Lead> = {}): Lead {
  return { id, marca: 'Lisô Laser', dia: '2026-10-20', email: `${id}@example.test`, formulario: 'lisolaser_multistep', dados_extras: { lead_type: 'MQL' }, ...overrides } as Lead
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('S&OP separa MQL de Franquia e Beauty antes de deduplicar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T12:00:00-03:00'))
    state.marcas = ['liso-laser']
    state.ouro = true
    state.leads = [
      row('beauty-form', { email: 'shared@example.test', formulario: 'beautyconnection_multistep' }),
      row('franquia', { email: 'shared@example.test' }),
      row('franquia-crm', { formulario: null, dados_extras: { lead_type: 'MQL', segmento: 'liso' } }),
      row('beauty-crm', { formulario: null, dados_extras: { lead_type: 'MQL', segmento: 'beauty' } }),
      row('lead', { dados_extras: { lead_type: 'LEAD' } }),
    ]
  })
  afterEach(() => vi.useRealTimers())

  it.each([true, false])('mantém dois MQLs de franquia e CP-MQL de R$50, ouro=%s', ouro => {
    state.ouro = ouro
    const html = renderToStaticMarkup(createElement(SopMarketing))
    expect(text(html)).toContain('Lisô Laser — Franquia')
    expect(text(html)).toMatch(/MQL 2 /)
    expect(text(html)).toMatch(/CP-MQL R\$ 50 /)
    expect(text(html)).toContain('MQLs da franquia · Beauty Connection contabilizado separadamente')
    expect(html.includes('aria-label="Beauty Connection"')).toBe(ouro)
    if (ouro) expect(text(html)).toContain('Contatos MQL 3')
  })

  it('não modifica as fontes nem transforma Lead em MQL', () => {
    const original = structuredClone(state.leads)
    const scoped = deduplicateLeads(state.leads.filter(isLisoSopFranchiseLead))
    expect(scoped.map(r => r.id)).toEqual(['franquia', 'franquia-crm', 'lead'])
    expect(scoped.filter(isLeadMql)).toHaveLength(2)
    expect(state.leads).toEqual(original)
  })

  it.each(['2026-09-20', '2026-10-20', '2026-11-02'])('separa pelo formulário/segmento também em %s', dia => {
    const scoped = state.leads.map(r => ({ ...r, dia })).filter(isLisoSopFranchiseLead)
    expect(scoped.filter(isLeadMql)).toHaveLength(2)
  })

  it('preserva a contagem de outras folhas', () => {
    state.marcas = ['viva']
    state.leads = state.leads.map(r => ({ ...r, marca: 'Viva', email: `${r.id}@example.test` }))
    const html = renderToStaticMarkup(createElement(SopMarketing))
    expect(text(html)).toMatch(/MQL 4 /)
    expect(html).not.toContain('MQLs da franquia')
  })
})
