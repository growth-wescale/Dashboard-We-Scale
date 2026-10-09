import { describe, expect, it } from 'vitest'
import { fotoCampanha } from './fotosCampanha'

describe('fotos exclusivas da campanha', () => {
  it.each([
    ['Paula Marinheiro', 'paula'],
    ['Jéssica', 'jessica'], ['Sarah Padilha', 'sarah'],
    ['Thiago', 'thiago'], ['Xayane', 'xayane'],
  ])('associa %s à foto aprovada', (nome, arquivo) => {
    expect(fotoCampanha(nome, '/anterior.png')).toBe(`/assets/campanha-ufc/${arquivo}.png`)
  })
  it('preserva os demais cadastros sem imagem aprovada', () => {
    expect(fotoCampanha('Douglas', '/douglas.png')).toBe('/douglas.png')
    expect(fotoCampanha('Outro')).toBeUndefined()
  })
})
