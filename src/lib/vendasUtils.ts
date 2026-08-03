export const FONTE_CATEGORIAS = [
  'Digital · Pago',
  'Digital · Orgânico',
  'Indicação / Referência',
  'Direto / Prospecção',
  'Sem classificação',
] as const

export type FonteCategoria = typeof FONTE_CATEGORIAS[number]

/** True if dateStr falls within [start, end] (end defaults to today if omitted). */
export function inPeriod(
  dateStr: string | null | undefined,
  start: string | undefined,
  end: string | undefined,
): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr).getTime()
  const s = start ? new Date(start).getTime() : 0
  const e = end ? new Date(end + 'T23:59:59').getTime() : Date.now()
  return d >= s && d <= e
}

export function mapFonte(fonte: string | null): FonteCategoria {
  if (!fonte || fonte === 'Desconhecido') return 'Sem classificação'
  const f = fonte.toLowerCase()
  if (f.includes('facebook') || f.includes('instagram') || f.includes('meta') ||
      (f.includes('pago') && !f.includes('orgâni'))) return 'Digital · Pago'
  if (f.includes('google') && f.includes('ads')) return 'Digital · Pago'
  if (f.includes('orgân')) return 'Digital · Orgânico'
  if (f.includes('indicaç') || f.includes('parceiro') || f.includes('referência') || f.includes('hubspot')) return 'Indicação / Referência'
  if (f.includes('outbound') || f.includes('prospecç') || f.includes('direto') ||
      f.includes('telefone') || f.includes('site') || f.includes('tráfego')) return 'Direto / Prospecção'
  return 'Sem classificação'
}
