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

export interface Duelo {
  id: string
  cargo: Competidor['cargo']
  a: Competidor
  b: Competidor
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

/** Pareia apenas vizinhos do ranking da MESMA função; ímpar fica sem par. */
export function duelosOctogono(rankings: { closers: readonly Competidor[]; sdrs: readonly Competidor[] }): Duelo[] {
  const duelos: Duelo[] = []
  for (const [cargo, lista] of [['Closer', rankings.closers], ['SDR', rankings.sdrs]] as const) {
    for (let i = 0; i + 1 < lista.length; i += 2) {
      duelos.push({ id: `${cargo}-${i / 2}`, cargo, a: lista[i], b: lista[i + 1] })
    }
  }
  return duelos
}
