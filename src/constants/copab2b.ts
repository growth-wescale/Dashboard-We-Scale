import type { Marca } from '@/lib/types'

// ── Período ───────────────────────────────────────────────────────────────
export const COPA_DATA_INICIO = '2026-07-01'
export const COPA_DIAS_MES    = 31
export const COPA_MES_LABEL   = 'Julho 2026'

// ── 1. CUSTO — CP-MQL baseline (Jan–Jun/26) e meta (–15%) ────────────────
export const COPA_CUSTO: Record<Marca, { baseline: number; meta: number }> = {
  'Lisô Laser': { baseline: 411.99, meta: 350.19 },
  'Oral Unic':  { baseline: 467.08, meta: 397.02 },
  'Inpot':      { baseline: 102.90, meta:  87.47 },
  'B2Case':     { baseline:  49.30, meta:  41.90 },
  'Eletrovias': { baseline:  20.06, meta:  17.05 },
  'Viva':       { baseline: 198.21, meta: 168.48 },
}

// ── 2. QUALIDADE — baseline % qualificado (Jan–Jun/26, whitelist histórica) ──
export const COPA_QUALIDADE_BASELINE: Record<Marca, number> = {
  'B2Case':     27.0,
  'Eletrovias': 58.6,
  'Inpot':      33.9,
  'Lisô Laser': 22.9,
  'Oral Unic':  41.4,
  'Viva':       33.6,
}

// Labels exatos de capital_declarado que contam como qualificado em Jul/26+
// Verificados caractere a caractere contra os valores do banco
export const COPA_CAPITAL_QUALIFICADO: Record<Marca, string[]> = {
  'B2Case': [
    'R$ 60.000 – R$ 100.000',
    'Entre R$ 60.000 e R$ 100.000',
    'Até R$ 100.000,00',              // qualificado a partir de Jul/26
    'R$ 100.000 – R$ 200.000',
    'Entre R$ 100.000,00 e R$ 200.000,00',
    'Acima de R$ 200.000',
    'Acima de R$ 200.000,00',
    'acima_200k',
  ],
  'Eletrovias': [
    'De R$ 50 mil a R$ 100 mil',
    '50k_100k',
    'De R$ 100 mil a R$ 150 mil',
    'De R$ 150 mil a R$ 200 mil',
    'Acima de R$ 200 mil',
  ],
  'Inpot': [
    'Entre R$ 200.000 e R$ 300.000',
    'Entre R$ 300.000 e R$ 400.000',
    'Acima de R$ 400.000',
  ],
  'Lisô Laser': [
    'Entre R$ 200.000 e R$ 300.000',
    'Entre R$ 200.000,00 e R$ 300.000,00',
    'Entre R$ 300.000 e R$ 400.000',
    'Entre R$ 300.000,00 e R$ 400.000,00',
    'Acima de R$ 400.000',
    'Acima de R$ 400.000,00',
  ],
  'Oral Unic': [
    'Entre R$ 200.000 e R$ 300.000',
    'Entre R$ 300.000 e R$ 500.000',
    'Acima de R$ 500.000',
  ],
  'Viva': [
    'de 600 a 700',
    '700 a 900',
    'mais de 900k',
  ],
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
  'B2Case':     { google: 5000,  meta: 10000 },
  'Eletrovias': { google: 5000,  meta: 3200  },
  'Inpot':      { google: 8000,  meta: 15000 },
  'Lisô Laser': { google: 8000,  meta: 12000 },
  'Oral Unic':  { google: 15000, meta: 30000 },
  'Viva':       { google: 6000,  meta: 4000  },
}
