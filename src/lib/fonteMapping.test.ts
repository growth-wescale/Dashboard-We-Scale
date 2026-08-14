import { describe, it, expect } from 'vitest'
import { SUB_FONTE_GRUPOS, normalizeSubFonte } from '@/lib/fonteMapping'

describe('normalizeSubFonte', () => {
  it('agrupa todas as variantes de Meta', () => {
    for (const raw of ['meta', 'ig', 'facebook', 'instagram', 'fb', 'Meta', 'IG']) {
      expect(normalizeSubFonte(raw)).toBe('Meta')
    }
  })

  it('agrupa Google e adwords', () => {
    expect(normalizeSubFonte('google')).toBe('Google')
    expect(normalizeSubFonte('adwords')).toBe('Google')
  })

  it('agrupa evento e qrcode', () => {
    expect(normalizeSubFonte('evento')).toBe('Evento')
    expect(normalizeSubFonte('lp-evento')).toBe('Evento')
    expect(normalizeSubFonte('qrcode')).toBe('Evento')
  })

  it('trata vazio e nulo como Não identificado', () => {
    expect(normalizeSubFonte(null)).toBe('Não identificado')
    expect(normalizeSubFonte('')).toBe('Não identificado')
    expect(normalizeSubFonte('   ')).toBe('Não identificado')
  })

  it('trata template de UTM não substituído como Não identificado', () => {
    // Vem assim do Meta quando a macro não resolve.
    expect(normalizeSubFonte('{{site_source_name}}')).toBe('Não identificado')
  })

  it('joga valor desconhecido em Outros, sem descartar', () => {
    expect(normalizeSubFonte('portaldofranchising')).toBe('Outros')
    expect(normalizeSubFonte('chatgpt.com')).toBe('Outros')
  })

  it('ignora espaços em volta e diferença de caixa', () => {
    expect(normalizeSubFonte('  GOOGLE  ')).toBe('Google')
  })

  it('expõe a lista de grupos para montar o filtro', () => {
    expect(SUB_FONTE_GRUPOS).toContain('Meta')
    expect(SUB_FONTE_GRUPOS).toContain('Não identificado')
    // 'Outros' e 'Não identificado' devem ser os últimos, por serem cestos.
    expect(SUB_FONTE_GRUPOS.slice(-2)).toEqual(['Outros', 'Não identificado'])
  })
})
