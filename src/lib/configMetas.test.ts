import { describe, expect, it } from 'vitest'
import { gerarSemanas, resolverFunilMarca, type ConfigEtapa } from '@/lib/metasEngine'
import type { EstadoMes, EstadoMesMarca } from '@/hooks/useMetaMes'
import {
  ajustarPeso, arredondarMeta, calcularFunil, definirModoEtapa, distribuicaoDerivada, distribuirProporcional,
  distribuirVendasProporcional, dividirIgualmente, marcaDeVersao, marcaDoMesAnterior, marcaEmBranco, marcasDisponiveis,
  mesAnterior, encaixarFaixas, metasPessoaSemana, metasPorPessoa, metasPorSemana, repartirInteiro, repartirMatriz, montarPublicacao, moverDivisa, normalizarPesos, ordenarMarcas,
  paraConfigEtapas, pendenciasMarca, rascunhoDeVersao, rascunhoDoMesAnterior, rascunhoEmBranco, referenciaDeVersao,
  resumoRascunho, statusMarca, vendasDistribuidas,
  type MarcaConfig,
} from '@/lib/configMetas'

// V1 real de setembro/2026 (importada: tudo `fixo`), conferida no banco em 30/09.
function fixo(etapa: ConfigEtapa['etapa'], valorFixo: number): ConfigEtapa {
  return { etapa, modo: 'fixo', valorFixo }
}
const INPOT_SET: EstadoMesMarca = {
  marca: 'Inpot',
  ticketMedio: 74900,
  etapas: [
    fixo('Ligações', 1557.6), fixo('Reunião Agendada SQL', 67.1), fixo('Reunião Realizada', 42.9),
    fixo('SAL', 28), fixo('Oportunidade COF', 10.6), fixo('Fechamento', 5),
  ],
  pessoas: [
    { nome: 'Douglas', funcao: 'Closer', peso: 100 },
    { nome: 'Thiago', funcao: 'SDR', peso: 50 },
    { nome: 'Xayane', funcao: 'SDR', peso: 50 },
  ],
}
const ODONTO_SET: EstadoMesMarca = {
  marca: 'Odonto Scale',
  ticketMedio: 5597,
  etapas: [fixo('Fechamento', 5)],
  pessoas: [{ nome: 'Aurélio Briano', funcao: 'Closer', peso: 100 }],
}
const SETEMBRO: EstadoMes = {
  status: 'publicado', diaViradaSemana: 'terca', semanas: gerarSemanas('2026-09-01', 'terca'),
  marcas: [ODONTO_SET, INPOT_SET], distribuicaoSemanal: [],
}

function inpotOutubro(vendas: number | null = 6): MarcaConfig {
  return { ...marcaDoMesAnterior(INPOT_SET, 'setembro'), vendas }
}

describe('arredondarMeta', () => {
  it('arredonda pra cima e ignora ruído de ponto flutuante', () => {
    expect(arredondarMeta(10.6)).toBe(11)
    expect(arredondarMeta(28.000000000000004)).toBe(28)
    expect(arredondarMeta(0)).toBe(0)
    expect(arredondarMeta(-3)).toBe(0)
  })
})

describe('mesAnterior', () => {
  it('volta um mês, virando o ano', () => {
    expect(mesAnterior('2026-10-01')).toBe('2026-09-01')
    expect(mesAnterior('2027-01-01')).toBe('2026-12-01')
  })
})

