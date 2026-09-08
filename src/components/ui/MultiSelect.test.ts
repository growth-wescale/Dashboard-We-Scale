import { describe, it, expect } from 'vitest'
import { mesmoConjunto, resolveClear, rodapeAcoes } from './MultiSelect'

describe('mesmoConjunto', () => {
  it('ignora ordem', () => {
    expect(mesmoConjunto(['a', 'b'], ['b', 'a'])).toBe(true)
  })
  it('tamanhos diferentes = diferente', () => {
    expect(mesmoConjunto(['a'], ['a', 'b'])).toBe(false)
  })
  it('mesmo tamanho, conteúdo diferente = diferente', () => {
    expect(mesmoConjunto(['a', 'b'], ['a', 'c'])).toBe(false)
  })
})

describe('resolveClear', () => {
  it('filtro que pode ficar vazio (minSelected 0): limpa para lista vazia = "Todas"', () => {
    expect(resolveClear(['meta', 'google'], 0)).toEqual([])
  })

  it('filtro com piso e clearTo (Marca): volta ao estado "sem recorte" (Consolidado)', () => {
    const todasMarcas = ['oral-unic', 'inpot', 'viva']
    // Bug reportado: com 1 marca isolada, "Limpar" tem que devolver todas,
    // não manter a primeira selecionada.
    expect(resolveClear(['inpot'], 1, todasMarcas)).toEqual(todasMarcas)
  })

  it('filtro com piso e clearTo (Período): volta ao período atual', () => {
    expect(resolveClear(['2026-06', '2026-07', '2026-08'], 1, ['2026-09'])).toEqual(['2026-09'])
  })

  it('filtro com piso SEM clearTo: fallback legado mantém só o 1º selecionado', () => {
    expect(resolveClear(['inpot', 'viva'], 1)).toEqual(['inpot'])
  })

  it('clearTo tem prioridade sobre o piso mesmo com 1 item selecionado', () => {
    expect(resolveClear(['inpot'], 1, ['oral-unic', 'inpot', 'viva'])).toEqual(['oral-unic', 'inpot', 'viva'])
  })
})

describe('rodapeAcoes', () => {
  const MARCAS = ['oral-unic', 'inpot', 'viva']

  it('filtro aberto com seleção parcial: mostra "Selecionar tudo" e "Limpar"', () => {
    const r = rodapeAcoes(['meta'], ['meta', 'google', 'ig'], 0)
    expect(r).toEqual({ selecionarTudo: true, limpar: true })
  })

  it('filtro aberto vazio: nada a fazer', () => {
    expect(rodapeAcoes([], ['meta', 'google'], 0)).toEqual({ selecionarTudo: true, limpar: false })
  })

  it('Marca com 1 isolada: só "Limpar" (= Consolidado); "Selecionar tudo" some pra não duplicar', () => {
    const r = rodapeAcoes(['inpot'], MARCAS, 1, MARCAS)
    expect(r).toEqual({ selecionarTudo: false, limpar: true })
  })

  it('Marca com subconjunto: só "Limpar" (leva a todas), sem botão redundante', () => {
    const r = rodapeAcoes(['inpot', 'viva'], MARCAS, 1, MARCAS)
    expect(r).toEqual({ selecionarTudo: false, limpar: true })
  })

  it('Marca em Consolidado (tudo marcado): rodapé some', () => {
    const r = rodapeAcoes(MARCAS, MARCAS, 1, MARCAS)
    expect(r).toEqual({ selecionarTudo: false, limpar: false })
  })

  it('Período multi: "Limpar" (volta ao atual) e "Selecionar tudo" coexistem — ações distintas', () => {
    const meses = ['2026-06', '2026-07', '2026-08', '2026-09']
    const r = rodapeAcoes(['2026-06', '2026-07'], meses, 1, ['2026-09'])
    expect(r).toEqual({ selecionarTudo: true, limpar: true })
  })

  it('Período já no período atual sozinho: "Limpar" some', () => {
    const meses = ['2026-08', '2026-09']
    const r = rodapeAcoes(['2026-09'], meses, 1, ['2026-09'])
    expect(r.limpar).toBe(false)
  })
})
