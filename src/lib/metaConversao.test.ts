import { describe, it, expect } from 'vitest'
import { metasConversao } from './metaConversao'
import { META_NO_SHOW_MAX } from '@/constants/metasVendas'
import type { RawMetaRow } from '@/hooks/useMetasPerformance'

// Fixture = recorte real de DB_Metas_Performance em set/2026 (mes_referencia
// 2026-09-01), conferido por SQL contra a base de Expansão.
function sdr(nome: string, marca: string, sql: number, rr: number, sal: number): RawMetaRow {
  return {
    nome_colaborador: nome, marca, mes_referencia: '2026-09-01', funcao: 'SDR',
    meta_sql: sql, meta_agendamento: sql, meta_reuniao_realizada: rr,
    meta_cof: null, meta_financeira: null, meta_qtd_vendas: null,
    meta_volume_sal: String(sal),
  }
}
function closer(nome: string, marca: string, cof: number | null, vendas: number): RawMetaRow {
  return {
    nome_colaborador: nome, marca, mes_referencia: '2026-09-01', funcao: 'Closer',
    meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null,
    meta_cof: cof, meta_financeira: 0, meta_qtd_vendas: vendas,
    meta_volume_sal: null,
  }
}

const SET_26: RawMetaRow[] = [
  sdr('Sarah Padilha', 'Eletrovias', 27.5, 15.95, 10),
  sdr('Sarah Padilha', 'Oral Unic', 30.8, 17.6, 11),
  sdr('Sarah Padilha', 'Viva', 15.4, 9.9, 7),
  sdr('Thiago', 'B2Case', 27.5, 15.95, 10),
  sdr('Thiago', 'Eletrovias', 27.5, 15.95, 10),
  sdr('Thiago', 'Inpot', 33.55, 21.45, 14),
  sdr('Thiago', 'Lisô Laser', 11.0, 5.5, 3),
  sdr('Xayane', 'B2Case', 27.5, 15.95, 10),
  sdr('Xayane', 'Inpot', 33.55, 21.45, 14),
  sdr('Xayane', 'Lisô Laser', 11.0, 5.5, 3),
  closer('Aurélio Briano', 'Odonto Scale', null, 5),
  closer('Aurélio Briano', 'Oral Unic', 4.4, 2),
  closer('Aurélio Briano', 'Viva', 2.6, 1),
  closer('Bruna', 'B2Case', 7.5, 4),
  closer('Bruna', 'Lisô Laser', 2.2, 2),
  closer('Douglas', 'Inpot', 10.6, 5),
  closer('Jéssica', 'Eletrovias', 7.5, 6),
]

const TODAS = ['B2Case', 'Eletrovias', 'Inpot', 'Lisô Laser', 'Odonto Scale', 'Oral Unic', 'Viva']

