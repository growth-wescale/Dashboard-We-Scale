import { dayOfMonth, daysInMonth } from '@/lib/dateUtils'

/**
 * Visão MTD (month-to-date) da aba Performance.
 *
 * - `fator`: quanto da meta do mês já deveria estar batida no último dia da
 *   janela — mesma régua do "esperado até hoje" dos cards (`computeRitmo`):
 *   dias corridos decorridos ÷ dias do mês. Mês já fechado = 1.
 * - `atual`: do dia 1 até o último dia da janela.
 * - `anterior`: o MESMO trecho do mês anterior (dia 1 até o mesmo dia, ou o
 *   último dia do mês anterior se ele for mais curto). É a base do comparativo.
 */
export interface JanelaMtd {
  mesKey: string
  dia: number
  fator: number
  atual: { from: string; to: string }
  anterior: { from: string; to: string; mesKey: string }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function mesAnterior(mesKey: string): string {
  const [y, m] = mesKey.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function janelaMtd(mesKey: string, fimJanela: string): JanelaMtd {
  const dim = daysInMonth(mesKey)
  const fimMes = fimJanela.slice(0, 7)
  const dia = fimMes === mesKey ? dayOfMonth(fimJanela) : fimMes > mesKey ? dim : 0
  const ant = mesAnterior(mesKey)
  const diaAnt = Math.min(Math.max(dia, 1), daysInMonth(ant))
  return {
    mesKey,
    dia,
    fator: dim > 0 ? dia / dim : 0,
    atual: { from: `${mesKey}-01`, to: `${mesKey}-${pad(Math.max(dia, 1))}` },
    anterior: { from: `${ant}-01`, to: `${ant}-${pad(diaAnt)}`, mesKey: ant },
  }
}

/** Meta que aparece na tabela: inteira, arredondada pra cima (nunca vírgula),
 *  igual ao `nfCeil` dos cards. O delta é calculado contra esse mesmo número. */
export function metaInteira(meta: number): number {
  return meta > 0 ? Math.ceil(meta - 1e-9) : 0
}

/** Variação percentual de `anterior` pra `atual`; null quando não há base. */
export function variacaoPct(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null
}
