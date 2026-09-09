import { describe, it, expect } from 'vitest'
import {
  fatorMetaCloser,
  fatorMetaSdr,
  emJanelas,
  janelasDasVoltas,
  janelaLabel,
  pctDecorridoJanela,
} from './metasCampanhaF1'

describe('fatorMetaCloser', () => {
  it('usa a forma da planilha por closer', () => {
    expect(fatorMetaCloser('Aurélio Briano', [3])).toBeCloseTo(0.375, 5)
    expect(fatorMetaCloser('Douglas', [2])).toBeCloseTo(0.4, 5)
    expect(fatorMetaCloser('Douglas', [1, 2])).toBeCloseTo(0.6, 5)
  })
  it('somando as 4 voltas dá a meta mensal cheia (fator 1)', () => {
    for (const nome of ['Douglas', 'Jéssica', 'Bruna', 'Aurélio Briano']) {
      expect(fatorMetaCloser(nome, [1, 2, 3, 4])).toBeCloseTo(1, 5)
    }
  })
  it('closer sem forma na planilha cai no rateio por dias', () => {
    expect(fatorMetaCloser('Fulano', [1])).toBeCloseTo(7 / 30, 5)
    expect(fatorMetaCloser('Fulano', [1, 2, 3, 4])).toBeCloseTo(1, 5)
  })
})

describe('fatorMetaSdr', () => {
  it('rateia por dias da volta', () => {
    expect(fatorMetaSdr([1])).toBeCloseTo(7 / 30, 5)
    expect(fatorMetaSdr([4])).toBeCloseTo(9 / 30, 5)
    expect(fatorMetaSdr([1, 2, 3, 4])).toBeCloseTo(1, 5)
  })
})

describe('emJanelas', () => {
  const j = janelasDasVoltas([2]) // 8–14 set
  it('data dentro da janela', () => {
    expect(emJanelas('2026-09-10T13:00:00Z', j)).toBe(true)
  })
  it('data fora da janela', () => {
    expect(emJanelas('2026-09-03T13:00:00Z', j)).toBe(false)
    expect(emJanelas('2026-09-20T13:00:00Z', j)).toBe(false)
  })
  it('sem janelas = sem recorte', () => {
    expect(emJanelas('2026-09-03T13:00:00Z', undefined)).toBe(true)
    expect(emJanelas('2026-09-03T13:00:00Z', [])).toBe(true)
  })
  it('data nula com janela ativa → fora', () => {
    expect(emJanelas(null, j)).toBe(false)
  })
  it('união de voltas não-contíguas mantém o buraco de fora', () => {
    const u = janelasDasVoltas([1, 3]) // 1–7 e 15–21, sem a semana do meio
    expect(emJanelas('2026-09-05T13:00:00Z', u)).toBe(true)
    expect(emJanelas('2026-09-18T13:00:00Z', u)).toBe(true)
    expect(emJanelas('2026-09-10T13:00:00Z', u)).toBe(false)
  })
})

describe('janelaLabel', () => {
  it('mensal', () => {
    expect(janelaLabel('mensal', [2])).toBe('Setembro 2026')
  })
  it('uma volta', () => {
    expect(janelaLabel('semanal', [2])).toBe('Volta 2 · 8–14 set')
  })
  it('voltas contíguas', () => {
    expect(janelaLabel('semanal', [1, 2, 3])).toBe('Voltas 1–3 · 1–21 set')
  })
  it('voltas não-contíguas', () => {
    expect(janelaLabel('semanal', [1, 3])).toBe('Voltas 1, 3')
  })
})

describe('pctDecorridoJanela', () => {
  it('volta inteira no passado → 100%', () => {
    expect(pctDecorridoJanela('semanal', [1], 9)).toBe(100)
  })
  it('volta inteira no futuro → 0%', () => {
    expect(pctDecorridoJanela('semanal', [3], 9)).toBe(0)
  })
  it('volta em curso → proporção dos dias', () => {
    // volta 2 = dias 8–14 (7 dias); hoje dia 9 → 2 dias decorridos
    expect(pctDecorridoJanela('semanal', [2], 9)).toBeCloseTo((2 / 7) * 100, 5)
  })
  it('mensal ignora a seleção e usa o mês todo', () => {
    expect(pctDecorridoJanela('mensal', [1], 15)).toBeCloseTo((15 / 30) * 100, 5)
  })
})
