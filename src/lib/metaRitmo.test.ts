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
    expect(r.pctDoEsperado).toBe(0)
    expect(r.noRitmo).toBe(true) // delta 0 >= -2
  })

  it('pctDoEsperado: 8 realizados de 10 esperados até hoje = 80% (não -20%)', () => {
    // metaMensal=100, esperado até o dia = 10 exatos: dim=100 dias fictícios não dá pra forçar
    // direto por mesKey/fimJanela reais, então cravamos via metaMensal=310 e dia 1/31 de ago/2026
    // (dim=31, diaN=1) -> esperado = 310 * 1/31 = 10.
    const r = computeRitmo({ realizado: 8, metaMensal: 310, mesKey: '2026-08', fimJanela: '2026-08-01' })
    expect(r.esperado).toBeCloseTo(10, 5)
    expect(r.pctDoEsperado).toBeCloseTo(80, 5)
  })

  it('pctDoEsperado pode passar de 100% quando o realizado supera o esperado', () => {
    const r = computeRitmo({ realizado: 15, metaMensal: 310, mesKey: '2026-08', fimJanela: '2026-08-01' })
    expect(r.pctDoEsperado).toBeCloseTo(150, 5)
  })

  it('dia da janela além do fim do mês satura no último dia', () => {
    const r = computeRitmo({ realizado: 100, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-09-10' })
    expect(r.esperado).toBeCloseTo(100, 5) // 31/31
  })

  it('fimJanela num mês ANTES do mesKey ainda não decorreu nada do mês meta', () => {
    const r = computeRitmo({ realizado: 0, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-07-15' })
    expect(r.esperado).toBe(0)
    expect(r.pctEsperado).toBe(0)
  })
})
