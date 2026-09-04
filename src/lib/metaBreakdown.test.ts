import { describe, it, expect } from 'vitest'
import { buildPersonMetaRows, buildPersonSimplesRows } from '@/lib/metaBreakdown'

describe('buildPersonMetaRows', () => {
  it('calcula ritmo e "hoje" por pessoa, ordenado do mais atrasado pro mais adiantado', () => {
    const rows = buildPersonMetaRows({
      periodo: new Map([['Xayane', 10], ['Thiago', 40]]),
      hoje: new Map([['Xayane', 0], ['Thiago', 2]]),
      metaMensalPorNome: nome => (nome === 'Xayane' ? 100 : 50),
      mesKey: '2026-08', // 31 dias, dia 15 => esperado = meta * 15/31
      fimJanela: '2026-08-15',
    })

    expect(rows.map(r => r.nome)).toEqual(['Xayane', 'Thiago']) // Xayane mais atrasada primeiro
    const xayane = rows.find(r => r.nome === 'Xayane')!
    expect(xayane.realizado).toBe(10)
    expect(xayane.metaMensal).toBe(100)
    expect(xayane.ritmo.esperado).toBeCloseTo(100 * 15 / 31, 5)
    expect(xayane.hoje).toEqual({ realizado: 0, meta: xayane.ritmo.metaDia })
  })

  it('exclui pessoas sem meta cadastrada (metaMensal <= 0)', () => {
    const rows = buildPersonMetaRows({
      periodo: new Map([['SemMeta', 5]]),
      hoje: new Map(),
      metaMensalPorNome: () => 0,
      mesKey: '2026-08',
      fimJanela: '2026-08-15',
    })
    expect(rows).toEqual([])
  })

  it('pessoa que só apareceu hoje (sem linha no período) ainda entra, com realizado 0', () => {
    const rows = buildPersonMetaRows({
      periodo: new Map(),
      hoje: new Map([['Sarah', 1]]),
      metaMensalPorNome: () => 30,
      mesKey: '2026-08',
      fimJanela: '2026-08-15',
    })
    expect(rows).toEqual([expect.objectContaining({ nome: 'Sarah', realizado: 0, hoje: expect.objectContaining({ realizado: 1 }) })])
  })
})

describe('buildPersonSimplesRows', () => {
  it('calcula % realizado/meta por pessoa, ordenado do mais atrasado pro mais adiantado', () => {
    const rows = buildPersonSimplesRows({
      periodo: new Map([['Douglas', 60_000], ['Jéssica', 90_000]]),
      metaMensalPorNome: nome => (nome === 'Douglas' ? 100_000 : 100_000),
    })
    expect(rows.map(r => r.nome)).toEqual(['Douglas', 'Jéssica'])
    expect(rows[0].pct).toBeCloseTo(60, 5)
    expect(rows[1].pct).toBeCloseTo(90, 5)
  })

  it('exclui pessoas sem meta cadastrada', () => {
    const rows = buildPersonSimplesRows({
      periodo: new Map([['SemMeta', 10]]),
      metaMensalPorNome: () => 0,
    })
    expect(rows).toEqual([])
  })
})
