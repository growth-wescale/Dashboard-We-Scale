import { describe, expect, it, vi } from 'vitest'
const flag = vi.hoisted(() => ({ enabled: true }))
vi.mock('./oralUnicOuroScope', async importOriginal => ({
  ...await importOriginal<typeof import('./oralUnicOuroScope')>(),
  get oralUnicOuroEnabled() { return flag.enabled },
}))
import { oralUnicMediaFront, isOralUnicCommunityMedia, isOralUnicFranchiseMedia, isOralUnicSopFranchiseMedia } from './oralUnicMarketingMedia'
import { filterMediaByMarca, isOutsideMqlMedia, rowBucket } from './visaoGeralMedia'
import type { MediaDailyRaw } from './types'

const row = (campanha: string, spend_brl: number, extra = {}) => ({
  id: campanha, marca: 'Oral Unic', dia: '2026-10-27', canal: 'meta', campanha, spend_brl, ...extra,
}) as MediaDailyRaw
const rows = [
  row('[OUF] FUNDO_MQL_FRANQUIA_NOVA', 4074.07, { campanha_id: '120249498633040752', conta_id: '24763396173316651' }),
  row('[GS][CONV][LEAD] - Avaliadores - 05/06/2026', 1781.76, { campanha_id: '120246002967810752', conta_id: '24763396173316651' }),
  row('[SEARCH] LEGACY Franchise marca', 3.35, { canal: 'google', campanha_id: '23324303426', conta_id: '9733883995' }),
  row('CMD Aquisição (comunidade) I Engajamento Whats — Cópia', 62.45),
  row('CMD Aquisição (comunidade) I Engajamento Whats', 49.12),
]
const cents = (rs: MediaDailyRaw[]) => rs.reduce((n, r) => n + Math.round(r.spend_brl * 100), 0)

describe('recorte de mídia Oral Unic aprovado, exclusivo de Marketing/outubro', () => {
  it('conserva todo gasto e separa franquia, avaliadores e comunidade sem alterar as linhas', () => {
    const before = structuredClone(rows)
    rows.forEach(Object.freeze)
    const franchise = rows.filter(isOralUnicFranchiseMedia)
    const community = rows.filter(isOralUnicCommunityMedia)
    const assessors = rows.filter(r => oralUnicMediaFront(r) === 'avaliadores')
    expect(cents(franchise)).toBe(407742)
    expect(cents(community)).toBe(11157)
    expect(cents(assessors)).toBe(178176)
    expect(cents(franchise) + cents(community) + cents(assessors)).toBe(cents(rows))
    expect(rows).toEqual(before)
  })
  it('usa o mesmo numerador de franquia no card, consolidado, Saúde e S&OP/PDF', () => {
    expect(cents(filterMediaByMarca(rows, 'Oral Unic'))).toBe(407742)
    expect(cents(rows.filter(r => !isOutsideMqlMedia(r)))).toBe(407742)
    expect(cents(rows.filter(isOralUnicFranchiseMedia))).toBe(407742)
    expect(cents(rows.filter(isOralUnicSopFranchiseMedia))).toBe(407742)
  })
  it('mantém outras marcas, consultoria, V4 e campanhas não mapeadas com suas regras anteriores', () => {
    const other = row(rows[1].campanha!, 100, { marca: 'Lisô Laser' })
    expect(oralUnicMediaFront(other)).toBeNull()
    expect(rowBucket(other)).toBe('Lisô Laser')
    expect(rowBucket(row('[ODL] Consultoria I LEADS I SITE LEGACY', 100))).toBe('Odonto Scale')
    expect(rowBucket(row('[ODL] [CMD] regra histórica', 100))).toBe('Odonto Scale')
    expect(isOralUnicFranchiseMedia(row('[V4] Aquisição', 100))).toBe(false)
    expect(isOralUnicFranchiseMedia(row('Campanha sem classificação anterior', 100))).toBe(true)
    expect(isOralUnicCommunityMedia(row('[CMD] AQUISIÇÃO (comunidade) I LEADS', 100))).toBe(true)
  })
  it.each(['2026-09-30', '2026-11-01'])('preserva recortes históricos/futuros em %s', dia => {
    for (const r of [rows[1], rows[3]]) {
      const historical = { ...r, dia }
      expect(oralUnicMediaFront(historical)).toBeNull()
      expect(isOralUnicFranchiseMedia(historical)).toBe(true)
      expect(rowBucket(historical)).toBe('Oral Unic')
    }
  })
  it('prefere ID e conta; não usa nome para sobrepor um ID diferente', () => {
    expect(oralUnicMediaFront({ ...rows[1], campanha: 'Nome alterado', campanha_id: '120246002967810752' })).toBe('avaliadores')
    expect(oralUnicMediaFront({ ...rows[1], campanha_id: 'outro' })).toBeNull()
    expect(oralUnicMediaFront({ ...rows[1], conta_id: 'outra' })).toBeNull()
    expect(oralUnicMediaFront({ ...rows[3], canal: 'google' })).toBeNull()
    expect(oralUnicMediaFront(row('CMD outra campanha não aprovada', 1))).toBeNull()
  })
  it('flag desligada conserva a leitura antiga em todos os consumidores', () => {
    flag.enabled = false
    try {
      expect(rows.every(r => oralUnicMediaFront(r) === null)).toBe(true)
      expect(cents(rows.filter(isOralUnicFranchiseMedia))).toBe(cents(rows))
      expect(cents(rows.filter(isOralUnicSopFranchiseMedia))).toBe(cents(rows))
      expect(cents(filterMediaByMarca(rows, 'Oral Unic'))).toBe(cents(rows))
      expect(rows.filter(isOralUnicCommunityMedia)).toHaveLength(0)
    } finally { flag.enabled = true }
  })
})
