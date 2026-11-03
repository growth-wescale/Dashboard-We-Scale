import { useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { fetchVendasRows, useVendasFunil, type VwMarketingFunil } from './useVendasFunil'

interface Filters {
  enabled?: boolean
  marca?: string
  dataInicio?: string
  dataFim?: string
}

// S&OP mounts several overlapping date windows in the same render. Keep their
// reads bounded, including when the PDF mounts a second slide off screen.
let ultimaLeitura: Promise<void> = Promise.resolve()
export function lerFunilSop<T>(signal: AbortSignal, ler: (pageSize: number) => Promise<T>): Promise<T> {
  const proxima = ultimaLeitura.then(async () => {
    signal.throwIfAborted()
    try { return await ler(1000) }
    catch (error) {
      signal.throwIfAborted()
      if (!(error instanceof Error) || !('code' in error) || error.code !== '57014') throw error
      // Retry only a database statement timeout. Restart pagination from zero.
      return ler(250)
    }
  })
  ultimaLeitura = proxima.then(() => {}, () => {})
  return proxima
}

function lerMarca(filters: Filters, signal: AbortSignal) {
  return lerFunilSop(signal, pageSize => fetchVendasRows(filters, signal, pageSize))
}

const colunasSop = [
  'id_lead', 'marca', 'funil', 'fonte', 'status_atual', 'data_criacao_negociacao', 'data_mql',
  'data_tentando_contato', 'data_contato_efetivo', 'data_sql', 'data_diagnostico', 'data_sal',
  'data_oportunidade', 'data_venda', 'quantidade_unidades', 'valor_contrato',
] as const satisfies readonly (keyof VwMarketingFunil)[]
export type LinhaFunilSop = Pick<VwMarketingFunil, typeof colunasSop[number]>

export async function fetchSopRows(filters: Filters, signal: AbortSignal, pageSize = 1000): Promise<LinhaFunilSop[]> {
  const marca = filters.marca
  const legacy = !marca || marca === 'Odonto Scale'
  const colunas = legacy ? '*' : [...colunasSop, 'ciclo'].join(',')
  const rows: LinhaFunilSop[] = []
  for (let from = 0; ; from += pageSize) {
    if (signal.aborted) throw new Error('Consulta cancelada.')
    let q = supabaseVendas.from('vw_marketing_funil').select(colunas)
      .in('funil', legacy ? ['Odonto Scale', 'Odonto Legacy'] : ['SDR', 'Closer', 'Prospecção Ativa', 'Odonto Scale'])
      .order('data_criacao_negociacao', { ascending: false })
      .range(from, from + pageSize - 1).abortSignal(signal)

    if (!legacy) q = q.eq('marca', marca)
    if (!legacy || pageSize < 1000) q = q.order('id_lead').order('ciclo')
    if (filters.dataInicio) q = q.or(
      `data_criacao_negociacao.gte.${filters.dataInicio},data_sql.gte.${filters.dataInicio},data_diagnostico.gte.${filters.dataInicio},data_sal.gte.${filters.dataInicio},data_venda.gte.${filters.dataInicio}`,
    )
    if (filters.dataFim) q = q.lte('data_criacao_negociacao', filters.dataFim + 'T23:59:59')

    const { data, error } = await q
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    rows.push(...((data ?? []) as unknown as LinhaFunilSop[]))
    if (!data || data.length < pageSize) return rows
  }
}

export function useSopVendasFunil(filters: Filters = {}) {
  const { marca, dataInicio, dataFim, enabled = true } = filters
  const partner = marca === 'We Scale' || marca === 'Scale Partner'
  const escopoSop = Boolean(marca) && !partner
  const standard = useVendasFunil({ marca, dataInicio, dataFim, enabled: enabled && !escopoSop }, partner ? undefined : lerMarca)
  const fetch = useCallback((signal: AbortSignal) => lerFunilSop(signal, pageSize => fetchSopRows({ marca, dataInicio, dataFim }, signal, pageSize)), [marca, dataInicio, dataFim])
  const scoped = useConsultaFiltrada(
    JSON.stringify([marca === 'Odonto Scale' ? 'expansao:sop_legacy_funil' : 'expansao:sop_funil:' + marca, dataInicio, dataFim]), fetch, enabled && escopoSop,
  )
  return escopoSop ? scoped : standard
}