describe('referenciaDeVersao', () => {
  it('tira a conversão implícita dos números fixos da V1 importada', () => {
    const ref = referenciaDeVersao(INPOT_SET, 'setembro')
    expect(ref.rotulo).toBe('setembro')
    expect(ref.vendas).toBe(5)
    expect(ref.ticketMedio).toBe(74900)
    expect(ref.taxas['Oportunidade COF']).toBeCloseTo(5 / 10.6, 6)
    expect(ref.taxas.SAL).toBeCloseTo(10.6 / 28, 6)
    expect(ref.taxas['Reunião Realizada']).toBeCloseTo(28 / 42.9, 6)
    expect(ref.taxas['Reunião Agendada SQL']).toBeCloseTo(42.9 / 67.1, 6)
    expect(ref.taxas['Ligações']).toBeCloseTo(67.1 / 1557.6, 6)
    expect(ref.valores).toMatchObject({ Fechamento: 5, 'Oportunidade COF': 11, SAL: 28, 'Reunião Realizada': 43, 'Reunião Agendada SQL': 68, 'Ligações': 1558 })
  })

  it('prefere a taxa gravada quando a etapa derivava da de baixo', () => {
    const estado: EstadoMesMarca = {
      ...INPOT_SET,
      etapas: [fixo('Fechamento', 5), { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'Fechamento', taxa: 0.5, taxaOrigem: 'manual' }],
    }
    expect(referenciaDeVersao(estado, 'V1').taxas['Oportunidade COF']).toBe(0.5)
  })

  it('marca sem etapas acima de Vendas não tem taxa nenhuma', () => {
    expect(referenciaDeVersao(ODONTO_SET, 'setembro').taxas).toEqual({})
  })
})

describe('marcaDoMesAnterior', () => {
  it('traz ticket, conversões e pessoas, mas deixa as vendas em branco', () => {
    const m = marcaDoMesAnterior(INPOT_SET, 'setembro')
    expect(m.vendas).toBeNull()
    expect(m.ticketMedio).toBe(74900)
    expect(Object.values(m.etapas).every(e => e.tipo === 'referencia')).toBe(true)
    expect(m.pessoas).toHaveLength(3)
    expect(m.pessoas).not.toBe(INPOT_SET.pessoas)
    expect(statusMarca(m)).toBe('nao_configurada')
  })

  it('etapa que não existia no mês anterior começa sem meta', () => {
    const m = marcaDoMesAnterior(ODONTO_SET, 'setembro')
    expect(Object.values(m.etapas).every(e => e.tipo === 'sem_meta')).toBe(true)
  })
})

describe('calcularFunil', () => {
  it('com as vendas de setembro reproduz setembro, arredondado pra cima', () => {
    const f = calcularFunil(inpotOutubro(5))
    expect(f.etapas['Oportunidade COF'].meta).toBe(11)
    expect(f.etapas.SAL.meta).toBe(28)
    expect(f.etapas['Reunião Realizada'].meta).toBe(43)
    expect(f.etapas['Reunião Agendada SQL'].meta).toBe(68)
    expect(f.etapas['Ligações'].meta).toBe(1558)
    expect(f.etapas.Fechamento.meta).toBe(5)
    expect(f.faturamento).toBe(374500)
  })

  it('arredonda sem cascata: cada etapa sobe do valor EXATO da de baixo', () => {
    const m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    const f = calcularFunil(m)
    // COF exato = 12,72 → 13. SAL = 12,72 / 0,4 = 31,8 → 32 (em cascata daria 13/0,4 = 32,5 → 33)
    expect(f.etapas['Oportunidade COF'].meta).toBe(13)
    expect(f.etapas.SAL.exato).toBeCloseTo(31.8, 6)
    expect(f.etapas.SAL.meta).toBe(32)
    expect(f.etapas.SAL.alterada).toBe(true)
    expect(f.etapas['Reunião Realizada'].meta).toBe(49)
    expect(f.etapas['Reunião Agendada SQL'].meta).toBe(77)
    expect(f.etapas['Ligações'].meta).toBe(1769)
    expect(f.faturamento).toBe(449400)
  })

  it('número manual vira ponto de partida pras etapas de cima', () => {
    const m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'manual', valor: 40 })
    const f = calcularFunil(m)
    expect(f.etapas.SAL.meta).toBe(40)
    expect(f.etapas.SAL.origem).toBe('manual')
    expect(f.etapas.SAL.taxa).toBeCloseTo(12.72 / 40, 6)
    expect(f.etapas['Reunião Realizada'].meta).toBe(arredondarMeta(40 / (28 / 42.9)))
    expect(f.etapas['Oportunidade COF'].meta).toBe(13)
  })

  it('nova conversão igual à de referência não conta como alterada', () => {
    const ref = referenciaDeVersao(INPOT_SET, 'setembro').taxas['Oportunidade COF']!
    const f = calcularFunil(definirModoEtapa(inpotOutubro(6), 'Oportunidade COF', { tipo: 'conversao', taxa: ref }))
    expect(f.etapas['Oportunidade COF'].alterada).toBe(false)
  })

  it('sem vendas, nada é calculado e nenhuma etapa reclama', () => {
    const f = calcularFunil(inpotOutubro(null))
    expect(f.etapas.SAL.meta).toBeNull()
    expect(f.etapas.SAL.problema).toBeNull()
    expect(f.faturamento).toBeNull()
  })

  it('etapa por conversão acima de etapa sem meta aponta o problema', () => {
    const m: MarcaConfig = { ...inpotOutubro(6), etapas: { ...inpotOutubro(6).etapas, 'Oportunidade COF': { tipo: 'sem_meta' } } }
    const f = calcularFunil(m)
    expect(f.etapas.SAL.meta).toBeNull()
    expect(f.etapas.SAL.problema).toMatch(/Oportunidade está sem meta/)
  })

  it('conversão em branco é problema', () => {
    const f = calcularFunil(definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: null }))
    expect(f.etapas.SAL.problema).toMatch(/conversão/)
  })
})

