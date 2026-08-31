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

  it('sem utm_source, usa o campo "Sub-Fonte" do RD CRM cru', () => {
    expect(normalizeSubFonte(null, 'Feira de Franquias 2026')).toBe('Feira de Franquias 2026')
    expect(normalizeSubFonte('', 'Busca Orgânica')).toBe('Busca Orgânica')
    expect(normalizeSubFonte('  ', '  SBC Repasse  ')).toBe('SBC Repasse')
    // Template de UTM não resolvido também dispara o fallback.
    expect(normalizeSubFonte('{{site_source_name}}', 'Lista Oral Unic David')).toBe('Lista Oral Unic David')
  })

  it('com utm_source resolvível, ignora o campo do RD CRM', () => {
    expect(normalizeSubFonte('meta', 'Feira de Franquias 2026')).toBe('Meta')
    expect(normalizeSubFonte('portaldofranchising', 'Busca Orgânica')).toBe('Outros')
  })

  it('sem utm_source e sem campo do RD CRM, continua Não identificado', () => {
    expect(normalizeSubFonte(null, null)).toBe('Não identificado')
    expect(normalizeSubFonte('', '   ')).toBe('Não identificado')
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
