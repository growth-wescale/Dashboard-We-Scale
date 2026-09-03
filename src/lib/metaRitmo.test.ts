import { describe, it, expect } from 'vitest'
import { computeRitmo } from '@/lib/metaRitmo'

describe('computeRitmo', () => {
  it('esperado é proporcional ao dia corrido do mês', () => {
    // ago/2026: 31 dias. Dia 15 → esperado = 100 * 15/31
    const r = computeRitmo({ realizado: 40, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-15' })
    expect(r.esperado).toBeCloseTo(100 * 15 / 31, 5)
    expect(r.pctRealizado).toBeCloseTo(40, 5)
    expect(r.pctEsperado).toBeCloseTo(100 * 15 / 31, 5)
  })

  it('meta do dia divide pela contagem de dias úteis seg-sáb', () => {
    // ago/2026 tem 26 dias úteis (seg-sáb). 100/26
    const r = computeRitmo({ realizado: 0, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-15' })
    expect(r.metaDia).toBeCloseTo(100 / 26, 5)
  })

  it('no ritmo quando realizado >= esperado - 2%', () => {
    const r = computeRitmo({ realizado: 49, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-16' })
    // esperado = 100*16/31 ≈ 51.61; delta = (49-51.61)/51.61 ≈ -5% → abaixo
    expect(r.noRitmo).toBe(false)
  })

  it('meta zero não quebra (sem divisão por zero)', () => {
    const r = computeRitmo({ realizado: 5, metaMensal: 0, mesKey: '2026-08', fimJanela: '2026-08-16' })
    expect(r.esperado).toBe(0)
    expect(r.metaDia).toBe(0)
    expect(r.pctRealizado).toBe(0)
    expect(r.deltaPct).toBe(0)
    expect(r.noRitmo).toBe(true) // delta 0 >= -2
  })

  it('dia da janela além do fim do mês satura no último dia', () => {
    const r = computeRitmo({ realizado: 100, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-09-10' })
    expect(r.esperado).toBeCloseTo(100, 5) // 31/31
  })
})
