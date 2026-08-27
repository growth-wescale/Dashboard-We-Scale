/**
 * Estado de filtros compartilhado pelas abas de Vendas.
 *
 * Existe para que Funil, Performance e Análise de Perda falem sempre do mesmo
 * recorte: trocar de aba não deve trocar o período nem a marca sob os pés do
 * usuário. Tudo é persistido em localStorage e validado na leitura — valor
 * salvo por uma versão antiga do app não pode derrubar a página.
 *
 * O período tem duas partes: a granularidade (`periodMode`) e quais períodos
 * daquela granularidade (`periodValues` — multi-seleção, como filtro de
 * Excel). No modo 'dia' não há `periodValues` — o usuário escolhe as datas
 * livremente no calendário.
 *
 * Com 2+ períodos selecionados, `ranges` é a UNIÃO exata deles (cada um já
 * truncado em "hoje" individualmente se estiver em curso) — não o intervalo
 * contínuo entre o primeiro e o último. `range` continua existindo como a
 * caixa delimitadora (menor início, maior fim) só para exibição e para
 * consultas de servidor que precisam de um único intervalo (ex.: mídia).
 *
 * `origem` separa os dois motores comerciais — Inbound e Prospecção Ativa.
 * Não é multi-seleção nem tem estado "Todos": as três abas de Vendas mostram
 * sempre um lado só, por decisão de negócio.
 *
 * Marca segue o mesmo molde: `brandKeys` é multi-seleção (nunca vazio).
 * Todas as marcas reais marcadas ao mesmo tempo é visualmente equivalente a
 * "Consolidado" — não existe um valor sentinela separado pra isso.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_VIEW_MODES } from '@/lib/metrics'
import type { EventSource, FunnelView, SalesMode, ViewModes } from '@/lib/metrics'
import { periodoAtual, rangeForPeriod } from '@/lib/periodo'
import type { DateRange, PeriodMode } from '@/lib/periodo'
import { BRAND_LIST } from '@/constants/brands'
import { ORIGENS } from '@/lib/funnelTypes'
import type { OrigemComercial } from '@/lib/funnelTypes'

export type { DateRange, PeriodMode } from '@/lib/periodo'
export type { OrigemComercial } from '@/lib/funnelTypes'

const PREFIX = 'wescale.vendas.'

/* ── Persistência ─────────────────────────────────────────────────────────── */

function read<T>(key: string, isValid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    return isValid(parsed) ? parsed : fallback
  } catch {
    return fallback // localStorage bloqueado ou JSON corrompido
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Modo privativo ou cota estourada: persistir é opcional.
  }
}

function usePersisted<T>(key: string, isValid: (v: unknown) => v is T, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, isValid, fallback))
  const set = useCallback((next: T) => { setValue(next); write(key, next) }, [key])
  return [value, set] as const
}

const isString = (v: unknown): v is string => typeof v === 'string'
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string')
const isNonEmptyStringArray = (v: unknown): v is string[] => isStringArray(v) && v.length > 0
const oneOf = <T extends string>(allowed: readonly T[]) =>
  (v: unknown): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v)
const isRange = (v: unknown): v is DateRange =>
  typeof v === 'object' && v !== null &&
  isString((v as DateRange).start) && isString((v as DateRange).end)

export const PERIOD_LABEL: Record<PeriodMode, string> = {
  dia: 'Dia',
  mes: 'Mês',
  trimestre: 'Trimestre',
  ano: 'Ano',
}

/* ── Contexto ─────────────────────────────────────────────────────────────── */

interface SharedFilters {
  /** Motor comercial em foco. Nunca nulo — não existe visão consolidada. */
  origem: OrigemComercial
  setOrigem: (o: OrigemComercial) => void

  /** Marcas selecionadas (chaves de BRAND_LIST). Todas selecionadas == Consolidado. Nunca vazio. */
  brandKeys: string[]
  setBrandKeys: (k: string[]) => void

  /** Granularidade do período. */
  periodMode: PeriodMode
  setPeriodMode: (m: PeriodMode) => void
  /** Períodos selecionados: ['2026-08'], ou vários ['2026-06','2026-08']. Vazio no modo 'dia'. */
  periodValues: string[]
  setPeriodValues: (v: string[]) => void
  /** União exata dos ranges dos períodos selecionados (1 elemento fora do modo 'dia' quando só 1 selecionado). */
  ranges: DateRange[]
  /** Caixa delimitadora de `ranges` — só para exibição/consultas de intervalo único, nunca para filtrar linhas. */
  range: DateRange
  /** Só no modo 'dia': datas escolhidas à mão. */
  setRange: (r: DateRange) => void

  fontes: string[]
  setFontes: (f: string[]) => void
  subFontes: string[]
  setSubFontes: (f: string[]) => void

  viewModes: ViewModes
  setSalesMode: (m: SalesMode) => void
  setFunnelView: (v: FunnelView) => void
  setEventSource: (s: EventSource) => void

