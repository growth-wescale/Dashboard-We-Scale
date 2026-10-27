import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({ marcas: ['we-scale'], requests: [] as { marca?: string; dataInicio?: string; dataFim?: string }[] }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ marcas: state.marcas }) }))
vi.mock('@/hooks/useMediaData', () => ({ useMarketingMediaData: (p: object) => { state.requests.push(p); return { data: [], loading: false, error: null } } }))
vi.mock('@/hooks/useSopLeads', () => ({ useSopLeads: (p: { marca: string; dataInicio: string; dataFim: string }) => {
  state.requests.push(p)
  const rows = ['2026-08-16', '2026-10-18'].map((dia, i) => ({ id: i, dia, nome: `Fixture ${i}`, marca: 'We Scale', dados_extras: { lead_type: 'MQL', utm_term: 'LLK' } }))
  return { data: p.marca === 'We Scale' ? rows.filter(r => r.dia >= p.dataInicio && r.dia <= p.dataFim) : [], loading: false, error: null }
} }))
vi.mock('@/hooks/useSopVendasFunil', () => ({ useSopVendasFunil: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useSopSqlEvents', () => ({ useSopSqlEvents: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useSopScalePartnerSales', () => ({ useSopScalePartnerSales: () => ({ sales: [], loading: false, error: null }) }))
vi.mock('@/hooks/useBeautyInscricoes', () => ({ beautyOuroEnabled: true, useBeautyInscricoes: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMarketingFunilVendas', () => ({ useMarketingFunilVendas: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMetas', () => ({ useMetas: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMediaOdontoLegacy', () => ({ useMediaOdontoLegacy: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useMediaComunidadeLegacy', () => ({ useMediaComunidadeLegacy: () => ({ data: [], loading: false, error: null }) }))
vi.mock('@/hooks/useBeautyMarketing', () => ({ lisoOuroEnabled: false, useBeautyMarketing: () => ({ enabled: false, data: [], loading: false, error: null }) }))

import { SopMarketing } from './SopMarketing'

describe('Partner mantém a folha original com dados do fechamento', () => {
  beforeEach(() => { state.marcas = ['we-scale']; state.requests.length = 0 })

  it('atualiza cards, mantém detalhamento consultado e não acrescenta folha', () => {
    const html = renderToStaticMarkup(createElement(SopMarketing))
    expect(html).toContain('Fechamento 15/08 a 19/10')
    expect(html).toContain('R$ 21.1k') // formato compacto original do card
    expect(html).toContain('R$ 414')
    expect(html).toContain('13.718,00')
    expect(html).toContain('>98<')
    expect(html).toContain('>51<')
    expect(html).toContain('>6<')
    expect(html).toContain('MQL Semanal')
    expect(html).toContain('Leads mapeados por evento')
    expect(html).toContain('Fixture 0') // agosto não pode desaparecer por carregar só cinco semanas
    expect(html).toContain('Fixture 1')
    expect(html).toContain('BC · INSCRIÇÕES')
    expect(html).toContain('1/2') // Partner original + Funil Atual
    expect(html).not.toContain('Scale Partner — Fechamento')
    expect(state.requests.filter(p => p.marca === 'We Scale' && p.dataFim === '2026-10-19'))
      .toContainEqual({ marca: 'We Scale', dataInicio: '2026-08-15', dataFim: '2026-10-19' })
  })

  it('não aplica o período nem o snapshot a outra marca', () => {
    state.marcas = ['viva']
    const html = renderToStaticMarkup(createElement(SopMarketing))
    expect(html).not.toContain('Fechamento 15/08 a 19/10')
    expect(html).not.toContain('13.718,00')
    expect(state.requests.some(p => p.marca === 'Viva' && p.dataInicio === '2026-08-15')).toBe(false)
  })
})
