import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DadosMissao } from '@/lib/missaoMetas'
const mocks = vi.hoisted(() => ({ acesso: true, hook: vi.fn() }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ pode: () => mocks.acesso, carregando: false }) }))
vi.mock('@/hooks/useMissaoResumo', () => ({ useMissaoResumo: mocks.hook }))
import { MissaoImpossivel, MissaoPainel } from './MissaoImpossivel'

const dados: DadosMissao = { hoje: '2026-10-07', atualizadoEm: '2026-10-07T12:00:00Z', vendas: [], metas: [], etapas: [], midia: [] }
describe('Missão: apresentação e isolamento', () => {
  it('preserva os dois placares e mostra nove cards mensais sem vendas por marca', () => {
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados }))
    expect(html).toContain('Meta anual · 2026'); expect(html).toContain('Missão · outubro a dezembro')
    expect(html).toContain('4.932.000,00'); expect(html).toContain('2.068.360,00')
    expect(html).not.toContain('Unidades vendidas no mês')
    expect((html.match(/<article/g) ?? []).length).toBe(9)
    expect(html).toContain('MQL e CP-MQL · Inpot')
    expect(html).toContain('SQL · reuniões agendadas'); expect(html).toContain('>SAL<')
    expect(html).toContain('Pacing de investimento'); expect(html).toContain('CP-MQL'); expect(html).toContain('Total e atingimento pendentes')
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
