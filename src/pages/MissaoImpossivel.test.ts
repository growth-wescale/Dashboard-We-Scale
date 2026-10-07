import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const h = vi.hoisted(() => ({ acesso: true, loading: false, error: null as string | null, crmLoading: false, crmError: null as string | null,
  mediaLoading: false, mediaError: null as string | null, chamadas: 0 }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ pode: () => h.acesso, carregando: h.loading }) }))
vi.mock('@/hooks/useMissaoDados', () => ({ useMissaoDados: () => {
  h.chamadas++
  return { deals: { loading: h.crmLoading, error: h.crmError, data: [
    { id_lead: 'teste', ciclo: 1, marca: 'Viva', status_atual: 'Ganho', data_venda: '2026-10-02', valor_contrato: 12345.67 },
    { id_lead: 'sem-valor', ciclo: 1, marca: 'B2Case', status_atual: 'Ganho', data_venda: '2026-10-02', valor_contrato: null },
  ] }, events: { data: [], loading: false, error: h.error } }
} }))
vi.mock('@/hooks/useMediaData', () => ({ useMediaData: () => ({ data: [], loading: h.mediaLoading, error: h.mediaError }) }))
vi.mock('@/hooks/useLeads', () => ({ useLeads: () => ({ data: [], loading: h.mediaLoading, error: h.mediaError }) }))
vi.mock('./MetaCopaB2B', () => ({ MetaCopaB2B: () => null }))
import { MissaoImpossivel } from './MissaoImpossivel'

beforeEach(() => {
  Object.assign(h, { acesso: true, loading: false, error: null, crmLoading: false, crmError: null, mediaLoading: false, mediaError: null, chamadas: 0 })
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })
const render = () => renderToStaticMarkup(createElement(MissaoImpossivel))

describe('tela Missão Impossível (renderização sem navegador)', () => {
  it('mostra placares independentes, prioridade, orçamentos e controles', () => {
    const html = render()
    for (const text of ['Missão Impossível', '4.932.000', '2.068.360', '12.345,67', 'Inpot', 'Eletrovias', 'Lisô Laser', '238.000', '36.000', '30.400', '28.800', 'Ano · 2026', 'Criação', 'Oral Unic']) {
      expect(html.toLowerCase()).toContain(text.toLowerCase())
    }
    expect(html).toContain('sem valor de contrato')
    expect(html).toContain('aria-expanded="false"')
  })
  it('não inicia consulta sem permissão ou enquanto o acesso carrega', () => {
    h.acesso = false; expect(render()).toContain('Sem acesso'); expect(h.chamadas).toBe(0)
    h.loading = true; expect(render()).toContain('Verificando acesso'); expect(h.chamadas).toBe(0)
  })
  it('erro de receita oculta valores anteriores, não mostra zero como resultado', () => {
    h.crmError = 'erro'; const html = render()
    expect(html).toContain('Não foi possível carregar')
    expect(html).not.toContain('12.345,67')
    expect(html).not.toContain('atingidos')
  })
  it('falha nos eventos não esconde a receita validamente carregada', () => {
    h.error = 'eventos'; const html = render()
    expect(html).toContain('12.345,67')
    expect(html).toContain('Não foi possível carregar')
    expect(html).not.toContain('0 ÷ 0')
  })
  it('loading de Marketing não bloqueia os placares nem os seletores', () => {
    h.mediaLoading = true; const html = render()
    expect(html).toContain('Carregando dados')
    expect(html).toContain('12.345,67')
    expect(html).toContain('Aplicar período')
  })
  it('base vazia exibe traço nas taxas e CP-MQL, não falso 0%', () => {
    const html = render()
    expect(html).toContain('0 ÷ 0')
    expect(html).toContain('—')
    expect(html).toContain('Orçamento mínimo a definir')
  })
})
