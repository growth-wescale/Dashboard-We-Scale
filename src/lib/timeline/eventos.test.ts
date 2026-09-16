import { describe, it, expect } from 'vitest'
import { momentosDeEventos, type DealEventoRow } from '@/lib/timeline/eventos'

const ev = (over: Partial<DealEventoRow>): DealEventoRow => ({
  id_evento: 1, id_deal: 'd1', tipo_evento: 'mudanca_etapa', nome_funil: 'SDR',
  id_etapa: 'e1', nome_etapa: 'Novo MQL', nome_etapa_anterior: null, responsavel: 'Xayane',
  valor_anterior: null, valor_novo: null, data_evento: '2026-08-06T12:00:00Z',
  motivo_perda: null, anotacao_perda: null, ...over,
})

describe('momentosDeEventos', () => {
  it('mudança de etapa conhecida vira etapa resolvida com rótulo do catálogo', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'Negociação SAL (7 dias)' })])
    expect(m.tipo).toBe('etapa')
    expect(m.etapa).toBe('SAL')
    expect(m.titulo).toBe('SAL')
    expect(m.etapaCrua).toBeUndefined()
    expect(m.ator).toBe('Xayane')
    expect(m.id).toBe('evento:1')
  })

  it('etapa crua desconhecida não some: vira nó cinza com o nome cru', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'Pré-Contrato enviado' })])
    expect(m.tipo).toBe('etapa')
    expect(m.etapa).toBeNull()
    expect(m.etapaCrua).toBe('Pré-Contrato enviado')
    expect(m.titulo).toBe('Pré-Contrato enviado')
  })

  it('No Show vira tipo no_show', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'No Show' })])
    expect(m.tipo).toBe('no_show')
    expect(m.etapa).toBe('No Show')
  })

  it('perda, ganho, retomada, troca, funil e campo', () => {
    const ms = momentosDeEventos([
      ev({ id_evento: 2, tipo_evento: 'perda', motivo_perda: 'Sem budget', anotacao_perda: 'x' }),
      ev({ id_evento: 3, tipo_evento: 'ganho' }),
      ev({ id_evento: 4, tipo_evento: 'deal_retomado' }),
      ev({ id_evento: 5, tipo_evento: 'troca_responsavel', valor_anterior: 'Sarah', valor_novo: 'Thiago' }),
      ev({ id_evento: 6, tipo_evento: 'mudanca_funil', valor_anterior: 'SDR', valor_novo: 'Closer' }),
      ev({ id_evento: 7, tipo_evento: 'mudanca_fonte_macro', valor_anterior: null, valor_novo: 'Inbound' }),
    ])
    expect(ms.map(m => m.tipo)).toEqual(['perda', 'ganho', 'retomada', 'troca_responsavel', 'mudanca_funil', 'mudanca_campo'])
    expect(ms[0].meta).toEqual({ kind: 'perda', motivo: 'Sem budget', anotacao: 'x' })
    expect(ms[3].detalhe).toBe('Sarah → Thiago')
    expect(ms[5].titulo).toBe('Fonte Macro alterada')
    expect(ms[5].detalhe).toBe('— → Inbound')
  })

  it('descarta deal_deletado, tipo desconhecido e data inválida', () => {
    const ms = momentosDeEventos([
      ev({ id_evento: 8, tipo_evento: 'deal_deletado' }),
      ev({ id_evento: 9, tipo_evento: 'algo_novo' }),
      ev({ id_evento: 10, data_evento: 'não é data' }),
    ])
    expect(ms).toEqual([])
  })
})