describe('definirModoEtapa', () => {
  it('sem meta leva junto as etapas de cima até a primeira manual', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    m = definirModoEtapa(m, 'Oportunidade COF', { tipo: 'sem_meta' })
    expect(m.etapas.SAL.tipo).toBe('sem_meta')
    expect(m.etapas['Reunião Realizada'].tipo).toBe('manual')
    expect(m.etapas['Reunião Agendada SQL'].tipo).toBe('referencia')
  })
})

describe('pendenciasMarca e statusMarca', () => {
  it('Inpot com vendas e time completo está configurada', () => {
    const m = inpotOutubro(6)
    expect(pendenciasMarca(m)).toEqual([])
    expect(statusMarca(m)).toBe('configurada')
  })

  it('aponta ticket, pesos e Closer faltando', () => {
    const m: MarcaConfig = {
      ...inpotOutubro(6),
      ticketMedio: null,
      pessoas: [{ nome: 'Thiago', funcao: 'SDR', peso: 60 }, { nome: 'Xayane', funcao: 'SDR', peso: 30 }],
    }
    const textos = pendenciasMarca(m).map(p => p.texto)
    expect(textos).toContain('Informe a taxa de franquia média')
    expect(textos).toContain('Adicione pelo menos um Closer')
    expect(textos.some(t => t.includes('SDRs somam 90%'))).toBe(true)
    expect(statusMarca(m)).toBe('em_configuracao')
  })

  it('marca só com Closer não precisa de SDR quando as etapas de SDR estão sem meta', () => {
    const m = { ...marcaDoMesAnterior(ODONTO_SET, 'setembro'), vendas: 5 }
    expect(pendenciasMarca(m)).toEqual([])
    expect(statusMarca(m)).toBe('configurada')
  })

  it('marca em branco lista as conversões que faltam', () => {
    const m = { ...marcaEmBranco('Viva'), vendas: 2, ticketMedio: 69900 }
    const funil = pendenciasMarca(m).filter(p => p.secao === 'funil')
    expect(funil).toHaveLength(5)
  })
})

describe('dividirIgualmente', () => {
  it('reparte 100% entre as pessoas da função e fecha a soma na última', () => {
    const r = dividirIgualmente([
      { nome: 'A', funcao: 'SDR', peso: 10 }, { nome: 'B', funcao: 'SDR', peso: 10 },
      { nome: 'C', funcao: 'SDR', peso: 10 }, { nome: 'D', funcao: 'Closer', peso: 100 },
    ], 'SDR')
    expect(r.map(p => p.peso)).toEqual([33.33, 33.33, 33.34, 100])
  })
})

