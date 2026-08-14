/**
 * Estado de filtros compartilhado pelas abas de Vendas.
 *
 * Existe para que Funil, Performance e Análise de Perda falem sempre do mesmo
 * recorte: trocar de aba não deve trocar o período nem a marca sob os pés do
 * usuário. Tudo é persistido em localStorage e validado na leitura — valor
 * salvo por uma versão antiga do app não pode derrubar a página.
 *
 * O período tem duas partes: a granularidade (`periodMode`) e qual período
 * daquela granularidade (`periodValue`). No modo 'dia' não há `periodValue` —
 * o usuário escolhe as datas livremente no calendário.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_VIEW_MODES } from '@/lib/metrics'
import type { EventSource, FunnelView, SalesMode, ViewModes } from '@/lib/metrics'
import { periodoAtual, rangeForPeriod } from '@/lib/periodo'
import type { DateRange, PeriodMode } from '@/lib/periodo'

export type { DateRange, PeriodMode } from '@/lib/periodo'

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
  brandKey: string
  setBrandKey: (k: string) => void

  /** Granularidade do período. */
  periodMode: PeriodMode
  setPeriodMode: (m: PeriodMode) => void
  /** Qual período: '2026-08', '2026-Q3', '2026'. Vazio no modo 'dia'. */
  periodValue: string
  setPeriodValue: (v: string) => void
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

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const [brandKey, setBrandKey] = usePersisted('brandKey', isString, 'overview')

  const [periodMode, setPeriodModeRaw] = usePersisted<PeriodMode>(
    'periodMode', oneOf(['dia', 'mes', 'trimestre', 'ano'] as const), MODE_PADRAO,
  )
  const [periodValue, setPeriodValueRaw] = usePersisted(
    'periodValue', isString, periodoAtual(MODE_PADRAO),
  )
  // Só usado no modo 'dia'; nos demais o range vem de periodMode + periodValue.
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

  const range = useMemo<DateRange>(
    () => (periodMode === 'dia' ? rangeDia : rangeForPeriod(periodMode, periodValue)),
    [periodMode, periodValue, rangeDia],
  )

  /** Trocar de granularidade seleciona o período corrente dela. */
  const setPeriodMode = useCallback((m: PeriodMode) => {
    setPeriodModeRaw(m)
    if (m !== 'dia') setPeriodValueRaw(periodoAtual(m))
  }, [setPeriodModeRaw, setPeriodValueRaw])

  const resetFiltros = useCallback(() => {
    setBrandKey('overview')
    setPeriodModeRaw(MODE_PADRAO)
    setPeriodValueRaw(periodoAtual(MODE_PADRAO))
    setFontes([])
    setSubFontes([])
  }, [setBrandKey, setPeriodModeRaw, setPeriodValueRaw, setFontes, setSubFontes])

  const value = useMemo<SharedFilters>(() => ({
    brandKey, setBrandKey,
    periodMode, setPeriodMode,
    periodValue, setPeriodValue: setPeriodValueRaw,
    range, setRange: setRangeDia,
    fontes, setFontes,
    subFontes, setSubFontes,
    viewModes: { salesMode, funnelView, eventSource },
    setSalesMode, setFunnelView, setEventSource,
    resetFiltros,
  }), [
    brandKey, setBrandKey, periodMode, setPeriodMode, periodValue, setPeriodValueRaw,
    range, setRangeDia, fontes, setFontes, subFontes, setSubFontes,
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
