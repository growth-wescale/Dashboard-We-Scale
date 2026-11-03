import { afterEach, describe, expect, it, vi } from 'vitest'
import { leituraOuroSop } from './leituraOuroSop'

const pendente = () => Response.json({ code: 'source_refresh_pending' }, { status: 503 })
afterEach(() => vi.useRealTimers())

describe('leitura da ouro na S&OP', () => {
  it('aguarda a renovação e retorna o segundo resultado integral', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const ler = vi.fn().mockResolvedValueOnce(pendente()).mockResolvedValueOnce(Response.json({ rows: [1, 2] }))
    const leitura = leituraOuroSop(ler, '/api/test', {}, '/sop-marketing')
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1))
    await vi.advanceTimersByTimeAsync(5000)
    expect(await (await leitura).json()).toEqual({ rows: [1, 2] })
    expect(ler).toHaveBeenCalledTimes(2)
  })
  it.each([['/marca', pendente()], ['/sop-marketing', Response.json({ code: 'source_unavailable' }, { status: 503 })],
    ['/sop-marketing', new Response(null, { status: 403 })]] as const)('preserva a falha em %s', async (rota, resposta) => {
    const ler = vi.fn().mockResolvedValue(resposta)
    expect(await leituraOuroSop(ler, '/api/test', {}, rota)).toBe(resposta)
    expect(ler).toHaveBeenCalledTimes(1)
  })
})
