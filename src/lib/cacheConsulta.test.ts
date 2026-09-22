import { describe, it, expect, beforeEach } from 'vitest'
import { carregarComCache, lerCache, limparCache } from '@/lib/cacheConsulta'

beforeEach(() => limparCache())

describe('cacheConsulta', () => {
  it('vazio antes de carregar', () => {
    expect(lerCache('x')).toBeUndefined()
  })

  it('guarda o valor e a hora da carga', async () => {
    const antes = Date.now()
    const v = await carregarComCache('x', async () => [1, 2, 3])
    expect(v).toEqual([1, 2, 3])
    const c = lerCache<number[]>('x')
    expect(c?.valor).toEqual([1, 2, 3])
    expect(c!.atualizadoEm).toBeGreaterThanOrEqual(antes)
  })

  it('chamadas simultâneas na mesma chave compartilham UMA carga', async () => {
    let cargas = 0
    const loader = async () => { cargas++; await new Promise(r => setTimeout(r, 10)); return cargas }
    const [a, b, c] = await Promise.all([
      carregarComCache('x', loader),
      carregarComCache('x', loader),
      carregarComCache('x', loader),
    ])
    expect(cargas).toBe(1)
    expect([a, b, c]).toEqual([1, 1, 1])
  })

  it('depois que a carga termina, a próxima chamada busca de novo (revalida)', async () => {
    let cargas = 0
    await carregarComCache('x', async () => ++cargas)
    const v = await carregarComCache('x', async () => ++cargas)
    expect(v).toBe(2)
    expect(lerCache('x')?.valor).toBe(2)
  })

  it('chaves diferentes não se misturam', async () => {
    await carregarComCache('Inbound', async () => 'i')
    await carregarComCache('Prospecção Ativa', async () => 'p')
    expect(lerCache('Inbound')?.valor).toBe('i')
    expect(lerCache('Prospecção Ativa')?.valor).toBe('p')
  })

  it('erro não é guardado e mantém o último valor bom', async () => {
    await carregarComCache('x', async () => 'bom')
    await expect(carregarComCache('x', async () => { throw new Error('timeout') })).rejects.toThrow('timeout')
    expect(lerCache('x')?.valor).toBe('bom')
    // e não fica preso "em voo": a próxima tentativa roda de verdade
    expect(await carregarComCache('x', async () => 'de novo')).toBe('de novo')
  })

  it('limita o número de chaves guardadas, descartando a mais antiga', async () => {
    for (let i = 0; i < 30; i++) await carregarComCache(`k${i}`, async () => i)
    expect(lerCache('k0')).toBeUndefined()
    expect(lerCache('k29')?.valor).toBe(29)
  })
})
