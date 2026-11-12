import { describe, expect, it } from 'vitest'
import { marketingMqlRows } from './leadUtils'
import { sqlDosMqlsDoPeriodo } from './sqlDosMqlsDoPeriodo'
import type { Lead } from './types'

const inicio = '2026-11-06', fim = '2026-11-12'
function lead(id: string, extra: Record<string, unknown>, overrides: Partial<Lead> = {}): Lead {
  return { id, marca: 'Eletrovias', dia: inicio, nome: null, email: null, telefone: null,
    cidade: null, uf: null, utm_source: null, utm_medium: null, utm_campaign: null,
    formulario: null, row_hash: null, criado_em: '', dados_extras: { lead_type: 'MQL', ...extra }, ...overrides }
}
const deal = (id: string, overrides?: Partial<Lead>) => lead(id, { metric_grain: 'crm_deal', conta_id: 'a', id_deal: id }, overrides)
const sql = (id: string, dia: string, marca = 'Eletrovias', ciclo = 1) => ({ marca, id_lead: id, data_sql: dia, ciclo })
function contar(rows: Lead[], sqls: ReturnType<typeof sql>[]) {
  const periodo = rows.filter(row => row.dia >= inicio && row.dia <= fim)
  return sqlDosMqlsDoPeriodo(marketingMqlRows(periodo), periodo, sqls, inicio, fim)
}
describe('SQLs dos MQLs do período', () => {
  it('exige mesma marca, criação e SQL dentro da janela e conta cada negócio uma vez', () => {
    const rows = [deal('novo'), deal('antigo', { dia: '2026-11-05' }), deal('depois'),
      deal('outra-marca'), deal('antes', { dia: fim }), deal('limite')]
    expect(contar(rows, [sql('novo', inicio), sql('novo', fim, 'Eletrovias', 2), sql('antigo', fim),
      sql('depois', '2026-11-13T03:00:00Z'), sql('outra-marca', fim, 'Inpot'),
      sql('antes', inicio), sql('limite', '2026-11-13T02:59:00Z')])).toEqual({ convertidos: 2, semVinculo: 0 })
  })
  it('usa a hora de criação da ouro quando o SQL tem horário no mesmo dia', () => {
    const rows = [deal('antes', { criado_em: inicio + 'T14:00:00Z' }), deal('depois', { criado_em: inicio + 'T14:00:00Z' })]
    expect(contar(rows, [sql('antes', inicio + 'T13:00:00Z'), sql('depois', inicio + 'T15:00:00Z')])).toEqual({ convertidos: 1, semVinculo: 0 })
  })
  it('considera os negócios vinculados ao contato deduplicado e respeita o ciclo quando identificado', () => {
    const row = (id: string, extra: Record<string, unknown>, email: string | null = null) =>
      lead(id, extra, { marca: 'We Scale', email })
    const rows = [row('1', { id_deal: 'd1' }, 'mesmo'), row('2', { id_deal: 'd2', ciclo_mql: 2 }, 'mesmo'),
      row('3', { id_deal: 'd3', ciclo_mql: 1 }), row('4', { crm_deal_ids: ['d4', 'd5'] }),
      row('sem-vinculo', {}), row('nao-mql', { lead_type: 'LEAD' })]
    expect(contar(rows, [sql('d2', fim, 'We Scale', 2), sql('d3', fim, 'We Scale', 2),
      sql('d5', inicio, 'We Scale'), sql('sem-vinculo', fim, 'We Scale')])).toEqual({ convertidos: 2, semVinculo: 1 })
    expect(contar([], [])).toEqual({ convertidos: 0, semVinculo: 0 })
  })
})
