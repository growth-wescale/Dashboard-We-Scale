import type { Marca } from '@/lib/types'

// ── Período ───────────────────────────────────────────────────────────────
export const COPA_DATA_INICIO = '2026-07-01'
export const COPA_DIAS_MES    = 31
export const COPA_MES_LABEL   = 'Julho 2026'

// ── 1. CUSTO — CP-MQL baseline (Jan–Jun/26) e meta (–15%) ────────────────
export const COPA_CUSTO: Record<Marca, { baseline: number; meta: number }> = {
  'Lisô Laser':   { baseline: 411.99, meta: 350.19 },
  'Oral Unic':    { baseline: 467.08, meta: 397.02 },
  'Odonto Scale': { baseline:   0,    meta:   0    },
  'Inpot':        { baseline: 102.90, meta:  87.47 },
  'B2Case':       { baseline:  49.30, meta:  41.90 },
  'Eletrovias':   { baseline:  20.06, meta:  17.05 },
  'Viva':         { baseline: 198.21, meta: 168.48 },
}

// ── 2. QUALIDADE — taxa MQL→SQL baseline (maio 2026) ─────────────────────
// SQL: deals com etapa_atual LIKE '%SQL%' criados em mai/26 (independente de won/lost)
// MQL: leads com lead_type='MQL' em mai/26 (tabela leads, deduplicado)
// B2Case=0/140 | Eletrovias=4/489 | Inpot=3/120 | Lisô=0/16 | Oral=1/44 | Viva=0/29
export const COPA_SQL_TAXA_BASELINE: Record<Marca, number> = {
  'B2Case':       0.0,
  'Eletrovias':   0.8,
  'Inpot':        2.5,
  'Lisô Laser':   0.0,
  'Odonto Scale': 0.0,
  'Oral Unic':    2.3,
  'Viva':         0.0,
}

// ── 3. VOLUME — meta MQL Jul/26 (só 3 marcas) ───────────────────────────
export const COPA_VOLUME_MARCAS: Marca[] = ['Lisô Laser', 'Viva', 'Oral Unic']

export const COPA_VOLUME_META: Partial<Record<Marca, number>> = {
  'Lisô Laser': 25,
  'Viva':       35,
  'Oral Unic':  65,
}

// Leads por mês Jan–Jun/26 (tabela leads — proxy de tendência para MQL)
export const COPA_LEADS_TREND: Partial<Record<Marca, [string, number][]>> = {
  'Lisô Laser': [['Jan', 217], ['Fev', 63], ['Mar', 85], ['Abr', 146], ['Mai', 72], ['Jun', 45]],
  'Oral Unic':  [['Jan', 124], ['Fev', 301], ['Mar', 162], ['Abr', 151], ['Mai', 144], ['Jun', 106]],
  'Viva':       [['Mar', 31], ['Abr', 148], ['Mai', 80], ['Jun', 62]],
}

// ── 4. INVESTIMENTO — budget Jul/26 por marca e canal ───────────────────
export const COPA_BUDGET: Record<Marca, { google: number; meta: number }> = {
  'B2Case':       { google: 5000,  meta: 10000 },
  'Eletrovias':   { google: 5000,  meta: 3200  },
  'Inpot':        { google: 8000,  meta: 15000 },
  'Lisô Laser':   { google: 8000,  meta: 12000 },
  'Odonto Scale': { google: 0,     meta: 0     },
  'Oral Unic':    { google: 15000, meta: 30000 },
  'Viva':         { google: 6000,  meta: 4000  },
}
