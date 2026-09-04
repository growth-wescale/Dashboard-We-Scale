import { computeRitmo } from '@/lib/metaRitmo'
import type { Ritmo } from '@/lib/metaRitmo'

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
