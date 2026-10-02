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

describe('catálogo unificado de 22/09/2026', () => {
  it('classifica os motivos renomeados no RD', () => {
    expect(classificarMotivo('[NOVO] Nunca respondeu')).toBe('processo')
    expect(classificarMotivo('[NOVO] No-show sem retorno')).toBe('processo')
    expect(classificarMotivo('[NOVO] Erro na lista de prospecção')).toBe('processo')
    expect(classificarMotivo('[NOVO] Sem contato com a persona principal')).toBe('processo')
    expect(classificarMotivo('[NOVO] Timing - sem previsão')).toBe('mercado')
    expect(classificarMotivo('[NOVO] Timing - até 6 meses')).toBe('mercado')
    expect(classificarMotivo('[NOVO] Escolheu outra franqueadora')).toBe('mercado')
    expect(classificarMotivo('[NOVO] Não aceitou condições comerciais')).toBe('mercado')
    expect(classificarMotivo('[NOVO] Benchmark / apenas pesquisando')).toBe('mercado')
    expect(classificarMotivo('[NOVO] Teste / registro interno')).toBe('ignorar')
    expect(classificarMotivo('[NOVO] Registro legado (migração)')).toBe('ignorar')
  })

  it('mantém os nomes antigos reconhecidos enquanto o espelho não sincroniza', () => {
    expect(classificarMotivo('Sem contato apos cadencia SDR')).toBe('processo')
    expect(classificarMotivo('[NJ] Lead atingiu o fim da cadência')).toBe('processo')
    expect(classificarMotivo('Momento atual até 6 meses')).toBe('mercado')
  })

  it('as 4 faixas de budget contam como mercado', () => {
    for (const f of ['50k', '100k', '200k', '300k']) {
      expect(classificarMotivo(`[NOVO] Sem Budget - Até ${f}`)).toBe('mercado')
    }
  })
})

describe('lista fixa de 02/10/2026', () => {
  it('classifica os 32 motivos sem o prefixo [NOVO]', () => {
    expect(classificarMotivo('Fim da cadência sem resposta')).toBe('processo')
    expect(classificarMotivo('Não chegou ao decisor')).toBe('processo')
    expect(classificarMotivo('Desmarcou antes da reunião')).toBe('processo')
    expect(classificarMotivo('Não era MQL')).toBe('processo')
    expect(classificarMotivo('Fora do perfil (ICP)')).toBe('mercado')
    expect(classificarMotivo('Sem interesse')).toBe('mercado')
    expect(classificarMotivo('Buscava outro modelo de negócio')).toBe('mercado')
    expect(classificarMotivo('Sem Budget - até R$ 200 mil')).toBe('mercado')
    expect(classificarMotivo('Sem liquidez no momento')).toBe('mercado')
    expect(classificarMotivo('Optou por outra franqueadora')).toBe('mercado')
    expect(classificarMotivo('Reprovado na análise da franqueadora')).toBe('mercado')
    expect(classificarMotivo('Registro de teste')).toBe('ignorar')
    expect(classificarMotivo('Base migrada de outro CRM')).toBe('ignorar')
  })

  it('ainda reconhece os nomes anteriores, caso algum evento escape', () => {
    expect(classificarMotivo('[NOVO] Atingiu o fim da cadência')).toBe('processo')
    expect(classificarMotivo('Sem contato apos cadencia SDR')).toBe('processo')
    expect(classificarMotivo('[NOVO] Sem perfil (fora do ICP)')).toBe('mercado')
  })
})
