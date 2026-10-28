import { describe, expect, it } from 'vitest'
import { etapasDoProcesso } from './regrasProcesso'

describe('etapasDoProcesso', () => {
  it('usa os números da configuração', () => {
    const e = etapasDoProcesso([
      { chave: 'janela_dedup_min', valor: '15' },
      { chave: 'retries_rd', valor: '1' },
      { chave: 'alerta_silencio_horas', valor: '4' },
    ])
    const texto = JSON.stringify(e)
    expect(e[1].titulo).toBe('Bloqueio de reenvio (15 minutos)')
    expect(texto).toContain('em menos de 15 minutos')
    expect(texto).toContain('repete até 1 vez.')
    expect(texto).toContain('há mais de 4 horas')
  })
  it('sem configuração cai nos padrões', () => {
    const e = etapasDoProcesso([])
    expect(e[1].titulo).toBe('Bloqueio de reenvio (10 minutos)')
    expect(JSON.stringify(e)).toContain('repete até 3 vezes')
  })
  it('descreve a regra do lead com deal aberto', () => {
    const passo = etapasDoProcesso([]).find(p => p.titulo === 'Lead que já tem deal aberto')!
    expect(passo.itens.join(' ')).toContain('E-mail, Telefone ou E-mail e Telefone')
  })
})
