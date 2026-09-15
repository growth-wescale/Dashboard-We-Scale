import { computeRitmo } from '@/lib/metaRitmo'
import type { Ritmo } from '@/lib/metaRitmo'
import { businessDaysInMonth, dayOfMonth } from '@/lib/dateUtils'

/**
 * Desdobramento de uma meta diária por pessoa — alimenta o popup que abre ao
 * clicar num card com meta (SQL, RR, SAL, COF). `periodo`/`hoje` já vêm
 * calculados pelo chamador (reaproveitando buildSdrRows/buildCloserRows com
 * janelas diferentes — a janela do recorte e uma só de hoje), então esta
 * função só combina os números com a meta mensal da pessoa e o ritmo.
 */
export interface PersonMetaRow {
  nome: string
  realizado: number
  metaMensal: number
  ritmo: Ritmo
  hoje: { realizado: number; meta: number }
}

export function buildPersonMetaRows(args: {
  /** nome -> realizado no recorte selecionado. */
  periodo: Map<string, number>
  /** nome -> realizado só hoje. */
  hoje: Map<string, number>
  metaMensalPorNome: (nome: string) => number
  mesKey: string
  fimJanela: string
}): PersonMetaRow[] {
  const nomes = new Set([...args.periodo.keys(), ...args.hoje.keys()])
  const linhas: PersonMetaRow[] = []
  for (const nome of nomes) {
    const metaMensal = args.metaMensalPorNome(nome)
    if (metaMensal <= 0) continue // sem meta cadastrada: fora do popup
    const realizado = args.periodo.get(nome) ?? 0
    const ritmo = computeRitmo({ realizado, metaMensal, mesKey: args.mesKey, fimJanela: args.fimJanela })
    linhas.push({
      nome, realizado, metaMensal, ritmo,
      hoje: { realizado: args.hoje.get(nome) ?? 0, meta: ritmo.metaDia },
    })
  }
  // Mais atrasado (vs. esperado até hoje) primeiro — é quem precisa de atenção.
  return linhas.sort((a, b) => a.ritmo.deltaPct - b.ritmo.deltaPct)
}

/**
 * Versão simplificada — pra metas sem leitura diária (Receita, Fechamentos):
 * só realizado x meta do mês x %, sem ritmo nem "hoje".
 */
export interface PersonSimplesRow {
  nome: string
  realizado: number
  metaMensal: number
  pct: number
}

export function buildPersonSimplesRows(args: {
  periodo: Map<string, number>
  metaMensalPorNome: (nome: string) => number
}): PersonSimplesRow[] {
  const linhas: PersonSimplesRow[] = []
  for (const nome of args.periodo.keys()) {
    const metaMensal = args.metaMensalPorNome(nome)
    if (metaMensal <= 0) continue
    const realizado = args.periodo.get(nome) ?? 0
    linhas.push({ nome, realizado, metaMensal, pct: (realizado / metaMensal) * 100 })
  }
  return linhas.sort((a, b) => a.pct - b.pct)
}

/**
 * Versão pra QUALQUER período (Dia, trimestre, ano, vários meses) — o popup
 * abre em todo recorte, não só em 1 mês. Realizado por pessoa; meta só quando
 * dá pra calcular uma honesta pro recorte (ver `fracaoMetaMensal`), senão
 * `meta = 0` e `pct = null` (a tela mostra "—"). Diferente de
 * `buildPersonMetaRows`, quem não tem meta continua na lista.
 */
export interface PersonPeriodoRow {
  nome: string
  realizado: number
  meta: number
  pct: number | null
}

export function buildPersonPeriodoRows(args: {
  periodo: Map<string, number>
  /** Meta da pessoa já proporcional ao recorte; 0 = sem meta. Omitir = ninguém tem meta. */
  metaPorNome?: (nome: string) => number
}): PersonPeriodoRow[] {
  const linhas: PersonPeriodoRow[] = []
  for (const [nome, realizado] of args.periodo) {
    const meta = args.metaPorNome?.(nome) ?? 0
    linhas.push({ nome, realizado, meta, pct: meta > 0 ? (realizado / meta) * 100 : null })
  }
  // Com meta: mais atrasado primeiro (igual aos outros popups). Sem meta: maior volume primeiro.
  return linhas.sort((a, b) => {
    if (a.pct != null && b.pct != null) return a.pct - b.pct
    if (a.pct != null) return -1
    if (b.pct != null) return 1
    return b.realizado - a.realizado
  })
}

/**
 * Fração da meta mensal que cabe num recorte de dias — dias úteis (segunda a
 * sábado, mesmo critério de `businessDaysInMonth`/meta do dia) dentro dos
 * ranges ÷ dias úteis do mês. Ex.: 1 dia útil em set/26 (26 úteis) = 1/26,
 * ou seja, a própria "meta do dia".
 *
 * `null` quando algum range sai do mês `mesKey` — a meta vem de um mês só, e
 * inventar a do outro mês seria pior que não mostrar.
 */
export function fracaoMetaMensal(ranges: { start: string; end: string }[], mesKey: string): number | null {
  if (ranges.length === 0) return null
  const uteisMes = businessDaysInMonth(mesKey)
  if (uteisMes === 0) return null
  let uteis = 0
  for (const { start, end } of ranges) {
    if (start.slice(0, 7) !== mesKey || end.slice(0, 7) !== mesKey) return null
    const [y, m] = mesKey.split('-').map(Number)
    for (let d = dayOfMonth(start); d <= dayOfMonth(end); d++) {
      if (new Date(y, m - 1, d).getDay() !== 0) uteis++
    }
  }
  return uteis / uteisMes
}
