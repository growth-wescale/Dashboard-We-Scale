import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarCacheFiltrado } from './consultaFiltrada'

afterEach(() => vi.useRealTimers())
const flush = () => Promise.resolve()
describe('cache filtrado cancelável', () => {
  it('compartilha consulta em voo e cache recente; refresh força nova busca', async () => {
    const cache = criarCacheFiltrado()
    const fetch = vi.fn(async () => [1])
    const a = cache.acquire('x', fetch), b = cache.acquire('x', fetch)
    expect(a.promise).toBe(b.promise)
    await a.promise; a.release(); b.release()
    const c = cache.acquire('x', fetch); await c.promise; c.release()
    expect(fetch).toHaveBeenCalledTimes(1)
    const d = cache.acquire('x', fetch, true); await d.promise; d.release()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('separa chaves e revalida cache vencido', async () => {
    vi.useFakeTimers()
    const cache = criarCacheFiltrado(1000)
    const fetch = vi.fn(async () => [1])
    const a = cache.acquire('a', fetch); await a.promise; a.release()
    const b = cache.acquire('b', fetch); await b.promise; b.release()
    vi.advanceTimersByTime(1001)
    const c = cache.acquire('a', fetch); expect(c.cached).toEqual([1]); await c.promise; c.release()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('não cancela quando ainda existe outro consumidor', async () => {
    const cache = criarCacheFiltrado()
    let signal!: AbortSignal
    let resolve!: (v: number[]) => void
    const fetch = (s: AbortSignal) => { signal = s; return new Promise<number[]>(r => { resolve = r }) }
    const a = cache.acquire('a', fetch), b = cache.acquire('a', fetch)
    await flush(); a.release(); await flush()
    expect(signal.aborted).toBe(false)
    resolve([7]); expect(await b.promise).toEqual([7]); b.release()
  })
  it('cancela sem consumidores e permite a mesma chave começar de novo', async () => {
    const cache = criarCacheFiltrado()
    const a = cache.acquire('a', () => new Promise<number[]>(() => {}))
    const rejected = expect(a.promise).rejects.toThrow('cancelada')
    a.release(); await rejected
    const b = cache.acquire('a', async () => [2]); expect(await b.promise).toEqual([2]); b.release()
  })
  it('reusa carga durante cleanup/remontagem imediata de StrictMode', async () => {
    const cache = criarCacheFiltrado()
    const fetch = vi.fn(async () => [3])
    const a = cache.acquire('a', fetch); a.release()
    const b = cache.acquire('a', fetch)
    expect(a.promise).toBe(b.promise)
    expect(await b.promise).toEqual([3]); b.release()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('timeout encerra até promessa que ignora AbortSignal, e permite retry', async () => {
    vi.useFakeTimers()
    const cache = criarCacheFiltrado()
    const a = cache.acquire('x', () => new Promise<number[]>(() => {}))
    const rejected = expect(a.promise).rejects.toThrow('60 segundos')
    await vi.advanceTimersByTimeAsync(60_000); await rejected; a.release()
    const b = cache.acquire('x', async () => [4]); expect(await b.promise).toEqual([4]); b.release()
  })
  it('erro síncrono ou assíncrono libera a chave e não substitui último valor bom', async () => {
    const cache = criarCacheFiltrado()
    const a = cache.acquire('x', async () => [1]); await a.promise; a.release()
    const b = cache.acquire('x', () => { throw new Error('falha') }, true)
    await expect(b.promise).rejects.toThrow('falha'); b.release()
    const c = cache.acquire('x', async () => [2]); expect(c.cached).toEqual([1]); c.release()
  })
  it('logout limpa valores e impede resposta tardia de repopular o cache', async () => {
    const cache = criarCacheFiltrado()
    let resolve!: (v: number[]) => void
    const a = cache.acquire('x', () => new Promise<number[]>(r => { resolve = r }))
    const rejected = expect(a.promise).rejects.toThrow('cancelada')
    await flush(); cache.clear(); await rejected; resolve([99]); a.release(); await flush()
    const b = cache.acquire('x', async () => [2]); expect(b.cached).toBeUndefined()
    expect(await b.promise).toEqual([2]); b.release()
  })
  it('limita cache concluído sem derrubar consulta em voo', async () => {
    const cache = criarCacheFiltrado(60_000, 60_000, 2)
    for (const key of ['a', 'b', 'c']) { const r = cache.acquire(key, async () => [key]); await r.promise; r.release() }
    const a = cache.acquire('a', async () => ['novo']); expect(a.cached).toBeUndefined(); await a.promise; a.release()
  })
})
