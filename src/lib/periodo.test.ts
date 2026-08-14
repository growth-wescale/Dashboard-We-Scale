import { describe, it, expect } from 'vitest'
import {
  opcoesAnos, opcoesMeses, opcoesTrimestres, periodoAtual, rangeForPeriod,
} from '@/lib/periodo'

// Meio de agosto de 2026: permite testar período corrente (que trunca em hoje)
// contra período fechado (que vai até o último dia).
const HOJE = new Date(2026, 7, 14) // mês é 0-indexado: 7 = agosto

describe('rangeForPeriod', () => {
  it('mês fechado vai do dia 1 ao último dia', () => {
    expect(rangeForPeriod('mes', '2026-06', HOJE)).toEqual({ start: '2026-06-01', end: '2026-06-30' })
  })

  it('mês corrente termina hoje, não no fim do mês', () => {
    expect(rangeForPeriod('mes', '2026-08', HOJE)).toEqual({ start: '2026-08-01', end: '2026-08-14' })
  })

  it('respeita fevereiro em ano bissexto', () => {
    expect(rangeForPeriod('mes', '2024-02', new Date(2026, 7, 14)))
      .toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('trimestre fechado cobre os três meses', () => {
    expect(rangeForPeriod('trimestre', '2026-Q1', HOJE)).toEqual({ start: '2026-01-01', end: '2026-03-31' })
    expect(rangeForPeriod('trimestre', '2026-Q2', HOJE)).toEqual({ start: '2026-04-01', end: '2026-06-30' })
  })

  it('trimestre corrente termina hoje', () => {
    // Agosto está no Q3 (jul-set)
    expect(rangeForPeriod('trimestre', '2026-Q3', HOJE)).toEqual({ start: '2026-07-01', end: '2026-08-14' })
  })

  it('ano fechado vai de janeiro a dezembro', () => {
    expect(rangeForPeriod('ano', '2025', HOJE)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })

  it('ano corrente termina hoje', () => {
    expect(rangeForPeriod('ano', '2026', HOJE)).toEqual({ start: '2026-01-01', end: '2026-08-14' })
  })

  it('valor inválido cai no período atual em vez de quebrar', () => {
    expect(rangeForPeriod('mes', 'lixo', HOJE)).toEqual({ start: '2026-08-01', end: '2026-08-14' })
  })
})

describe('periodoAtual', () => {
  it('devolve a chave do período corrente de cada granularidade', () => {
    expect(periodoAtual('mes', HOJE)).toBe('2026-08')
    expect(periodoAtual('trimestre', HOJE)).toBe('2026-Q3')
    expect(periodoAtual('ano', HOJE)).toBe('2026')
  })

  it('mapeia cada mês para o trimestre certo', () => {
    expect(periodoAtual('trimestre', new Date(2026, 0, 5))).toBe('2026-Q1')  // jan
    expect(periodoAtual('trimestre', new Date(2026, 3, 5))).toBe('2026-Q2')  // abr
    expect(periodoAtual('trimestre', new Date(2026, 9, 5))).toBe('2026-Q4')  // out
  })
})

describe('opções do seletor', () => {
  it('meses vêm do mais recente para o mais antigo, começando em hoje', () => {
    const opts = opcoesMeses(HOJE, '2026-05')
    expect(opts[0]).toEqual({ value: '2026-08', label: 'Agosto 2026' })
    expect(opts.at(-1)?.value).toBe('2026-05')
    expect(opts).toHaveLength(4) // mai, jun, jul, ago
  })

  it('não oferece mês futuro', () => {
    expect(opcoesMeses(HOJE, '2026-01').some(o => o.value > '2026-08')).toBe(false)
  })

  it('trimestres saem rotulados por extenso', () => {
    const opts = opcoesTrimestres(HOJE, '2026-01')
    expect(opts[0]).toEqual({ value: '2026-Q3', label: '3º trimestre 2026' })
    expect(opts.map(o => o.value)).toEqual(['2026-Q3', '2026-Q2', '2026-Q1'])
  })

  it('anos saem do mais recente para o mais antigo', () => {
    expect(opcoesAnos(HOJE, '2024-06').map(o => o.value)).toEqual(['2026', '2025', '2024'])
  })

  it('lida com o piso caindo no mesmo período de hoje', () => {
    expect(opcoesMeses(HOJE, '2026-08')).toEqual([{ value: '2026-08', label: 'Agosto 2026' }])
    expect(opcoesAnos(HOJE, '2026-01')).toEqual([{ value: '2026', label: '2026' }])
  })
})
