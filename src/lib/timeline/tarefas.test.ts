import { describe, it, expect } from 'vitest'
import { momentosDeTarefas, type TarefaRow } from '@/lib/timeline/tarefas'

const AGORA = new Date('2026-08-20T12:00:00Z')
const t = (over: Partial<TarefaRow>): TarefaRow => ({
  task_id: 't1', subject: 'Ligacao 2 - Viva', type: 'call', notes: 'Tarefa da cadencia', done: true,
  status_calc: 'concluida_no_prazo', prazo: '2026-08-08T18:00:00Z', done_date: '2026-08-08T10:22:00Z',
  user_name: 'Xayane', deal_id: 'd1', ...over,
})

describe('momentosDeTarefas', () => {
  it('tarefa concluída usa done_date como instante e não é atrasada', () => {
    const [m] = momentosDeTarefas([t({})], AGORA)
    expect(m.tipo).toBe('tarefa')
    expect(m.id).toBe('tarefa:t1')
    expect(m.instante.toISOString()).toBe('2026-08-08T10:22:00.000Z')
    expect(m.ator).toBe('Xayane')
    expect(m.titulo).toBe('Ligacao 2 - Viva')
    expect(m.meta).toMatchObject({ kind: 'tarefa', tipoTarefa: 'call', concluida: true, atrasada: false, atrasoDias: null })
  })

  it('concluída atrasada mede o atraso entre prazo e conclusão', () => {
    const [m] = momentosDeTarefas([t({ status_calc: 'concluida_atrasada', prazo: '2026-08-06T18:00:00Z', done_date: '2026-08-08T18:00:00Z' })], AGORA)
    expect(m.meta).toMatchObject({ atrasada: true, atrasoDias: 2 })
  })

  it('aberta e atrasada usa o prazo como instante e mede atraso até agora', () => {
    const [m] = momentosDeTarefas([t({ done: false, done_date: null, status_calc: 'atrasada', prazo: '2026-08-18T12:00:00Z' })], AGORA)
    expect(m.instante.toISOString()).toBe('2026-08-18T12:00:00.000Z')
    expect(m.meta).toMatchObject({ concluida: false, atrasada: true, atrasoDias: 2 })
  })

  it('tipo desconhecido vira outro; sem prazo nem conclusão é descartada', () => {
    const ms = momentosDeTarefas([
      t({ task_id: 'a', type: 'visita' }),
      t({ task_id: 'b', prazo: null, done_date: null }),
    ], AGORA)
    expect(ms).toHaveLength(1)
    expect(ms[0].meta).toMatchObject({ tipoTarefa: 'outro' })
  })
})
