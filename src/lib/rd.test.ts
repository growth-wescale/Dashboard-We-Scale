import { describe, it, expect } from 'vitest'
import { parseIdDeal, rdDealUrl } from '@/lib/rd'

describe('parseIdDeal', () => {
  it('aceita id de 24 hex, com espaços e caixa alta', () => {
    expect(parseIdDeal('  6A870AB4C5CD95000121CC95 ')).toBe('6a870ab4c5cd95000121cc95')
  })
  it('extrai o id de uma URL do RD (com ou sem sufixo)', () => {
    expect(parseIdDeal('https://crm.rdstation.com/app/deals/6a870ab4c5cd95000121cc95')).toBe('6a870ab4c5cd95000121cc95')
    expect(parseIdDeal(rdDealUrl('6a870ab4c5cd95000121cc95') + '?tab=history')).toBe('6a870ab4c5cd95000121cc95')
  })
  it('nome de deal ou id curto → null', () => {
    expect(parseIdDeal('Clínica Sorriso')).toBeNull()
    expect(parseIdDeal('6a870ab4')).toBeNull()
  })
})
