import type { PeriodoMensal } from './previaMensal'

// Whole-brand replacement in linhaMensal for both leads and media. Oral Unic
// and Legacy retain their entire reference: community/consulting scopes vary.
export const monthlyReferenceCoveredBrands = ['Inpot', 'B2Case', 'Viva', 'Eletrovias', 'Lisô Laser', 'Beauty Connection'] as const

/** Reduce only a reference request; the original query still filters the gold
 * rows and controls the final union, ordering, projection and pagination. */
export function monthlyReferenceUrl(url: URL, periodo: PeriodoMensal, brands: readonly string[]): URL {
  const reduced = new URL(url)
  // Do not rewrite existing Boolean expressions or their precedence.
  if (!brands.length || [...url.searchParams.keys()].some(k => ['or', 'and', 'not.or', 'not.and'].includes(k))) return reduced
  const covered = brands.filter(b => monthlyReferenceCoveredBrands.some(known => known === b))
  if (!covered.length) return reduced
  // Explicit null branches preserve Postgres three-valued logic. Out-of-window
  // rows remain for mixed historical/monthly requests.
  reduced.searchParams.set('or', `(dia.is.null,dia.lt.${periodo.inicio},dia.gt.${periodo.fim},marca.is.null,marca.not.in.(${covered.map(b => JSON.stringify(b)).join(',')}))`)
  return reduced
}
