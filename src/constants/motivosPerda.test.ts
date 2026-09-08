import { describe, it, expect } from 'vitest'
import { classificarMotivo } from '@/constants/motivosPerda'

describe('classificarMotivo', () => {
  it('classifica motivo de processo, ignorando acento e caixa', () => {
    expect(classificarMotivo('Atingiu o fim da cadência')).toBe('processo')
    expect(classificarMotivo('atingiu o fim da cadencia')).toBe('processo')
    expect(classificarMotivo('ATINGIU O FIM DA CADÊNCIA')).toBe('processo')
  })

  it('classifica motivo de mercado mesmo com espaçamento diferente ao redor da barra', () => {
    expect(classificarMotivo('Sem budget / momento')).toBe('mercado')
    expect(classificarMotivo('Sem budget/momento')).toBe('mercado')
  })

  it('remove o prefixo [NOVO] (com ou sem espaço extra) antes de classificar', () => {
    expect(classificarMotivo('[NOVO] Sem perfil (fora do ICP)')).toBe('mercado')
    expect(classificarMotivo('[novo]   Teste')).toBe('ignorar')
  })

  it('motivo não catalogado retorna null, não quebra em entrada vazia', () => {
    expect(classificarMotivo('Registro de teste - apagar')).toBeNull()
    expect(classificarMotivo(null)).toBeNull()
    expect(classificarMotivo(undefined)).toBeNull()
    expect(classificarMotivo('')).toBeNull()
  })
})
