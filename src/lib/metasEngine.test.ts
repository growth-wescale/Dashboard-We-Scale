import { describe, it, expect } from 'vitest'
import { gerarSemanas, ETAPAS_META_ORDEM } from './metasEngine'

describe('ETAPAS_META_ORDEM', () => {
  it('tem as 13 etapas do funil (Faturamento fica de fora — é calculado à parte)', () => {
    expect(ETAPAS_META_ORDEM).toHaveLength(13)
    expect(ETAPAS_META_ORDEM[0]).toBe('Ligações')
    expect(ETAPAS_META_ORDEM.at(-1)).toBe('Fechamento')
  })
})

describe('gerarSemanas', () => {
  it('setembro/2026, virada terça: 5 semanas, primeira começa no dia 1', () => {
    const semanas = gerarSemanas('2026-09-01', 'terca')
    expect(semanas).toHaveLength(5)
    expect(semanas[0]).toEqual({ numero: 1, inicio: '2026-09-01', fim: '2026-09-07' })
    expect(semanas[1]).toEqual({ numero: 2, inicio: '2026-09-08', fim: '2026-09-14' })
    expect(semanas[4].fim).toBe('2026-09-30')
  })

  it('virada segunda: primeira semana começa no dia 1 do mês mesmo assim (não corta antes)', () => {
    const semanas = gerarSemanas('2026-09-01', 'segunda')
    expect(semanas[0].inicio).toBe('2026-09-01')
  })

  it('última semana é parcial quando o mês não fecha em múltiplo de 7', () => {
    const semanas = gerarSemanas('2026-09-01', 'terca')
    const ultima = semanas.at(-1)!
    const dias = (new Date(ultima.fim) as any) - (new Date(ultima.inicio) as any)
    expect(dias / 86_400_000 + 1).toBeLessThan(7)
  })
})

import { resolverFunilMarca, type ConfigEtapa, detectarGaps } from './metasEngine'

describe('resolverFunilMarca', () => {
  it('duas âncoras fixas nas pontas — cada etapa mantém seu próprio valor, sem inventar nada no meio', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const r = resolverFunilMarca(configs, 74900)
    expect(r.valores['Ligações']).toBe(1000)
    expect(r.valores['Fechamento']).toBe(5)
    expect(r.faturamento).toBe(5 * 74900)
    expect(r.erros).toHaveLength(0)
  })

  it('cadeia derivada descendo o funil (origem antes do destino): multiplica', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.30 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'MQL', taxa: 0.40 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeCloseTo(300)
    expect(r.valores['SAL']).toBeCloseTo(120)
    expect(r.erros).toHaveLength(0)
  })

  it('cadeia derivada subindo o funil (origem depois do destino): divide', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Fechamento', taxa: 0.25 }, // SAL = Fechamento / 25%
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['SAL']).toBeCloseTo(20) // 5 / 0.25
  })

  it('pode derivar de qualquer etapa, não só da vizinha (D1)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.10 }, // pula MQL, Contato etc
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['SAL']).toBeCloseTo(100)
  })

  it('etapas não configuradas ficam de fora dos valores, sem erro', () => {
    const configs: ConfigEtapa[] = [{ etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 }]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros).toHaveLength(0)
  })

  it('detecta ciclo (A deriva de B, B deriva de A) e não calcula nenhum dos dois', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.5 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'MQL', taxa: 0.5 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.valores['SAL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'ciclo')).toBe(true)
  })

  it('detecta origem desligada', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'desligado' },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.3 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'origem_desligada')).toBe(true)
  })

  it('detecta cadeia sem âncora alcançável (origem citada mas nunca configurada)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.3 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'origem_inexistente')).toBe(true)
  })

  it('Odonto Scale: só Fechamento fixo, resto desligado — sem erro, faturamento calcula', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
      ...(['Ligações', 'MQL', 'SAL'] as const).map(etapa => ({ etapa, modo: 'desligado' as const })),
    ]
    const r = resolverFunilMarca(configs, 5597)
    expect(r.faturamento).toBe(5 * 5597)
    expect(r.erros).toHaveLength(0)
  })

  it('derivado sem etapaOrigem: erro sem_ancora (UI transiente)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'MQL', modo: 'derivado' }, // sem etapaOrigem, sem taxa
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0].tipo).toBe('sem_ancora')
    expect(r.erros[0].mensagem).toContain('nenhuma etapa de origem foi escolhida')
  })

  it('derivado com etapaOrigem mas sem taxa: erro sem_ancora', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações' }, // taxa undefined
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'sem_ancora' && e.mensagem.includes('taxa ainda não foi definida'))).toBe(true)
  })
})

describe('detectarGaps', () => {
  it('duas âncoras sem cadeia derivada entre elas — mostra taxa implícita, sem divergência (nada pra comparar)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1558 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].etapaTopo).toBe('Ligações')
    expect(gaps[0].etapaFundo).toBe('Fechamento')
    expect(gaps[0].taxaImplicita).toBeCloseTo(5 / 1558)
    expect(gaps[0].taxaConfigurada).toBeNull()
    expect(gaps[0].diverge).toBe(false)
  })

  it('cadeia derivada completa que concorda com a taxa implícita — sem divergência', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'SAL', modo: 'fixo', valorFixo: 100 },
      { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.4 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 40 }, // 40/100 = 40%, bate com a cadeia
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    const gap = gaps.find(g => g.etapaTopo === 'SAL' && g.etapaFundo === 'Fechamento')!
    expect(gap.diverge).toBe(false)
  })

  it('cadeia derivada completa que DISCORDA da taxa implícita — sinaliza divergência', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'SAL', modo: 'fixo', valorFixo: 86.9 },
      { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.25 }, // = 21.7
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 22 }, // implícita: 22/86.9 = 25.3%, cadeia diz 25%×algo — força divergência clara
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    const gap = gaps.find(g => g.etapaTopo === 'SAL' && g.etapaFundo === 'Fechamento')!
    expect(gap.taxaConfigurada).toBeCloseTo(0.25)
    expect(gap.taxaImplicita).toBeCloseTo(22 / 86.9)
    expect(gap.diverge).toBe(true)
  })

  it('cadeia derivada cíclica (duas etapas derivando uma da outra) não trava — guarda de ciclo funciona', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Contato Efetivo', taxa: 0.5 },
      { etapa: 'Contato Efetivo', modo: 'derivado', etapaOrigem: 'MQL', taxa: 0.5 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    // A chamada tem que retornar (um array), sem entrar em loop infinito —
    // essa é a prova em si; vitest mata o teste se travar além do timeout.
    const gaps = detectarGaps(configs, resolucao)
    expect(Array.isArray(gaps)).toBe(true)
  })
})
