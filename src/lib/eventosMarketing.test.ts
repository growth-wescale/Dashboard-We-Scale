import { describe, expect, it } from 'vitest'
import { leadsPorEvento } from './eventosMarketing'
import { deduplicateLeads, isLeadMql } from './leadUtils'
import type { Lead } from './types'

const lead = (id: string, participacoes: unknown, extra = {}): Lead => ({
  id, dia: '2026-07-01', marca: 'Lisô Laser', nome: 'Pessoa fictícia',
  email: 'ficticio@example.test', telefone: null, cidade: null, uf: null,
  utm_source: null, utm_medium: null, utm_campaign: null, formulario: null,
  row_hash: null, criado_em: '', dados_extras: { eventos_marketing: participacoes, ...extra },
})
const p = (evento = 'Scale Partner Geral', dia = '2026-09-10') => ({ evento, dia })
const get = (rows: Lead[]) => leadsPorEvento(rows, '2026-09-01', '2026-09-30')

describe('participações de Marketing conciliadas com CRM', () => {
  it('usa dia do CRM e inclui contato de outra marca criado anteriormente', () => {
    const result = get([lead('a', [p()])])
    expect(result).toHaveLength(1)
    expect(result[0].dia).toBe('2026-09-10')
    expect(result[0].marca).toBe('Lisô Laser')
  })
  it('conta a mesma pessoa uma vez em cada evento', () => {
    expect(get([lead('a', [p(), p('Beauty Connection'), p()])])).toHaveLength(2)
  })
  it('deduplica IDs repetidos e escolhe a primeira participação no período', () => {
    expect(get([lead('a', [p(), p('Scale Partner Geral', '2026-09-08')]), lead('a', [p()])])[0].dia).toBe('2026-09-08')
    expect(get([lead('a', [p()]), lead('a', [p()])])).toHaveLength(1)
  })
  it('não classifica por adset nem usa metadados antigos como atalho', () => {
    expect(get([lead('a', undefined, { adset: 'ODONTOLOGIA', evento: 'Beauty Connection' })])).toEqual([])
  })
  it('ignora registros malformados, outros eventos e datas fora do intervalo', () => {
    expect(get([lead('a', [null, {}, p('Outro'), p('Beauty Connection', '2026-08-31'), p('Beauty Connection', '2026-10-01'), p('Beauty Connection', 'invalid')])])).toEqual([])
    expect(get([lead('a', {})])).toEqual([])
  })
  it('inclui os limites e preserva a data original do cadastro', () => {
    const original = lead('a', [p('Beauty Connection', '2026-09-01'), p('Scale Partner Geral', '2026-09-30')])
    expect(get([original])).toHaveLength(2)
    expect(original.dia).toBe('2026-07-01')
  })
  it('não altera deduplicação nem infere MQL', () => {
    const a = lead('a', [p()]), b = lead('b', [p()])
    expect(deduplicateLeads([a, b])).toHaveLength(1)
    expect(isLeadMql(a)).toBe(false)
    expect(isLeadMql(lead('c', [p()], { lead_type: 'MQL' }))).toBe(true)
  })
  it('usa empresa e local conciliados sem mutar o lead', () => {
    const original = lead('a', [{ ...p(), empresa: 'Empresa fictícia', cidade: 'Cidade', uf: 'SP' }])
    expect(get([original])[0].dados_extras?.empresa).toBe('Empresa fictícia')
    expect(get([original])[0].cidade).toBe('Cidade')
    expect(original.cidade).toBeNull()
  })
})
