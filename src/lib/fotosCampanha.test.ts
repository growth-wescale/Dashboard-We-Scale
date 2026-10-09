import { describe, expect, it } from 'vitest'
import { fotoCampanha } from './fotosCampanha'

describe('fotos exclusivas da campanha', () => {
  it.each([
    ['Bruna', 'bruna'], ['Douglas', 'douglas'],
    ['Paula Marinheiro', 'paula'],
    ['Jéssica', 'jessica'], ['Sarah Padilha', 'sarah'],
    ['Thiago', 'thiago'], ['Xayane', 'xayane'],
  ])('associa %s à foto aprovada', (nome, arquivo) => {
    expect(fotoCampanha(nome, '/anterior.png')).toBe(`/assets/campanha-ufc/${arquivo}.png`)
  })
  it('preserva os demais cadastros sem imagem aprovada', () => {
    expect(fotoCampanha('Aurélio Briano', '/aurelio.png')).toBe('/aurelio.png')
    expect(fotoCampanha('Outro')).toBeUndefined()
  })
})
