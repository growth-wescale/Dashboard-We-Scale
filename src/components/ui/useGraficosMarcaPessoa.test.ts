import { describe, expect, it } from 'vitest'
import { filtrarPorGraficos, FILTRO_GRAFICOS_VAZIO } from './useGraficosMarcaPessoa'

type L = { marca: string | null; pessoa: string | null }
const itens: L[] = [
  { marca: 'Eletrovias', pessoa: 'Sarah Padilha' },
  { marca: 'Eletrovias', pessoa: 'Xayane' },
  { marca: 'Inpot', pessoa: 'Xayane' },
  { marca: 'Inpot', pessoa: null },
]
const m = (l: L) => l.marca
const p = (l: L) => l.pessoa

describe('filtrarPorGraficos', () => {
  it('sem filtro devolve a mesma lista', () => {
    expect(filtrarPorGraficos(itens, FILTRO_GRAFICOS_VAZIO, m, p)).toBe(itens)
  })
  it('cruza marca e pessoa', () => {
    expect(filtrarPorGraficos(itens, { marca: ['Eletrovias'], pessoa: ['Xayane'] }, m, p)).toEqual([itens[1]])
  })
  it('ignorar deixa o próprio campo de fora (gráfico estilo Excel)', () => {
    const f = { marca: ['Inpot'], pessoa: ['Xayane'] }
    expect(filtrarPorGraficos(itens, f, m, p, 'marca')).toEqual([itens[1], itens[2]])
    expect(filtrarPorGraficos(itens, f, m, p, 'pessoa')).toEqual([itens[2], itens[3]])
  })
  it('vários valores (ex.: barra Ex-integrantes junta nomes)', () => {
    expect(filtrarPorGraficos(itens, { marca: [], pessoa: ['Sarah Padilha', 'Xayane'] }, m, p)).toHaveLength(3)
  })
})
