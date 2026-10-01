import { describe, it, expect } from 'vitest'
import {
  diaDaCampanha,
  emJanelas,
  fatorMetaCloser,
  fatorMetaSdr,
  janelaLabel,
  janelasDasVoltas,
  mesAtualCampanha,
  mesesDaCampanha,
  montarCampanha,
  pctDecorridoJanela,
  voltaDoDia,
} from './metasCampanhaF1'

const SET = montarCampanha('2026-09-01')
// Semanas que o Junior configurou pra outubro (virada na terça), como ficam em meta_semana.
const SEMANAS_OUT = [
  { numero: 1, inicio: '2026-10-01', fim: '2026-10-05' },
  { numero: 2, inicio: '2026-10-06', fim: '2026-10-12' },
  { numero: 3, inicio: '2026-10-13', fim: '2026-10-19' },
  { numero: 4, inicio: '2026-10-20', fim: '2026-10-26' },
  { numero: 5, inicio: '2026-10-27', fim: '2026-10-31' },
]
const OUT = montarCampanha('2026-10-01', SEMANAS_OUT)

describe('montarCampanha', () => {
  it('setembro mantém as 4 voltas que a campanha usou, mesmo com semanas da meta', () => {
    const s = montarCampanha('2026-09-01', SEMANAS_OUT)
    expect(s.rotulo).toBe('Setembro 2026')
    expect(s.diasMes).toBe(30)
    expect(s.voltas.map(v => v.label)).toEqual(['Volta 1 · 1–7 set', 'Volta 2 · 8–14 set', 'Volta 3 · 15–21 set', 'Volta 4 · 22–30 set'])
  })

  it('de outubro em diante, as voltas são as semanas da Configuração das Metas', () => {
    expect(OUT.rotulo).toBe('Outubro 2026')
    expect(OUT.diasMes).toBe(31)
    expect(OUT.voltas.map(v => v.label)).toEqual([
      'Volta 1 · 1–5 out', 'Volta 2 · 6–12 out', 'Volta 3 · 13–19 out', 'Volta 4 · 20–26 out', 'Volta 5 · 27–31 out',
    ])
    expect(OUT.voltas.reduce((s, v) => s + v.fracaoDias, 0)).toBeCloseTo(1, 10)
  })

  it('mês sem meta publicada usa semanas com virada na terça', () => {
    const nov = montarCampanha('2026-11-01')
    expect(nov.voltas[0]).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-02' })
    expect(nov.voltas.at(-1)!.fim).toBe('2026-11-30')
  })
})

describe('meses da campanha', () => {
  it('vai de setembro/2026 até o mês atual', () => {
    expect(mesesDaCampanha(new Date(2026, 9, 1))).toEqual(['2026-09-01', '2026-10-01'])
    expect(mesesDaCampanha(new Date(2026, 7, 20))).toEqual(['2026-09-01'])
  })
  it('mês atual nunca antes de setembro', () => {
    expect(mesAtualCampanha(new Date(2026, 9, 15))).toBe('2026-10-01')
    expect(mesAtualCampanha(new Date(2026, 6, 15))).toBe('2026-09-01')
  })
})

describe('fatorMetaCloser', () => {
  it('setembro usa a forma da planilha por closer', () => {
    expect(fatorMetaCloser(SET, 'Douglas', [2])).toBeCloseTo(0.4)
    expect(fatorMetaCloser(SET, 'Aurélio Briano', [1, 2])).toBeCloseTo(0.375)
    expect(fatorMetaCloser(SET, 'Douglas', [1, 2, 3, 4])).toBeCloseTo(1)
  })
  it('depois de setembro usa a distribuição semanal das vendas, quando existe', () => {
    const fracoes = new Map([['Paula Marinheiro', [0, 0.5, 0, 0.5, 0]]])
    expect(fatorMetaCloser(OUT, 'Paula Marinheiro', [2], fracoes)).toBeCloseTo(0.5)
    expect(fatorMetaCloser(OUT, 'Paula Marinheiro', [1, 3], fracoes)).toBe(0)
  })
  it('sem distribuição semanal, rateia pelos dias da volta', () => {
    expect(fatorMetaCloser(OUT, 'Bruna', [1])).toBeCloseTo(5 / 31)
    expect(fatorMetaCloser(SET, 'Paula Marinheiro', [4])).toBeCloseTo(9 / 30)
  })
})

describe('fatorMetaSdr', () => {
  it('rateia pelos dias das voltas do mês', () => {
    expect(fatorMetaSdr(SET, [4])).toBeCloseTo(9 / 30)
    expect(fatorMetaSdr(OUT, [2, 3])).toBeCloseTo(14 / 31)
  })
})

describe('emJanelas', () => {
  const janelas = janelasDasVoltas(SET, [1, 3])
  it('dentro, fora e união com buraco', () => {
    expect(emJanelas('2026-09-03T10:00:00-03:00', janelas)).toBe(true)
    expect(emJanelas('2026-09-10', janelas)).toBe(false)
    expect(emJanelas('2026-09-16', janelas)).toBe(true)
  })
  it('sem janelas = sem recorte; data nula com janela = fora', () => {
    expect(emJanelas('2026-09-10', undefined)).toBe(true)
    expect(emJanelas(null, janelas)).toBe(false)
  })
})

describe('janelaLabel', () => {
  it('mensal, uma, contíguas e não-contíguas', () => {
    expect(janelaLabel(OUT, 'mensal', [1])).toBe('Outubro 2026')
    expect(janelaLabel(OUT, 'semanal', [2])).toBe('Volta 2 · 6–12 out')
    expect(janelaLabel(OUT, 'semanal', [2, 3])).toBe('Voltas 2–3 · 6–19 out')
    expect(janelaLabel(OUT, 'semanal', [1, 5])).toBe('Voltas 1, 5')
  })
})

describe('pctDecorridoJanela', () => {
  it('passado, futuro, em curso e mensal', () => {
    expect(pctDecorridoJanela(OUT, 'semanal', [1], 10)).toBe(100)
    expect(pctDecorridoJanela(OUT, 'semanal', [5], 10)).toBe(0)
    expect(pctDecorridoJanela(OUT, 'semanal', [2], 8)).toBeCloseTo((3 / 7) * 100)
    expect(pctDecorridoJanela(OUT, 'mensal', [2], 31)).toBe(100)
  })
})

describe('diaDaCampanha / voltaDoDia', () => {
  it('dia dentro do mês, 0 antes e o último dia depois', () => {
    expect(diaDaCampanha(OUT, new Date(2026, 9, 14))).toBe(14)
    expect(diaDaCampanha(OUT, new Date(2026, 8, 30))).toBe(0)
    expect(diaDaCampanha(SET, new Date(2026, 9, 1))).toBe(30)
  })
  it('volta pelos limites das voltas do mês', () => {
    expect(voltaDoDia(OUT, 0)).toBe(1)
    expect(voltaDoDia(OUT, 6)).toBe(2)
    expect(voltaDoDia(OUT, 31)).toBe(5)
    expect(voltaDoDia(SET, 30)).toBe(4)
  })
})
