import { describe, expect, it } from 'vitest'
import { RELATORIOS_METABASE, urlColecao, urlRelatorio } from './relatoriosMetabase'

describe('relatórios do Metabase', () => {
  it('monta o link do painel e da aba no formato do Metabase', () => {
    expect(urlRelatorio(8)).toBe('https://metabase.wescale.com.br/dashboard/8')
    expect(urlRelatorio(8, { id: 50, nome: 'Perdas e detalhe' }))
      .toBe('https://metabase.wescale.com.br/dashboard/8?tab=50-perdas-e-detalhe')
    expect(urlRelatorio(8, { id: 48, nome: 'Pré-vendas' }))
      .toBe('https://metabase.wescale.com.br/dashboard/8?tab=48-pre-vendas')
    expect(urlColecao(34)).toBe('https://metabase.wescale.com.br/collection/34')
  })

  it('não repete painel nem aba', () => {
    const ids = RELATORIOS_METABASE.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const abas = RELATORIOS_METABASE.flatMap(r => r.abas.map(a => a.id))
    expect(new Set(abas).size).toBe(abas.length)
  })

  it('tem data de atualização válida em todos', () => {
    for (const r of RELATORIOS_METABASE) expect(r.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
