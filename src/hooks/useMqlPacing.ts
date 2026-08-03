import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead, BaselineFunil } from '@/lib/types'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayCount { day: number; count: number }

export interface PacingData {
  marca: string
  ancora: string           // 'Venda', 'Oportunidade', 'COF Assinada', 'SAL', 'R1 realizada', 'SQL'
  ancoraEtapa: string
  mqlPorUnidade: number    // MQL por unidade da âncora (ratio histórico)
  targetUnits: number      // meta de unidades da âncora (ex: 3 vendas/mês)
  monthlyTarget: number    // targetUnits × mqlPorUnidade → MQLs necessários no mês
  dailyTarget: number      // monthlyTarget / daysInMonth
  mtdMqls: number
  avgPerDay: number
  pctVsExpected: number
  projected: number        // avgPerDay × daysInMonth → MQLs projetados
  projectedAncora: number  // projected / mqlPorUnidade → unidades âncora projetadas
  necessarioDia: number    // (monthlyTarget - mtdMqls) / daysRemaining
  daysElapsed: number
  daysInMonth: number
  daysRemaining: number
  hasBaseline: boolean
  hasTarget: boolean       // usuário definiu uma meta de unidades
  dailyMqls: DayCount[]
}

// ── Priority: deepest funnel stage wins ───────────────────────────────────────
const ANCORA_PRIORITY: { etapa: string; label: string }[] = [
  { etapa: 'Vendas',        label: 'Venda' },
  { etapa: 'COF Assinada',  label: 'COF Assinada' },
  { etapa: 'Oportunidades', label: 'Oportunidade' },
  { etapa: 'SAL',           label: 'SAL' },
  { etapa: 'R1 realizada',  label: 'R1 realizada' },
  { etapa: 'SQL',           label: 'SQL' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function computePacing(
  marca: string,
  baseline: BaselineFunil[],
  allLeads: Lead[],
  targetUnits: number,   // meta de unidades da âncora (0 = sem meta definida)
  today: Date,
): PacingData {
  const brandBaseline = baseline.filter(b => b.marca === marca)
  const totalMql = brandBaseline.find(b => b.etapa === 'MQL')?.total ?? 0

  // encontra âncora mais profunda com histórico
  let ancora = ''
  let ancoraEtapa = ''
  let ancoraTotal = 0
  for (const { etapa, label } of ANCORA_PRIORITY) {
    const row = brandBaseline.find(b => b.etapa === etapa)
    if (row && row.total > 0) {
      ancora = label
      ancoraEtapa = etapa
      ancoraTotal = row.total
      break
    }
  }

  const hasBaseline = ancoraTotal > 0 && totalMql > 0
  const hasTarget = targetUnits > 0
  const mqlPorUnidade = hasBaseline ? totalMql / ancoraTotal : 0

  const year = today.getFullYear()
  const month = today.getMonth()
  const dim = daysInMonth(year, month)
  const elapsed = Math.min(today.getDate(), dim)
  const remaining = dim - elapsed

  // MTD leads para esta marca
  const brandLeads = allLeads.filter(l => l.marca === marca)
  const mqls = deduplicateLeads(brandLeads.filter(isLeadMql))
  const mtdMqls = mqls.length

  // breakdown diário (deduplicado — igual aos KPI tiles)
  const dayMap = new Map<number, number>()
  mqls.forEach(l => {
    const d = new Date(l.dia).getUTCDate()
    dayMap.set(d, (dayMap.get(d) ?? 0) + 1)
  })
  const dailyMqls: DayCount[] = Array.from(dayMap.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day - b.day)

  const avgPerDay = elapsed > 0 ? mtdMqls / elapsed : 0
  const projected = Math.round(avgPerDay * dim)
  const projectedAncora = hasBaseline ? projected / mqlPorUnidade : 0

  if (!hasBaseline) {
    return {
      marca, ancora, ancoraEtapa, mqlPorUnidade: 0, targetUnits,
      monthlyTarget: 0, dailyTarget: 0,
      mtdMqls, avgPerDay,
      pctVsExpected: 0, projected, projectedAncora: 0, necessarioDia: 0,
      daysElapsed: elapsed, daysInMonth: dim, daysRemaining: remaining,
      hasBaseline: false, hasTarget, dailyMqls,
    }
  }

  const monthlyTarget = hasTarget ? Math.round(mqlPorUnidade * targetUnits) : 0
  const dailyTarget = hasTarget ? monthlyTarget / dim : 0
  const expected = dailyTarget * elapsed
  const pctVsExpected = expected > 0 ? (mtdMqls / expected) * 100 : 0
  const necessarioDia = hasTarget && remaining > 0
    ? Math.max(0, (monthlyTarget - mtdMqls) / remaining)
    : 0

  return {
    marca, ancora, ancoraEtapa, mqlPorUnidade, targetUnits,
    monthlyTarget,
    dailyTarget,
    mtdMqls, avgPerDay, pctVsExpected, projected, projectedAncora, necessarioDia,
    daysElapsed: elapsed, daysInMonth: dim, daysRemaining: remaining,
    hasBaseline: true, hasTarget, dailyMqls,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
const MARCAS_ATIVAS = ['Viva', 'Inpot', 'Lisô Laser', 'Oral Unic', 'Eletrovias', 'B2Case']
const LS_KEY = 'pacing_targets_v3'

function loadTargets(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveTargets(t: Record<string, number>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(t)) } catch {}
}

interface UsePacingResult {
  data: PacingData[]
  loading: boolean
  error: string | null
  setTarget: (marca: string, units: number) => void
}

export function useAllBrandsMqlPacing(): UsePacingResult {
  const [baseline, setBaseline] = useState<BaselineFunil[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targets, setTargets] = useState<Record<string, number>>(loadTargets)

  const setTarget = useCallback((marca: string, units: number) => {
    setTargets(prev => {
      const next = { ...prev, [marca]: units }
      saveTargets(next)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchData(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)

      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth()
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const monthEnd   = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`

      const baseRes = await supabase.from('baseline_funil').select('*')
      if (cancelled) return
      if (baseRes.error) { setError(baseRes.error.message); setLoading(false); return }

      // Paginate leads to avoid 1000-row default cap
      const allLeads: Lead[] = []
      let page = 0
      const PAGE_SIZE = 1000
      while (true) {
        const from = page * PAGE_SIZE
        const { data: rows, error: err } = await supabase
          .from('leads').select('*')
          .gte('dia', monthStart).lte('dia', monthEnd)
          .order('dia', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        allLeads.push(...((rows ?? []) as Lead[]))
        if (!rows || rows.length < PAGE_SIZE) break
        page++
      }

      setBaseline((baseRes.data ?? []) as BaselineFunil[])
      setLeads(allLeads)
      setLoading(false)
    }

    fetchData()

    const handleRefresh = () => { if (!cancelled) fetchData(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchData(false) }, 120000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [])

  const data = useMemo<PacingData[]>(() => {
    if (loading) return []
    const now = new Date()
    return MARCAS_ATIVAS.map(marca =>
      computePacing(marca, baseline, leads, targets[marca] ?? 0, now)
    )
  }, [baseline, leads, targets, loading])

  return { data, loading, error, setTarget }
}
