import { describe, expect, it } from 'vitest'
import { inPeriod } from './vendasUtils'
import { filterRows, matches, mergePartnerRows, projectRows, sortRows } from './partnerOuroQuery'

describe('contrato Partner: outras marcas, filtros e paginação', () => {
  const liso = { id_lead: 'liso', marca: 'Lisô Laser', valor_contrato: 10, dia: '2026-10-19' }
  const old = { id_lead: 'partner', marca: 'Scale Partner', valor_contrato: 2, dia: '2026-10-20' }
  const gold = { id_lead: 'partner', marca: 'We Scale', valor_contrato: 3, dia: '2026-10-20' }
  it('substitui a parcela Partner uma vez e preserva os objetos das outras marcas', () => {
    const out = mergePartnerRows([liso, old], [gold], ['partner'], 'id_lead', new URLSearchParams('order=dia.desc'))
    expect(out).toEqual([gold, liso]); expect(out[1]).toBe(liso)
    expect(out.reduce((s, r) => s + Number(r.valor_contrato), 0)).toBe(13)
  })
  it('exclui evento Partner pela identidade mesmo com marca nula/incorreta na ingestão', () => {
    const a = { id_deal: 'partner', marca_deal: null }, b = { id_deal: 'outro', marca_deal: null }
    expect(mergePartnerRows([a, b], [], ['partner'], 'id_deal', new URLSearchParams())).toEqual([b])
  })
  it('aceita alias sem alterar as outras marcas', () => {
    expect(filterRows([gold], new URLSearchParams('marca=eq.Scale+Partner'))).toEqual([gold])
    expect(filterRows([gold], new URLSearchParams('marca=eq.Lisô+Laser'))).toEqual([])
  })
  it('compara timestamptz por instante e mantém DATE como data pura', () => {
    const r = { data_venda: '2026-10-01T00:00:00-03:00', dia: '2026-10-01' }
    expect(matches(r, 'data_venda', 'gte.2026-10-01')).toBe(true)
    expect(matches({data_venda:'2026-10-01T02:59:59Z'},'data_venda','gte.2026-10-01')).toBe(false)
    expect(matches(r, 'data_venda', 'lt.2026-10-01T02:59:59Z')).toBe(false)
    expect(matches(r, 'data_venda', 'lte.2026-10-01T03:00:00Z')).toBe(true)
    expect(matches(r, 'dia', 'eq.2026-10-01')).toBe(true)
  })
  it('preserva união lógica, nulos, filtros de origem/pessoa e allowlist legado apenas na parcela ouro', () => {
    const p = new URLSearchParams('or=(data_novo_mql.gte.2026-10-01,data_venda.gte.2026-10-01)&nome_sdr=eq.SDR&origem_comercial=eq.Inbound&funil=in.(SDR,Closer,Prospecção+Ativa,Odonto+Scale)')
    const r = { data_novo_mql: null, data_venda: '2026-10-20T12:00:00Z', nome_sdr: 'SDR', origem_comercial: 'Inbound', funil: 'Scale Partner' }
    expect(filterRows([r], p, true)).toEqual([r]); expect(filterRows([r], p)).toEqual([])
    expect(matches({ a: null }, 'a', 'is.null')).toBe(true)
    expect(matches({ a: null }, 'a', 'not.ilike.%teste%')).toBe(false)
    expect(matches({ a: 'teste' }, 'a', 'not.is.null')).toBe(true)
  })
  it('ordena numericamente, com desempate estável, preservando nulos e projeção', () => {
    const rows = [{ id: 'c', n: null }, { id: 'b', n: 10 }, { id: 'a', n: 2 }]
    expect(sortRows(rows, 'n.asc,id.asc').map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(projectRows(rows, 'id')).toEqual([{ id: 'c' }, { id: 'b' }, { id: 'a' }])
  })
  it('falha explicitamente quando há operador novo; não remove filtros silenciosamente', () => {
    expect(() => filterRows([gold], new URLSearchParams('id_lead=unknown.x'))).toThrow('não suportado')
    expect(() => projectRows([gold], 'payload->secret')).toThrow()
  })
})

it('o recorte BRT do Marketing Partner não muda a regra das outras marcas', () => {
  const before = '2026-10-01T02:59:59Z'
  expect(inPeriod(before,'2026-10-01','2026-10-01','We Scale')).toBe(false)
  expect(inPeriod(before,'2026-10-01','2026-10-01','Inpot')).toBe(inPeriod(before,'2026-10-01','2026-10-01'))
})
