import { describe, expect, it } from 'vitest'
import { desvios, diffRegra, rotuloFonteTime, textoBarreira, type RegraRow } from './regras'

function regra(p: Partial<RegraRow>): RegraRow {
  return {
    id: 1, marca: 'Eletrovias', marca_rd: 'Eletrovias', versao: 1, vigente_de: '2026-10-16T12:00:00Z', vigente_ate: null,
    modo: 'sombra', evento_identificador: 'eletrovias_multistep', id_funil: 'f', id_etapa: 'e', campaign_id: null,
    barreira_campo: null, barreira_valores_barrados: [], responsavel_padrao_user_id: 'u', nome_formato: null,
    campos_extra: {}, time_proprio: null, criado_por: 'x', criado_em: '2026-10-16T12:00:00Z', motivo: null, ...p,
  }
}

describe('textoBarreira', () => {
  it('sem campo ou sem valores = sem barreira', () => {
    expect(textoBarreira(null, [])).toBe('sem barreira')
    expect(textoBarreira('cf_capital', [])).toBe('sem barreira')
  })
  it('lista os valores barrados com "ou"', () => {
    expect(textoBarreira('cf_capital', ['Até R$ 50 mil', 'De R$ 50 mil a R$ 100 mil']))
      .toBe('barra quando cf_capital é Até R$ 50 mil ou De R$ 50 mil a R$ 100 mil')
    expect(textoBarreira('cf_capital', ['Até R$ 60.000'])).toBe('barra quando cf_capital é Até R$ 60.000')
  })
})

describe('diffRegra', () => {
  it('uma frase por campo que mudou', () => {
    const antes = regra({ modo: 'sombra', barreira_campo: null, barreira_valores_barrados: [] })
    const depois = regra({ versao: 2, modo: 'ativo', barreira_campo: 'cf_capital', barreira_valores_barrados: ['Até R$ 50 mil'] })
    expect(diffRegra(antes, depois)).toEqual([
      'modo: sombra → ativo',
      'barreira: sem barreira → barra quando cf_capital é Até R$ 50 mil',
    ])
  })
  it('nada mudou = lista vazia (versão e datas não contam)', () => {
    expect(diffRegra(regra({}), regra({ versao: 2, vigente_de: '2026-10-17T00:00:00Z', criado_em: '2026-10-17T00:00:00Z' }))).toEqual([])
  })
  it('time próprio e responsável padrão aparecem no diff', () => {
    const d = diffRegra(regra({}), regra({ responsavel_padrao_user_id: 'u2', time_proprio: [{ nome: 'Sarah Padilha', peso: 100 }] }))
    expect(d).toEqual(['responsável padrão: u → u2', 'time próprio: (nenhum) → Sarah Padilha 100%'])
  })
})

describe('desvios', () => {
  it('desvio = recebidos − peso × total, ordenado do mais abaixo pro mais acima', () => {
    const r = desvios(
      [{ nome: 'Sarah Padilha', peso: 50 }, { nome: 'Thiago', peso: 20 }, { nome: 'Xayane', peso: 30 }],
      { 'Sarah Padilha': 23, Thiago: 9, Xayane: 14 },
    )
    expect(r).toEqual([
      { nome: 'Xayane', peso: 30, recebidos: 14, pctRecebido: 30.43, desvio: 0.2 },
      { nome: 'Thiago', peso: 20, recebidos: 9, pctRecebido: 19.57, desvio: -0.2 },
      { nome: 'Sarah Padilha', peso: 50, recebidos: 23, pctRecebido: 50, desvio: 0 },
    ].sort((a, b) => a.desvio - b.desvio))
    expect(r[0].nome).toBe('Thiago')
  })
  it('sem leads ainda: 0 recebidos, 0%, desvio 0', () => {
    expect(desvios([{ nome: 'A', peso: 100 }], {})).toEqual([{ nome: 'A', peso: 100, recebidos: 0, pctRecebido: 0, desvio: 0 }])
  })
})

describe('rotuloFonteTime', () => {
  it('traduz a fonte do time', () => {
    expect(rotuloFonteTime('versao_ativa')).toBe('meta do mês')
    expect(rotuloFonteTime('versao_anterior')).toBe('última meta publicada (sem meta neste mês)')
    expect(rotuloFonteTime('time_proprio')).toBe('time próprio (marca sem meta)')
    expect(rotuloFonteTime('nenhum')).toBe('sem SDR elegível')
    expect(rotuloFonteTime(null)).toBe('sem SDR elegível')
  })
})
