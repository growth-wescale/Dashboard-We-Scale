/**
 * Estado de filtros compartilhado pelas abas de Vendas.
 *
 * Existe para que Funil, Performance e Análise de Perda falem sempre do mesmo
 * recorte: trocar de aba não deve trocar o período nem a marca sob os pés do
 * usuário. Tudo é persistido em localStorage e validado na leitura — valor
 * salvo por uma versão antiga do app não pode derrubar a página.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isoDate } from '@/lib/dateUtils'
import { DEFAULT_VIEW_MODES } from '@/lib/metrics'
import type { EventSource, FunnelView, SalesMode, ViewModes } from '@/lib/metrics'

export type PeriodMode = 'dia' | 'mes' | 'trimestre' | 'ano' | 'custom'
export interface DateRange { start: string; end: string }

const PREFIX = 'wescale.vendas.'

/* ── Persistência ─────────────────────────────────────────────────────────── */

function read<T>(key: string, isValid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    return isValid(parsed) ? parsed : fallback
  } catch {
    // localStorage bloqueado ou JSON corrompido: seguir com o padrão.
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Modo privativo ou cota estourada: persistir é opcional, não quebra a tela.
  }
}

/** useState que espelha em localStorage. */
function usePersisted<T>(key: string, isValid: (v: unknown) => v is T, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, isValid, fallback))
  const set = useCallback(
    (next: T) => {
      setValue(next)
      write(key, next)
    },
    [key],
  )
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

/* ── Presets de período ───────────────────────────────────────────────────── */

/** Range de um preset, sempre terminando hoje (não faz sentido projetar futuro). */
export function rangeForMode(mode: Exclude<PeriodMode, 'custom'>, hoje = new Date()): DateRange {
  const end = isoDate(hoje)
  const y = hoje.getFullYear()

  switch (mode) {
    case 'dia':
      return { start: end, end }
    case 'mes':
      return { start: isoDate(new Date(y, hoje.getMonth(), 1)), end }
    case 'trimestre': {
      const primeiroMesDoTri = Math.floor(hoje.getMonth() / 3) * 3
      return { start: isoDate(new Date(y, primeiroMesDoTri, 1)), end }
    }
    case 'ano':
      return { start: isoDate(new Date(y, 0, 1)), end }
  }
}

export const PERIOD_LABEL: Record<PeriodMode, string> = {
  dia: 'Hoje',
  mes: 'Mês',
  trimestre: 'Trimestre',
  ano: 'Ano',
  custom: 'Personalizado',
}

/* ── Contexto ─────────────────────────────────────────────────────────────── */

interface SharedFilters {
  brandKey: string
  setBrandKey: (k: string) => void

  periodMode: PeriodMode
  /** Troca o preset e recalcula o range. Use setRange para datas manuais. */
  setPeriodMode: (m: PeriodMode) => void
  range: DateRange
  setRange: (r: DateRange) => void

  /** Valores de fonte_macro. Vazio = todas. */
  fontes: string[]
  setFontes: (f: string[]) => void
  /** Grupos normalizados de utm_source. Vazio = todos. */
  subFontes: string[]
  setSubFontes: (f: string[]) => void

  viewModes: ViewModes
  setSalesMode: (m: SalesMode) => void
  setFunnelView: (v: FunnelView) => void
  setEventSource: (s: EventSource) => void

  resetFiltros: () => void
}

const Ctx = createContext<SharedFilters | null>(null)

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const [brandKey, setBrandKey] = usePersisted('brandKey', isString, 'overview')
  const [periodMode, setPeriodModeRaw] = usePersisted<PeriodMode>(
    'periodMode',
    oneOf(['dia', 'mes', 'trimestre', 'ano', 'custom'] as const),
    'mes',
  )
  const [range, setRangeRaw] = usePersisted<DateRange>('range', isRange, rangeForMode('mes'))
  const [fontes, setFontes] = usePersisted('fontes', isStringArray, [])
  const [subFontes, setSubFontes] = usePersisted('subFontes', isStringArray, [])

  const [salesMode, setSalesModeRaw] = usePersisted<SalesMode>(
    'salesMode', oneOf(['deals', 'units'] as const), DEFAULT_VIEW_MODES.salesMode,
  )
  const [funnelView, setFunnelViewRaw] = usePersisted<FunnelView>(
    'funnelView', oneOf(['stageDate', 'cohort'] as const), DEFAULT_VIEW_MODES.funnelView,
  )
  const [eventSource, setEventSourceRaw] = usePersisted<EventSource>(
    'eventSource', oneOf(['unique', 'passages'] as const), DEFAULT_VIEW_MODES.eventSource,
  )

  const setPeriodMode = useCallback((m: PeriodMode) => {
    setPeriodModeRaw(m)
    if (m !== 'custom') setRangeRaw(rangeForMode(m))
  }, [setPeriodModeRaw, setRangeRaw])

  // Mexer nas datas na mão implica sair do preset.
  const setRange = useCallback((r: DateRange) => {
    setRangeRaw(r)
    setPeriodModeRaw('custom')
  }, [setRangeRaw, setPeriodModeRaw])

  const resetFiltros = useCallback(() => {
    setBrandKey('overview')
    setPeriodModeRaw('mes')
    setRangeRaw(rangeForMode('mes'))
    setFontes([])
    setSubFontes([])
  }, [setBrandKey, setPeriodModeRaw, setRangeRaw, setFontes, setSubFontes])

  const value = useMemo<SharedFilters>(() => ({
    brandKey, setBrandKey,
    periodMode, setPeriodMode,
    range, setRange,
    fontes, setFontes,
    subFontes, setSubFontes,
    viewModes: { salesMode, funnelView, eventSource },
    setSalesMode: setSalesModeRaw,
    setFunnelView: setFunnelViewRaw,
    setEventSource: setEventSourceRaw,
    resetFiltros,
  }), [
    brandKey, setBrandKey, periodMode, setPeriodMode, range, setRange,
    fontes, setFontes, subFontes, setSubFontes,
    salesMode, funnelView, eventSource,
    setSalesModeRaw, setFunnelViewRaw, setEventSourceRaw, resetFiltros,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSharedFilters(): SharedFilters {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSharedFilters precisa estar dentro de <SharedFiltersProvider>')
  return ctx
}
