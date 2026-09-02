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
