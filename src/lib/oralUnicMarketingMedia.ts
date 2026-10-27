import { inOralUnicWindow, oralUnicOuroEnabled, ORAL_UNIC_MEDIA } from './oralUnicOuroScope'
import { isMediaFranquia, isMediaLegacy } from './oralUnicMapping'

export interface OralUnicMediaRow {
  marca?: unknown; dia?: unknown; canal?: unknown; campanha?: string | null
  conta_id?: unknown; campanha_id?: unknown
}
export type OralUnicMediaFront = 'franquia' | 'avaliadores' | 'comunidade'

// Recorte aprovado em27/10. IDs quando expostos pela ouro; nomes exatos apenas
// para a referência antiga, que não possui IDs. Não modifica marca ou valores.
const CAMPAIGNS = [
  ...ORAL_UNIC_MEDIA.map(c => ({ ...c, front: c.id === '120246002967810752' ? 'avaliadores' as const : 'franquia' as const })),
  { canal: 'meta', account: '24763396173316651', id: '120249277805770752', names: ['CMD Aquisição (comunidade) I Engajamento Whats — Cópia'], front: 'comunidade' as const },
  { canal: 'meta', account: '24763396173316651', id: '120249260819990752', names: ['CMD Aquisição (comunidade) I Engajamento Whats'], front: 'comunidade' as const },
]

export function oralUnicMediaFront(row: OralUnicMediaRow, enabled = oralUnicOuroEnabled): OralUnicMediaFront | null {
  if (!enabled || row.marca !== 'Oral Unic' || !inOralUnicWindow(row)) return null
  const campaign = CAMPAIGNS.find(c => c.canal === row.canal
    && (row.conta_id == null || String(row.conta_id) === c.account)
    && (row.campanha_id != null ? String(row.campanha_id) === c.id : c.names.some(n => n === row.campanha)))
  return campaign?.front ?? null
}

export function isOralUnicFranchiseMedia(row: OralUnicMediaRow): boolean {
  const front = oralUnicMediaFront(row)
  return front === null ? isMediaFranquia(row.campanha ?? null) : front === 'franquia'
}

export function isOralUnicCommunityMedia(row: OralUnicMediaRow): boolean {
  const front = oralUnicMediaFront(row)
  return front === null ? isMediaLegacy(row.campanha ?? null) : front === 'comunidade'
}

// S&OP conserva seu filtro histórico quando não há uma campanha do novo recorte.
export function isOralUnicSopFranchiseMedia(row: OralUnicMediaRow): boolean {
  const front = oralUnicMediaFront(row)
  if (front !== null) return front === 'franquia'
  const c = (row.campanha ?? '').toUpperCase()
  return !c.includes('[LEGACY]') && !c.includes('LEGACY]') && !c.includes('[CMD]') && !c.includes('[ODL]')
}
