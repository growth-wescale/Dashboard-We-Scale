import { describe, it, expect } from 'vitest'
import { leadtimeDias, fmtDias, fmtDuracao, breakdownPorCategoria } from './dealDrawerShared'

const DIA = 86_400_000
const AGORA = new Date('2026-09-08T12:00:00Z').getTime()

describe('leadtimeDias', () => {
  it('conta os dias corridos entre início (MQL) e a data de referência da linha', () => {
    expect(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-11T00:00:00Z', AGORA)).toBe(10)
  })

  it('sem referência, mede do início até agora (deal ainda vivo)', () => {
    expect(leadtimeDias(new Date(AGORA - 3 * DIA).toISOString(), null, AGORA)).toBeCloseTo(3, 5)
  })

  it('retorna null quando falta o início', () => {
    expect(leadtimeDias(null, '2026-08-11T00:00:00Z', AGORA)).toBeNull()
    expect(leadtimeDias(undefined, '2026-08-11T00:00:00Z', AGORA)).toBeNull()
  })

  it('retorna null quando a referência é anterior ao início (evento fora de ordem)', () => {
    expect(leadtimeDias('2026-08-11T00:00:00Z', '2026-08-01T00:00:00Z', AGORA)).toBeNull()
  })

  it('retorna null para datas inválidas', () => {
    expect(leadtimeDias('não é data', '2026-08-11T00:00:00Z', AGORA)).toBeNull()
    expect(leadtimeDias('2026-08-01T00:00:00Z', 'lixo', AGORA)).toBeNull()
  })

  it('formata via fmtDias: horas abaixo de 1 dia, dias acima (usado só na lista de etapas)', () => {
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-01T06:00:00Z', AGORA))).toBe('6h')
    expect(fmtDias(leadtimeDias('2026-08-01T00:00:00Z', '2026-08-04T00:00:00Z', AGORA))).toBe('3.0d')
    expect(fmtDias(leadtimeDias(null, null, AGORA))).toBe('—')
  })
})

describe('fmtDuracao', () => {
  it('quebra em dia / hora / minuto', () => {
    // 4,3 dias = 4d 7h 12min
    expect(fmtDuracao(4.3)).toBe('4d 7h 12min')
  })

  it('omite o dia quando é zero, mas mantém hora + minuto', () => {
    expect(fmtDuracao(0.25)).toBe('6h 0min')
  })

  it('mostra só minutos abaixo de 1 hora', () => {
    expect(fmtDuracao(20 / 1440)).toBe('20min')
  })

  it('mantém "0h" quando há dias (Dia, Hora e Minuto sempre juntos acima de 1 dia)', () => {
    expect(fmtDuracao(2 + 5 / 1440)).toBe('2d 0h 5min')
  })

  it('arredonda para o minuto mais próximo', () => {
    expect(fmtDuracao(1 + 89 / 86400)).toBe('1d 0h 1min') // 89s -> ~1min
  })

  it('null / NaN / não-positivo → "—" ou "0min"', () => {
    expect(fmtDuracao(null)).toBe('—')
    expect(fmtDuracao(NaN)).toBe('—')
    expect(fmtDuracao(0)).toBe('0min')
    expect(fmtDuracao(-1)).toBe('0min')
  })
})

describe('breakdownPorCategoria', () => {
  it('nunca gera "Outros", não importa quantas categorias — toda categoria real aparece', () => {
    // Reproduz o caso real de 21/09: 7 marcas distintas, a menor com 1 deal só.
    const items = [
      ...Array(20).fill('Odonto Legacy'), ...Array(13).fill('B2Case'), ...Array(8).fill('Eletrovias'),
      ...Array(5).fill('Lisô Laser'), ...Array(3).fill('Scale Partner'), ...Array(3).fill('Viva'),
      'Oral Unic',
    ]
    const rows = breakdownPorCategoria(items, m => m, () => '#000')
    expect(rows).toHaveLength(7)
    expect(rows.find(r => r.label === 'Outros')).toBeUndefined()
    const oralUnic = rows.find(r => r.label === 'Oral Unic')
    expect(oralUnic?.count).toBe(1)
    expect(oralUnic?.values).toEqual(['Oral Unic'])
  })

  it('mesmo com dezenas de categorias distintas (campo aberto tipo SDR/Closer), nenhuma vira "Outros"', () => {
    const items = Array.from({ length: 20 }, (_, i) => `Pessoa ${i}`)
    const rows = breakdownPorCategoria(items, m => m, () => '#000')
    expect(rows).toHaveLength(20)
    expect(rows.every(r => r.label !== 'Outros')).toBe(true)
    expect(rows.every(r => r.count === 1)).toBe(true)
  })

  it('agrupa por RÓTULO (alias), mas mantém todos os valores crus em "values" pra filtrar por todos', () => {
    // 'Odonto Scale' e 'Odonto Legacy' são o mesmo negócio (rename 11/09) — devem
    // virar 1 barra só via labelOf, sem perder nenhum dos 2 valores crus do filtro.
    const items = ['Odonto Scale', 'Odonto Scale', 'Odonto Legacy']
    const labelOf = (raw: string) => (raw === 'Odonto Scale' ? 'Odonto Legacy' : raw)
    const rows = breakdownPorCategoria(items, m => m, () => '#000', labelOf)
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Odonto Legacy')
    expect(rows[0].count).toBe(3)
    expect(rows[0].values.sort()).toEqual(['Odonto Legacy', 'Odonto Scale'])
  })

  it('valor vazio/nulo vira "Sem informação" e fica com values=[] (não filtrável)', () => {
    const rows = breakdownPorCategoria([null, '', 'A'], m => m, () => '#000')
    const semInfo = rows.find(r => r.label === 'Sem informação')
    expect(semInfo?.count).toBe(2)
    expect(semInfo?.values).toEqual([])
  })
})
