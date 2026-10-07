import { describe, expect, it } from 'vitest'
import { etapasMissao, metaCadastrada, MESES_MISSAO, pacingMissao, proximoDia, realizadoMissao, type MetaMissaoRow, type VendaMissaoRow } from './missaoMetas'

const meta: MetaMissaoRow = { mes_referencia: '2026-10-01', marca: 'Inpot', funcao: 'Closer', meta_financeira: 1000, meta_qtd_vendas: 2, meta_sql: null, meta_volume_sal: null }
const venda: VendaMissaoRow = { id_lead: 'teste', ciclo: 1, marca: 'Inpot', status_atual: 'Ganho', valor_contrato: 100.25, quantidade_unidades: 3, data_venda: '2026-10-02T12:00:00Z' }

describe('Missão: metas publicadas sem alterações comerciais', () => {
  it('não apresenta outubro como uma meta completa de Q4', () => {
    expect(metaCadastrada([meta], 'Inpot', MESES_MISSAO, 'meta_financeira')).toEqual({ valor: null, parcial: 1000, faltantes: ['2026-11-01', '2026-12-01'] })
  })
  it('soma parcelas dos Closers sem incluir valores de SDR ou outras marcas', () => {
    expect(metaCadastrada([meta, meta, { ...meta, funcao: 'SDR' }, { ...meta, marca: 'Eletrovias' }], 'Inpot', ['2026-10-01'], 'meta_qtd_vendas').valor).toBe(4)
  })
  it('SQL/SAL vêm dos SDRs; null não vira zero', () => {
    const sdr = { ...meta, funcao: 'SDR', meta_sql: 5, meta_volume_sal: '2.5' }
    expect(metaCadastrada([sdr, { ...sdr, funcao: 'Closer' }], 'Inpot', ['2026-10-01'], 'meta_sql').valor).toBe(5)
    expect(metaCadastrada([sdr], 'Inpot', ['2026-10-01'], 'meta_volume_sal').valor).toBe(2.5)
    expect(metaCadastrada([{ ...sdr, meta_sql: null }], 'Inpot', ['2026-10-01'], 'meta_sql').valor).toBeNull()
  })
  it('respeita uma meta explicitamente zero, mas não parcela nula/inválida', () => {
    expect(metaCadastrada([{ ...meta, meta_qtd_vendas: 0 }], 'Inpot', ['2026-10-01'], 'meta_qtd_vendas').valor).toBe(0)
    expect(metaCadastrada([meta, { ...meta, meta_qtd_vendas: null }], 'Inpot', ['2026-10-01'], 'meta_qtd_vendas').valor).toBeNull()
  })
  it('Q4 completo soma os três meses cadastrados, sem ratear receita', () => {
    expect(metaCadastrada(MESES_MISSAO.map(m => ({ ...meta, mes_referencia: m })), 'Inpot', MESES_MISSAO, 'meta_financeira').valor).toBe(3000)
  })
})

describe('Missão: realizado', () => {
  it('aplica trava Ganho, dedupe por ciclo, quantidade e receita sem multiplicar', () => {
    const r = realizadoMissao([venda, venda, { ...venda, ciclo: 2 }, { ...venda, id_lead: 'revertido', status_atual: 'Perdido' }], '2026-01-01', '2026-12-31')
    expect(r).toEqual({ receita: 200.5, unidades: 6, negocios: 2, semValor: 0 })
  })
  it('distingue anual, trimestre e marca sem excluir origens ou marcas secundárias', () => {
    const rows = [venda, { ...venda, id_lead: 'setembro', data_venda: '2026-09-30T12:00:00Z', marca: 'Viva' }]
    expect(realizadoMissao(rows, '2026-01-01', '2026-10-07').receita).toBe(200.5)
    expect(realizadoMissao(rows, '2026-10-01', '2026-10-07').receita).toBe(100.25)
    expect(realizadoMissao(rows, '2026-01-01', '2026-10-07', 'Viva').receita).toBe(100.25)
  })
  it('respeita virada em Brasília, datas futuras e ausência de valor/unidades', () => {
    const rows = [venda, { ...venda, id_lead: 'virada', data_venda: '2026-10-01T02:59:59Z' }, { ...venda, id_lead: 'sem-valor', valor_contrato: null, quantidade_unidades: null }, { ...venda, id_lead: 'futuro', data_venda: '2026-10-08' }]
    expect(realizadoMissao(rows, '2026-10-01', '2026-10-07')).toEqual({ receita: 100.25, unidades: 4, negocios: 2, semValor: 1 })
  })
  it('preserva ajustes de receita negativos e fallback de unidades de Vendas', () => {
    expect(realizadoMissao([{ ...venda, valor_contrato: -10.25, quantidade_unidades: -2 }], '2026-10-01', '2026-10-07')).toEqual({ receita: -10.25, unidades: 1, negocios: 1, semValor: 0 })
  })
  it('SQL e SAL usam datas próprias, por ciclo, não duplicam handoff nem exigem Ganho', () => {
    const row = { id_lead: 'teste', ciclo: 1, marca: 'Inpot', status_atual: 'Em andamento', data_agendamento_reuniao_sql: '2026-10-01T03:00:00Z', data_sal: '2026-10-03' }
    expect(etapasMissao([row, row, { ...row, ciclo: 2, data_sal: null }, { ...row, id_lead: 'fora', data_agendamento_reuniao_sql: '2026-10-01T02:00:00Z', data_sal: '2026-10-08' }], 'Inpot', '2026-10-01', '2026-10-07')).toEqual({ sql: 2, sal: 1 })
    expect(etapasMissao([{ ...row, status_atual: 'Excluído' }, { ...row, marca: 'Viva' }], 'Inpot', '2026-10-01', '2026-10-07')).toEqual({ sql: 0, sal: 0 })
  })
})

describe('Missão: pacing mensal', () => {
  it('rateia só orçamento, soma mídia até hoje e marca proporção de dias corridos', () => {
    const row = { id: 'm1', marca: 'Inpot', dia: '2026-10-01', canal: 'meta', spend_brl: 100 }
    const r = pacingMissao([row, row, { ...row, id: 'm2', spend_brl: 200, canal: 'google' }, { ...row, id: 'futuro', dia: '2026-10-08' }], 'Inpot', 90_000, '2026-10-07')
    expect(r.gasto).toBe(300); expect(r.orcamento).toBe(36_000)
    expect(r.previsto).toBeCloseTo(36_000 * 7 / 31)
    expect(r.ritmo).toBeCloseTo(300 / (36_000 * 7 / 31))
  })
  it('dezembro recebe 20%; não inventa orçamento fora da missão', () => {
    expect(pacingMissao([], 'Inpot', 90_000, '2026-12-31').orcamento).toBe(18_000)
    expect(pacingMissao([], 'Inpot', 90_000, '2027-01-01').orcamento).toBeNull()
    expect(proximoDia('2026-12-31')).toBe('2027-01-01')
  })
})
