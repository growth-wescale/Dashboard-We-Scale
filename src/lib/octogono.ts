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
