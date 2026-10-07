import { useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import type { MissaoDeal } from '@/lib/missaoImpossivel'
import type { FunnelEventRow } from '@/lib/metrics'

/** Todas as origens; sem nomes, contatos ou payload. Filtros locais não causam nova carga. */
export function useMissaoDados(enabled: boolean) {
  const fetchDeals = useCallback(async (signal: AbortSignal) => {
    const result = await buscarTodasPaginas<MissaoDeal>(async (de, ate, contar) => {
      const { data, error, count } = await supabaseVendas.from('vw_funil_vendas')
        .select('id_lead,ciclo,marca,status_atual,valor_contrato,data_venda,data_criacao_original,data_novo_mql,data_agendamento_reuniao_sql,data_sal', contar ? { count: 'exact' } : undefined)
        .order('id_lead').order('ciclo').range(de, ate).abortSignal(signal)
      return { rows: (data ?? []) as MissaoDeal[], error: error?.message ?? null, total: count }
    }, { tamanhoPagina: 1000, concorrencia: 3 })
    if (result.error) throw new Error(result.error)
    return result.rows
  }, [])
  const fetchEvents = useCallback(async (signal: AbortSignal) => {
    const result = await buscarTodasPaginas<FunnelEventRow>(async (de, ate, contar) => {
      const { data, error, count } = await supabaseVendas.from('vw_funil_etapas_v2')
        .select('id_deal,dia,etapa_canonica,id_etapa,nome_funil,ciclo,rn_deal_etapa_mes,marca_deal', contar ? { count: 'exact' } : undefined)
        .order('dia').order('id_deal').order('id_etapa').order('etapa_canonica').order('nome_funil').order('ciclo').order('rn_deal_etapa_mes')
        .range(de, ate).abortSignal(signal)
      return { rows: (data ?? []) as FunnelEventRow[], error: error?.message ?? null, total: count }
    }, { tamanhoPagina: 1000, concorrencia: 3 })
    if (result.error) throw new Error(result.error)
    return result.rows
  }, [])
  const deals = useConsultaFiltrada('missao:deals:todas-origens:v1', fetchDeals, enabled)
  const events = useConsultaFiltrada('missao:eventos:todas-origens:v1', fetchEvents, enabled)
  return { deals, events }
}
