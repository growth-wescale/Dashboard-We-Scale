import { describe, it, expect } from 'vitest'
import { resumirTimePorMarca } from '@/hooks/useMetasTimeResumo'
import type { RawMetaTimeRow } from '@/hooks/useMetasTimeResumo'

const base: RawMetaTimeRow = {
  nome_colaborador: 'Fulano', marca: 'Oral Unic', funcao: 'SDR',
  meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null,
  meta_cof: null, meta_financeira: null, meta_qtd_vendas: null,
}

describe('resumirTimePorMarca', () => {
  it('soma SDR e Closer da mesma marca', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, funcao: 'SDR', meta_sql: 30, meta_reuniao_realizada: 20 },
      { ...base, funcao: 'Closer', meta_cof: 10, meta_financeira: 500_000, meta_qtd_vendas: 8 },
    ]
    const m = resumirTimePorMarca(rows)
    expect(m.get('Oral Unic')).toEqual({
      metaSql: 30, metaReuniao: 20, metaCof: 10, metaFinanceira: 500_000, metaQtdVendas: 8,
    })
  })

  it('exclui marcas agregadas (Geral/Outbound/Repasse) e marca nula', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, marca: 'Geral', meta_sql: 99 },
      { ...base, marca: null, meta_sql: 99 },
      { ...base, marca: 'Viva', meta_sql: 5 },
    ]
    const m = resumirTimePorMarca(rows)
    expect([...m.keys()]).toEqual(['Viva'])
    expect(m.get('Viva')!.metaSql).toBe(5)
  })

  it('ignora funcao Repasse e nome nulo', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, funcao: 'Repasse' as unknown as 'SDR', meta_sql: 7 },
      { ...base, nome_colaborador: null, meta_sql: 7 },
    ]
    expect(resumirTimePorMarca(rows).size).toBe(0)
  })
})
