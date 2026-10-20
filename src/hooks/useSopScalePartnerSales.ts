import { useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { supabase } from '@/lib/supabase'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { partnerSalesInPeriod, type SopPartnerSale, type SopPartnerContact } from '@/lib/sopScalePartner'

interface Filters { start: string; end: string; enabled: boolean }
interface Result { sales: SopPartnerSale[]; contacts: SopPartnerContact[]; contactError: string | null }

export async function fetchSopPartnerSales({ start, end }: Omit<Filters, 'enabled'>, signal: AbortSignal): Promise<Result[]> {
  const rows: SopPartnerSale[] = []
  const followingDay = new Date(`${end}T00:00:00Z`)
  followingDay.setUTCDate(followingDay.getUTCDate() + 1)
  const exclusiveEnd = `${followingDay.toISOString().slice(0, 10)}T00:00:00-03:00`
  for (let from = 0; ; from += 1000) {
    if (signal.aborted) throw new Error('Consulta cancelada.')
    const { data, error } = await supabaseVendas.from('vw_funil_vendas')
      .select('id_lead,ciclo,marca,nome_negociacao,status_atual,data_venda,valor_contrato,utm_source')
      .in('marca', ['We Scale', 'Scale Partner']).eq('status_atual', 'Ganho')
      .gte('data_venda', `${start}T00:00:00-03:00`).lt('data_venda', exclusiveEnd)
      .order('data_venda', { ascending: false }).order('id_lead').order('ciclo')
      .range(from, from + 999).abortSignal(signal)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as SopPartnerSale[]))
    if (!data || data.length < 1000) break
  }
  const sales = partnerSalesInPeriod(rows, start, end)
  const contacts: SopPartnerContact[] = []
  let contactError: string | null = null
  // Só busca identidade dos compradores, inclusive os captados antes do mês da venda.
  const ids = [...new Set(sales.map(sale => sale.id_lead))]
  for (let from = 0; from < ids.length; from += 100) {
    const { data, error } = await supabase.from('leads')
      .select('nome,crm_deal_id:dados_extras->>crm_deal_id,empresa:dados_extras->>empresa')
      .in('marca', ['We Scale', 'Scale Partner'])
      .in('dados_extras->>crm_deal_id', ids.slice(from, from + 100))
      .order('dia', { ascending: false }).order('id').abortSignal(signal)
    if (error) {
      contactError = 'Não foi possível consultar os dados complementares dos compradores.'
      break
    }
    contacts.push(...((data ?? []) as unknown as SopPartnerContact[]))
  }
  return [{ sales, contacts, contactError }]
}

export function useSopScalePartnerSales({ start, end, enabled }: Filters) {
  const fetch = useCallback((signal: AbortSignal) => fetchSopPartnerSales({ start, end }, signal), [start, end])
  const result = useConsultaFiltrada(JSON.stringify(['sop:scale-partner-sales', start, end]), fetch, enabled)
  return { ...result, sales: result.data[0]?.sales ?? [], contacts: result.data[0]?.contacts ?? [], contactError: result.data[0]?.contactError ?? null }
}
