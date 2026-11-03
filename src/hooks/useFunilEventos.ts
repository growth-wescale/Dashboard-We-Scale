import { useMemo } from 'react'
import { baseEtapas, porOrigem, type EventoFunil } from '@/lib/aoVivo/basesVendas'
import { useBaseAoVivo } from './useBaseAoVivo'
import type { FunnelEventRow } from '@/lib/metrics'
import type { OrigemComercial } from '@/lib/funnelTypes'

/**
 * Eventos de passagem por etapa (`vw_funil_etapas_v2`), pela base ao vivo
 * (`src/lib/aoVivo`): abre na hora e recebe sozinha o que mudar no banco.
 *
 * Antes eram 25 páginas de 1000 linhas e cada uma recalculava a view inteira
 * (~0,9 s no banco ocioso, até 2,7 s com carga): ~14 s para abrir a Visão
 * Macro. Agora o banco mantém a view pronta (`dash_etapas`) e manda só o que
 * mudou — ver docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql.
 *
 * A view não expõe fonte_macro nem utm_source. O filtro de MARCA, fonte e
 * sub-fonte é aplicado depois, cruzando `id_deal` com o conjunto já filtrado
 * de `vw_funil_vendas`.
 *
 * NÃO filtrar pela `marca` do evento: ela vem de `deal_eventos.marca`, um
 * retrato denormalizado gravado na ingestão, nulo em ~17% dos eventos de
 * agosto/26 (a origem `api_backfill_stage_history` nunca preenche). Um
 * `.eq('marca', ...)` descartava 87% dos eventos da janela e o funil de uma
 * marca sozinha aparecia zerado. A marca confiável é a do deal, em
 * `vw_funil_vendas` (e `marca_deal` aqui, só para a regra de funil
 * obrigatório).
 *
 * Sem filtro de data: a base inteira fica no navegador e a troca de período é
 * filtrada no cliente via `isInWindow`/`win`, igual a `useFunilVendas`.
 * Origem também é recortada aqui (a base traz as duas).
 */

interface Params {
  enabled: boolean
  origem: OrigemComercial
}

export interface UseFunilEventosResult {
  /** Compartilhado entre componentes: NÃO mutar o array nem as linhas. */
  data: FunnelEventRow[]
  loading: boolean
  error: string | null
}

const NENHUM: FunnelEventRow[] = []

export function useFunilEventos({ enabled, origem }: Params): UseFunilEventosResult {
  const { linhas, carregando, erro } = useBaseAoVivo(baseEtapas, enabled)
  const data = useMemo<FunnelEventRow[]>(
    () => (enabled ? porOrigem<EventoFunil>(linhas, origem) : NENHUM),
    [enabled, linhas, origem],
  )
  return { data, loading: carregando, error: erro }
}
