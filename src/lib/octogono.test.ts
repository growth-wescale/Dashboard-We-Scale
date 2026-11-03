import { describe, expect, it } from 'vitest'
import { campeaoCloser, campeaoSdr, rankingOctogono } from './octogono'
import { mesDoCinturao } from '@/constants/metasCampanhaF1'

describe('Octógono: apresentação sem alterar as métricas', () => {
  const closers = [
    { nome: 'Bia', iniciais: 'B', cor: '#111', realizado: 80, metaFinanceira: 100 },
    { nome: 'Ana', iniciais: 'A', cor: '#222', realizado: 100, metaFinanceira: 100 },
    { nome: 'Caio', iniciais: 'C', cor: '#333', realizado: 0, metaFinanceira: 0 },
  ]
  const sdrs = [
    { nome: 'S1', iniciais: 'S1', cor: '#444', metaSql: 10 },
    { nome: 'S2', iniciais: 'S2', cor: '#555', metaSql: 10 },
    { nome: 'S3', iniciais: 'S3', cor: '#666', metaSql: 10 },
  ]

  it('ordena todos por percentual dentro do próprio cargo', () => {
    const ranking = rankingOctogono(closers, sdrs, new Map([
      ['S1', { sql: 8 }], ['S2', { sql: 5 }], ['S3', { sql: 2 }],
    ]))
    expect(ranking.closers.map(c => c.nome)).toEqual(['Ana', 'Bia'])
    expect(ranking.sdrs.map(s => s.nome)).toEqual(['S1', 'S2', 'S3'])
  })

  it('escala só a meta do SDR no round, sem mudar o realizado', () => {
    const ranking = rankingOctogono([], sdrs, new Map([['S1', { sql: 5 }]]), 0.5)
    expect(ranking.sdrs[0]).toMatchObject({ nome: 'S1', meta: 5, realizado: 5, pct: 100 })
  })
})

describe('Cinturão · Closer', () => {
  it('fica com o maior % da meta, desempate pelo realizado', () => {
    const c = campeaoCloser([
      { nome: 'Bruna', realizado: 30000, metaFinanceira: 69900 },
      { nome: 'Jéssica', realizado: 463500, metaFinanceira: 438900 },
      { nome: 'Douglas', realizado: 169800, metaFinanceira: 299600 },
    ])
    expect(c?.nome).toBe('Jéssica')
    expect(c?.pct).toBeCloseTo(105.6, 1)
  })

  it('sem nenhuma venda no mês não há campeão (nada de desempate alfabético)', () => {
    expect(campeaoCloser([
      { nome: 'Bruna', realizado: 0, metaFinanceira: 69900 },
      { nome: 'Douglas', realizado: 0, metaFinanceira: 444400 },
    ])).toBeNull()
  })
})

describe('mesDoCinturao', () => {
  const hoje = new Date(2026, 10, 3) // 03/11/2026
  it('mês em curso usa o mês anterior', () => {
    expect(mesDoCinturao('2026-11-01', hoje)).toBe('2026-10-01')
  })
  it('mês fechado usa ele mesmo', () => {
    expect(mesDoCinturao('2026-10-01', hoje)).toBe('2026-10-01')
    expect(mesDoCinturao('2026-09-01', hoje)).toBe('2026-09-01')
  })
  it('virada de ano', () => {
    expect(mesDoCinturao('2027-01-01', new Date(2027, 0, 5))).toBe('2026-12-01')
  })
})

describe('Cinturão · SDR', () => {
  const sdrs = [
    { nome: 'Xayane', metaSql: 103 },
    { nome: 'Sarah Padilha', metaSql: 81 },
    { nome: 'Cassiana Lavall', metaSql: 0 },
  ]
  it('fica com a maior % da meta de SQL do mês', () => {
    const c = campeaoSdr(sdrs, new Map([['Xayane', { sql: 45, rr: 30 }], ['Sarah Padilha', { sql: 54, rr: 32 }]]))
    expect(c?.sdr.nome).toBe('Sarah Padilha')
    expect(c?.pct).toBeCloseTo(66.7, 1)
  })
  it('sem SQL no mês não há campeão', () => {
    expect(campeaoSdr(sdrs, new Map([['Xayane', { sql: 0, rr: 3 }]]))).toBeNull()
  })
})
