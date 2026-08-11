import type { Marca } from '@/lib/types'

// ── Tipos ────────────────────────────────────────────────────────────────
export interface CopaMesConfig {
  key: string
  label: string
  dataInicio: string
  dataFim: string
  diasMes: number
  fechado: boolean
  custo: Record<Marca, { baseline: number; meta: number }>
  sqlBaseline: Record<Marca, number>
  volumeMarcas: Marca[]
  volumeMeta: Partial<Record<Marca, number>>
  leadsTrend: Partial<Record<Marca, [string, number][]>>
  budget: Record<Marca, { google: number; meta: number }>
  budgetSplit: boolean
}

// ── Baselines fixos (histórico) ───────────────────────────────────────────
// Taxa MQL→SQL baseline maio/26 (SQLs oficiais do CRM ÷ MQLs dedup da tabela leads)
// B2Case  16/135 = 11,9% | Eletrovias 39/274 = 14,2% | Inpot 14/116 = 12,1%
// Lisô     2/15  = 13,3% | Oral Unic   3/38  =  7,9% | Viva   3/29  = 10,3%
const SQL_BASELINE_MAIO: Record<Marca, number> = {
  'B2Case':       11.9,
  'Eletrovias':   14.2,
  'Inpot':        12.1,
  'Lisô Laser':   13.3,
  'Odonto Scale':  0.0,
  'Oral Unic':     7.9,
  'Viva':         10.3,
}

// Leads por mês Jan–Jun/26 (proxy de tendência)
const LEADS_TREND_JUN: Partial<Record<Marca, [string, number][]>> = {
  'Lisô Laser': [['Jan', 217], ['Fev', 63], ['Mar', 85], ['Abr', 146], ['Mai', 72], ['Jun', 45]],
  'Oral Unic':  [['Jan', 124], ['Fev', 301], ['Mar', 162], ['Abr', 151], ['Mai', 144], ['Jun', 106]],
  'Viva':       [['Mar', 31], ['Abr', 148], ['Mai', 80], ['Jun', 62]],
}

// ── Cálculo padrão (Jul e Ago usam o mesmo baseline maio/26) ─────────────
// CP-MQL maio/26 (aplicando novo critério Eletrovias ≥ 100k):
//   B2Case 65.47 | Eletro 30.79 | Inpot 155.73 | Lisô 763.93 | OS 364.62 | Oral 738.29 | Viva 223.81
// Meta = baseline × 0,85 (redução 15%)
const CUSTO_BASELINE_MAIO: Record<Marca, { baseline: number; meta: number }> = {
  'B2Case':       { baseline:  65.47, meta:  55.65 },
  'Eletrovias':   { baseline:  30.79, meta:  26.17 },
  'Inpot':        { baseline: 155.73, meta: 132.37 },
  'Lisô Laser':   { baseline: 763.93, meta: 649.34 },
  'Odonto Scale': { baseline: 364.62, meta: 309.93 },
  'Oral Unic':    { baseline: 738.29, meta: 627.55 },
  'Viva':         { baseline: 223.81, meta: 190.24 },
}

// Budget mensal por marca (Google + Meta Ads)
// Formato agosto: total unificado (budgetSplit=false); split G/M só no realizado
const BUDGET_MENSAL: Record<Marca, { google: number; meta: number }> = {
  'B2Case':       { google: 5000,  meta: 10000 },
  'Eletrovias':   { google: 5000,  meta: 3200  },
  'Inpot':        { google: 8000,  meta: 15000 },
  'Lisô Laser':   { google: 8000,  meta: 12000 },
  'Odonto Scale': { google: 0,     meta: 0     },
  'Oral Unic':    { google: 15000, meta: 30000 },
  'Viva':         { google: 6000,  meta: 4000  },
}

// Meta volume MQL (Meta Copa doc — pisos com leve crescimento sobre maio/26)
const VOLUME_META_MAIO: Partial<Record<Marca, number>> = {
  'Lisô Laser': 25,
  'Viva':       35,
  'Oral Unic':  65,
}

// ── Configuração Julho/26 (fechado) ──────────────────────────────────────
const JUL_26: CopaMesConfig = {
  key: '2026-07',
  label: 'Julho 2026',
  dataInicio: '2026-07-01',
  dataFim: '2026-07-31',
  diasMes: 31,
  fechado: true,
  custo: CUSTO_BASELINE_MAIO,
  sqlBaseline: SQL_BASELINE_MAIO,
  volumeMarcas: ['Lisô Laser', 'Viva', 'Oral Unic'],
  volumeMeta: VOLUME_META_MAIO,
  leadsTrend: LEADS_TREND_JUN,
  budget: BUDGET_MENSAL,
  budgetSplit: false,
}

// ── Configuração Agosto/26 (MTD) ─────────────────────────────────────────
const AGO_26: CopaMesConfig = {
  key: '2026-08',
  label: 'Agosto 2026',
  dataInicio: '2026-08-01',
  dataFim: '2026-08-31',
  diasMes: 31,
  fechado: false,
  custo: CUSTO_BASELINE_MAIO,
  sqlBaseline: SQL_BASELINE_MAIO,
  volumeMarcas: ['Lisô Laser', 'Viva', 'Oral Unic'],
  volumeMeta: VOLUME_META_MAIO,
  leadsTrend: LEADS_TREND_JUN,
  budget: BUDGET_MENSAL,
  budgetSplit: false,
}

// ── Exports públicos ──────────────────────────────────────────────────────
export const COPA_MESES: Record<string, CopaMesConfig> = {
  '2026-07': JUL_26,
  '2026-08': AGO_26,
}

export const COPA_MESES_ORDENADOS: CopaMesConfig[] = [AGO_26, JUL_26]

export function getMesCorrente(now: Date = new Date()): CopaMesConfig {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const key = `${y}-${m}`
  return COPA_MESES[key] ?? AGO_26
}
