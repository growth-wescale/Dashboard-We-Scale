import { describe, expect, it } from 'vitest'
import { gerarSemanas, type ConfigEtapa, type LinhaEspelho } from '@/lib/metasEngine'
import type { EstadoMes, EstadoMesMarca } from '@/hooks/useMetaMes'
import { detalharVersao, etapaAbaixo } from '@/lib/detalheVersaoMeta'

function derivado(etapa: ConfigEtapa['etapa'], etapaOrigem: ConfigEtapa['etapa'], taxa: number): ConfigEtapa {
  return { etapa, modo: 'derivado', etapaOrigem, taxa, taxaOrigem: 'manual' }
}

const INPOT: EstadoMesMarca = {
  marca: 'Inpot',
  ticketMedio: 74900,
  etapas: [
    { etapa: 'Fechamento', modo: 'fixo', valorFixo: 6 },
    derivado('Oportunidade COF', 'Fechamento', 0.5),
    derivado('SAL', 'Oportunidade COF', 0.4),
    derivado('Reunião Realizada', 'SAL', 0.6),
    derivado('Reunião Agendada SQL', 'Reunião Realizada', 0.625),
    { etapa: 'Ligações', modo: 'fixo', valorFixo: 1800 },
    derivado('MQL', 'Reunião Agendada SQL', 0.2),
  ],
  pessoas: [
    { nome: 'Douglas', funcao: 'Closer', peso: 100 },
    { nome: 'Xayane', funcao: 'SDR', peso: 50 },
    { nome: 'Sarah Padilha', funcao: 'SDR', peso: 50 },
  ],
}

const VIVA: EstadoMesMarca = {
  marca: 'Viva',
  ticketMedio: 69900,
  etapas: [
    { etapa: 'Fechamento', modo: 'fixo', valorFixo: 1 },
    derivado('Oportunidade COF', 'Fechamento', 0.5),
    { etapa: 'SAL', modo: 'desligado' },
    { etapa: 'Reunião Realizada', modo: 'desligado' },
    { etapa: 'Reunião Agendada SQL', modo: 'desligado' },
    { etapa: 'Ligações', modo: 'desligado' },
    { etapa: 'MQL', modo: 'desligado' },
  ],
  pessoas: [
    { nome: 'Douglas', funcao: 'Closer', peso: 100 },
    { nome: 'Sarah Padilha', funcao: 'SDR', peso: 100 },
  ],
}

function linha(marca: string, nome: string, funcao: 'SDR' | 'Closer', v: Partial<LinhaEspelho>): LinhaEspelho {
  return {
    mes_referencia: '2026-10-01', marca, nome_colaborador: nome, funcao,
    meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null, meta_volume_sal: null,
    meta_cof: null, meta_financeira: null, meta_qtd_vendas: null, meta_mql: null, ...v,
  }
}

const ESPELHO: LinhaEspelho[] = [
  linha('Viva', 'Sarah Padilha', 'SDR', {}),
  linha('Viva', 'Douglas', 'Closer', { meta_cof: 2, meta_qtd_vendas: 1, meta_financeira: 69900 }),
  linha('Inpot', 'Xayane', 'SDR', { meta_sql: 40, meta_reuniao_realizada: 25, meta_volume_sal: '15', meta_mql: 200 }),
  linha('Inpot', 'Sarah Padilha', 'SDR', { meta_sql: 40, meta_reuniao_realizada: 25, meta_volume_sal: '15', meta_mql: 200 }),
  linha('Inpot', 'Douglas', 'Closer', { meta_cof: 12, meta_qtd_vendas: 6, meta_financeira: 449400 }),
]

const OUTUBRO: EstadoMes = {
  status: 'publicado',
  diaViradaSemana: 'terca',
  semanas: gerarSemanas('2026-10-01', 'terca'),
  marcas: [VIVA, INPOT],
  distribuicaoSemanal: [
    { marca: 'Inpot', nomePessoa: 'Douglas', semanaNumero: 1, etapa: 'Fechamento', valor: 2 },
    { marca: 'Inpot', nomePessoa: 'Douglas', semanaNumero: 3, etapa: 'Fechamento', valor: 4 },
    { marca: 'Inpot', nomePessoa: 'Douglas', semanaNumero: 3, etapa: 'Oportunidade COF', valor: 8 },
  ],
}

const V5 = { id: 19, numero: 5, rotulo: 'v5', origem: 'hub' as const, linhasEspelho: ESPELHO }

