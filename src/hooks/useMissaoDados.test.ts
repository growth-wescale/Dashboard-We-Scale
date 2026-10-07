import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fetches: [] as Array<{ key: string; fetch: (signal: AbortSignal) => Promise<unknown[]>; enabled: boolean }>,
  queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>,
  replies: [] as Array<{ data: unknown[] | null; error: { message: string } | null; count?: number }>,
}))
vi.mock('react', () => ({ useCallback: (f: unknown) => f }))
vi.mock('./useConsultaFiltrada', () => ({ useConsultaFiltrada: (key: string, fetch: (signal: AbortSignal) => Promise<unknown[]>, enabled: boolean) => {
  h.fetches.push({ key, fetch, enabled }); return { data: [], loading: enabled, error: null }
} }))
vi.mock('@/lib/supabaseVendas', () => ({ supabaseVendas: { from(table: string) {
  const query = { table, calls: [] as Array<[string, unknown[]]> }; h.queries.push(query)
  const builder: Record<string, unknown> = { then(resolve: (r: unknown) => void) { resolve(h.replies.shift() ?? { data: [], error: null, count: 0 }) } }
  for (const method of ['select', 'order', 'range', 'abortSignal']) builder[method] = (...args: unknown[]) => { query.calls.push([method, args]); return builder }
  return builder
} } }))

import { useMissaoDados } from './useMissaoDados'

beforeEach(() => { h.fetches.length = 0; h.queries.length = 0; h.replies.length = 0 })
describe('consulta Missão Impossível', () => {
  it('preserva gate de acesso e chaves independentes de período', () => {
    useMissaoDados(false)
    expect(h.fetches.every(f => !f.enabled)).toBe(true)
    expect(h.queries).toHaveLength(0)
    expect(h.fetches.map(f => f.key)).toEqual(['missao:deals:todas-origens:v1', 'missao:eventos:todas-origens:v1'])
  })
  it('lê as duas fontes de Expansão sem filtros de marca/origem ou payload', async () => {
    useMissaoDados(true)
    const signal = new AbortController().signal
    await Promise.all(h.fetches.map(f => f.fetch(signal)))
    expect(h.queries.map(q => q.table)).toEqual(['vw_funil_vendas', 'vw_funil_etapas_v2'])
    for (const q of h.queries) {
      expect(q.calls.find(c => c[0] === 'select')![1][0]).not.toMatch(/payload|email|telefone|nome_negociacao/)
      expect(q.calls).toContainEqual(['abortSignal', [signal]])
      expect(q.calls).toContainEqual(['range', [0, 999]])
    }
    expect(h.queries[0].calls.filter(c => c[0] === 'order').map(c => c[1][0])).toEqual(['id_lead', 'ciclo'])
    expect(h.queries[1].calls.filter(c => c[0] === 'order').map(c => c[1][0])).toEqual(['dia', 'id_deal', 'id_etapa', 'etapa_canonica', 'nome_funil', 'ciclo', 'rn_deal_etapa_mes'])
  })
  it('não limita o realizado às primeiras mil linhas', async () => {
    useMissaoDados(true)
    h.replies.push({ data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null, count: 1001 }, { data: [{ id: 1000 }], error: null })
    const rows = await h.fetches[0].fetch(new AbortController().signal)
    expect(rows).toHaveLength(1001)
    expect(h.queries[1].calls).toContainEqual(['range', [1000, 1999]])
  })
  it('falha integralmente se uma página falha, sem KPIs parciais', async () => {
    useMissaoDados(true)
    h.replies.push({ data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null, count: 1001 }, { data: null, error: { message: 'indisponível' } })
    await expect(h.fetches[0].fetch(new AbortController().signal)).rejects.toThrow('indisponível')
  })
})
