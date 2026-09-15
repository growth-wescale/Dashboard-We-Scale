import { describe, it, expect } from 'vitest'
import type { StageDeal } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import {
  opcoesCruzadas, filtrarStageDeals, EMPTY_STAGE_DEALS_FILTERS,
} from '@/components/ui/useStageDealsFilters'

/** Só os campos que os filtros do popup leem. */
function deal(p: Partial<FunnelRow>): StageDeal {
  return { row: p as FunnelRow, dataEtapa: '2026-09-14' }
}

const DEALS: StageDeal[] = [
  deal({ marca: 'B2Case', nome_funil: 'SDR', fonte_macro: 'Inbound', nome_sdr: 'Thiago', nome_closer: null }),
  deal({ marca: 'B2Case', nome_funil: 'Closer', fonte_macro: 'Resgate', nome_sdr: 'Sarah', nome_closer: 'Jéssica' }),
  deal({ marca: 'Eletrovias', nome_funil: 'SDR', fonte_macro: 'Inbound', nome_sdr: 'Sarah', nome_closer: null }),
]

describe('opcoesCruzadas', () => {
  it('sem filtro: todos os valores presentes nos deals, sem vazio', () => {
    const o = opcoesCruzadas(DEALS, EMPTY_STAGE_DEALS_FILTERS)
    expect(o.marca).toEqual(['B2Case', 'Eletrovias'])
    expect(o.funil).toEqual(['Closer', 'SDR'])
    expect(o.sdr).toEqual(['Sarah', 'Thiago'])
    expect(o.closer).toEqual(['Jéssica']) // os dois nulos não viram opção
  })

  it('cruza com os OUTROS filtros: escolher a marca estreita SDR/funil/fonte', () => {
    const o = opcoesCruzadas(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, marca: ['Eletrovias'] })
    expect(o.sdr).toEqual(['Sarah'])
    expect(o.funil).toEqual(['SDR'])
    expect(o.fonte).toEqual(['Inbound'])
    // O próprio campo não se estreita — senão Marca colapsaria em 1 opção e
    // não daria pra trocar de marca sem limpar o filtro.
    expect(o.marca).toEqual(['B2Case', 'Eletrovias'])
  })

  it('cruza nos dois sentidos (SDR restringe Closer e vice-versa)', () => {
    expect(opcoesCruzadas(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, sdr: ['Sarah'] }).closer).toEqual(['Jéssica'])
    expect(opcoesCruzadas(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, closer: ['Jéssica'] }).sdr).toEqual(['Sarah'])
  })

  it('mantém o valor já marcado mesmo sem linha restante (escape hatch)', () => {
    // Thiago não tem deal na Eletrovias — mas precisa continuar na lista pra
    // poder ser desmarcado.
    const o = opcoesCruzadas(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, marca: ['Eletrovias'], sdr: ['Thiago'] })
    expect(o.sdr).toContain('Thiago')
  })
})

describe('filtrarStageDeals', () => {
  it('aplica todos os campos ao mesmo tempo (E, não OU)', () => {
    const r = filtrarStageDeals(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, marca: ['B2Case'], funil: ['SDR'] })
    expect(r).toHaveLength(1)
    expect(r[0].row.nome_sdr).toBe('Thiago')
  })

  it('campo vazio não filtra nada', () => {
    expect(filtrarStageDeals(DEALS, EMPTY_STAGE_DEALS_FILTERS)).toHaveLength(3)
  })

  it('vários valores no mesmo campo somam (OU dentro do campo)', () => {
    const r = filtrarStageDeals(DEALS, { ...EMPTY_STAGE_DEALS_FILTERS, sdr: ['Thiago', 'Sarah'] })
    expect(r).toHaveLength(3)
  })
})
