import { describe, expect, it, vi } from 'vitest'
import { createEletroviasOuroFetch } from './eletroviasOuroFetch'
import { filterRows } from './partnerOuroQuery'

const origin = 'https://marketing.test'
const url = `${origin}/rest/v1/leads?dia=gte.2026-11-01&dia=lte.2026-11-16&order=id.asc`
const goldRows = [{ id: 'gold', marca: 'Inpot', dia: '2026-11-02' }]
const referenceRows = [{ id: 'old', marca: 'Inpot', dia: '2026-11-02' }, { id: 'partner', marca: 'We Scale', dia: '2026-11-02' }]
const response = (rows = goldRows) => new Response(JSON.stringify({ mode: 'ouro', contract: 'marketing_mensal_v1', rows }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function setup(parallelReference = true, route = '/') {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response())
  const referenceFetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(referenceRows)))
  const token = vi.fn(async () => 'session')
  const read = createEletroviasOuroFetch({ origin, route: () => route, token, fetch, referenceFetch, parallelReference,
    marketingScope: { mensal: true, brands: ['Inpot'], endpoint: '/api/marketing-mensal-ouro/v1/read',
      contract: 'marketing_mensal_v1', includes: r => r.marca === 'Inpot' } })
  return { fetch, referenceFetch, token, read }
}

