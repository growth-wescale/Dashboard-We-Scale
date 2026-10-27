import { describe, expect, it } from 'vitest'
import { classifyLisoMedia, mediaDifferenceCents, type LisoMediaCandidate } from './lisoBeautyMediaContract'

const candidate: LisoMediaCandidate = {
  dia: '2026-10-22', canal: 'meta', conta_id: '655039566905092',
  campanha_id: '120250473527040783', moeda: 'BRL', spend_brl: 372.40,
}

describe('contrato local de mídia Lisô/Beauty', () => {
  it('separa Beauty por conta e campanha, mesmo na conta compartilhada', () => {
    expect(classifyLisoMedia(candidate)).toBe('beauty')
    expect(classifyLisoMedia({ ...candidate, campanha_id: '120249196601180044' })).toBeNull()
    expect(classifyLisoMedia({ ...candidate, campanha_id: '120250987482330783' })).toBeNull()
  })
  it('exige canal, moeda, dia e valor válidos', () => {
    expect(classifyLisoMedia({ ...candidate, canal: 'google' })).toBeNull()
    expect(classifyLisoMedia({ ...candidate, moeda: 'USD' })).toBeNull()
    expect(classifyLisoMedia({ ...candidate, dia: '22/10/2026' })).toBeNull()
    expect(classifyLisoMedia({ ...candidate, dia: '2026-02-30' })).toBeNull()
    expect(classifyLisoMedia({ ...candidate, spend_brl: Number.NaN })).toBeNull()
  })
  it('reconhece somente as quatro campanhas conferidas e o desvio aceito', () => {
    expect(classifyLisoMedia({ ...candidate, conta_id: '1923360421973366', campanha_id: '120249196601180044' })).toBe('liso')
    expect(classifyLisoMedia({ ...candidate, canal: 'google', conta_id: '9186518266', campanha_id: '23604680552' })).toBe('liso')
    expect(classifyLisoMedia({ ...candidate, canal: 'google', conta_id: '9186518266', campanha_id: '24118318500' })).toBe('liso')
    expect(mediaDifferenceCents(372.45, 372.40)).toBe(5)
  })
})
