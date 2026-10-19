import { describe, expect, it } from 'vitest'
import { termoBusca } from './useLogAtribuicoes'

describe('termoBusca', () => {
  it('tira o que quebra o filtro OR do PostgREST', () => {
    expect(termoBusca('  joao, (teste)*  ')).toBe('joao teste')
    expect(termoBusca('fulano@x.com')).toBe('fulano@x.com')
    expect(termoBusca('   ')).toBe('')
  })
})
