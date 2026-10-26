export interface BeautyInscricaoDia { dia: string; inscricoes: number }

export function parseBeautyInscricoes(reply: unknown): BeautyInscricaoDia[] {
  if (!reply || typeof reply !== 'object') throw new Error('Resposta de Beauty inválida.')
  const value = reply as Record<string, unknown>
  if (value.mode !== 'ouro' || value.contract !== 'beauty_inscricoes_v1' || value.dataset !== 'inscricoes' || !Array.isArray(value.rows)) {
    throw new Error('Contrato de Beauty indisponível.')
  }
  const seen = new Set<string>()
  return value.rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Dia de Beauty inválido.')
    const r = row as Record<string, unknown>
    if (typeof r.dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dia) ||
        !Number.isSafeInteger(r.inscricoes) || (r.inscricoes as number) < 0 || seen.has(r.dia)) {
      throw new Error('Contagem de Beauty inválida.')
    }
    seen.add(r.dia)
    return { dia: r.dia, inscricoes: r.inscricoes as number }
  })
}

export function beautyInscricoesNoPeriodo(rows: BeautyInscricaoDia[], start: string, end: string): number {
  return rows.reduce((total, row) => total + (row.dia >= start && row.dia <= end ? row.inscricoes : 0), 0)
}
