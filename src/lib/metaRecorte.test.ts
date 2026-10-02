import { describe, expect, it } from 'vitest'
import { metaDoRecorte } from './metaRecorte'
import type { RawMetaRow } from '@/hooks/useMetasPerformance'

function linha(p: Partial<RawMetaRow>): RawMetaRow {
  return {
    nome_colaborador: null, marca: null, mes_referencia: '2026-09-01', funcao: null,
    meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null, meta_cof: null,
    meta_financeira: null, meta_qtd_vendas: null, meta_volume_sal: null, ...p,
  }
}

const rows: RawMetaRow[] = [
  linha({ nome_colaborador: 'Xayane', marca: 'Inpot', funcao: 'SDR', meta_sql: 30, meta_reuniao_realizada: 18, meta_volume_sal: '14' }),
  linha({ nome_colaborador: 'Xayane', marca: 'B2Case', funcao: 'SDR', meta_sql: 20, meta_reuniao_realizada: 10, meta_volume_sal: '10' }),
  linha({ nome_colaborador: 'Thiago', marca: 'Inpot', funcao: 'SDR', meta_sql: 30, meta_reuniao_realizada: 18, meta_volume_sal: '14' }),
  linha({ nome_colaborador: 'Douglas', marca: 'Inpot', funcao: 'Closer', meta_cof: 10, meta_qtd_vendas: 5, meta_financeira: 300000 }),
  linha({ nome_colaborador: 'Bruna', marca: 'B2Case', funcao: 'Closer', meta_cof: 4, meta_qtd_vendas: 3, meta_financeira: 30000 }),
  linha({ nome_colaborador: 'Fulano', marca: 'Geral', funcao: 'SDR', meta_sql: 999 }),
  linha({ nome_colaborador: 'Repasse', marca: 'Inpot', funcao: 'Repasse', meta_sql: 999, meta_cof: 999 }),
]

describe('metaDoRecorte', () => {
  it('sem filtro de pessoa soma o time das marcas selecionadas', () => {
    expect(metaDoRecorte(rows, { marcas: ['Inpot', 'B2Case'] })).toEqual({
      metaSql: 80, metaReuniao: 46, metaSal: 38, metaCof: 14, metaQtdVendas: 8, metaFinanceira: 330000,
    })
  })

  it('filtro de SDR estreita só a meta do lado SDR', () => {
    const m = metaDoRecorte(rows, { marcas: ['Inpot', 'B2Case'], sdrs: ['Xayane'] })
    expect(m.metaSql).toBe(50)
    expect(m.metaReuniao).toBe(28)
    expect(m.metaSal).toBe(24)
    expect(m.metaCof).toBe(14)
  })

  it('filtro de Closer estreita só o lado Closer', () => {
    const m = metaDoRecorte(rows, { marcas: ['Inpot', 'B2Case'], closers: ['Douglas'] })
    expect(m.metaSql).toBe(80)
    expect(m.metaCof).toBe(10)
    expect(m.metaQtdVendas).toBe(5)
    expect(m.metaFinanceira).toBe(300000)
  })

  it('cruza pessoa com marca e ignora caixa/espaço no nome', () => {
    expect(metaDoRecorte(rows, { marcas: ['Inpot'], sdrs: [' xayane '] }).metaSql).toBe(30)
  })

  it('pessoa sem meta no recorte zera o lado dela', () => {
    expect(metaDoRecorte(rows, { marcas: ['Inpot'], sdrs: ['Sarah Padilha'] }).metaSql).toBe(0)
  })
})
