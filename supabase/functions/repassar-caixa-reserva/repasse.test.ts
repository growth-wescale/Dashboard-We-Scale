import { describe, expect, it } from 'vitest'
import { entregue, semChave } from './repasse'

describe('entregue', () => {
  it('2xx e erro de payload contam como entregue; 401, 5xx e 0 (rede) não', () => {
    expect([200, 204, 400, 422].map(entregue)).toEqual([true, true, true, true])
    expect([0, 401, 500, 502, 503, 504, 546].map(entregue)).toEqual([false, false, false, false, false, false, false])
  })
})

describe('semChave', () => {
  it('mascara a chave em qualquer posição da URL', () => {
    expect(semChave('error sending request for url (https://x/f?chave=abc123&listar=1)')).toBe('error sending request for url (https://x/f?chave=***&listar=1)')
    expect(semChave('https://x/f?listar=1&chave=abc123')).toBe('https://x/f?listar=1&chave=***')
  })
})
