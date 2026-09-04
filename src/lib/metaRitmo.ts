import { businessDaysInMonth, dayOfMonth, daysInMonth } from '@/lib/dateUtils'

export interface Ritmo {
  esperado: number
  metaDia: number
  pctRealizado: number
  pctEsperado: number
  /** (realizado - esperado) / esperado — usado só pro limiar de `noRitmo`. */
  deltaPct: number
  /** Realizado como % do esperado até hoje (não um delta): 8 de 10 = 80,
   *  não -20%. Pode passar de 100 quando o realizado supera o esperado. */
  pctDoEsperado: number
  noRitmo: boolean
}

/**
 * Leitura diária de uma meta mensal:
 *  - `esperado`: a fração da meta que já deveria estar batida a esta altura do
 *    mês (dias corridos: dia atual / total de dias do mês).
 *  - `metaDia`: quanto precisa sair por dia útil (segunda a sábado) para
 *    fechar o mês.
 * `noRitmo` tolera 2% abaixo do esperado antes de acender o alerta.
 */
export function computeRitmo(args: {
  realizado: number
  metaMensal: number
  mesKey: string
  fimJanela: string
}): Ritmo {
  const dim = daysInMonth(args.mesKey)
  const fimJanelaMesKey = args.fimJanela.substring(0, 7) // extrai 'YYYY-MM'
  const diaN = fimJanelaMesKey === args.mesKey
    ? dayOfMonth(args.fimJanela)
    : fimJanelaMesKey > args.mesKey
      ? dim // fimJanela é depois do mesKey, então o mês inteiro já passou
      : 0 // fimJanela é de um mês ANTES do mesKey — nada do mês meta ainda decorreu
  const uteis = businessDaysInMonth(args.mesKey)

  const esperado = args.metaMensal * (diaN / dim)
  const metaDia = uteis > 0 ? args.metaMensal / uteis : 0
  const pctRealizado = args.metaMensal > 0 ? Math.min(100, (args.realizado / args.metaMensal) * 100) : 0
  const pctEsperado = args.metaMensal > 0 ? Math.min(100, (esperado / args.metaMensal) * 100) : 0
  const deltaPct = esperado > 0 ? ((args.realizado - esperado) / esperado) * 100 : 0
  const pctDoEsperado = esperado > 0 ? (args.realizado / esperado) * 100 : 0

  return { esperado, metaDia, pctRealizado, pctEsperado, deltaPct, pctDoEsperado, noRitmo: deltaPct >= -2 }
}
