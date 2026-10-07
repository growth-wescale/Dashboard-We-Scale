import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarCacheMissao, MISSAO_INTERVALO, MISSAO_TIMEOUT, MISSAO_TTL } from './missaoCache'
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('Cache isolado da Missão', () => {
  it('reaproveita leitura, deduplica consumidores e nunca faz polling', async () => {
    const cache = criarCacheMissao<number>(), fetch = vi.fn(async () => 1)
    const a = cache.acquire('u:dia', fetch), b = cache.acquire('u:dia', fetch)
    expect(await a.promise).toEqual({ data: 1, error: null }); await b.promise
    a.release(); b.release()
    const c = cache.acquire('u:dia', fetch); await c.promise; c.release()
    await vi.advanceTimersByTimeAsync(MISSAO_TTL + 1)
    expect(fetch).toHaveBeenCalledTimes(1)
    const d = cache.acquire('u:dia', fetch); await d.promise; d.release()
    expect(fetch).toHaveBeenCalledTimes(2); cache.clear()
  })
  it('refresh manual respeita um minuto, inclusive entre remontagens', async () => {
    const cache = criarCacheMissao<number>(), fetch = vi.fn(async () => 1)
    const a = cache.acquire('u:dia', fetch); await a.promise; a.release()
    const b = cache.acquire('u:dia', fetch, true); await b.promise; b.release()
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(MISSAO_INTERVALO)
    const c = cache.acquire('u:dia', fetch, true); await c.promise; c.release()
    expect(fetch).toHaveBeenCalledTimes(2); cache.clear()
  })
  it('armazena falha e não dispara repetição automática na remontagem', async () => {
    const cache = criarCacheMissao<number>(), fetch = vi.fn(async () => { throw new Error('indisponível') })
    const a = cache.acquire('u:dia', fetch); expect(await a.promise).toEqual({ data: null, error: 'indisponível' }); a.release()
    const b = cache.acquire('u:dia', fetch); await b.promise; b.release()
    expect(fetch).toHaveBeenCalledTimes(1); cache.clear()
  })
  it('libera a rede ao sair e impede nova tentativa imediata após abort', async () => {
    const cache = criarCacheMissao<number>()
    let signal: AbortSignal | undefined
    const fetch = vi.fn((s: AbortSignal) => { signal = s; return new Promise<number>(() => {}) })
    const a = cache.acquire('u:dia', fetch)
    const caught = a.promise.catch(() => null)
    await Promise.resolve(); a.release(); await vi.advanceTimersByTimeAsync(0); await caught
    expect(signal?.aborted).toBe(true)
    const b = cache.acquire('u:dia', fetch); expect((await b.promise).error).toContain('um minuto'); b.release()
    expect(fetch).toHaveBeenCalledTimes(1); cache.clear()
  })
  it('timeout total de 20s cancela até transporte que não retorna', async () => {
    const cache = criarCacheMissao<number>(); let signal: AbortSignal | undefined
    const a = cache.acquire('u:dia', s => { signal = s; return new Promise<number>(() => {}) })
    const caught = a.promise.catch(() => 'timeout')
    await vi.advanceTimersByTimeAsync(MISSAO_TIMEOUT)
    expect(await caught).toBe('timeout'); expect(signal?.aborted).toBe(true); a.release(); cache.clear()
  })
  it('clear para logout/troca de conta remove os dados e cancela requisições', async () => {
    const cache = criarCacheMissao<number>(), fetch = vi.fn(async () => 1)
    const a = cache.acquire('usuario1:dia', fetch); await a.promise; a.release(); cache.clear()
    const b = cache.acquire('usuario2:dia', fetch); await b.promise; b.release()
    expect(fetch).toHaveBeenCalledTimes(2); cache.clear()
  })
})
