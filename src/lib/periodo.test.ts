import { describe, it, expect } from 'vitest'
import {
  mesesDoPeriodo, opcoesAnos, opcoesMeses, opcoesTrimestres, periodoAnterior, periodoAtual, periodoEmCurso,
  rangeAnteriorComparavel, rangeAnteriorDia, rangeForPeriod,
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

describe('periodoAnterior', () => {
  it('mês vira o mês anterior, com virada de ano', () => {
    expect(periodoAnterior('mes', '2026-08')).toBe('2026-07')
    expect(periodoAnterior('mes', '2026-01')).toBe('2025-12')
  })

  it('trimestre vira o trimestre anterior, com virada de ano', () => {
    expect(periodoAnterior('trimestre', '2026-Q3')).toBe('2026-Q2')
    expect(periodoAnterior('trimestre', '2026-Q1')).toBe('2025-Q4')
  })

  it('ano vira o ano anterior', () => {
    expect(periodoAnterior('ano', '2026')).toBe('2025')
  })
})

describe('periodoEmCurso', () => {
  it('mês fechado (no passado) não está em curso', () => {
    expect(periodoEmCurso('mes', '2026-07', HOJE)).toBe(false)
  })

  it('mês corrente (contém hoje) está em curso', () => {
    expect(periodoEmCurso('mes', '2026-08', HOJE)).toBe(true)
  })

  it('trimestre e ano seguem a mesma regra', () => {
    expect(periodoEmCurso('trimestre', '2026-Q2', HOJE)).toBe(false)
    expect(periodoEmCurso('trimestre', '2026-Q3', HOJE)).toBe(true)
    expect(periodoEmCurso('ano', '2025', HOJE)).toBe(false)
    expect(periodoEmCurso('ano', '2026', HOJE)).toBe(true)
  })
})

describe('rangeAnteriorComparavel', () => {
  // Bug original: shiftar data por "1 mês" com Date.setMonth() estoura em
  // meses de 31 dias cujo mês anterior tem menos dias — 31 de julho vira
  // 1º de agosto (do mês CORRENTE), poluindo o período anterior com dias do
  // período atual. Cobre os 5 meses de 31 dias cujo antecessor é mais curto.
  it('mês fechado de 31 dias compara com o mês anterior inteiro, sem vazar pro mês corrente', () => {
    expect(rangeAnteriorComparavel('mes', '2026-07', HOJE)).toEqual({ start: '2026-06-01', end: '2026-06-30' })
    expect(rangeAnteriorComparavel('mes', '2026-03', HOJE)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(rangeAnteriorComparavel('mes', '2026-05', HOJE)).toEqual({ start: '2026-04-01', end: '2026-04-30' })
  })

  it('mês em curso compara com o mesmo nº de dias corridos do mês anterior', () => {
    // HOJE = 14/ago/2026: agosto corrente tem 14 dias corridos.
    expect(rangeAnteriorComparavel('mes', '2026-08', HOJE)).toEqual({ start: '2026-07-01', end: '2026-07-14' })
  })

  it('trimestre usa o trimestre anterior, não desloca só 1 mês', () => {
    expect(rangeAnteriorComparavel('trimestre', '2026-Q2', HOJE)).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('trimestre em curso compara com o mesmo nº de dias corridos do trimestre anterior', () => {
    // Q3 (jul-set) corrente até 14/ago = 45 dias corridos desde 1º/jul.
    expect(rangeAnteriorComparavel('trimestre', '2026-Q3', HOJE)).toEqual({ start: '2026-04-01', end: '2026-05-15' })
  })

  it('ano usa o ano anterior inteiro quando fechado', () => {
    expect(rangeAnteriorComparavel('ano', '2025', HOJE)).toEqual({ start: '2024-01-01', end: '2024-12-31' })
  })

  it('ano em curso compara com o mesmo nº de dias corridos do ano anterior', () => {
    expect(rangeAnteriorComparavel('ano', '2026', HOJE)).toEqual({ start: '2025-01-01', end: '2025-08-14' })
  })
})

describe('rangeAnteriorDia', () => {
  it('devolve o mesmo nº de dias, imediatamente antes do início', () => {
    expect(rangeAnteriorDia({ start: '2026-08-10', end: '2026-08-14' }))
      .toEqual({ start: '2026-08-05', end: '2026-08-09' })
  })

  it('atravessa virada de mês corretamente', () => {
    expect(rangeAnteriorDia({ start: '2026-08-01', end: '2026-08-01' }))
      .toEqual({ start: '2026-07-31', end: '2026-07-31' })
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

describe('mesesDoPeriodo', () => {
  it('modo mês devolve os próprios valores', () => {
    expect(mesesDoPeriodo('mes', ['2026-06', '2026-08'])).toEqual(['2026-06', '2026-08'])
  })

  it('modo trimestre expande pros 3 meses', () => {
    expect(mesesDoPeriodo('trimestre', ['2026-Q1'])).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('modo ano expande pros 12 meses', () => {
    expect(mesesDoPeriodo('ano', ['2026'])).toHaveLength(12)
  })

  it('deduplica meses de seleções sobrepostas', () => {
    expect(mesesDoPeriodo('trimestre', ['2026-Q1', '2026-Q2'])).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ])
  })

  it('modo dia não tem meta mensal correspondente', () => {
    expect(mesesDoPeriodo('dia', ['qualquer'])).toEqual([])
  })
})
