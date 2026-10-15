import { describe, expect, it } from 'vitest'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'
import type { RawMetaRow } from '@/hooks/useMetasPerformance'
import type { ConfigEtapa } from '@/lib/metasEngine'
import {
  arredondarMeta, calcularFunil, definirModoEtapa, linhasEspelho, marcaDeVersao, marcaDoMesAnterior, marcaEmBranco,
  metasPorPessoa, paraConfigEtapas, pendenciasMarca, referenciaDeVersao,
  type MarcaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import { metasConversao } from '@/lib/metaConversao'

// Meta MQL → SQL nas metas do mês (15/10/2026): MQL é uma etapa pendurada no
// SQL, igual às Ligações, e a meta de conversão sai da razão das metas de volume.

function fixo(etapa: ConfigEtapa['etapa'], valorFixo: number): ConfigEtapa {
  return { etapa, modo: 'fixo', valorFixo }
}
const INPOT: EstadoMesMarca = {
  marca: 'Inpot',
  ticketMedio: 74900,
  etapas: [fixo('Reunião Agendada SQL', 69), fixo('Reunião Realizada', 43), fixo('SAL', 28), fixo('Oportunidade COF', 11), fixo('Fechamento', 5)],
  pessoas: [
    { nome: 'Douglas', funcao: 'Closer', peso: 100 },
    { nome: 'Thiago', funcao: 'SDR', peso: 50 },
    { nome: 'Xayane', funcao: 'SDR', peso: 50 },
  ],
}

function comMql(m: MarcaConfig, taxa: number): MarcaConfig {
  return definirModoEtapa(m, 'MQL', { tipo: 'conversao', taxa })
}

describe('etapa MQL na Configuração das Metas', () => {
  it('mês sem MQL na referência começa sem meta de MQL, sem pendência', () => {
    const m = { ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }
    expect(m.etapas.MQL).toEqual({ tipo: 'sem_meta' })
    expect(calcularFunil(m).etapas.MQL.meta).toBeNull()
    expect(pendenciasMarca(m).some(p => p.texto.includes('MQL'))).toBe(false)
  })

  it('marca em branco também começa sem meta de MQL', () => {
    expect(marcaEmBranco('Viva').etapas.MQL).toEqual({ tipo: 'sem_meta' })
  })

  it('conversão MQL → SQL vira meta de MQL = SQL ÷ taxa, arredondada pra cima', () => {
    const m = comMql({ ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }, 0.23)
    const f = calcularFunil(m)
    expect(f.etapas['Reunião Agendada SQL'].meta).toBe(69)
    expect(f.etapas.MQL.meta).toBe(arredondarMeta(69 / 0.23)) // 300
    expect(f.etapas.MQL.taxa).toBe(0.23)
  })

  it('MQL não mexe nas etapas de baixo', () => {
    const base = { ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }
    const sem = calcularFunil(base)
    const com = calcularFunil(comMql(base, 0.2))
    for (const e of ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF', 'Fechamento'] as const) {
      expect(com.etapas[e].meta).toBe(sem.etapas[e].meta)
    }
  })

  it('rascunho salvo antes da etapa MQL (sem a chave) calcula como sem meta', () => {
    const m = { ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }
    const { MQL: _fora, ...semMql } = m.etapas
    const antigo = { ...m, etapas: semMql } as MarcaConfig
    expect(calcularFunil(antigo).etapas.MQL.origem).toBe('sem_meta')
    expect(paraConfigEtapas(antigo).find(c => c.etapa === 'MQL')).toEqual({ etapa: 'MQL', modo: 'desligado' })
  })

  it('SQL sem meta leva o MQL junto, a menos que o MQL seja manual', () => {
    const m = comMql({ ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }, 0.2)
    expect(definirModoEtapa(m, 'Reunião Agendada SQL', { tipo: 'sem_meta' }).etapas.MQL.tipo).toBe('sem_meta')
    const manual = definirModoEtapa(m, 'MQL', { tipo: 'manual', valor: 300 })
    expect(definirModoEtapa(manual, 'Reunião Agendada SQL', { tipo: 'sem_meta' }).etapas.MQL.tipo).toBe('manual')
  })

  it('publica MQL derivado do SQL e a meta de MQL de cada SDR pelo peso', () => {
    const m = comMql({ ...marcaDoMesAnterior(INPOT, 'setembro'), vendas: 5 }, 0.23)
    expect(paraConfigEtapas(m).find(c => c.etapa === 'MQL')).toMatchObject({
      modo: 'derivado', etapaOrigem: 'Reunião Agendada SQL', taxa: 0.23, taxaOrigem: 'manual',
    })
    const pessoas = metasPorPessoa(m)
    expect(pessoas.filter(p => p.funcao === 'SDR').map(p => p.valores.MQL)).toEqual([150, 150])
    const r = { mesReferencia: '2026-10-01', marcas: [m] } as unknown as RascunhoConfig
    const linhas = linhasEspelho(r)
    expect(linhas.find(l => l.nome_colaborador === 'Thiago')!.meta_mql).toBe(150)
    expect(linhas.find(l => l.nome_colaborador === 'Douglas')!.meta_mql).toBeNull()
  })

  it('revisão de uma versão com MQL derivado volta como referência com a mesma taxa', () => {
    const v: EstadoMesMarca = {
      ...INPOT,
      etapas: [...INPOT.etapas, { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Reunião Agendada SQL', taxa: 0.2, taxaOrigem: 'manual' }],
    }
    expect(referenciaDeVersao(v, 'V2').taxas.MQL).toBe(0.2)
    expect(marcaDeVersao(v, 'V2', false).etapas.MQL).toEqual({ tipo: 'referencia' })
  })
})

function sdr(nome: string, marca: string, sql: number, mql: number | null): RawMetaRow {
  return {
    nome_colaborador: nome, marca, mes_referencia: '2026-10-01', funcao: 'SDR',
    meta_sql: sql, meta_agendamento: sql, meta_reuniao_realizada: null,
    meta_cof: null, meta_financeira: null, meta_qtd_vendas: null, meta_volume_sal: null,
    meta_mql: mql,
  }
}

describe('meta de conversão MQL → SQL na Performance', () => {
  const rows = [
    sdr('Thiago', 'Inpot', 35, 152), sdr('Xayane', 'Inpot', 34, 148),   // 69 / 300 = 23%
    sdr('Sarah Padilha', 'Oral Unic', 20, 100),                          // 20 / 100 = 20%
    sdr('Sarah Padilha', 'Viva', 10, null),                              // sem meta de MQL
  ]

  it('é a razão das metas de volume no recorte de marcas', () => {
    expect(metasConversao(rows, { marcas: ['Inpot'] }).mql_sql).toBeCloseTo(23, 6)
    expect(metasConversao(rows, { marcas: ['Inpot', 'Oral Unic'] }).mql_sql).toBeCloseTo((89 / 400) * 100, 6)
  })

  it('marca sem meta de MQL fica fora em vez de zerar a meta do consolidado', () => {
    expect(metasConversao(rows, { marcas: ['Inpot', 'Oral Unic', 'Viva'] }).mql_sql).toBeCloseTo((89 / 400) * 100, 6)
    expect(metasConversao(rows, { marcas: ['Viva'] }).mql_sql).toBeNull()
  })

  it('segue o filtro de SDR', () => {
    expect(metasConversao(rows, { marcas: ['Inpot', 'Oral Unic'], sdrs: ['Sarah Padilha'] }).mql_sql).toBeCloseTo(20, 6)
  })
})
