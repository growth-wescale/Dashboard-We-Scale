import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), standard: vi.fn(), scoped: vi.fn(),
}))
vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }))
vi.mock('@/lib/supabaseVendas', () => ({ supabaseVendas: { from: mocks.from } }))
vi.mock('./useVendasFunil', () => ({ useVendasFunil: mocks.standard }))
vi.mock('./useConsultaFiltrada', () => ({ useConsultaFiltrada: mocks.scoped }))

import { fetchSopLegacyRows, useSopVendasFunil } from './useSopVendasFunil'

function query(data: unknown[] | null = [], error: { message: string } | null = null) {
  const q = {
    select: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(),
    abortSignal: vi.fn(), or: vi.fn(), lte: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  }
  for (const k of ['select', 'in', 'order', 'range', 'abortSignal', 'or', 'lte'] as const) q[k].mockReturnValue(q)
  return q
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.standard.mockReturnValue({ data: ['standard'], loading: false, error: null })
  mocks.scoped.mockReturnValue({ data: ['legacy'], loading: false, error: null })
})

describe('fonte Legacy exclusiva da S&OP', () => {
  it('aceita somente os nomes antigo e atual do funil e conserva os filtros de período', async () => {
    const q = query([{ id_lead: 'historic' }, { id_lead: 'current' }])
    mocks.from.mockReturnValue(q)
    const signal = new AbortController().signal
    expect(await fetchSopLegacyRows({ dataInicio: '2026-10-01', dataFim: '2026-10-19' }, signal)).toHaveLength(2)
    expect(mocks.from).toHaveBeenCalledWith('vw_marketing_funil')
    expect(q.in).toHaveBeenCalledWith('funil', ['Odonto Scale', 'Odonto Legacy'])
    expect(q.or).toHaveBeenCalledWith('data_criacao_negociacao.gte.2026-10-01,data_sql.gte.2026-10-01,data_diagnostico.gte.2026-10-01,data_sal.gte.2026-10-01,data_venda.gte.2026-10-01')
    expect(q.lte).toHaveBeenCalledWith('data_criacao_negociacao', '2026-10-19T23:59:59')
    expect(q.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('preserva consulta histórica sem período e pagina a base completa', async () => {
    const first = query(Array.from({ length: 1000 }, (_, i) => ({ id_lead: String(i) })))
    const second = query([{ id_lead: 'last' }])
    mocks.from.mockReturnValueOnce(first).mockReturnValueOnce(second)
    expect(await fetchSopLegacyRows({}, new AbortController().signal)).toHaveLength(1001)
    expect(first.range).toHaveBeenCalledWith(0, 999)
    expect(second.range).toHaveBeenCalledWith(1000, 1999)
    expect(first.or).not.toHaveBeenCalled()
    expect(first.lte).not.toHaveBeenCalled()
  })

  it('não oculta falhas nem consulta quando já cancelada', async () => {
    mocks.from.mockReturnValue(query(null, { message: 'indisponível' }))
    await expect(fetchSopLegacyRows({}, new AbortController().signal)).rejects.toThrow('indisponível')
    mocks.from.mockClear()
    const c = new AbortController(); c.abort()
    await expect(fetchSopLegacyRows({}, c.signal)).rejects.toThrow('cancelada')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('ativa somente a consulta Legacy e isola o cache da consulta compartilhada', () => {
    expect(useSopVendasFunil({ marca: 'Odonto Scale', dataInicio: '2026-10-01' }).data).toEqual(['legacy'])
    expect(mocks.standard).toHaveBeenCalledWith({ marca: 'Odonto Scale', dataInicio: '2026-10-01', dataFim: undefined, enabled: false })
    expect(mocks.scoped).toHaveBeenCalledWith('["expansao:sop_legacy_funil","2026-10-01",null]', expect.any(Function), true)
  })

  it.each(['Eletrovias', 'Inpot', 'B2Case', 'Lisô Laser', 'Viva', 'Oral Unic', 'We Scale', undefined])('não muda a fonte da folha %s', marca => {
    expect(useSopVendasFunil({ marca, dataInicio: '2026-10-01', dataFim: '2026-10-19' }).data).toEqual(['standard'])
    expect(mocks.standard).toHaveBeenCalledWith({ marca, dataInicio: '2026-10-01', dataFim: '2026-10-19', enabled: true })
    expect(mocks.scoped.mock.calls[0][2]).toBe(false)
  })

  it('respeita desativação explícita nas duas fontes', () => {
    useSopVendasFunil({ marca: 'Odonto Scale', enabled: false })
    expect(mocks.standard.mock.calls[0][0].enabled).toBe(false)
    expect(mocks.scoped.mock.calls[0][2]).toBe(false)
  })
})
