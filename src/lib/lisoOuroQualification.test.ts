import { describe, expect, it } from 'vitest'
import { readLisoCaptureQualification, type LisoQualification } from './lisoOuroQualification'
const base: LisoQualification = { marca: 'Lisô Laser', formulario: 'lisolaser_multistep', capital: '200k_300k', mqlObservado: null }
describe('transporte da qualificação de origem Lisô, sem ativação', () => {
  it.each([true, false, null])('deal confirmado é MQL mesmo quando a captação é %s', mqlObservado => {
    expect(readLisoCaptureQualification({ ...base, capital: 'Ainda não possuo', mqlObservado,
      dealCrm: { contaId: 'wescale_principal_crm', id: 'deal-1', segmento: 'liso' },
    })).toEqual({ mql: true, origem: 'deal_criado_crm', segmento: 'liso' })
  })
  it('deal Beauty é MQL do evento, separado de Lisô e da inscrição', () => {
    expect(readLisoCaptureQualification({ ...base, formulario: 'beautyconnection_multistep',
      dealCrm: { contaId: 'wescale_principal_crm', id: 'deal-bc', segmento: 'beauty' },
    })).toEqual({ mql: true, origem: 'deal_criado_crm', segmento: 'beauty' })
  })
  it('ID vazio ou deal de outra conta não certificam MQL', () => {
    for (const dealCrm of [
      { contaId: 'outra', id: 'deal-1', segmento: 'liso' as const },
      { contaId: 'wescale_principal_crm', id: ' ', segmento: 'liso' as const },
    ]) expect(readLisoCaptureQualification({ ...base, dealCrm }).mql).toBeNull()
  })
  it.each(['200k_300k', 'Entre R$ 300.000 e R$ 500.000', 'Acima de R$ 500.000', 'Ainda não possuo', null])('não classifica pela informação de capital: %s', capital => {
    expect(readLisoCaptureQualification({ ...base, capital })).toEqual({ mql: null, origem: 'sem_classificacao_origem' })
  })
  it.each([true, false])('preserva literalmente a classificação da origem: %s', mqlObservado => {
    expect(readLisoCaptureQualification({ ...base, mqlObservado })).toEqual({ mql: mqlObservado, origem: 'classificacao_observada' })
  })
  it('não transforma Beauty, outra marca ou import comercial em captação MQL', () => {
    expect(readLisoCaptureQualification({ ...base, formulario: 'beautyconnection_multistep' }).origem).toBe('evento_separado')
    expect(readLisoCaptureQualification({ ...base, marca: 'We Scale' }).origem).toBe('fora_escopo')
    expect(readLisoCaptureQualification({ ...base, formulario: 'rd_crm_export' }).origem).toBe('fora_escopo')
  })
})
