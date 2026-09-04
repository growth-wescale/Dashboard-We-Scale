import { describe, it, expect } from 'vitest'
import { buildSdrRows, buildCloserRows } from '@/lib/performanceRows'
import { toWindow } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import type { MembroRoster } from '@/hooks/useRosterVendas'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'

const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])

const roster: MembroRoster[] = [
  { nome: 'Xayane', cargo: 'SDR', foto: null },
  { nome: 'Douglas', cargo: 'Closer', foto: null },
]

const rosterMulti: MembroRoster[] = [
  { nome: 'Xayane', cargo: 'SDR', foto: null },
  { nome: 'Thiago', cargo: 'SDR', foto: null },
  { nome: 'Douglas', cargo: 'Closer', foto: null },
  { nome: 'Aurélio', cargo: 'Closer', foto: null },
]

const metasSdr: MetaAgregada[] = [
  { nome: 'Xayane', funcao: 'SDR', metaSql: 20, metaAgendamento: 0, metaReuniao: 10, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0, metaSal: 0 },
]
const metasCloser: MetaAgregada[] = [
  { nome: 'Douglas', funcao: 'Closer', metaSql: 0, metaAgendamento: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 100_000, metaQtdVendas: 0, metaSal: 0 },
]

function r(p: Partial<FunnelRow>): FunnelRow {
  return {
    id_lead: 'x', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Oral Unic', nome_funil: 'SDR', origem_comercial: 'Inbound',
    etapa_funil: null, id_etapa_atual: null, status_atual: 'Em andamento',
    nome_negociacao: null, nome_sdr: null, nome_closer: null,
    fonte_macro: null, sub_fonte: null, utm_source: null, sub_fonte_crm: null,
    valor_contrato: null, quantidade_unidades: null, motivo_perda: null,
    data_novo_mql: null, data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    ...p,
  }
}

describe('buildSdrRows', () => {
  it('credita etapas na janela ao nome_sdr e calcula % da meta de SQL', () => {
    const rows = [
      r({ nome_sdr: 'Xayane', data_novo_mql: '2026-08-05', data_agendamento_reuniao_sql: '2026-08-10' }),
      r({ nome_sdr: 'Xayane', data_agendamento_reuniao_sql: '2026-08-12', data_reuniao_realizada: '2026-08-20' }),
      r({ nome_sdr: 'Xayane', data_agendamento_reuniao_sql: '2026-07-30' }), // fora da janela
    ]
    const [row] = buildSdrRows(rows, win, metasSdr, roster)
    expect(row.nome).toBe('Xayane')
    expect(row.mql).toBe(1)
    expect(row.sql).toBe(2)
    expect(row.rr).toBe(1)
    expect(row.metaSql).toBe(20)
    expect(row.pctAting).toBeCloseTo(10, 5) // 2/20
    expect(row.mqlToSql).toBeCloseTo(200, 5) // 2/1
  })

  it('ignora quem não está no roster de SDR e status Excluído', () => {
    const rows = [
      r({ nome_sdr: 'Fantasma', data_agendamento_reuniao_sql: '2026-08-10' }),
      r({ nome_sdr: 'Xayane', status_atual: 'Excluído', data_agendamento_reuniao_sql: '2026-08-10' }),
    ]
    expect(buildSdrRows(rows, win, metasSdr, roster)).toEqual([])
  })

  it('agrega mesma pessoa com casing diferente em uma linha, preservando casing original', () => {
    const rows = [
      r({ nome_sdr: 'Xayane', data_novo_mql: '2026-08-05' }),
      r({ nome_sdr: 'XAYANE', data_agendamento_reuniao_sql: '2026-08-10' }),
    ]
    const result = buildSdrRows(rows, win, metasSdr, roster)
    expect(result).toHaveLength(1) // Deve ser 1 linha, não 2
    expect(result[0].nome).toBe('Xayane') // Casing original da primeira ocorrência
    expect(result[0].mql).toBe(1)
    expect(result[0].sql).toBe(1)
  })

  it('sem metas (array vazio), ordena por SQL desc em vez de ordem de inserção', () => {
    const rows = [
      r({ nome_sdr: 'Xayane', data_agendamento_reuniao_sql: '2026-08-10' }), // 1 SQL
      r({ nome_sdr: 'Thiago', data_agendamento_reuniao_sql: '2026-08-11' }),
      r({ nome_sdr: 'Thiago', data_agendamento_reuniao_sql: '2026-08-12' }), // 2 SQL
    ]
    const result = buildSdrRows(rows, win, [], rosterMulti)
    expect(result.every(x => x.pctAting === 0)).toBe(true)
    expect(result.map(x => x.nome)).toEqual(['Thiago', 'Xayane'])
  })
})

describe('buildCloserRows', () => {
  it('conta ganhos/faturamento só com status Ganho e data_venda na janela', () => {
    const rows = [
      r({ nome_closer: 'Douglas', data_reuniao_realizada: '2026-08-03', status_atual: 'Ganho', data_venda: '2026-08-15', valor_contrato: 60_000 }),
      r({ nome_closer: 'Douglas', status_atual: 'Ganho', data_venda: '2026-07-15', valor_contrato: 999 }), // fora da janela
      r({ nome_closer: 'Douglas', data_venda: '2026-08-20', valor_contrato: 999, status_atual: 'Perdido' }), // não é Ganho
    ]
    const [row] = buildCloserRows(rows, win, metasCloser, roster)
    expect(row.rr).toBe(1)
    expect(row.ganhos).toBe(1)
    expect(row.faturamento).toBe(60_000)
    expect(row.pctAting).toBeCloseTo(60, 5) // 60000/100000
    expect(row.winRate).toBeCloseTo(100, 5) // 1 ganho / 1 rr
  })

  it('agrega mesma pessoa com casing diferente em uma linha, preservando casing original', () => {
    const rows = [
      r({ nome_closer: 'Douglas', data_reuniao_realizada: '2026-08-03', status_atual: 'Ganho', data_venda: '2026-08-15', valor_contrato: 50_000 }),
      r({ nome_closer: 'DOUGLAS', data_sal: '2026-08-10', status_atual: 'Ganho', data_venda: '2026-08-20', valor_contrato: 30_000 }),
    ]
    const result = buildCloserRows(rows, win, metasCloser, roster)
    expect(result).toHaveLength(1) // Deve ser 1 linha, não 2
    expect(result[0].nome).toBe('Douglas') // Casing original da primeira ocorrência
    expect(result[0].rr).toBe(1)
    expect(result[0].sal).toBe(1)
    expect(result[0].ganhos).toBe(2)
    expect(result[0].faturamento).toBe(80_000)
  })

  it('sem metas (array vazio), ordena por faturamento desc em vez de ordem de inserção', () => {
    const rows = [
      r({ nome_closer: 'Douglas', status_atual: 'Ganho', data_venda: '2026-08-10', valor_contrato: 20_000 }),
      r({ nome_closer: 'Aurélio', status_atual: 'Ganho', data_venda: '2026-08-11', valor_contrato: 50_000 }),
    ]
    const result = buildCloserRows(rows, win, [], rosterMulti)
    expect(result.every(x => x.pctAting === 0)).toBe(true)
    expect(result.map(x => x.nome)).toEqual(['Aurélio', 'Douglas'])
  })
})
