import { describe, it, expect } from 'vitest'
import { nfCeil } from '@/lib/format'

describe('nfCeil', () => {
  it('arredonda pra cima, nunca pra baixo', () => {
    expect(nfCeil(9.35)).toBe('10')
    expect(nfCeil(2.75)).toBe('3')
    expect(nfCeil(13.2)).toBe('14')
  })

  it('número já inteiro fica igual', () => {
    expect(nfCeil(11)).toBe('11')
  })

  it('formata em pt-BR (separador de milhar)', () => {
    expect(nfCeil(1234.1)).toBe('1.235')
  })
})
