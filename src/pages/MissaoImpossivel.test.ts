import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DadosMissao } from '@/lib/missaoMetas'
const mocks = vi.hoisted(() => ({ acesso: true, hook: vi.fn() }))
vi.mock('@/contexts/AcessoContext', () => ({ useAcesso: () => ({ pode: () => mocks.acesso, carregando: false }) }))
vi.mock('@/hooks/useMissaoResumo', () => ({ useMissaoResumo: mocks.hook }))
import { MissaoImpossivel, MissaoPainel } from './MissaoImpossivel'
import { pacingTrimestre } from '@/lib/missaoMetas'

const dados: DadosMissao = { hoje: '2026-10-07', atualizadoEm: '2026-10-07T12:00:00Z', vendas: [],
  metas: ['Inpot', 'Eletrovias', 'Lisô Laser'].map(marca => ({ mes_referencia: '2026-10-01', marca, funcao: 'Closer', meta_qtd_vendas: marca === 'Lisô Laser' ? 2 : 3, meta_financeira: null, meta_sql: null, meta_volume_sal: null })), etapas: [], midia: [] }
describe('Missão: apresentação e isolamento', () => {
  it('marca pacing mensal e anual, e CP-MQL usa referência de eficiência', () => {
    const lead: NonNullable<DadosMissao['leads']>[number] = { id: 'a', dia: '2026-10-01', marca: 'Inpot', email: 'teste', telefone: null, dados_extras: { lead_type: 'MQL' }, nome: null, uf: null, cidade: null, utm_source: null, utm_medium: null, utm_campaign: null, formulario: null, row_hash: null, criado_em: '2026-10-01T12:00:00Z' }
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, leads: [lead] } }))
    expect(html).toContain(`left:${7 / 31 * 100}%`)
    expect(html).toContain('title="Referência: 100%"')
    expect(html).toContain('Traço: 100% de eficiência')
    expect(html).toContain('title="Referência: 76,71%"')
  })
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
    expect(html).toContain('0,59% atingidos')
    expect(html).not.toContain('meta pendente')
    expect(html).toContain('esperado pelos dias transcorridos do trimestre')
    const pendente = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, metas: [] } }))
    expect(pendente).toContain('meta pendente')
    expect(pendente).toContain('falta completar a meta de vendas dos Closers deste mês')
    expect(pendente).toContain('Comparação com a meta de MQL pendente.')
    expect(pendente).not.toContain('/ 164'); expect(pendente).not.toContain('/ 757'); expect(pendente).not.toContain('/ 96')
  })
  it('preserva os dois placares e mostra nove cards mensais sem vendas por marca', () => {
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados }))
    expect(html).toContain('Meta anual · 2026'); expect(html).toContain('Missão · outubro a dezembro')
    expect(html).toContain('4.932.000,00'); expect(html).toContain('2.068.360,00')
    expect(html).not.toContain('Unidades vendidas no mês')
    expect((html.match(/<article/g) ?? []).length).toBe(9)
    expect(html).toContain('MQL e CP-MQL · Inpot')
    expect(html).toContain('SQL · reuniões agendadas'); expect(html).toContain('>SAL<')
    expect(html).toContain('Pacing de investimento'); expect(html).toContain('CP-MQL'); expect(html).toContain('/ 170'); expect(html).toContain('/ 310'); expect(html).toContain('/ 180')
    expect((html.match(/Projeção com mídia paga/g) ?? []).length).toBe(3)
    expect(html).toContain('≈ 164'); expect(html).toContain('≈ 757'); expect(html).toContain('≈ 96')
    expect(html).toContain('96,47% da meta de MQL')
    expect(html).toContain('aria-label="Projeção de MQL com mídia paga · Inpot"')
    expect(html).toContain('Taxas do print: MQL → SQL 23% · SQL → SAL 39% · SAL → Venda 20%')
    expect(html).toContain('São referências de planejamento, não conversões observadas no CRM')
    expect(html).toContain('base: 3 vendas cadastradas no mês')
  })
  it('metas não diminuem com vendas realizadas; zero não divide por zero', () => {
    const venda = { id_lead: 'ganho', ciclo: 1, marca: 'Inpot', status_atual: 'Ganho', valor_contrato: 100, quantidade_unidades: 1, data_venda: '2026-10-02' }
    const html = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, vendas: [venda] } }))
    expect(html).toContain('/ 170'); expect(html).toContain('100,00')
    const zero = renderToStaticMarkup(createElement(MissaoPainel, { dados: { ...dados, metas: dados.metas.map(m => ({ ...m, meta_qtd_vendas: 0 })) } }))
    expect(zero).toContain('Meta 0'); expect(zero).not.toMatch(/NaN|Infinity|meta pendente/)
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
