/**
 * Funil completo (12 etapas) na aba Performance Detalhada.
 *
 * Bloco independente do resto da página: lê `vw_funil_vendas` +
 * `SharedFiltersContext` — a mesma base e os mesmos filtros (marca, período,
 * fonte) da Visão Macro, que só mostra um subconjunto simplificado de
 * etapas. Não usa os filtros locais (marca/mês) do resto de Performance
 * Detalhada, que ainda lê a view antiga `vw_marketing_funil`.
 */

import { useMemo } from 'react'
import { SCard } from '@/components/ui/v2'
import { TrapFunnel } from '@/components/ui/TrapFunnel'
import type { FunnelStage } from '@/components/ui/TrapFunnel'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useMediaData } from '@/hooks/useMediaData'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import {
  STAGE_ORDER, STAGE_LABEL, buildScopeFilter, cohortKeys, countSales, countStageEvents, toWindow,
} from '@/lib/metrics'
import { BRANDS_WITH_OVERVIEW } from '@/constants/brands'

export function FunilCompletoSection() {
  const { brandKey, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()
  const brandDef = BRANDS_WITH_OVERVIEW.find(b => b.key === brandKey) ?? BRANDS_WITH_OVERVIEW[0]
  const marca = brandDef.marca
  const { accent, dark } = brandDef
  const scopeLabel = brandKey === 'overview' ? 'Consolidado' : brandDef.label

  const { data: rows, loading } = useFunilVendas(marca)
  const { data: eventos } = useFunilEventos({
    enabled: true,
    marca,
    inicio: range.start,
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { data: curMedia } = useMediaData({ marca, dataInicio: range.start, dataFim: range.end })

  const scope = useMemo(() => buildScopeFilter({ fontes, subFontes }), [fontes, subFontes])
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )

  // União exata: soma só mídia dos dias que caem de fato num período selecionado.
  const invest = useMemo(
    () => curMedia.reduce((s, r) => s + (ranges.some(rg => r.dia >= rg.start && r.dia <= rg.end) ? r.spend_brl : 0), 0),
    [curMedia, ranges],
  )

  const funnel = useMemo<FunnelStage[]>(() => {
    const safra = viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null
    const idsEscopo = new Set(scoped.map(r => String(r.id_lead)))
    return STAGE_ORDER.map(s => ({
      key: s,
      label: STAGE_LABEL[s],
      value: s === 'Fechamento'
        ? countSales(scoped, win, viewModes)
        : countStageEvents(eventos, s, win, viewModes, {
            cohortIds: safra,
            extra: e => idsEscopo.has(String(e.id_deal)),
          }),
    }))
  }, [scoped, eventos, win, viewModes])

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>
          Funil completo (12 etapas)
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
          {scopeLabel} · usa os mesmos filtros de marca, período e fonte da Visão Macro
        </div>
      </div>
      <SCard style={{ padding: '18px 24px 24px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
        <TrapFunnel stages={funnel} invest={invest} accent={accent} dark={dark} />
      </SCard>
    </div>
  )
}
