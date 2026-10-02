import type { MediaDailyRaw } from './types'
import { isMediaOdontoLegacy, isMediaLegacy } from './oralUnicMapping'

// Regras existentes da Visão Geral: Franquia, Consultoria e Comunidade
// não podem compartilhar o mesmo investimento no cálculo de CP-MQL.
export function isComunidadeRow(r: MediaDailyRaw): boolean {
  return r.marca === 'Oral Unic' && isMediaLegacy(r.campanha)
}

export function rowBucket(r: MediaDailyRaw): string | null {
  if (r.marca === 'Oral Unic') {
    if (isMediaOdontoLegacy(r.campanha)) return 'Odonto Scale'
    if (isMediaLegacy(r.campanha)) return null
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
