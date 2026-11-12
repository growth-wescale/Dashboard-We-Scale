import { describe, expect, it } from 'vitest'
import type { Lead } from './types'
import { acumuladoMqlLegacy, mesesMtdLegacy } from './sopLegacyMtd'

describe('Comparativo mensal Legacy', () => {
  it('respeita o último dia do relatório inclusive em fevereiro e na virada do ano', () => {
    expect(mesesMtdLegacy('2028-03-31').map(m => m.end)).toEqual(['2028-03-31','2028-02-29','2028-01-31','2027-12-31'])
  })
  it('conta negociações distintas, mesmo sem contato, e aplica o corte antes do dedupe', () => {
    const deal = (id: string, dia: string): Lead => ({ id, nome:null, telefone:null, uf:null, cidade:null, formulario:null,
      utm_source:null, utm_medium:null, utm_campaign:null, row_hash:null, criado_em:dia, marca:'Odonto Scale', dia, email:'mesmo', dados_extras:{
      origem_leitura:'previa_mensal_ouro',metric_grain:'crm_deal',conta_id:'conta',id_deal:id } })
    const [mes] = mesesMtdLegacy('2026-11-03')
    expect(acumuladoMqlLegacy([deal('1','2026-11-04'),deal('1','2026-11-01'),deal('1','2026-11-01'),deal('2','2026-11-03')],mes)).toEqual([1,1,2])
    expect(acumuladoMqlLegacy([],mes)).toEqual([0,0,0])
  })
})
