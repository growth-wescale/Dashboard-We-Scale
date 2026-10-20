import { useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { partnerSalesInPeriod, type SopPartnerSale } from '@/lib/sopScalePartner'

interface Filters { start: string; end: string; enabled: boolean }

export async function fetchSopPartnerSales({ start, end }: Omit<Filters, 'enabled'>, signal: AbortSignal): Promise<SopPartnerSale[]> {
  const rows: SopPartnerSale[] = []
  const followingDay = new Date(`${end}T00:00:00Z`)
  followingDay.setUTCDate(followingDay.getUTCDate() + 1)
  const exclusiveEnd = `${followingDay.toISOString().slice(0, 10)}T00:00:00-03:00`
  for (let from = 0; ; from += 1000) {
    if (signal.aborted) throw new Error('Consulta cancelada.')
    const { data, error } = await supabaseVendas.from('vw_funil_vendas')
      .select('id_lead,ciclo,marca,status_atual,data_venda,valor_contrato,utm_source')
      .in('marca', ['We Scale', 'Scale Partner']).eq('status_atual', 'Ganho')
      .gte('data_venda', `${start}T00:00:00-03:00`).lt('data_venda', exclusiveEnd)
      .order('data_venda', { ascending: false }).order('id_lead').order('ciclo')
      .range(from, from + 999).abortSignal(signal)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as SopPartnerSale[]))
    if (!data || data.length < 1000) break
  }
  return partnerSalesInPeriod(rows, start, end)
}

export function useSopScalePartnerSales({ start, end, enabled }: Filters) {
  const fetch = useCallback((signal: AbortSignal) => fetchSopPartnerSales({ start, end }, signal), [start, end])
  const result = useConsultaFiltrada(JSON.stringify(['sop:scale-partner-sales:v2', start, end]), fetch, enabled)
  return { ...result, sales: result.data }
}
