import { describe, expect, it } from 'vitest'
import { periodoMensal, linhaMensal } from './previaMensal'

describe('recorte mensal da prévia', () => {
  function periodo(...datas: string[]) {
    return periodoMensal(new URLSearchParams(datas.map(dia => ['dia', dia])), '2026-11-04')
  }
  it('delega outubro fechado e usa só novembro num intervalo misto', () => {
    expect(periodo('gte.2026-10-01','lt.2026-11-01')).toBeUndefined()
    expect(periodo('gte.2026-10-27','lte.2026-11-04')).toEqual({inicio:'2026-11-01',fim:'2026-11-04'})
  })
  it('aceita dezembro e a virada do ano sem mudar as regras', () => {
    expect(periodo('gt.2026-11-30','lt.2027-01-01')).toEqual({inicio:'2026-12-01',fim:'2026-12-31'})
    expect(periodo('eq.2027-01-01')).toEqual({inicio:'2027-01-01',fim:'2027-01-01'})
  })
  it('protege comunidade, campanhas não mapeadas da conta compartilhada e Partner', () => {
    expect(linhaMensal({marca:'Oral Unic',formulario:'comunidade_multistep'},'leads')).toBe(false)
    expect(linhaMensal({marca:'Oral Unic',canal:'meta',campanha:'Outra campanha'},'media_daily_raw')).toBe(false)
    expect(linhaMensal({marca:'We Scale'},'leads')).toBe(false)
  })
})
