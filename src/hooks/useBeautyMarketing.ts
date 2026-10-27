import { useAcesso } from '@/contexts/AcessoContext'
import { useCallback } from 'react'
import { marketingDataClient } from '@/lib/partnerMarketingSources'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { deduplicateLeads, isLeadMql } from '@/lib/leadUtils'
import type { Lead } from '@/lib/types'
export const lisoOuroEnabled = import.meta.env.VITE_LISO_OURO_ENABLED === 'true'
export function useBeautyMarketing(start: string, end: string, active = true) {
  const acesso = useAcesso()
  const allowed = acesso.registrado && acesso.ativo && (acesso.acessoTotal || acesso.marcas === null || acesso.marcas.includes('liso-laser'))
  const enabled = allowed && lisoOuroEnabled && active && start <= '2026-10-31' && end >= '2026-10-01'
  const from = start < '2026-10-01' ? '2026-10-01' : start
  const to = end > '2026-10-31' ? '2026-10-31' : end
  const fetch = useCallback(async (signal: AbortSignal) => {
    const db = marketingDataClient()
    const leads: Lead[] = []
    let spend = 0
    for (const table of ['leads', 'media_daily_raw'] as const) {
      for (let offset = 0; ; offset += 1000) {
        if (offset >= 50000) throw new Error('Refine o período de Beauty Connection.')
        const { data, error } = await db.from(table).select('*').eq('marca', 'Beauty Connection')
          .gte('dia', from).lte('dia', to).order('dia', { ascending: false }).order('id')
          .range(offset, offset + 999).abortSignal(signal)
        if (error) throw new Error(error.message)
        if (table === 'leads') leads.push(...data as Lead[])
        else for (const r of data ?? []) {
          if (typeof r.spend_brl !== 'number' || !Number.isFinite(r.spend_brl)) throw new Error('Investimento de Beauty indisponível.')
          spend += r.spend_brl
        }
        if (!data || data.length < 1000) break
      }
    }
    const mqls = leads.filter(isLeadMql)
    const deals = new Set(mqls.map(r => r.dados_extras?.id_deal).filter((id): id is string => typeof id === 'string' && id.length > 0))
    return [{ deals: deals.size, contacts: deduplicateLeads(mqls).length, spend }]
  }, [from, to])
  return { ...useConsultaFiltrada(JSON.stringify(['beauty:marketing:ouro:v1', from, to]), fetch, enabled), enabled, start: from, end: to }
}
export type BeautyMarketingResult = ReturnType<typeof useBeautyMarketing>
