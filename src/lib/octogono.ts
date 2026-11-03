/** Apresentação da campanha: não altera as metas nem o realizado dos hooks. */
export interface Competidor {
  nome: string
  cargo: 'Closer' | 'SDR'
  iniciais: string
  cor: string
  foto?: string
  realizado: number
  meta: number
  pct: number
  unidade: 'R$' | 'SQL'
}

interface CloserInput {
  nome: string
  iniciais: string
  cor: string
  foto?: string
  realizado: number
  metaFinanceira: number
}

interface SdrInput {
  nome: string
  iniciais: string
  cor: string
  foto?: string
  metaSql: number
}

/** Pessoas sem meta continuam nas grades originais, mas não disputam cinturão. */
export function rankingOctogono(
  closers: readonly CloserInput[],
  sdrs: readonly SdrInput[],
  realizadoSdr: ReadonlyMap<string, { sql: number }>,
  fatorSdr = 1,
): { closers: Competidor[]; sdrs: Competidor[] } {
  const ordenar = (a: Competidor, b: Competidor) =>
    b.pct - a.pct || b.realizado - a.realizado || a.nome.localeCompare(b.nome, 'pt-BR')

  return {
    closers: closers.filter(c => c.metaFinanceira > 0).map(c => ({
      nome: c.nome, cargo: 'Closer', iniciais: c.iniciais, cor: c.cor, foto: c.foto,
      realizado: c.realizado, meta: c.metaFinanceira,
      pct: c.realizado / c.metaFinanceira * 100, unidade: 'R$',
    } as Competidor)).sort(ordenar),
    sdrs: sdrs.filter(s => s.metaSql * fatorSdr > 0).map(s => {
      const meta = s.metaSql * fatorSdr
      const realizado = realizadoSdr.get(s.nome)?.sql ?? 0
      return {
        nome: s.nome, cargo: 'SDR', iniciais: s.iniciais, cor: s.cor, foto: s.foto,
        realizado, meta, pct: realizado / meta * 100, unidade: 'SQL',
      } as Competidor
    }).sort(ordenar),
  }
}

/**
 * Campeão do Cinturão · Closer de um mês fechado: maior % da própria meta
 * financeira, desempate pelo realizado. Quem não vendeu nada não leva o
 * cinturão — sem nenhuma venda no mês, não há campeão.
 */
export function campeaoCloser<T extends { nome: string; realizado: number; metaFinanceira: number }>(
  closers: readonly T[],
): (T & { pct: number }) | null {
  const candidatos = closers
    .filter(c => c.metaFinanceira > 0 && c.realizado > 0)
    .map(c => ({ ...c, pct: c.realizado / c.metaFinanceira * 100 }))
    .sort((a, b) => b.pct - a.pct || b.realizado - a.realizado || a.nome.localeCompare(b.nome, 'pt-BR'))
  return candidatos[0] ?? null
}

/**
 * Campeão do Cinturão · SDR de um mês fechado: maior % da meta de SQL do mês,
 * desempate por SQL e depois por Diagnóstico (RR). Sem nenhum SQL no mês, não
 * há campeão.
 */
export function campeaoSdr<T extends { nome: string; metaSql: number }>(
  sdrs: readonly T[],
  realizado: ReadonlyMap<string, { sql: number; rr: number }>,
): { sdr: T; sql: number; rr: number; pct: number } | null {
  const candidatos = sdrs
    .filter(s => s.metaSql > 0 && (realizado.get(s.nome)?.sql ?? 0) > 0)
    .map(s => {
      const real = realizado.get(s.nome)!
      return { sdr: s, sql: real.sql, rr: real.rr, pct: real.sql / s.metaSql * 100 }
    })
    .sort((a, b) => b.pct - a.pct || b.sql - a.sql || b.rr - a.rr || a.sdr.nome.localeCompare(b.sdr.nome, 'pt-BR'))
  return candidatos[0] ?? null
}
