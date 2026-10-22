import { describe, expect, it } from 'vitest'
import { diffVersoes, dividirReceita, dividirVenda, montarVersoes, pctWeScale, versaoNoDia, type RepasseLinha } from './repasse'

function linha(numero: number, vigente: string, marca: string, pct: number): RepasseLinha {
  return { versao_id: numero, numero, vigente_desde: vigente, motivo: null, criado_por: null, criado_em: '2026-10-22T12:00:00Z', marca, pct_we_scale: pct }
}

const VERSOES = montarVersoes([
  linha(2, '2027-01-01', 'Inpot', 50),
  linha(1, '2025-01-01', 'Inpot', 60),
  linha(1, '2025-01-01', 'Eletrovias', 70),
  linha(1, '2025-01-01', 'Oral Unic', 100),
])

describe('repasse da taxa de franquia', () => {
  it('ordena as versões pela vigência', () => {
    expect(VERSOES.map(v => v.numero)).toEqual([1, 2])
  })

  it('usa a versão vigente na data da venda — versão nova não muda venda antiga', () => {
    expect(pctWeScale(VERSOES, 'Inpot', '2026-10-20T15:00:00Z')).toBe(60)
    expect(pctWeScale(VERSOES, 'Inpot', '2027-01-01')).toBe(50)
    expect(pctWeScale(VERSOES, 'Inpot', '2026-12-31')).toBe(60)
  })

  it('a virada é pelo dia em Brasília, não em UTC', () => {
    // 31/12 22h em Brasília = 01/01 01h UTC: ainda é a versão antiga
    expect(pctWeScale(VERSOES, 'Inpot', '2027-01-01T01:00:00Z')).toBe(60)
  })

  it('venda antes da 1ª versão usa a 1ª', () => {
    expect(versaoNoDia(VERSOES, '2024-05-01')?.numero).toBe(1)
  })

  it('marca sem percentual cadastrado (ou versão nenhuma) conta 100% We Scale', () => {
    expect(pctWeScale(VERSOES, 'Viva', '2026-10-01')).toBe(100)
    expect(pctWeScale([], 'Inpot', '2026-10-01')).toBe(100)
    expect(pctWeScale(VERSOES, null, '2026-10-01')).toBe(100)
  })

  it('aceita o nome cru do RD (Odonto Legacy / Scale Partner) igual ao canônico', () => {
    const v = montarVersoes([linha(1, '2025-01-01', 'Odonto Legacy', 80)])
    expect(pctWeScale(v, 'Odonto Scale', '2026-10-01')).toBe(80)
  })

  it('divide cada venda e soma', () => {
    expect(dividirVenda(VERSOES, { marca: 'Inpot', data_venda: '2026-10-01', valor_contrato: 100_000 }))
      .toEqual({ total: 100_000, weScale: 60_000, marca: 40_000 })
    const d = dividirReceita(VERSOES, [
      { marca: 'Inpot', data_venda: '2026-10-01', valor_contrato: 100_000 },
      { marca: 'Eletrovias', data_venda: '2026-10-01', valor_contrato: 50_000 },
      { marca: 'Oral Unic', data_venda: '2026-10-01', valor_contrato: 70_000 },
      { marca: 'Inpot', data_venda: '2026-10-01', valor_contrato: null },
    ])
    expect(d).toEqual({ total: 220_000, weScale: 165_000, marca: 55_000 })
  })

  it('diff mostra só o que mudou', () => {
    expect(diffVersoes(VERSOES[0], VERSOES[1])).toEqual([
      { marca: 'Eletrovias', de: 70, para: 100 },
      { marca: 'Inpot', de: 60, para: 50 },
    ])
  })
})
