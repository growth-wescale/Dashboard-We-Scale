import { describe, it, expect } from 'vitest'
import { fasesDaLinha } from '@/lib/timeline/fasesDaLinha'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-09-02T12:00:00Z')
const row = (over: Partial<FunnelRow>): FunnelRow => ({ status_atual: 'Em andamento', data_novo_mql: '2026-08-06T12:00:00Z', ...over } as FunnelRow)

describe('fasesDaLinha', () => {
  it('ganho: MQL → SDR → Closer, fim na venda', () => {
    const r = fasesDaLinha(row({ status_atual: 'Ganho', data_tentando_contato: '2026-08-07T12:00:00Z', data_agendamento_reuniao_sql: '2026-08-11T12:00:00Z', data_reuniao_realizada: '2026-08-18T12:00:00Z', data_venda: '2026-09-01T12:00:00Z' }), AGORA)
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(r.fases[1].duracaoDias).toBeCloseTo(11, 5)
    expect(r.desfecho).toMatchObject({ tipo: 'ganho', instante: new Date('2026-09-01T12:00:00Z') })
    expect(r.fim).toEqual(new Date('2026-09-01T12:00:00Z'))
  })
  it('só MQL em andamento: 1 fase até agora', () => {
    const r = fasesDaLinha(row({}), AGORA)
    expect(r.fases).toHaveLength(1)
    expect(r.fases[0].tipo).toBe('MQL')
    expect(r.fim).toEqual(AGORA)
    expect(r.desfecho.tipo).toBe('em_andamento')
  })
  it('perdido no SDR: fim em data_perdido', () => {
    const r = fasesDaLinha(row({ status_atual: 'Perdido', data_contato_efetivo: '2026-08-09T12:00:00Z', data_perdido: '2026-08-12T12:00:00Z' }), AGORA)
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR'])
    expect(r.desfecho.tipo).toBe('perda')
    expect(r.fim).toEqual(new Date('2026-08-12T12:00:00Z'))
  })
  it('sem MQL usa criação original como início', () => {
    const r = fasesDaLinha(row({ data_novo_mql: null, data_criacao_original: '2026-08-01T12:00:00Z', data_sal: '2026-08-20T12:00:00Z' }), AGORA)
    expect(r.inicio).toEqual(new Date('2026-08-01T12:00:00Z'))
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'Closer'])
  })
})
