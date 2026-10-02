import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ciclo de hooks controlado (sem DOM): executa os hooks de produção, com rede
// simulada que deliberadamente ignora abort para testar respostas tardias.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void }
  type Instance = { slots: Slot[]; cursor: number; effects: Array<() => void> }
  type Request = { source: string; table: string; calls: Array<[string, unknown[]]>; signal?: AbortSignal;
    resolve: (result: { data: unknown[] | null; error: { message: string } | null }) => void; reject: (e: Error) => void }
  const h = {
    active: null as Instance | null,
    instances: [] as Instance[], requests: [] as Request[],
    auth: (_event: string, _session: { user: { id: string } } | null) => {},
    instance(): Instance { const instance = { slots: [], cursor: 0, effects: [] }; h.instances.push(instance); return instance },
    slot() { const i = h.active!; const index = i.cursor++; return i.slots[index] ?? (i.slots[index] = {}) },
    equal(a?: unknown[], b?: unknown[]) { return !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])) },
    client(source: string) {
      return { from(table: string) {
        const request: Request = { source, table, calls: [], resolve: () => {}, reject: () => {} }
        const promise = new Promise<{ data: unknown[] | null; error: { message: string } | null }>((resolve, reject) => {
          request.resolve = resolve; request.reject = reject
        })
        const query: Record<string, unknown> = { then: promise.then.bind(promise) }
        for (const method of ['select', 'order', 'range', 'eq', 'gte', 'lte', 'in', 'not', 'neq', 'or', 'abortSignal']) {
          query[method] = (...args: unknown[]) => {
            request.calls.push([method, args])
            if (method === 'abortSignal') request.signal = args[0] as AbortSignal
            return query
          }
        }
        h.requests.push(request)
        return query
      } }
    },
  }
  return h
})
vi.mock('react', () => ({
  useState(initial: unknown) {
    const slot = harness.slot()
    if (!('value' in slot)) slot.value = initial
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useCallback(callback: unknown, deps: unknown[]) {
    const slot = harness.slot()
    if (!harness.equal(slot.deps, deps)) { slot.value = callback; slot.deps = deps }
    return slot.value
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const slot = harness.slot()
    if (!harness.equal(slot.deps, deps)) {
      slot.deps = deps
      harness.active!.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined })
    }
  },
}))
vi.mock('@/lib/supabase', () => ({ supabase: { ...harness.client('marketing'), auth: {
  onAuthStateChange(callback: typeof harness.auth) { harness.auth = callback; return { data: { subscription: { unsubscribe() {} } } } },
} } }))
vi.mock('@/lib/supabaseVendas', () => ({ supabaseVendas: harness.client('expansao') }))

import { useMediaData } from './useMediaData'
import { useLeads } from './useLeads'
import { useVendasFunil } from './useVendasFunil'

type Instance = ReturnType<typeof harness.instance>
function render<T>(instance: Instance, hook: () => T) {
  harness.active = instance; instance.cursor = 0
  const result = hook()
  harness.active = null
  instance.effects.splice(0).forEach(effect => effect())
  return result
}
function unmount(instance: Instance) { instance.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve() }
function resolve(index: number, data: unknown[]) { harness.requests[index].resolve({ data, error: null }) }
const dates = (start: string) => ({ dataInicio: start, dataFim: '2026-10-02' })
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  harness.requests.length = 0
})
afterEach(async () => {
  harness.instances.splice(0).forEach(unmount)
  harness.auth('SIGNED_OUT', null)
  await flush()
  vi.useRealTimers(); vi.unstubAllGlobals()
})