describe('metasPorPessoa', () => {
  it('SDR leva Ligações/SQL/Diagnóstico/SAL, Closer leva COF/Vendas/faturamento, pelo peso', () => {
    const r = metasPorPessoa(definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 }))
    const thiago = r.find(p => p.nome === 'Thiago')!
    // 77 SQL em 50/50 → 39 + 38: nunca meia reunião
    expect(thiago.valores['Reunião Agendada SQL']).toBe(39)
    expect(r.find(p => p.nome === 'Xayane')!.valores['Reunião Agendada SQL']).toBe(38)
    expect(thiago.valores.SAL).toBe(16)
    expect(thiago.valores['Oportunidade COF']).toBeUndefined()
    const douglas = r.find(p => p.nome === 'Douglas')!
    expect(douglas.valores['Oportunidade COF']).toBe(13)
    expect(douglas.valores.Fechamento).toBe(6)
    expect(douglas.faturamento).toBe(449400)
  })
})

describe('paraConfigEtapas e ida-e-volta', () => {
  it('grava vendas fixa, referência/nova como derivada da de baixo, manual como fixa', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    m = definirModoEtapa(m, 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    const cfgs = paraConfigEtapas(m)
    expect(cfgs.find(c => c.etapa === 'Fechamento')).toEqual({ etapa: 'Fechamento', modo: 'fixo', valorFixo: 6 })
    expect(cfgs.find(c => c.etapa === 'SAL')).toEqual({ etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Oportunidade COF', taxa: 0.4, taxaOrigem: 'manual' })
    expect(cfgs.find(c => c.etapa === 'Oportunidade COF')).toMatchObject({ modo: 'derivado', etapaOrigem: 'Fechamento', taxaOrigem: 'mes_anterior' })
    expect(cfgs.find(c => c.etapa === 'Reunião Realizada')).toEqual({ etapa: 'Reunião Realizada', modo: 'fixo', valorFixo: 50 })
    expect(cfgs.find(c => c.etapa === 'Ligações')).toMatchObject({ modo: 'derivado', etapaOrigem: 'Reunião Agendada SQL' })
    // o motor antigo chega nos mesmos valores exatos
    expect(resolverFunilMarca(cfgs, 74900).valores.SAL).toBeCloseTo(31.8, 6)
  })

  it('republicar a versão (hub) dá as mesmas metas', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    m = definirModoEtapa(m, 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    const volta = marcaDeVersao({ marca: m.marca, ticketMedio: 74900, etapas: paraConfigEtapas(m), pessoas: m.pessoas }, 'V1', false)
    expect(volta.vendas).toBe(6)
    expect(volta.etapas['Reunião Realizada']).toEqual({ tipo: 'manual', valor: 50 })
    expect(volta.etapas.SAL.tipo).toBe('referencia')
    const a = calcularFunil(m).etapas
    const b = calcularFunil(volta).etapas
    for (const e of ['Ligações', 'Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF', 'Fechamento'] as const) {
      expect(b[e].meta).toBe(a[e].meta)
    }
  })

  it('revisão de versão importada trata os fixos como conversão de referência', () => {
    const m = marcaDeVersao(INPOT_SET, 'V1', true)
    expect(m.vendas).toBe(5)
    expect(Object.values(m.etapas).every(e => e.tipo === 'referencia')).toBe(true)
    const h = marcaDeVersao(INPOT_SET, 'V1', false)
    expect(h.etapas.SAL).toEqual({ tipo: 'manual', valor: 28 })
  })
})

describe('montarPublicacao', () => {
  it('gera o espelho com as metas arredondadas, rateadas por peso', () => {
    const r = { ...rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro') }
    r.marcas = r.marcas.map(m => m.marca === 'Inpot'
      ? definirModoEtapa({ ...m, vendas: 6 }, 'SAL', { tipo: 'conversao', taxa: 0.4 })
      : { ...m, vendas: 5 })
    const pub = montarPublicacao(r)
    const thiago = pub.linhasEspelho.find(l => l.nome_colaborador === 'Thiago')!
    expect(thiago).toMatchObject({ marca: 'Inpot', funcao: 'SDR', meta_sql: 39, meta_agendamento: 39, meta_reuniao_realizada: 25, meta_volume_sal: '16' })
    const douglas = pub.linhasEspelho.find(l => l.nome_colaborador === 'Douglas')!
    expect(douglas).toMatchObject({ meta_cof: 13, meta_qtd_vendas: 6, meta_financeira: 449400 })
    const aurelio = pub.linhasEspelho.find(l => l.nome_colaborador === 'Aurélio Briano')!
    expect(aurelio).toMatchObject({ marca: 'Odonto Scale', meta_qtd_vendas: 5, meta_cof: null })
    expect(pub.marcas.find(m => m.marca === 'Inpot')!.ticketMedio).toBe(74900)
  })

  it('publica a distribuição semanal derivada das vendas, só de marca distribuída por completo', () => {
    const r = outubroComSemanas()
    const pub = montarPublicacao(r)
    const s2 = pub.distribuicaoSemanal.filter(d => d.semanaNumero === 2)
    expect(s2.find(d => d.nomePessoa === 'Douglas' && d.etapa === 'Fechamento')!.valor).toBe(2)
    expect(pub.distribuicaoSemanal.every(d => Number.isInteger(d.valor))).toBe(true)
    // Odonto Legacy não distribuiu nada → nenhuma linha semanal dela
    expect(pub.distribuicaoSemanal.some(d => d.marca === 'Odonto Scale')).toBe(false)
  })
})

function outubroComSemanas() {
  const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
  r.marcas = r.marcas.map(m => m.marca === 'Inpot'
    ? definirModoEtapa({ ...m, vendas: 6 }, 'SAL', { tipo: 'conversao', taxa: 0.4 })
    : { ...m, vendas: 5 })
  r.vendasPorSemana = [1, 2, 1, 1, 1].map((valor, i) => ({ marca: 'Inpot', semanaNumero: i + 1, valor }))
  return r
}

describe('semanas: só vendas se distribuem, o resto vem junto', () => {
  it('metasPorSemana dá números inteiros por semana que fecham a meta do mês', () => {
    const r = outubroComSemanas()
    const semanas = metasPorSemana(r, 'Inpot')
    expect(semanas.map(x => x.Fechamento)).toEqual([1, 2, 1, 1, 1])
    expect(semanas.map(x => x['Reunião Agendada SQL'])).toEqual([13, 25, 13, 13, 13])
    for (const e of ['Oportunidade COF', 'SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'Ligações'] as const) {
      expect(semanas.every(x => Number.isInteger(x[e]))).toBe(true)
    }
    expect(semanas.reduce((a, x) => a + (x.SAL ?? 0), 0)).toBe(32)
    expect(semanas.reduce((a, x) => a + (x['Ligações'] ?? 0), 0)).toBe(1769)
  })

  it('metasPessoaSemana: inteiros que fecham a meta da pessoa no mês e a da marca na semana', () => {
    const r = outubroComSemanas()
    const pessoas = metasPessoaSemana(r, 'Inpot')
    const thiago = pessoas.find(p => p.nome === 'Thiago')!
    const xayane = pessoas.find(p => p.nome === 'Xayane')!
    const sql = (p: typeof thiago) => p.porSemana.map(x => x['Reunião Agendada SQL'] ?? 0)
    expect(sql(thiago).reduce((a, b) => a + b, 0)).toBe(39)
    expect(sql(xayane).reduce((a, b) => a + b, 0)).toBe(38)
    expect(sql(thiago).map((v, i) => v + sql(xayane)[i])).toEqual([13, 25, 13, 13, 13])
    expect(pessoas.find(p => p.nome === 'Douglas')!.porSemana.map(x => x.Fechamento)).toEqual([1, 2, 1, 1, 1])
  })

  it('distribuicaoDerivada reparte a semana entre as pessoas pelo peso e fecha no mês', () => {
    const itens = distribuicaoDerivada(outubroComSemanas())
    const somaThiagoSql = itens.filter(d => d.nomePessoa === 'Thiago' && d.etapa === 'Reunião Agendada SQL').reduce((a, d) => a + d.valor, 0)
    expect(somaThiagoSql).toBe(39)
    const douglasVendas = itens.filter(d => d.nomePessoa === 'Douglas' && d.etapa === 'Fechamento').map(d => d.valor)
    expect(douglasVendas).toEqual([1, 2, 1, 1, 1])
    expect(itens.some(d => d.nomePessoa === 'Thiago' && d.etapa === 'Oportunidade COF')).toBe(false)
  })

  it('vendasDistribuidas diz se a marca está vazia, parcial ou completa', () => {
    const r = outubroComSemanas()
    expect(vendasDistribuidas(r, 'Inpot')).toMatchObject({ porSemana: [1, 2, 1, 1, 1], distribuido: 6, total: 6, situacao: 'completo' })
    expect(vendasDistribuidas(r, 'Odonto Scale').situacao).toBe('vazio')
    r.vendasPorSemana = r.vendasPorSemana.filter(v => v.semanaNumero !== 5)
    expect(vendasDistribuidas(r, 'Inpot')).toMatchObject({ distribuido: 5, situacao: 'parcial' })
    r.marcas = r.marcas.map(m => (m.marca === 'Inpot' ? { ...m, vendas: null } : m))
    expect(vendasDistribuidas(r, 'Inpot').situacao).toBe('sem_vendas')
  })

  it('distribuirVendasProporcional preenche pelos dias de cada semana', () => {
    const r = outubroComSemanas()
    const novo = distribuirVendasProporcional(r, 'Odonto Scale')
    expect(vendasDistribuidas({ ...r, vendasPorSemana: novo }, 'Odonto Scale')).toMatchObject({ porSemana: [1, 1, 1, 1, 1], situacao: 'completo' })
    // não mexe nas outras marcas
    expect(novo.filter(v => v.marca === 'Inpot')).toEqual(r.vendasPorSemana)
  })
})

describe('rascunhos', () => {
  it('do mês anterior: semanas do mês novo, marcas ordenadas, sem distribuição', () => {
    const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
    expect(r.origem).toEqual({ tipo: 'mes_anterior', mes: '2026-09-01', rotulo: 'setembro' })
    expect(r.semanas[0]).toEqual({ numero: 1, inicio: '2026-10-01', fim: '2026-10-05' })
    expect(r.marcas.map(m => m.marca)).toEqual(['Odonto Scale', 'Inpot'])
    expect(r.vendasPorSemana).toEqual([])
  })

  it('de versão: mantém semanas e distribuição da versão', () => {
    const estado: EstadoMes = { ...SETEMBRO, distribuicaoSemanal: [
      { marca: 'Inpot', nomePessoa: 'Thiago', semanaNumero: 1, etapa: 'Ligações', valor: 100 },
      { marca: 'Inpot', nomePessoa: 'Douglas', semanaNumero: 1, etapa: 'Fechamento', valor: 2 },
      { marca: 'Inpot', nomePessoa: 'Douglas', semanaNumero: 3, etapa: 'Fechamento', valor: 3 },
    ] }
    const r = rascunhoDeVersao('2026-09-01', { id: 7, numero: 1, rotulo: 'Lançamento', origem: 'importado' }, estado)
    expect(r.origem).toEqual({ tipo: 'versao', versaoId: 7, numero: 1, rotulo: 'Lançamento' })
    expect(r.semanas).toBe(estado.semanas)
    expect(r.vendasPorSemana).toEqual([{ marca: 'Inpot', semanaNumero: 1, valor: 2 }, { marca: 'Inpot', semanaNumero: 3, valor: 3 }])
    expect(r.marcas.find(m => m.marca === 'Inpot')!.referencia!.rotulo).toBe('V1')
  })

  it('em branco: marcas sem referência', () => {
    const r = rascunhoEmBranco('2026-10-01', ['Viva'])
    expect(r.origem).toEqual({ tipo: 'branco' })
    expect(r.marcas[0].referencia).toBeNull()
  })

  it('resumo soma vendas/faturamento e conta as prontas', () => {
    const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
    r.marcas = r.marcas.map(m => m.marca === 'Inpot' ? { ...m, vendas: 6 } : m)
    expect(resumoRascunho(r)).toEqual({ vendas: 6, faturamento: 449400, prontas: 1, total: 2 })
  })
})

describe('marcas', () => {
  it('ordena pela ordem do BRAND_LIST', () => {
    expect(ordenarMarcas([{ marca: 'Viva' }, { marca: 'Oral Unic' }, { marca: 'Inpot' }]).map(m => m.marca)).toEqual(['Oral Unic', 'Inpot', 'Viva'])
  })

  it('lista as marcas que ainda não estão no rascunho', () => {
    const r = rascunhoEmBranco('2026-10-01', ['Viva', 'Inpot'])
    const d = marcasDisponiveis(r)
    expect(d).toContain('Oral Unic')
    expect(d).not.toContain('Viva')
  })
})

describe('distribuirProporcional', () => {
  it('reparte o total inteiro pelos dias de cada semana e fecha a soma', () => {
    const semanas = gerarSemanas('2026-10-01', 'terca') // 5, 7, 7, 7, 5 dias
    expect(distribuirProporcional(41, semanas)).toEqual([7, 9, 9, 9, 7])
    expect(distribuirProporcional(40.5, semanas).reduce((a, b) => a + b, 0)).toBe(41)
  })
})

describe('pesos que sempre fecham 100%', () => {
  const time = [
    { nome: 'A', funcao: 'SDR' as const, peso: 50 },
    { nome: 'B', funcao: 'SDR' as const, peso: 30 },
    { nome: 'C', funcao: 'SDR' as const, peso: 20 },
    { nome: 'D', funcao: 'Closer' as const, peso: 100 },
  ]
  const soma = (ps: { funcao: string; peso: number }[], f: string) => ps.filter(p => p.funcao === f).reduce((s, p) => s + p.peso, 0)

  it('ajustarPeso redistribui o resto entre os outros, na proporção deles', () => {
    const r = ajustarPeso(time, 'SDR', 'A', 60)
    expect(r.map(p => p.peso)).toEqual([60, 24, 16, 100])
  })

  it('ajustarPeso nunca passa de 100 nem fica negativo', () => {
    expect(ajustarPeso(time, 'SDR', 'A', 150).filter(p => p.funcao === 'SDR').map(p => p.peso)).toEqual([100, 0, 0])
    expect(ajustarPeso(time, 'SDR', 'A', -5).filter(p => p.funcao === 'SDR').map(p => p.peso)).toEqual([0, 60, 40])
  })

  it('ajustarPeso reparte igual quando os outros estavam zerados', () => {
    const zerados = ajustarPeso(time, 'SDR', 'A', 100)
    expect(ajustarPeso(zerados, 'SDR', 'A', 40).filter(p => p.funcao === 'SDR').map(p => p.peso)).toEqual([40, 30, 30])
  })

  it('ajustarPeso fecha em 100 mesmo com dízima', () => {
    const r = ajustarPeso(time, 'SDR', 'A', 33.33)
    expect(soma(r, 'SDR')).toBeCloseTo(100, 10)
    expect(r[0].peso).toBe(33.33)
  })

  it('pessoa sozinha na função fica sempre com 100%', () => {
    expect(ajustarPeso(time, 'Closer', 'D', 40).find(p => p.nome === 'D')!.peso).toBe(100)
  })

  it('moverDivisa troca peso só entre os dois vizinhos, em passos de 1%', () => {
    expect(moverDivisa([50, 30, 20], 0, 42.4)).toEqual([42, 38, 20])
    expect(moverDivisa([50, 30, 20], 1, 90)).toEqual([50, 40, 10])
    // não atravessa a divisa vizinha
    expect(moverDivisa([50, 30, 20], 0, 95)).toEqual([80, 0, 20])
    expect(moverDivisa([50, 30, 20], 1, 10)).toEqual([50, 0, 50])
  })

  it('normalizarPesos corrige soma errada mantendo a proporção', () => {
    const r = normalizarPesos([{ nome: 'A', funcao: 'SDR', peso: 60 }, { nome: 'B', funcao: 'SDR', peso: 60 }], 'SDR')
    expect(r.map(p => p.peso)).toEqual([50, 50])
    const vazio = normalizarPesos([{ nome: 'A', funcao: 'SDR', peso: 0 }, { nome: 'B', funcao: 'SDR', peso: 0 }], 'SDR')
    expect(vazio.map(p => p.peso)).toEqual([50, 50])
  })
})

describe('metas inteiras por pessoa', () => {
  it('repartirInteiro divide um inteiro pelos pesos e sempre fecha o total', () => {
    expect(repartirInteiro(77, [50, 50])).toEqual([39, 38])
    expect(repartirInteiro(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(repartirInteiro(2, [80, 20])).toEqual([2, 0])
    expect(repartirInteiro(5, [0, 0])).toEqual([3, 2])
    expect(repartirInteiro(0, [50, 50])).toEqual([0, 0])
  })

  it('repartirMatriz fecha linhas (pessoa no mês) e colunas (semana da marca)', () => {
    const m = repartirMatriz([39, 38], [13, 25, 13, 13, 13])
    expect(m.map(l => l.reduce((a, b) => a + b, 0))).toEqual([39, 38])
    expect(m[0].map((v, i) => v + m[1][i])).toEqual([13, 25, 13, 13, 13])
    expect(m.flat().every(v => Number.isInteger(v) && v >= 0)).toBe(true)
  })

  it('Closers: pesos só em faixas que dão vendas inteiras', () => {
    const closers = [{ nome: 'Bruna', funcao: 'Closer' as const, peso: 80 }, { nome: 'Jéssica', funcao: 'Closer' as const, peso: 20 }]
    // 2 vendas: faixas de 50% — 80/20 vira 100/0 (1,6 venda não existe)
    expect(encaixarFaixas(closers, 'Closer', 2).map(p => p.peso)).toEqual([100, 0])
    expect(encaixarFaixas(closers, 'Closer', 5).map(p => p.peso)).toEqual([80, 20])
    const metade = [{ ...closers[0], peso: 50 }, { ...closers[1], peso: 50 }]
    expect(ajustarPeso(metade, 'Closer', 'Bruna', 60, 2).map(p => p.peso)).toEqual([50, 50])
    expect(ajustarPeso(metade, 'Closer', 'Bruna', 80, 2).map(p => p.peso)).toEqual([100, 0])
    expect(ajustarPeso(metade, 'Closer', 'Bruna', 60, 5).map(p => p.peso)).toEqual([60, 40])
    expect(moverDivisa([50, 50], 0, 70, 50)).toEqual([50, 50])
    expect(moverDivisa([50, 50], 0, 80, 50)).toEqual([100, 0])
  })
})

describe('pesos digitados livremente', () => {
  it('Closer fora da faixa de vendas inteiras vira pendência', () => {
    const m: MarcaConfig = {
      ...inpotOutubro(2),
      pessoas: [
        { nome: 'Douglas', funcao: 'Closer', peso: 70 },
        { nome: 'Bruna', funcao: 'Closer', peso: 30 },
        { nome: 'Thiago', funcao: 'SDR', peso: 50 },
        { nome: 'Xayane', funcao: 'SDR', peso: 50 },
      ],
    }
    expect(pendenciasMarca(m).map(p => p.texto)).toContain('Com 2 vendas, os pesos dos Closers precisam ser múltiplos de 50%')
    const ok = { ...m, pessoas: m.pessoas.map(p => (p.funcao === 'Closer' ? { ...p, peso: 50 } : p)) }
    expect(pendenciasMarca(ok)).toEqual([])
  })

  it('soma diferente de 100 diz quanto passou ou faltou', () => {
    const m: MarcaConfig = { ...inpotOutubro(6), pessoas: [
      { nome: 'Douglas', funcao: 'Closer', peso: 100 },
      { nome: 'Thiago', funcao: 'SDR', peso: 60 },
      { nome: 'Xayane', funcao: 'SDR', peso: 50 },
    ] }
    expect(pendenciasMarca(m).map(p => p.texto)).toContain('Os pesos dos SDRs somam 110% — 10 pontos acima de 100%')
    const menos = { ...m, pessoas: m.pessoas.map(p => (p.nome === 'Xayane' ? { ...p, peso: 30 } : p)) }
    expect(pendenciasMarca(menos).map(p => p.texto)).toContain('Os pesos dos SDRs somam 90% — faltam 10 pontos pra 100%')
  })
})
