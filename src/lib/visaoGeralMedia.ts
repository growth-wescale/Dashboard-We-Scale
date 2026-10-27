import { oralUnicMediaFront, isOralUnicCommunityMedia } from './oralUnicMarketingMedia'
import type { MediaDailyRaw } from './types'
import { isMediaOdontoLegacy } from './oralUnicMapping'

// Regras existentes da Visão Geral: Franquia, Consultoria e Comunidade
// não podem compartilhar o mesmo investimento no cálculo de CP-MQL.
export function isComunidadeRow(r: MediaDailyRaw): boolean {
  return r.marca === 'Oral Unic' && isOralUnicCommunityMedia(r)
}

/** Comunidade e Avaliadores ficam fora do investimento de aquisição/CP-MQL. */
export function isOutsideMqlMedia(r: MediaDailyRaw): boolean {
  return isComunidadeRow(r) || oralUnicMediaFront(r) === 'avaliadores'
}

export function rowBucket(r: MediaDailyRaw): string | null {
  if (r.marca === 'Oral Unic') {
    if (oralUnicMediaFront(r) === 'avaliadores') return null
    if (isMediaOdontoLegacy(r.campanha)) return 'Odonto Scale'
    if (isOralUnicCommunityMedia(r)) return null
    return 'Oral Unic'
  }
  return r.marca
}

export function filterMediaByMarcas(rows: MediaDailyRaw[], marcas: string[]): MediaDailyRaw[] {
  const set = new Set(marcas)
  return rows.filter(r => {
    const b = rowBucket(r)
    return b !== null && set.has(b)
  })
}

export function filterMediaByMarca(rows: MediaDailyRaw[], marca: string): MediaDailyRaw[] {
  return filterMediaByMarcas(rows, [marca])
}
