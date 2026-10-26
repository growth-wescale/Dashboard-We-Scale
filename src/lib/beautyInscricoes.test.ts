import { describe, expect, it } from 'vitest'
import { beautyInscricoesNoPeriodo, parseBeautyInscricoes } from './beautyInscricoes'

const reply = (rows: unknown[]) => ({ mode: 'ouro', contract: 'beauty_inscricoes_v1', dataset: 'inscricoes', rows })

describe('inscrições Beauty na S&OP', () => {
  it('soma apenas os dias selecionados e não converte ausência em presença', () => {
    const rows = parseBeautyInscricoes(reply([
      { dia: '2026-10-05', inscricoes: 2 },
      { dia: '2026-10-16', inscricoes: 7 },
      { dia: '2026-10-23', inscricoes: 3 },
    ]))
    expect(beautyInscricoesNoPeriodo(rows, '2026-10-01', '2026-10-23')).toBe(12)
    expect(beautyInscricoesNoPeriodo(rows, '2026-10-16', '2026-10-22')).toBe(7)
  })

  it('recusa respostas de outra fonte e dias duplicados', () => {
    expect(() => parseBeautyInscricoes({ mode: 'legacy', rows: [] })).toThrow()
    expect(() => parseBeautyInscricoes(reply([{ dia: '2026-10-05', inscricoes: 2 }, { dia: '2026-10-05', inscricoes: 2 }]))).toThrow()
    expect(() => parseBeautyInscricoes(reply([{ dia: '2026-10-05', inscricoes: -1 }]))).toThrow()
  })
})
