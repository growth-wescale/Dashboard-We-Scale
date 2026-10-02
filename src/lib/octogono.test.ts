import { describe, expect, it } from 'vitest'
import { rankingOctogono } from './octogono'

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