describe('metasConversao', () => {
  it('deriva as conversões do SDR no consolidado', () => {
    const m = metasConversao(SET_26, { marcas: TODAS })
    // SQL 245,3 · RR 145,2 · SAL 92 (soma dos 3 SDRs em todas as marcas)
    expect(m.sql_diag).toBeCloseTo((145.2 / 245.3) * 100, 4)
    expect(m.diag_sal).toBeCloseTo((92 / 145.2) * 100, 4)
    expect(m.sql_sal).toBeCloseTo((92 / 245.3) * 100, 4)
  })

  it('muda o número quando a marca muda', () => {
    const liso = metasConversao(SET_26, { marcas: ['Lisô Laser'] })
    const oral = metasConversao(SET_26, { marcas: ['Oral Unic'] })
    // Lisô: RR 11 / SQL 22 · Oral Unic: RR 17,6 / SQL 30,8
    expect(liso.sql_diag).toBeCloseTo(50, 4)
    expect(oral.sql_diag).toBeCloseTo((17.6 / 30.8) * 100, 4)
    expect(liso.sql_diag).not.toBeCloseTo(oral.sql_diag!, 2)
  })

  it('filtra por SDR sem estreitar quando o SDR cobre várias marcas', () => {
    const m = metasConversao(SET_26, { marcas: TODAS, sdrs: ['Thiago'] })
    // Thiago: SQL 99,55 · RR 58,85 · SAL 37
    expect(m.sql_diag).toBeCloseTo((58.85 / 99.55) * 100, 4)
    expect(m.sql_sal).toBeCloseTo((37 / 99.55) * 100, 4)
  })

  it('deriva as conversões do Closer usando a meta de SAL da marca', () => {
    const m = metasConversao(SET_26, { marcas: TODAS, closers: ['Douglas'] })
    // Douglas só tem Inpot: COF 10,6 · vendas 5 · SAL da marca 28 · RR 42,9
    expect(m.sal_cof).toBeCloseTo((10.6 / 28) * 100, 4)
    expect(m.cof_fech).toBeCloseTo((5 / 10.6) * 100, 4)
    expect(m.sal_fech).toBeCloseTo((5 / 28) * 100, 4)
    // O filtro de Closer estreita o universo de marcas: Diagnóstico → SAL da
    // Inpot (28/42,9), não o consolidado (92/145,2).
    expect(m.diag_sal).toBeCloseTo((28 / 42.9) * 100, 4)
    expect(m.diag_sal).not.toBeCloseTo((92 / 145.2) * 100, 2)
  })

  it('separa as marcas de um mesmo Closer', () => {
    const oral = metasConversao(SET_26, { marcas: ['Oral Unic'], closers: ['Aurélio Briano'] })
    const viva = metasConversao(SET_26, { marcas: ['Viva'], closers: ['Aurélio Briano'] })
    expect(oral.cof_fech).toBeCloseTo((2 / 4.4) * 100, 4)
    expect(viva.cof_fech).toBeCloseTo((1 / 2.6) * 100, 4)
  })

  it('ignora a marca que só tem uma das duas pontas', () => {
    // Odonto Scale tem 5 vendas e nenhum COF — entrar na conta daria 5/0.
    const so = metasConversao(SET_26, { marcas: ['Odonto Scale'] })
    expect(so.cof_fech).toBeNull()

    const com = metasConversao(SET_26, { marcas: ['Odonto Scale', 'Inpot'] })
    expect(com.cof_fech).toBeCloseTo((5 / 10.6) * 100, 4) // só a Inpot entra
  })

  it('ignora as linhas agregadas da tabela', () => {
    const comGeral = [...SET_26, sdr('Time', 'Geral', 999, 999, 999), closer('Time', 'Repasse', 99, 99)]
    expect(metasConversao(comGeral, { marcas: [...TODAS, 'Geral', 'Repasse'] }).sql_diag)
      .toBeCloseTo(metasConversao(SET_26, { marcas: TODAS }).sql_diag!, 6)
  })

  it('devolve null quando o recorte não tem meta', () => {
    expect(metasConversao([], { marcas: TODAS }).sql_diag).toBeNull()
    expect(metasConversao(SET_26, { marcas: [] }).sql_diag).toBeNull()
    // Closer que não cobre a marca selecionada → sem interseção.
    expect(metasConversao(SET_26, { marcas: ['Inpot'], closers: ['Jéssica'] }).cof_fech).toBeNull()
  })

  it('cruza filtro de SDR com filtro de Closer pela interseção de marcas', () => {
    // Xayane: B2Case, Inpot, Lisô · Bruna: B2Case, Lisô → sobram B2Case e Lisô.
    const m = metasConversao(SET_26, { marcas: TODAS, sdrs: ['Xayane'], closers: ['Bruna'] })
    expect(m.sql_diag).toBeCloseTo(((15.95 + 5.5) / (27.5 + 11.0)) * 100, 4)
    expect(m.cof_fech).toBeCloseTo(((4 + 2) / (7.5 + 2.2)) * 100, 4)
  })

  it('no-show é teto fixo, não derivado', () => {
    expect(metasConversao(SET_26, { marcas: TODAS }).no_show).toBe(META_NO_SHOW_MAX)
    expect(metasConversao([], { marcas: [] }).no_show).toBe(META_NO_SHOW_MAX)
  })
})