describe.each([
  ['mídia', useMediaData], ['leads', useLeads], ['CRM', useVendasFunil],
] as const)('%s: carregamento filtrado', (_name, hook) => {
  it('troca durante carga inicia consulta nova; resposta antiga não sobrescreve', async () => {
    const instance = harness.instance()
    render(instance, () => hook(dates('2026-09-01'))); await flush()
    const next = () => hook(dates('2026-10-01'))
    expect(render(instance, next)).toMatchObject({ data: [], loading: true })
    await flush()
    expect(harness.requests).toHaveLength(2)
    expect(harness.requests[0].signal?.aborted).toBe(true)
    resolve(1, [{ id: 'novo' }]); await flush()
    expect(render(instance, next)).toMatchObject({ data: [{ id: 'novo' }], loading: false, error: null })
    resolve(0, [{ id: 'antigo' }]); await flush()
    expect(render(instance, next).data).toEqual([{ id: 'novo' }])
  })
  it('troca durante atualização silenciosa não deixa números antigos no recorte novo', async () => {
    const instance = harness.instance(), old = () => hook(dates('2026-09-01'))
    render(instance, old); await flush(); resolve(0, [{ id: 'antigo' }]); await flush()
    window.dispatchEvent(new Event('dashboard:refresh')); await flush()
    expect(render(instance, old).loading).toBe(false)
    const next = () => hook(dates('2026-10-01'))
    expect(render(instance, next)).toMatchObject({ data: [], loading: true }); await flush()
    expect(harness.requests).toHaveLength(3)
    resolve(2, [{ id: 'novo' }]); await flush(); resolve(1, [{ id: 'atrasado' }]); await flush()
    expect(render(instance, next).data).toEqual([{ id: 'novo' }])
  })
  it('rejeição encerra loading, informa erro e permite atualizar novamente', async () => {
    const instance = harness.instance(), query = () => hook(dates('2026-10-01'))
    render(instance, query); await flush(); harness.requests[0].reject(new Error('rede indisponível')); await flush()
    expect(render(instance, query)).toMatchObject({ loading: false, error: 'rede indisponível' })
    window.dispatchEvent(new Event('dashboard:refresh')); await flush(); resolve(1, [{ id: 'ok' }]); await flush()
    expect(render(instance, query)).toMatchObject({ data: [{ id: 'ok' }], loading: false, error: null })
  })
  it('compartilha consulta entre instâncias e não cancela consumidor ainda montado', async () => {
    const a = harness.instance(), b = harness.instance(), query = () => hook(dates('2026-10-01'))
    render(a, query); render(b, query); await flush()
    expect(harness.requests).toHaveLength(1)
    unmount(a); await flush(); expect(harness.requests[0].signal?.aborted).toBe(false)
    resolve(0, [{ id: 'ok' }]); await flush()
    expect(render(b, query).data).toEqual([{ id: 'ok' }])
    render(harness.instance(), query); await flush()
    expect(harness.requests).toHaveLength(1)
  })
  it('consulta desabilitada não busca dados', async () => {
    const instance = harness.instance()
    expect(render(instance, () => hook({ enabled: false }))).toEqual({ data: [], loading: false, error: null })
    await flush(); expect(harness.requests).toHaveLength(0)
    render(instance, () => hook({ enabled: true })); await flush()
    expect(harness.requests).toHaveLength(1)
  })
  it('timeout acaba com loading infinito e polling não acumula requisições', async () => {
    vi.useFakeTimers()
    const instance = harness.instance(), query = () => hook(dates('2026-10-01'))
    render(instance, query); await flush()
    window.dispatchEvent(new Event('dashboard:refresh')); await flush()
    expect(harness.requests).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(render(instance, query)).toMatchObject({ loading: false, error: expect.stringContaining('60 segundos') })
    await vi.advanceTimersByTimeAsync(240_000)
    expect(harness.requests).toHaveLength(2)
  })
})

it('preserva fonte, filtros, ordem e paginação de mídia; não publica páginas incompletas', async () => {
  const instance = harness.instance()
  const useQuery = () => useMediaData({ marca: 'Viva', canal: 'meta', ...dates('2026-09-01') })
  render(instance, useQuery); await flush()
  expect(harness.requests[0]).toMatchObject({ source: 'marketing', table: 'media_daily_raw' })
  expect(harness.requests[0].calls).toEqual(expect.arrayContaining([
    ['select', ['*']], ['order', ['dia', { ascending: false }]], ['range', [0, 999]],
    ['eq', ['marca', 'Viva']], ['eq', ['canal', 'meta']], ['gte', ['dia', '2026-09-01']], ['lte', ['dia', '2026-10-02']],
  ]))
  resolve(0, Array.from({ length: 1000 }, (_, id) => ({ id }))); await flush()
  expect(render(instance, useQuery)).toMatchObject({ loading: true, data: [] })
  expect(harness.requests[1].calls).toContainEqual(['range', [1000, 1999]])
  resolve(1, [{ id: 1000 }]); await flush()
  expect(render(instance, useQuery).data).toHaveLength(1001)
})
it('CRM preserva origem Expansão, allowlist, datas e tratamento de Odonto Scale', async () => {
  const instance = harness.instance()
  render(instance, () => useVendasFunil(dates('2026-09-01'))); await flush()
  expect(harness.requests[0]).toMatchObject({ source: 'expansao', table: 'vw_marketing_funil' })
  expect(harness.requests[0].calls).toEqual(expect.arrayContaining([
    ['in', ['funil', ['SDR', 'Closer', 'Prospecção Ativa', 'Odonto Scale']]],
    ['not', ['marca', 'is', null]], ['neq', ['marca', '']],
    ['lte', ['data_criacao_negociacao', '2026-10-02T23:59:59']],
    ['or', ['data_criacao_negociacao.gte.2026-09-01,data_sql.gte.2026-09-01,data_diagnostico.gte.2026-09-01,data_sal.gte.2026-09-01,data_venda.gte.2026-09-01']],
  ]))
  render(instance, () => useVendasFunil({ marca: 'Odonto Scale' })); await flush()
  expect(harness.requests[1].calls).toContainEqual(['eq', ['funil', 'Odonto Scale']])
  expect(harness.requests[1].calls.some(([name]) => name === 'in' || name === 'or')).toBe(false)
})
it('erro de uma página não vira sucesso parcial e login de outro usuário não reutiliza cache', async () => {
  const instance = harness.instance(), useQuery = () => useLeads({ marca: 'Viva' })
  render(instance, useQuery); await flush(); resolve(0, Array.from({ length: 1000 }, (_, id) => ({ id }))); await flush()
  harness.requests[1].resolve({ data: null, error: { message: 'timeout do banco' } }); await flush()
  expect(render(instance, useQuery)).toMatchObject({ data: [], loading: false, error: 'timeout do banco' })
  window.dispatchEvent(new Event('dashboard:refresh')); await flush(); resolve(2, [{ id: 'ok' }]); await flush()
  unmount(instance); harness.auth('SIGNED_IN', { user: { id: 'outra-pessoa' } })
  const next = harness.instance()
  expect(render(next, useQuery)).toMatchObject({ data: [], loading: true }); await flush()
  expect(harness.requests).toHaveLength(4)
})
