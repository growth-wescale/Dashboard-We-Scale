import { describe, expect, it } from 'vitest'
import { agruparGravacoesPorDeal, dicaGravacao, rotuloGravacao, type GravacaoDeal } from './gravacoesDeal'

function g(over: Partial<GravacaoDeal>): GravacaoDeal {
  return {
    id_deal: 'd1', call_id: 1, tipo: null, eh_live: false,
    call_timestamp: '2026-11-16T14:00:00+00:00', closer: 'Douglas', titulo: 'R1| Teste', url: 'https://meetrox/1',
    ...over,
  }
}

describe('agruparGravacoesPorDeal', () => {
  it('junta por negócio, da mais antiga para a mais nova', () => {
    const m = agruparGravacoesPorDeal([
      g({ id_deal: 'd1', call_id: 3, call_timestamp: '2026-11-24T13:00:00+00:00' }),
      g({ id_deal: 'd2', call_id: 2 }),
      g({ id_deal: 'd1', call_id: 1, call_timestamp: '2026-11-16T14:00:00+00:00' }),
    ])
    expect(m.get('d1')?.map(x => x.call_id)).toEqual([1, 3])
    expect(m.get('d2')?.map(x => x.call_id)).toEqual([2])
    expect(m.get('d3')).toBeUndefined()
  })

  it('mesma hora desempata pelo call_id', () => {
    const m = agruparGravacoesPorDeal([g({ call_id: 9 }), g({ call_id: 4 })])
    expect(m.get('d1')?.map(x => x.call_id)).toEqual([4, 9])
  })
})

describe('rotuloGravacao', () => {
  it('LIVE vence o tipo; sem tipo vira "Gravação"', () => {
    expect(rotuloGravacao(g({ eh_live: true, tipo: 'R1' }))).toBe('LIVE')
    expect(rotuloGravacao(g({ tipo: 'R2' }))).toBe('R2')
    expect(rotuloGravacao(g({ tipo: null }))).toBe('Gravação')
  })
})

describe('dicaGravacao', () => {
  it('rótulo, data e hora de Brasília, Closer e título', () => {
    expect(dicaGravacao(g({ tipo: 'R1' }))).toBe('R1 · 16/11/2026 11:00 · Douglas · R1| Teste')
  })

  it('sem Closer nem título, só o que tem', () => {
    expect(dicaGravacao(g({ closer: null, titulo: '  ' }))).toBe('Gravação · 16/11/2026 11:00')
  })
})
