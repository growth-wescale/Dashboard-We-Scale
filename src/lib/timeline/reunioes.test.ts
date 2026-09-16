import { describe, it, expect } from 'vitest'
import { momentosDeReunioes, type ReuniaoRow } from '@/lib/timeline/reunioes'

const r = (over: Partial<ReuniaoRow>): ReuniaoRow => ({
  id: 11202379, title: 'R3 Viva - William', url: 'https://app.meetrox.ai/721/calls/11202379',
  call_timestamp: '2026-09-15T20:00:00Z', call_type_name: '🟤 [Sales] - Geomarketing - R3',
  user_name: 'Douglas', duration_minutes: 76.2222, ai_score: 0.75, scorecard_name: 'R3',
  summary: { 'Objetivo da conversa': ['Apresentar o modelo.', 'Validar pontos.'], 'Vazia': [] },
  scorecard_answers: [{ answer: 'yes', category_name: 'Rapport', question_text: 'Tom positivo' }],
  attendees: ['a@x.com', 'b@y.com'], id_deal: null, crm_deal_id: 'd1', has_summary: true, has_scorecard: true,
  ...over,
})

describe('momentosDeReunioes', () => {
  it('reunião vira momento com nota ×10, duração inteira e resumo em seções (sem seção vazia)', () => {
    const [m] = momentosDeReunioes([r({})])
    expect(m.id).toBe('reuniao:11202379')
    expect(m.idDeal).toBe('d1')
    expect(m.tipo).toBe('reuniao')
    expect(m.titulo).toBe('R3 Viva - William')
    expect(m.meta).toMatchObject({ kind: 'reuniao', notaIA: 7.5, duracaoMin: 76, scorecard: 'R3', url: 'https://app.meetrox.ai/721/calls/11202379' })
    expect((m.meta as { resumo: unknown[] }).resumo).toEqual([{ titulo: 'Objetivo da conversa', itens: ['Apresentar o modelo.', 'Validar pontos.'] }])
    expect((m.meta as { respostas: unknown[] }).respostas).toEqual([{ categoria: 'Rapport', pergunta: 'Tom positivo', resposta: 'yes' }])
  })

  it('id_deal tem prioridade sobre crm_deal_id; sem os dois, descarta', () => {
    const ms = momentosDeReunioes([r({ id: 1, id_deal: 'x9', crm_deal_id: 'd1' }), r({ id: 2, id_deal: null, crm_deal_id: null })])
    expect(ms).toHaveLength(1)
    expect(ms[0].idDeal).toBe('x9')
  })

  it('sem nota, sem resumo e sem scorecard não quebra', () => {
    const [m] = momentosDeReunioes([r({ ai_score: null, summary: null, scorecard_answers: null, duration_minutes: null, attendees: null })])
    expect(m.meta).toMatchObject({ notaIA: null, duracaoMin: null, resumo: [], respostas: [], participantes: [] })
  })
})
