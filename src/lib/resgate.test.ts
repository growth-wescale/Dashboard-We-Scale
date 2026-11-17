import { describe, expect, it } from 'vitest'
import { diasParado, ehResgate, inicioLeadtimeGeral, inicioPosReativacao } from './resgate'

const base = {
  ciclo: 1,
  eh_resgate: false,
  data_novo_mql: '2026-08-01T12:00:00Z',
  data_criacao_original: '2026-08-01T11:00:00Z',
  data_criacao_negociacao: '2026-08-01T11:00:00Z',
  data_perda_anterior: null as string | null,
}
const l = (extra: Partial<typeof base>) => ({ ...base, ...extra })

describe('ehResgate', () => {
  it('só vale o que a view diz', () => {
    expect(ehResgate({ eh_resgate: true })).toBe(true)
    expect(ehResgate({ eh_resgate: false })).toBe(false)
    expect(ehResgate({ eh_resgate: null })).toBe(false)
    expect(ehResgate({})).toBe(false)
  })
})

describe('inicioLeadtimeGeral', () => {
  it('ciclo 1: MQL, senão criação', () => {
    expect(inicioLeadtimeGeral(base)).toBe('2026-08-01T12:00:00Z')
    expect(inicioLeadtimeGeral({ ...base, data_novo_mql: null })).toBe('2026-08-01T11:00:00Z')
  })
  it('ciclo 2 com MQL novo no ciclo: mede desde a criação original', () => {
    expect(inicioLeadtimeGeral({ ...base, ciclo: 2, data_novo_mql: '2026-09-20T12:00:00Z' })).toBe('2026-08-01T11:00:00Z')
  })
})

describe('inicioPosReativacao', () => {
  it('resgate: desde a reabertura', () => {
    expect(inicioPosReativacao(l({ ciclo: 2, eh_resgate: true, data_criacao_negociacao: '2026-09-20T13:00:00Z' })))
      .toBe('2026-09-20T13:00:00Z')
  })
  it('reaberto no mesmo dia da perda (não é resgate) e ciclo 1: null', () => {
    expect(inicioPosReativacao(l({ ciclo: 2, eh_resgate: false, data_criacao_negociacao: '2026-09-20T13:00:00Z' }))).toBeNull()
    expect(inicioPosReativacao(base)).toBeNull()
  })
})

describe('diasParado', () => {
  it('perda 12/09 → reabertura 20/09 = 8 dias', () => {
    expect(diasParado(l({ ciclo: 2, eh_resgate: true, data_perda_anterior: '2026-09-12T15:00:00Z', data_criacao_negociacao: '2026-09-20T15:00:00Z' }))).toBe(8)
  })
  it('sem perda anterior ou fora de ordem: null', () => {
    expect(diasParado(l({ ciclo: 2, eh_resgate: true }))).toBeNull()
    expect(diasParado(l({ ciclo: 2, eh_resgate: true, data_perda_anterior: '2026-09-21T15:00:00Z', data_criacao_negociacao: '2026-09-20T15:00:00Z' }))).toBeNull()
  })
})
