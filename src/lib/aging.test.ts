import { describe, it, expect } from 'vitest'
import { computeAging } from '@/lib/aging'
import type { EtapaPeriodoRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-08-14T12:00:00Z').getTime()
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

const periodo = (over: Partial<EtapaPeriodoRow>): EtapaPeriodoRow => ({
  deal_id: 'd1',
  etapa: 'Contato Efetivo',
  data_entrada: diasAtras(10),
  data_saida: null,
  e_ultima_passagem: true,
  ...over,
})

describe('computeAging', () => {
  it('conta apenas deals vivos, ignorando os mortos', () => {
    // Este é o ponto central: vw_deal_etapa_periodos não fecha o período quando
    // o deal é perdido. Sem o filtro, um deal morto há 300 dias entra na mediana.
    const periodos = [
      periodo({ deal_id: 'vivo', data_entrada: diasAtras(10) }),
      periodo({ deal_id: 'morto', data_entrada: diasAtras(300) }),
    ]
    const [r] = computeAging(periodos, new Set(['vivo']), AGORA)

    expect(r.deals).toBe(1)
    expect(r.p50).toBeCloseTo(10, 5)
  })

  it('devolve vazio quando nenhum deal está vivo', () => {
    expect(computeAging([periodo({ deal_id: 'morto' })], new Set(), AGORA)).toEqual([])
  })

  it('agrupa por etapa e ordena pela quantidade de deals', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: 'SAL' }),
      periodo({ deal_id: 'b', etapa: 'Contato Efetivo' }),
      periodo({ deal_id: 'c', etapa: 'Contato Efetivo' }),
    ]
    const r = computeAging(periodos, new Set(['a', 'b', 'c']), AGORA)

    expect(r.map(x => x.etapa)).toEqual(['Contato Efetivo', 'SAL'])
    expect(r[0].deals).toBe(2)
  })

  it('calcula p50 e p75 sobre os dias parados', () => {
    const periodos = [2, 4, 6, 8].map((d, i) =>
      periodo({ deal_id: `d${i}`, data_entrada: diasAtras(d) }),
    )
    const [r] = computeAging(periodos, new Set(['d0', 'd1', 'd2', 'd3']), AGORA)

    expect(r.p50).toBeCloseTo(5, 5) // média entre 4 e 6
    expect(r.p75).toBeCloseTo(6.5, 5)
  })

  it('descarta linha sem etapa ou sem data de entrada', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: null }),
      periodo({ deal_id: 'a', data_entrada: null }),
      periodo({ deal_id: 'a', data_entrada: 'não é data' }),
    ]
    expect(computeAging(periodos, new Set(['a']), AGORA)).toEqual([])
  })

  it('ignora entrada no futuro em vez de gerar dias negativos', () => {
    const futuro = [periodo({ deal_id: 'a', data_entrada: diasAtras(-5) })]
    expect(computeAging(futuro, new Set(['a']), AGORA)).toEqual([])
  })
})