  resetFiltros: () => void
}

const Ctx = createContext<SharedFilters | null>(null)

// Exclui 'dia' de propósito: o padrão precisa ter um período nomeado
// (periodoAtual não sabe responder "qual dia"), e mês é o recorte do time.
const MODE_PADRAO: Exclude<PeriodMode, 'dia'> = 'mes'

// Todas as marcas reais selecionadas de saída == Consolidado.
const TODAS_MARCAS = BRAND_LIST.map(b => b.key)

// Inbound é o motor que sustenta a receita (a Prospecção Ativa não tem venda
// nenhuma na base), então é o padrão de quem abre o dashboard.
const ORIGEM_PADRAO: OrigemComercial = 'Inbound'

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const [origem, setOrigem] = usePersisted<OrigemComercial>('origem', oneOf(ORIGENS), ORIGEM_PADRAO)

  const [brandKeys, setBrandKeys] = usePersisted('brandKeys', isNonEmptyStringArray, TODAS_MARCAS)

  const [periodMode, setPeriodModeRaw] = usePersisted<PeriodMode>(
    'periodMode', oneOf(['dia', 'mes', 'trimestre', 'ano'] as const), MODE_PADRAO,
  )
  const [periodValues, setPeriodValuesRaw] = usePersisted(
    'periodValues', isNonEmptyStringArray, [periodoAtual(MODE_PADRAO)],
  )
  // Só usado no modo 'dia'; nos demais o range vem de periodMode + periodValues.
  const [rangeDia, setRangeDia] = usePersisted<DateRange>(
    'rangeDia', isRange, rangeForPeriod('mes', periodoAtual('mes')),
  )

  const [fontes, setFontes] = usePersisted('fontes', isStringArray, [])
  const [subFontes, setSubFontes] = usePersisted('subFontes', isStringArray, [])

  const [salesMode, setSalesMode] = usePersisted<SalesMode>(
    'salesMode', oneOf(['deals', 'units'] as const), DEFAULT_VIEW_MODES.salesMode,
  )
  const [funnelView, setFunnelView] = usePersisted<FunnelView>(
    'funnelView', oneOf(['stageDate', 'cohort'] as const), DEFAULT_VIEW_MODES.funnelView,
  )
  const [eventSource, setEventSource] = usePersisted<EventSource>(
    'eventSource', oneOf(['unique', 'passages'] as const), DEFAULT_VIEW_MODES.eventSource,
  )

  const ranges = useMemo<DateRange[]>(() => {
    if (periodMode === 'dia') return [rangeDia]
    return periodValues.map(v => rangeForPeriod(periodMode, v))
  }, [periodMode, periodValues, rangeDia])

  // Caixa delimitadora: só para textos e para consultas de servidor que
  // precisam de um único intervalo (ex.: mídia). Nunca usar para filtrar
  // linhas — isso é o papel de `ranges`, que preserva a união exata.
  const range = useMemo<DateRange>(() => {
    let { start, end } = ranges[0]
    for (const r of ranges) {
      if (r.start < start) start = r.start
      if (r.end > end) end = r.end
    }
    return { start, end }
  }, [ranges])

  /** Trocar de granularidade seleciona o período corrente dela. */
  const setPeriodMode = useCallback((m: PeriodMode) => {
    setPeriodModeRaw(m)
    if (m !== 'dia') setPeriodValuesRaw([periodoAtual(m)])
  }, [setPeriodModeRaw, setPeriodValuesRaw])

  const resetFiltros = useCallback(() => {
    setOrigem(ORIGEM_PADRAO)
    setBrandKeys(TODAS_MARCAS)
    setPeriodModeRaw(MODE_PADRAO)
    setPeriodValuesRaw([periodoAtual(MODE_PADRAO)])
    setFontes([])
    setSubFontes([])
  }, [setOrigem, setBrandKeys, setPeriodModeRaw, setPeriodValuesRaw, setFontes, setSubFontes])

  const value = useMemo<SharedFilters>(() => ({
    origem, setOrigem,
    brandKeys, setBrandKeys,
    periodMode, setPeriodMode,
    periodValues, setPeriodValues: setPeriodValuesRaw,
    ranges, range, setRange: setRangeDia,
    fontes, setFontes,
    subFontes, setSubFontes,
    viewModes: { salesMode, funnelView, eventSource },
    setSalesMode, setFunnelView, setEventSource,
    resetFiltros,
  }), [
    origem, setOrigem, brandKeys, setBrandKeys, periodMode, setPeriodMode, periodValues, setPeriodValuesRaw,
    ranges, range, setRangeDia, fontes, setFontes, subFontes, setSubFontes,
    salesMode, funnelView, eventSource, setSalesMode, setFunnelView, setEventSource,
    resetFiltros,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSharedFilters(): SharedFilters {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSharedFilters precisa estar dentro de <SharedFiltersProvider>')
  return ctx
}