describe('consultas mensais independentes na Visão Geral', () => {
  it('inicia ambas antes de receber a ouro e só entrega a união completa', async () => {
    const s = setup(), gold = deferred<Response>(), reference = deferred<Response>(), started = deferred<void>()
    s.fetch.mockReturnValue(gold.promise)
    s.referenceFetch.mockImplementation(() => { started.resolve(); return reference.promise })
    const complete = vi.fn()
    const result = s.read(url).then(r => { complete(); return r })
    await started.promise
    expect(s.fetch).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
    reference.resolve(new Response(JSON.stringify(referenceRows)))
    await Promise.resolve()
    expect(complete).not.toHaveBeenCalled()
    gold.resolve(response())
    expect(await (await result).json()).toEqual([goldRows[0], referenceRows[1]])
  })

  it.each([[false, '/'], [true, '/marca'], [true, '/sop-marketing'], [true, '/okrs']])('mantém sequência com opt-in %s em %s', async (enabled, route) => {
    const s = setup(Boolean(enabled), String(route)), gold = deferred<Response>(), entered = deferred<void>()
    s.fetch.mockImplementation(() => { entered.resolve(); return gold.promise })
    const result = s.read(url)
    await entered.promise
    expect(s.referenceFetch).not.toHaveBeenCalled()
    gold.resolve(response())
    await result
    expect(s.referenceFetch).toHaveBeenCalledOnce()
  })

  it.each(['leads', 'media_daily_raw'])('preserva %s, todas as páginas, ordenação e marcas sem duplicar consultas', async table => {
    const native = [...Array.from({ length: 1001 }, (_, i) => ({ id: `native-${String(i).padStart(4, '0')}`, marca: 'We Scale', dia: '2026-11-02', spend_brl: i / 100 })),
      { id: 'old', marca: 'Inpot', dia: '2026-11-02', spend_brl: 20 },
      { id: 'october', marca: 'Inpot', dia: '2026-10-02', spend_brl: 30 }]
    const request = `${origin}/rest/v1/${table}?dia=gte.2026-10-01&dia=lte.2026-11-16&select=id,marca,spend_brl&order=id.desc&offset=999&limit=5`
    const outputs: string[] = [], ranges: (string | null)[] = []
    for (const enabled of [false, true]) {
      const s = setup(enabled)
      s.referenceFetch.mockImplementation(async input => {
        const query = new URL(String(input)).searchParams
        return new Response(JSON.stringify(filterRows(native, query).slice(Number(query.get('offset')), Number(query.get('offset')) + Number(query.get('limit')))))
      })
      const [first, shared] = await Promise.all([s.read(request), s.read(request)])
      outputs.push(await first.text()); ranges.push(first.headers.get('Content-Range'))
      expect(await shared.text()).toBe(outputs.at(-1))
      expect(s.fetch).toHaveBeenCalledOnce()
      expect(s.referenceFetch).toHaveBeenCalledTimes(2)
    }
    expect(outputs[1]).toBe(outputs[0]); expect(ranges[1]).toBe(ranges[0])
    expect(JSON.parse(outputs[0])).toHaveLength(4)
  })

  it('falha fechada quando as duas fontes falham e permite nova tentativa', async () => {
    const s = setup()
    s.fetch.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    s.referenceFetch.mockRejectedValueOnce(new Error('reference failure'))
    await expect(s.read(url)).rejects.toThrow('ouro de Inpot')
    expect(await (await s.read(url)).json()).toEqual([goldRows[0], referenceRows[1]])
    expect(s.fetch).toHaveBeenCalledTimes(2)
    expect(s.referenceFetch).toHaveBeenCalledTimes(2)
  })

  it('não entrega só a ouro quando a referência falha', async () => {
    const s = setup(), gold = deferred<Response>(), started = deferred<void>()
    s.fetch.mockReturnValue(gold.promise)
    s.referenceFetch.mockImplementation(async () => { started.resolve(); throw new Error('reference failure') })
    const result = s.read(url); const rejected = expect(result).rejects.toThrow('reference failure')
    await started.promise; gold.resolve(response()); await rejected
  })

  it('mantém delegação explícita no modo legado com os cabeçalhos originais', async () => {
    const s = setup()
    s.fetch.mockResolvedValue(new Response(JSON.stringify({ mode: 'legacy' })))
    s.referenceFetch.mockImplementation(async input => new Response(JSON.stringify(referenceRows), { headers: { 'X-Reference': String(input) === url ? 'original' : 'page' } }))
    const result = await s.read(url)
    expect(result.headers.get('X-Reference')).toBe('original')
    expect(await result.json()).toEqual(referenceRows)
  })

  it('recusa publicação ausente mesmo que a referência tenha dados', async () => {
    const s = setup()
    s.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'periodo_sem_publicacao' }), { status: 409 }))
    await expect(s.read(url)).rejects.toThrow('ainda não publicou')
  })

  it('preserva cancelamento antes de compor o resultado', async () => {
    const s = setup(), gold = deferred<Response>(), entered = deferred<void>(), controller = new AbortController()
    s.fetch.mockImplementation(() => { entered.resolve(); return gold.promise })
    const result = s.read(url, { signal: controller.signal }); const rejected = expect(result).rejects.toThrow('Consulta cancelada')
    await entered.promise; controller.abort(); gold.resolve(response()); await rejected
  })

  it('não consulta sem sessão e limpa as duas fontes ao trocar sessão', async () => {
    const s = setup()
    s.token.mockResolvedValueOnce('')
    await expect(s.read(url)).rejects.toThrow('Entre novamente')
    expect(s.fetch).not.toHaveBeenCalled(); expect(s.referenceFetch).not.toHaveBeenCalled()
    await s.read(url); s.token.mockResolvedValue('other-session'); await s.read(url)
    expect(s.fetch).toHaveBeenCalledTimes(2); expect(s.referenceFetch).toHaveBeenCalledTimes(2)
  })

  it.each(['/funil-vendas', '/performance-vendas', '/esteira'])('não intercepta %s', async route => {
    const s = setup(true, route)
    await s.read(url)
    expect(s.token).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled(); expect(s.referenceFetch).toHaveBeenCalledOnce()
  })

  it('mantém HEAD sequencial, sem antecipar a referência', async () => {
    const s = setup(), gold = deferred<Response>(), entered = deferred<void>()
    s.fetch.mockImplementation(() => { entered.resolve(); return gold.promise })
    const result = s.read(url, { method: 'HEAD' })
    await entered.promise; expect(s.referenceFetch).not.toHaveBeenCalled(); gold.resolve(response())
    expect(await (await result).text()).toBe('')
  })
})
