/**
 * Funil completo (12 etapas) na aba Performance.
 *
 * Lê `vw_funil_vendas` + `SharedFiltersContext` — a mesma base e os mesmos
 * filtros do resto da página (migrada em 2026-09-03) e da Visão Macro, que só
 * mostra um subconjunto simplificado de etapas.
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
import { BRAND_LIST, BRAND_OVERVIEW } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'

export function FunilCompletoSection() {
  const { origem, brandKeys, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()

  const marcasSelecionadas = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is BrandDef => !!b),
    [brandKeys],
  )
  const todasSelecionadas = marcasSelecionadas.length === BRAND_LIST.length
  const { accent, dark } = marcasSelecionadas.length === 1 ? marcasSelecionadas[0] : BRAND_OVERVIEW
  const scopeLabel = todasSelecionadas
    ? 'Consolidado'
    : marcasSelecionadas.length === 1
      ? marcasSelecionadas[0].label
      : marcasSelecionadas.length <= 3
        ? marcasSelecionadas.map(b => b.label).join(', ')
        : `${marcasSelecionadas.length} marcas selecionadas`
  const marcaFetch = marcasSelecionadas.length === 1 ? marcasSelecionadas[0].marca : undefined
  const marcasParaEscopo: string[] = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is Marca => !!m),
    [marcasSelecionadas],
  )

  const { data: rows, loading } = useFunilVendas(origem, marcaFetch)
  // Sem marca no servidor — o recorte vem de `idsEscopo`. Ver useFunilEventos.
  const { data: eventos } = useFunilEventos({
    enabled: true,
    origem,
    inicio: range.start,
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { data: curMedia } = useMediaData({ marca: marcaFetch, dataInicio: range.start, dataFim: range.end })

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes }),
    [origem, marcasParaEscopo, fontes, subFontes],
  )
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )

  // União exata: soma só mídia dos dias que caem de fato num período
  // selecionado, e só das marcas selecionadas (quando a busca trouxe mais de uma).
  const invest = useMemo(
    () => curMedia.reduce((s, r) => s + (
      ranges.some(rg => r.dia >= rg.start && r.dia <= rg.end) && marcasParaEscopo.includes(r.marca)
        ? r.spend_brl : 0
    ), 0),
    [curMedia, ranges, marcasParaEscopo],
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
