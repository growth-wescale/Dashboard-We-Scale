import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow } from '@/lib/metrics'
import { STAGE_DATE_FIELD, STAGE_ORDER, isInWindow } from '@/lib/metrics'
import { normalizeFonteMacro, normalizeSubFonte } from '@/lib/fonteMapping'

export interface FunilFilterOptionsInput {
  rows: FunnelRow[]
  win: PeriodWindow
  marcasParaEscopo: string[]
  fontes: string[]
  subFontes: string[]
  sdrs: string[]
  closers: string[]
  /** true no modo "Deals criados no período" (safra) — só o MQL conta como "na janela". */
  cohort: boolean
}

export interface FunilFilterOptions {
  marcas: string[]
  fontes: string[]
  subFontes: string[]
  sdrs: string[]
  closers: string[]
}

/**
 * Opções "estilo Excel" dos filtros de Marca, Fonte, Sub-fonte, SDR e Closer:
 * cada lista reflete os DEMAIS filtros já ativos + a janela de período, menos
 * o próprio filtro. "Deal na janela" = tem alguma data de etapa dentro de
 * `win` (ou só o MQL, no modo safra) — a mesma regra que popula o funil.
 * Compartilhado entre Visão Macro e Performance.
 */
export function funilFilterOptions(input: FunilFilterOptionsInput): FunilFilterOptions {
  const { rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, cohort } = input
  const camposJanela = cohort
    ? (['data_novo_mql'] as const)
    : STAGE_ORDER.map(s => STAGE_DATE_FIELD[s])

  const subFonteDe = (r: FunnelRow) => normalizeSubFonte(r.utm_source, r.sub_fonte_crm)
  const fonteDe = (r: FunnelRow) => normalizeFonteMacro(r.fonte_macro)
  const naJanela = rows.filter(r => camposJanela.some(c => isInWindow(r[c] as string | null, win)))
  const okMarca = (r: FunnelRow) => !marcasParaEscopo.length || marcasParaEscopo.includes(r.marca ?? '')
  const okFonte = (r: FunnelRow) => !fontes.length || fontes.includes(fonteDe(r))
  const okSub = (r: FunnelRow) => !subFontes.length || subFontes.includes(subFonteDe(r))
  const okSdr = (r: FunnelRow) => !sdrs.length || sdrs.includes(r.nome_sdr ?? '')
  const okCloser = (r: FunnelRow) => !closers.length || closers.includes(r.nome_closer ?? '')
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

  return {
    marcas: uniq(naJanela.filter(r => okFonte(r) && okSub(r) && okSdr(r) && okCloser(r)).map(r => r.marca ?? '')),
    fontes: uniq(naJanela.filter(r => okMarca(r) && okSub(r) && okSdr(r) && okCloser(r)).map(fonteDe)),
    subFontes: uniq(naJanela.filter(r => okMarca(r) && okFonte(r) && okSdr(r) && okCloser(r)).map(subFonteDe)),
    sdrs: uniq(naJanela.filter(r => okMarca(r) && okFonte(r) && okSub(r) && okCloser(r)).map(r => r.nome_sdr ?? '')),
    closers: uniq(naJanela.filter(r => okMarca(r) && okFonte(r) && okSub(r) && okSdr(r)).map(r => r.nome_closer ?? '')),
  }
}
