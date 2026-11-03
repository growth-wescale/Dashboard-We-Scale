import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), standard: vi.fn(), scoped: vi.fn(),
}))
vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }))
vi.mock('@/lib/supabaseVendas', () => ({ supabaseVendas: { from: mocks.from } }))
vi.mock('./useVendasFunil', () => ({ useVendasFunil: mocks.standard }))
vi.mock('./useConsultaFiltrada', () => ({ useConsultaFiltrada: mocks.scoped }))

import { fetchSopRows, lerFunilSop, useSopVendasFunil } from './useSopVendasFunil'

function query(data: unknown[] | null = [], error: { message: string } | null = null) {
  const q = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(),
    abortSignal: vi.fn(), or: vi.fn(), lte: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  }
  for (const k of ['select', 'eq', 'in', 'order', 'range', 'abortSignal', 'or', 'lte'] as const) q[k].mockReturnValue(q)
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
    expect(await fetchSopRows({ dataInicio: '2026-10-01', dataFim: '2026-10-19' }, signal)).toHaveLength(2)
    expect(mocks.from).toHaveBeenCalledWith('vw_marketing_funil')
    expect(q.in).toHaveBeenCalledWith('funil', ['Odonto Scale', 'Odonto Legacy'])
    expect(q.or).toHaveBeenCalledWith('data_criacao_negociacao.gte.2026-10-01,data_sql.gte.2026-10-01,data_diagnostico.gte.2026-10-01,data_sal.gte.2026-10-01,data_venda.gte.2026-10-01')
    expect(q.lte).toHaveBeenCalledWith('data_criacao_negociacao', '2026-10-19T23:59:59')
    expect(q.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('lê a folha de Eletrovias com os campos utilizados, a mesma marca e os mesmos funis', async () => {
    const q = query([{ id_lead: 'exemplo', ciclo: 1 }]); mocks.from.mockReturnValue(q)
    expect(await fetchSopRows({ marca: 'Eletrovias' }, new AbortController().signal)).toHaveLength(1)
    expect(q.eq).toHaveBeenCalledWith('marca', 'Eletrovias')
    expect(q.in).toHaveBeenCalledWith('funil', ['SDR', 'Closer', 'Prospecção Ativa', 'Odonto Scale'])
    expect(q.select.mock.calls[0][0].split(',')).toContain('data_sql')
    expect(q.order.mock.calls.map(call => call[0])).toEqual(['data_criacao_negociacao','id_lead','ciclo'])
  })
  it('preserva consulta histórica sem período e pagina a base completa', async () => {
    const first = query(Array.from({ length: 1000 }, (_, i) => ({ id_lead: String(i) })))
    const second = query([{ id_lead: 'last' }])
    mocks.from.mockReturnValueOnce(first).mockReturnValueOnce(second)
    expect(await fetchSopRows({}, new AbortController().signal)).toHaveLength(1001)
    expect(first.range).toHaveBeenCalledWith(0, 999)
    expect(second.range).toHaveBeenCalledWith(1000, 1999)
    expect(first.or).not.toHaveBeenCalled()
    expect(first.lte).not.toHaveBeenCalled()
  })

  it('não oculta falhas nem consulta quando já cancelada', async () => {
    mocks.from.mockReturnValue(query(null, { message: 'indisponível' }))
    await expect(fetchSopRows({}, new AbortController().signal)).rejects.toThrow('indisponível')
    mocks.from.mockClear()
    const c = new AbortController(); c.abort()
    await expect(fetchSopRows({}, c.signal)).rejects.toThrow('cancelada')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('ativa somente a consulta Legacy e isola o cache da consulta compartilhada', () => {
    expect(useSopVendasFunil({ marca: 'Odonto Scale', dataInicio: '2026-10-01' }).data).toEqual(['legacy'])
    expect(mocks.standard).toHaveBeenCalledWith({ marca: 'Odonto Scale', dataInicio: '2026-10-01', dataFim: undefined, enabled: false }, expect.any(Function))
    expect(mocks.scoped).toHaveBeenCalledWith('["expansao:sop_legacy_funil","2026-10-01",null]', expect.any(Function), true)
  })

  it('isola a projeção de Eletrovias no cache da S&OP', () => {
    useSopVendasFunil({ marca: 'Eletrovias', dataInicio: '2026-10-01', dataFim: '2026-10-03' })
    expect(mocks.standard.mock.calls[0][0].enabled).toBe(false)
    expect(mocks.scoped.mock.calls[0]).toEqual(['["expansao:sop_eletrovias_funil","2026-10-01","2026-10-03"]', expect.any(Function), true])
  })

  it.each(['Inpot', 'B2Case', 'Lisô Laser', 'Viva', 'Oral Unic', 'We Scale', undefined])('não muda a fonte da folha %s', marca => {
    expect(useSopVendasFunil({ marca, dataInicio: '2026-10-01', dataFim: '2026-10-19' }).data).toEqual(['standard'])
    expect(mocks.standard).toHaveBeenCalledWith({ marca, dataInicio: '2026-10-01', dataFim: '2026-10-19', enabled: true }, marca === 'We Scale' ? undefined : expect.any(Function))
    expect(mocks.scoped.mock.calls[0][2]).toBe(false)
  })

  it('respeita desativação explícita nas duas fontes', () => {
    useSopVendasFunil({ marca: 'Odonto Scale', enabled: false })
    expect(mocks.standard.mock.calls[0][0].enabled).toBe(false)
    expect(mocks.scoped.mock.calls[0][2]).toBe(false)
  })
})

describe('leituras concorrentes do PDF', () => {
  it('espera a janela anterior e repete somente um timeout, com paginação menor', async () => {
    let liberar!: () => void
    const primeiro = lerFunilSop(new AbortController().signal, () => new Promise<void>(r => { liberar = r }))
    const ler = vi.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), {code:'57014'})).mockResolvedValueOnce(['completo'])
    const segundo = lerFunilSop(new AbortController().signal, ler)
    await Promise.resolve()
    expect(ler).not.toHaveBeenCalled()
    liberar()
    await primeiro
    await expect(segundo).resolves.toEqual(['completo'])
    expect(ler.mock.calls).toEqual([[1000], [250]])
  })
  it('preserva erro de acesso e não consulta pedidos cancelados na fila', async () => {
    const ler = vi.fn().mockRejectedValue(Object.assign(new Error('negado'), {code:'42501'}))
    await expect(lerFunilSop(new AbortController().signal, ler)).rejects.toThrow('negado')
    const cancelado = new AbortController(); cancelado.abort()
    await expect(lerFunilSop(cancelado.signal, ler)).rejects.toThrow()
    expect(ler).toHaveBeenCalledTimes(1)
  })
})
