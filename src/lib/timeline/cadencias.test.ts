import { describe, expect, it } from 'vitest'
import { momentosDeCadencias, type CadenciaRow } from './cadencias'

const row = (p: Partial<CadenciaRow>): CadenciaRow => ({
  id: 'exec:1:entrada', id_deal: 'd1', tipo: 'entrada', instante: '2026-10-17T10:54:00Z',
  cadencia_nome: 'SDR - Tentativa de Contato (21 dias)', detalhe: 'entrada', status: 'encerrada', ciclo: 1, ...p,
})

describe('momentosDeCadencias', () => {
  it('entrada e saída viram momentos de cadência, com o motivo legível', () => {
    const [e, s] = momentosDeCadencias([row({}), row({ id: 'exec:1:saida', tipo: 'saida', instante: '2026-10-19T12:01:00Z', detalhe: 'saiu_da_etapa' })])
    expect([e.tipo, e.titulo, e.detalhe]).toEqual(['cadencia', 'Entrou na cadência', 'SDR - Tentativa de Contato (21 dias)'])
    expect([s.titulo, s.detalhe]).toEqual(['Saiu da cadência', 'SDR - Tentativa de Contato (21 dias) · saiu da etapa'])
  })
  it('WhatsApp automático: só enviado e erro aparecem', () => {
    const ms = momentosDeCadencias([
      row({ id: 'disparo:1', tipo: 'disparo', detalhe: 'm1', status: 'enviado' }),
      row({ id: 'disparo:2', tipo: 'disparo', detalhe: 'm2', status: 'pulado' }),
      row({ id: 'disparo:3', tipo: 'disparo', detalhe: 'm3', status: 'erro' }),
    ])
    expect(ms.map(m => m.titulo)).toEqual(['WhatsApp automático enviado', 'WhatsApp automático falhou'])
    expect(ms[0].detalhe).toBe('mensagem m1 · SDR - Tentativa de Contato (21 dias)')
  })
  it('instante vazio ou inválido é descartado', () => {
    expect(momentosDeCadencias([row({ instante: null }), row({ instante: 'xx' })])).toEqual([])
  })
})
