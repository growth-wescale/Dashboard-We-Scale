import { describe, expect, it } from 'vitest'
import { deveGuardar, esperaMinutos, identificadores } from './caixa'

describe('identificadores', () => {
  it('lê o formato legado leads[]', () => {
    const body = { leads: [
      { email: 'a@x.com', last_conversion: { content: { identificador: 'eletrovias_multistep' } } },
      { email: 'b@x.com', last_conversion: { conversion_identifier: 'inpot_multistep' } },
      { email: 'c@x.com' },
    ] }
    expect(identificadores(body)).toEqual(['eletrovias_multistep', 'inpot_multistep', ''])
  })
  it('lê o formato novo', () => {
    expect(identificadores({ event_identifier: 'viva_multistep', contact: {} })).toEqual(['viva_multistep'])
  })
  it('corpo vazio ou estranho não tem conversão', () => {
    expect(identificadores(null)).toEqual([])
    expect(identificadores({ foo: 1 })).toEqual([])
  })
})

describe('deveGuardar', () => {
  it('descarta só ruído (eventos do CRM, chat e COF)', () => {
    expect(deveGuardar(['Tarefa criada no RD Station CRM'])).toBe(false)
    expect(deveGuardar(['CHAT_STARTED', 'cof_inpot'])).toBe(false)
  })
  it('guarda chatbot e qualquer evento desconhecido', () => {
    expect(deveGuardar(['b2case_multistep'])).toBe(true)
    expect(deveGuardar(['Negociação criada no RD Station CRM', 'odontolegacy_multistep'])).toBe(true)
    expect(deveGuardar(['evento_novo_qualquer'])).toBe(true)
    expect(deveGuardar([''])).toBe(true)
  })
  it('sem conversão não guarda', () => {
    expect(deveGuardar([])).toBe(false)
  })
})

describe('esperaMinutos', () => {
  it('cresce e para em 10 min', () => {
    expect([0, 1, 2, 3, 4, 9].map(esperaMinutos)).toEqual([2, 2, 4, 8, 10, 10])
  })
})