describe('detalharVersao — funil por marca', () => {
  const d = detalharVersao('2026-10-01', V5, OUTUBRO)

  it('ordena as marcas como o resto do dashboard', () => {
    expect(d.marcas.map(m => m.marca)).toEqual(['Inpot', 'Viva'])
  })

  it('reconstrói metas e conversões da configuração gravada', () => {
    const inpot = d.marcas[0]
    expect(inpot.vendas).toBe(6)
    expect(inpot.ticketMedio).toBe(74900)
    expect(inpot.faturamento).toBe(449400)
    expect(inpot.etapas.Fechamento).toEqual({ meta: 6, taxa: null, fixo: false })
    expect(inpot.etapas['Oportunidade COF']).toEqual({ meta: 12, taxa: 0.5, fixo: false })
    expect(inpot.etapas.SAL.meta).toBe(30)
    expect(inpot.etapas['Reunião Realizada'].meta).toBe(50)
    expect(inpot.etapas['Reunião Agendada SQL'].meta).toBe(80)
    expect(inpot.etapas.MQL).toEqual({ meta: 400, taxa: 0.2, fixo: false })
  })

  it('marca número digitado à mão como fixo, com a conversão implícita', () => {
    const lig = d.marcas[0].etapas['Ligações']
    expect(lig.meta).toBe(1800)
    expect(lig.fixo).toBe(true)
    expect(lig.taxa).toBeCloseTo(80 / 1800, 9)
  })

  it('etapa sem meta fica vazia, sem conversão', () => {
    expect(d.marcas[1].etapas.SAL).toEqual({ meta: null, taxa: null, fixo: false })
    expect(d.marcas[1].etapas.MQL).toEqual({ meta: null, taxa: null, fixo: false })
  })

  it('total soma as marcas e a conversão usa só quem tem as duas pontas', () => {
    expect(d.total.vendas).toBe(7)
    expect(d.total.faturamento).toBe(519300)
    expect(d.total.ticketMedio).toBeCloseTo(519300 / 7, 6)
    expect(d.total.etapas['Oportunidade COF']).toMatchObject({ meta: 14, taxa: 0.5 })
    // Viva não tem SAL: a conversão SAL → Oportunidade do total é só a da Inpot (12/30), não 14/30.
    expect(d.total.etapas.SAL).toMatchObject({ meta: 30, taxa: 0.4 })
    expect(d.total.etapas.MQL).toMatchObject({ meta: 400, taxa: 0.2 })
  })
})

describe('detalharVersao — pessoas', () => {
  it('lê as metas congeladas do espelho, somando as marcas da pessoa', () => {
    const d = detalharVersao('2026-10-01', V5, OUTUBRO)
    expect(d.closers).toEqual([{
      nome: 'Douglas', funcao: 'Closer',
      marcas: [
        { marca: 'Inpot', peso: 100, valores: { 'Oportunidade COF': 12, Fechamento: 6 }, faturamento: 449400 },
        { marca: 'Viva', peso: 100, valores: { 'Oportunidade COF': 2, Fechamento: 1 }, faturamento: 69900 },
      ],
      valores: { 'Oportunidade COF': 14, Fechamento: 7 },
      faturamento: 519300,
    }])
    expect(d.sdrs.map(p => p.nome)).toEqual(['Sarah Padilha', 'Xayane'])
    expect(d.sdrs[0]).toEqual({
      nome: 'Sarah Padilha', funcao: 'SDR',
      marcas: [
        { marca: 'Inpot', peso: 50, valores: { MQL: 200, 'Reunião Agendada SQL': 40, 'Reunião Realizada': 25, SAL: 15 }, faturamento: null },
        // Na Viva ela está no time, mas sem meta de SDR: a marca aparece vazia.
        { marca: 'Viva', peso: 100, valores: {}, faturamento: null },
      ],
      valores: { MQL: 200, 'Reunião Agendada SQL': 40, 'Reunião Realizada': 25, SAL: 15 },
      faturamento: null,
    })
  })

  it('versão importada: sem peso e meta quebrada arredondada pra cima depois de somar', () => {
    const importada = {
      ...V5, origem: 'importado' as const,
      linhasEspelho: [
        linha('Inpot', 'Xayane', 'SDR', { meta_sql: 36.85 }),
        linha('Viva', 'Xayane', 'SDR', { meta_sql: 36.85 }),
      ],
    }
    const [xay] = detalharVersao('2026-10-01', importada, OUTUBRO).sdrs
    // Cada marca fica como veio da planilha; só o total arredonda (73,7 → 74), senão as linhas somariam 37 + 37.
    expect(xay.marcas.map(m => [m.marca, m.peso, m.valores['Reunião Agendada SQL']])).toEqual([['Inpot', null, 36.85], ['Viva', null, 36.85]])
    expect(xay.valores['Reunião Agendada SQL']).toBe(74)
  })
})

describe('detalharVersao — semanas', () => {
  it('mostra só as marcas com vendas distribuídas', () => {
    const d = detalharVersao('2026-10-01', V5, OUTUBRO)
    expect(d.diaViradaSemana).toBe('terca')
    expect(d.semanas).toHaveLength(OUTUBRO.semanas.length)
    expect(d.vendasPorSemana).toEqual([{ marca: 'Inpot', porSemana: [2, 0, 4, 0, 0], total: 6 }])
  })
})

describe('etapaAbaixo', () => {
  it('aponta pra etapa da conversão', () => {
    expect(etapaAbaixo('MQL')).toBe('Reunião Agendada SQL')
    expect(etapaAbaixo('Ligações')).toBe('Reunião Agendada SQL')
    expect(etapaAbaixo('Oportunidade COF')).toBe('Fechamento')
    expect(etapaAbaixo('Fechamento')).toBeNull()
  })
})
