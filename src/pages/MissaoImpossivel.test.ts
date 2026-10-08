import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DadosMissao } from '@/lib/missaoMetas'
const mocks = vi.hoisted(() => ({ acesso: true, hook: vi.fn() }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ pode: () => mocks.acesso, carregando: false }) }))
vi.mock('@/hooks/useMissaoResumo', () => ({ useMissaoResumo: mocks.hook }))
import { MissaoImpossivel, MissaoPainel } from './MissaoImpossivel'
import { pacingTrimestre } from '@/lib/missaoMetas'

const dados: DadosMissao = { hoje: '2026-10-07', atualizadoEm: '2026-10-07T12:00:00Z', vendas: [], metas: [], etapas: [], midia: [] }
describe('Missão: apresentação e isolamento', () => {
  it('pacing trimestral inclusivo não rateia receita e limita início/fim', () => {
    expect(pacingTrimestre('2026-09-30')).toBe(0)
    expect(pacingTrimestre('2026-10-01')).toBeCloseTo(1 / 92)
    expect(pacingTrimestre('2026-10-08')).toBeCloseTo(8 / 92)
    expect(pacingTrimestre('2026-12-31')).toBe(1)
    expect(pacingTrimestre('2027-01-01')).toBe(1)
  })
  it('MQL com meta mostra percentual; sem meta mantém barra neutra sem zero fictício', () => {
    const lead: NonNullable<DadosMissao['leads']>[number] = { id: 'a', dia: '2026-10-01', marca: 'Inpot', email: 'teste', telefone: null, dados_extras: { lead_type: 'MQL' }, nome: null, uf: null, cidade: null, utm_source: null, utm_medium: null, utm_campaign: null, formulario: null, row_hash: null, criado_em: '2026-10-01T12:00:00Z' }
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, leads: [lead], metasMql: [{ marca: 'Inpot', valor_meta: 2 }] } }))
    expect(html).toContain('0,61% atingidos')
    expect(html).not.toContain('Percentual de MQL pendente')
    expect(html).toContain('esperado pelos dias transcorridos do trimestre')
  })
  it('preserva os dois placares e mostra nove cards mensais sem vendas por marca', () => {
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados }))
    expect(html).toContain('Meta anual · 2026'); expect(html).toContain('Missão · outubro a dezembro')
    expect(html).toContain('4.932.000,00'); expect(html).toContain('2.068.360,00')
    expect(html).not.toContain('Unidades vendidas no mês')
    expect((html.match(/<article/g) ?? []).length).toBe(9)
    expect(html).toContain('MQL e CP-MQL · Inpot')
    expect(html).toContain('SQL · reuniões agendadas'); expect(html).toContain('>SAL<')
    expect(html).toContain('Pacing de investimento'); expect(html).toContain('CP-MQL'); expect(html).toContain('/ 164'); expect(html).toContain('/ 757'); expect(html).toContain('/ 96')
  })
  it('nega acesso antes de iniciar leitura', () => {
    mocks.acesso = false; mocks.hook.mockClear()
    expect(renderToStaticMarkup(createElement(MissaoImpossivel))).toContain('Sem acesso')
    expect(mocks.hook).not.toHaveBeenCalled(); mocks.acesso = true
  })
  it('falha nunca renderiza zeros ou totais parciais', () => {
    mocks.hook.mockReturnValue({ data: dados, error: 'Falha na consulta', loading: false, bloqueado: false, atualizar: vi.fn() })
    const html = renderToStaticMarkup(createElement(MissaoImpossivel))
    expect(html).toContain('role="alert"'); expect(html).not.toContain('Receita realizada')
  })
  it('fora de Q4 omite blocos mensais e não mostra janeiro contra orçamento de outubro', () => {
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, hoje: '2027-01-01' } }))
    expect(html).toContain('não se aplicam'); expect(html).not.toContain('Unidades vendidas no mês'); expect(html).not.toContain('Pacing de investimento')
  })
})
