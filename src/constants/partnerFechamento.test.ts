import { describe, expect, it } from 'vitest'
import { getPartnerFechamento, PARTNER_FECHAMENTO_ATUAL } from './partnerFechamento'

describe('fechamento Partner nos cards existentes', () => {
  it('preserva os seis totais fornecidos e a janela recente completa', () => {
    expect(getPartnerFechamento('2026-08-15', '2026-10-19', '__all__')).toMatchObject({
      invest: 21133.85, leads: 98, mql: 51, cpMql: 414.39, vendas: 6, receita: 13718,
    })
    expect(PARTNER_FECHAMENTO_ATUAL.start).toBe('2026-08-15')
    expect(PARTNER_FECHAMENTO_ATUAL.end).toBe('2026-10-19')
  })
  it('mantém a referência anterior separada, excluindo 13 e 14/08', () => {
    expect(getPartnerFechamento('2026-05-01', '2026-08-12', '__all__')).toMatchObject({
      invest: 35748.98, leads: 107, mql: 49, cpMql: 729.57, vendas: 15, receita: 27550,
    })
    expect(getPartnerFechamento('2026-05-01', '2026-08-14', '__all__')).toBeNull()
  })
  it('não sobrescreve outubro, setembro nem um recorte por fonte', () => {
    expect(getPartnerFechamento('2026-10-01', '2026-10-19', '__all__')).toBeNull()
    expect(getPartnerFechamento('2026-09-01', '2026-09-30', '__all__')).toBeNull()
    expect(getPartnerFechamento('2026-08-15', '2026-10-19', 'meta')).toBeNull()
  })
})
