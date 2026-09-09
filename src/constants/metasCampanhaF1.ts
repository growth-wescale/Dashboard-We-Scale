import { toLocalDate } from '@/lib/dateUtils'

/**
 * Campanha de Metas F1 · Setembro/2026 — recortes por volta (semana).
 *
 * As 4 voltas cobrem o mês inteiro (dias 1–7, 8–14, 15–21, 22–30). O seletor
 * de voltas na página é multi-seleção: a janela ativa é a UNIÃO das voltas
 * marcadas (voltas não-contíguas mantêm o buraco de fora).
 *
 * Metas semanais:
 *  - Closer: a planilha "Metas 2026.xlsx" (aba Closer · bloco "FECHAMENTO POR
 *    SEMANA") dá a FORMA da distribuição semanal (não é uniforme). A magnitude
 *    continua sendo a meta mensal viva em `DB_Metas_Performance`. Meta da
 *    janela = meta mensal × soma das frações das voltas selecionadas — somando
 *    as 4 voltas dá exatamente a meta mensal.
 *  - SDR: a planilha só tem meta de ligações/semana, não de SQL/RR. Então a
 *    meta de SQL/RR do Grid dos SDRs é rateada pelos DIAS de cada volta
 *    (`fracaoDias`).
 */

export interface Janela {
  /** 'YYYY-MM-DD' (Brasília), inclusivo. */
  inicio: string
  /** 'YYYY-MM-DD' (Brasília), inclusivo. */
  fim: string
}

export interface VoltaDef extends Janela {
  num: number
  diaInicio: number
  diaFim: number
  label: string
  /** dias da volta ÷ dias do mês — usado no rateio da meta do SDR. */
  fracaoDias: number
}

export const VOLTAS_F1: readonly VoltaDef[] = [
  { num: 1, inicio: '2026-09-01', fim: '2026-09-07', diaInicio: 1, diaFim: 7, label: 'Volta 1 · 1–7 set', fracaoDias: 7 / 30 },
  { num: 2, inicio: '2026-09-08', fim: '2026-09-14', diaInicio: 8, diaFim: 14, label: 'Volta 2 · 8–14 set', fracaoDias: 7 / 30 },
  { num: 3, inicio: '2026-09-15', fim: '2026-09-21', diaInicio: 15, diaFim: 21, label: 'Volta 3 · 15–21 set', fracaoDias: 7 / 30 },
  { num: 4, inicio: '2026-09-22', fim: '2026-09-30', diaInicio: 22, diaFim: 30, label: 'Volta 4 · 22–30 set', fracaoDias: 9 / 30 },
]

export const MES_INICIO_ISO = '2026-09-01'
export const MES_FIM_ISO = '2026-09-30'

/**
 * Fração da meta MENSAL de cada closer que cai em cada volta (índice 0 = volta 1).
 * Forma vinda de "Metas 2026.xlsx" · aba Closer · "FECHAMENTO POR SEMANA".
 * Soma 1 por pessoa.
 */
export const FRACAO_VOLTA_CLOSER: Record<string, readonly [number, number, number, number]> = {
  Douglas: [0.2, 0.4, 0.2, 0.2],
  Jéssica: [0.2, 0.4, 0.2, 0.2],
  Bruna: [0.25, 0.25, 0.25, 0.25],
  'Aurélio Briano': [0.125, 0.25, 0.375, 0.25],
}

/** Fator da meta mensal do closer para o conjunto de voltas selecionado. */
export function fatorMetaCloser(nome: string, voltas: readonly number[]): number {
  const fracoes = FRACAO_VOLTA_CLOSER[nome.trim()]
  if (fracoes) return voltas.reduce((s, v) => s + (fracoes[v - 1] ?? 0), 0)
  // Sem forma na planilha → cai no rateio por dias (mesma regra do SDR).
  return voltas.reduce((s, v) => s + (VOLTAS_F1[v - 1]?.fracaoDias ?? 0), 0)
}

/** Fator da meta mensal do SDR (rateio por dias) para o conjunto de voltas. */
export function fatorMetaSdr(voltas: readonly number[]): number {
  return voltas.reduce((s, v) => s + (VOLTAS_F1[v - 1]?.fracaoDias ?? 0), 0)
}

/** true se a data (timestamptz ISO ou 'YYYY-MM-DD') cai em ALGUMA janela
 *  (comparação por dia, Brasília). `janelas` vazio/undefined = sem recorte. */
export function emJanelas(ts: string | null | undefined, janelas?: readonly Janela[]): boolean {
  if (!janelas || janelas.length === 0) return true
  if (!ts) return false
  const d = toLocalDate(ts)
  if (!d) return false
  return janelas.some(j => d >= j.inicio && d <= j.fim)
}

/** Chave estável de um array de janelas — pra usar em deps de hook. */
export function janelasKey(janelas?: readonly Janela[]): string {
  return janelas && janelas.length ? janelas.map(j => `${j.inicio}~${j.fim}`).join('|') : ''
}

/** Janelas (para os hooks) a partir das voltas selecionadas, em ordem. */
export function janelasDasVoltas(voltas: readonly number[]): Janela[] {
  return [...voltas]
    .sort((a, b) => a - b)
    .map(v => VOLTAS_F1[v - 1])
    .filter((v): v is VoltaDef => !!v)
    .map(v => ({ inicio: v.inicio, fim: v.fim }))
}

/** Rótulo da janela ativa. */
export function janelaLabel(ciclo: 'semanal' | 'mensal', voltas: readonly number[]): string {
  if (ciclo === 'mensal') return 'Setembro 2026'
  const s = [...voltas].sort((a, b) => a - b)
  if (s.length === 0) return 'Setembro 2026'
  if (s.length === 1) return VOLTAS_F1[s[0] - 1].label
  const contiguo = s.every((n, i) => i === 0 || n === s[i - 1] + 1)
  const di = VOLTAS_F1[s[0] - 1].diaInicio
  const df = VOLTAS_F1[s[s.length - 1] - 1].diaFim
  return contiguo ? `Voltas ${s[0]}–${s[s.length - 1]} · ${di}–${df} set` : `Voltas ${s.join(', ')}`
}

/**
 * % do período já decorrido (ritmo esperado) para a janela ativa, dado o dia
 * do mês de hoje (0 = antes do mês, 30 = depois).
 */
export function pctDecorridoJanela(ciclo: 'semanal' | 'mensal', voltas: readonly number[], diaHoje: number): number {
  const alvo = ciclo === 'mensal' ? [1, 2, 3, 4] : [...voltas].sort((a, b) => a - b)
  let total = 0
  let decorrido = 0
  for (const v of alvo) {
    const def = VOLTAS_F1[v - 1]
    if (!def) continue
    const dias = def.diaFim - def.diaInicio + 1
    total += dias
    decorrido += Math.max(0, Math.min(dias, diaHoje - (def.diaInicio - 1)))
  }
  return total > 0 ? (decorrido / total) * 100 : 0
}
