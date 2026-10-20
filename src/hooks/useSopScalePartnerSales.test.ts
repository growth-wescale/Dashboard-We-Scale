import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sales: vi.fn(), contacts: vi.fn(), cache: vi.fn() }))
vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }))
vi.mock('@/lib/supabaseVendas', () => ({ supabaseVendas: { from: mocks.sales } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.contacts } }))
vi.mock('./useConsultaFiltrada', () => ({ useConsultaFiltrada: mocks.cache }))
import { fetchSopPartnerSales, useSopScalePartnerSales } from './useSopScalePartnerSales'

function query(data: unknown[] = [], error: { message: string } | null = null) {
  const q = { select: vi.fn(), in: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) }
  for (const key of ['select', 'in', 'eq', 'gte', 'lt', 'order', 'range', 'abortSignal'] as const) q[key].mockReturnValue(q)
  return q
}
const sale = { id_lead: 'a', ciclo: 1, marca: 'Scale Partner', status_atual: 'Ganho', data_venda: '2026-10-09T18:00:00Z', valor_contrato: 2997 }
const filters = { start: '2026-10-01', end: '2026-10-19' }
beforeEach(() => { vi.clearAllMocks(); mocks.cache.mockReturnValue({ data: [], loading: false, error: null }) })

describe('consulta de vendas Scale Partner na S&OP', () => {
  it('lê somente ganhos das duas marcas por data da venda, com limite e cancelamento', async () => {
    const q = query([sale]); const c = query([{ crm_deal_id: 'a', nome: 'Pessoa', empresa: 'Empresa' }])
    mocks.sales.mockReturnValue(q); mocks.contacts.mockReturnValue(c)
    const signal = new AbortController().signal
    const [result] = await fetchSopPartnerSales(filters, signal)
    expect(mocks.sales).toHaveBeenCalledWith('vw_funil_vendas')
    expect(q.in).toHaveBeenCalledWith('marca', ['We Scale', 'Scale Partner'])
    expect(q.eq).toHaveBeenCalledWith('status_atual', 'Ganho')
    expect(q.gte).toHaveBeenCalledWith('data_venda', '2026-10-01T00:00:00-03:00')
    expect(q.lt).toHaveBeenCalledWith('data_venda', '2026-10-20T00:00:00-03:00')
    expect(q.range).toHaveBeenCalledWith(0, 999)
    expect(q.abortSignal).toHaveBeenCalledWith(signal)
    expect(c.in).toHaveBeenCalledWith('dados_extras->>crm_deal_id', ['a'])
    expect(result.sales).toHaveLength(1); expect(result.contacts).toHaveLength(1)
  })
  it('não busca contatos sem vendas e não transforma falha comercial em zero', async () => {
    mocks.sales.mockReturnValue(query())
    expect((await fetchSopPartnerSales(filters, new AbortController().signal))[0].sales).toEqual([])
    expect(mocks.contacts).not.toHaveBeenCalled()
    mocks.sales.mockReturnValue(query([], { message: 'indisponível' }))
    await expect(fetchSopPartnerSales(filters, new AbortController().signal)).rejects.toThrow('indisponível')
  })
  it('pagina ganhos com ordem estável e deduplica a chave negócio/ciclo', async () => {
    const first = query(Array.from({ length: 1000 }, () => sale))
    const second = query([{ ...sale, id_lead: 'b' }])
    mocks.sales.mockReturnValueOnce(first).mockReturnValueOnce(second)
    mocks.contacts.mockReturnValue(query())
    const [result] = await fetchSopPartnerSales(filters, new AbortController().signal)
    expect(first.range).toHaveBeenCalledWith(0, 999)
    expect(second.range).toHaveBeenCalledWith(1000, 1999)
    expect(first.order.mock.calls.map(call => call[0])).toEqual(['data_venda', 'id_lead', 'ciclo'])
    expect(result.sales).toHaveLength(2)
  })
  it('mantém totais comerciais quando somente o complemento de contatos falha', async () => {
    mocks.sales.mockReturnValue(query([sale])); mocks.contacts.mockReturnValue(query([], { message: 'sem acesso' }))
    const [result] = await fetchSopPartnerSales(filters, new AbortController().signal)
    expect(result.sales).toHaveLength(1); expect(result.contactError).toBeTruthy()
  })
  it('não consulta se cancelada e mantém cache exclusivo desativado nas demais folhas', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(fetchSopPartnerSales(filters, controller.signal)).rejects.toThrow('cancelada')
    expect(mocks.sales).not.toHaveBeenCalled()
    useSopScalePartnerSales({ ...filters, enabled: false })
    expect(mocks.cache).toHaveBeenCalledWith('["sop:scale-partner-sales","2026-10-01","2026-10-19"]', expect.any(Function), false)
  })
})
