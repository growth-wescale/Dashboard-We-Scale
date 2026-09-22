import { describe, it, expect } from 'vitest'
import { montarTimeline } from '@/lib/timeline/montar'
import type { MomentoBruto, DealCabecalho } from '@/lib/timeline/tipos'
import type { StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-09-02T12:00:00Z')
const d = (iso: string) => new Date(iso)
let seq = 0
const etapa = (iso: string, e: StageKey | null, over: Partial<MomentoBruto> = {}): MomentoBruto => ({
  id: `evento:${++seq}`, idDeal: 'd1', instante: d(iso), tipo: e === 'No Show' ? 'no_show' : 'etapa',
  etapa: e, etapaCrua: e ? undefined : 'Etapa X', ator: 'Xayane', titulo: e ?? 'Etapa X',
  meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: null }, ...over,
})
const tarefa = (iso: string, atrasada = false): MomentoBruto => ({
  id: `tarefa:${++seq}`, idDeal: 'd1', instante: d(iso), tipo: 'tarefa', ator: 'Xayane', titulo: 'Ligação',
  meta: { kind: 'tarefa', tipoTarefa: 'call', status: atrasada ? 'concluida_atrasada' : 'concluida_no_prazo', concluida: true, atrasada, prazo: null, feitaEm: iso, atrasoDias: atrasada ? 1 : null, assunto: 'Ligação', notas: null },
})
const simples = (iso: string, tipo: MomentoBruto['tipo'], titulo: string, over: Partial<MomentoBruto> = {}): MomentoBruto =>
  ({ id: `evento:${++seq}`, idDeal: 'd1', instante: d(iso), tipo, ator: 'Jéssica', titulo, ...over })
const cab = (status: FunnelRow['status_atual'], over: Partial<FunnelRow> = {}): DealCabecalho => {
  const row = { id_lead: 'd1', ciclo: 1, status_atual: status, data_novo_mql: '2026-08-06T12:00:00Z', data_venda: null, ...over } as FunnelRow
  return { row, ciclos: [row] }
}

describe('montarTimeline', () => {
  it('ordena, monta nós, trechos com toques e fases por camada; em andamento termina agora', () => {
    const tl = montarTimeline([
      tarefa('2026-08-07T10:00:00Z'), tarefa('2026-08-08T10:00:00Z', true),
      etapa('2026-08-09T12:00:00Z', 'Contato Efetivo'),
      etapa('2026-08-06T12:00:00Z', 'MQL'),
      etapa('2026-08-07T09:00:00Z', 'Tentando Contato'),
      etapa('2026-08-18T12:00:00Z', 'Diagnóstico', { ator: 'Jéssica' }),
      tarefa('2026-08-20T10:00:00Z'),
    ], cab('Em andamento'), AGORA)

    expect(tl.nos.map(n => n.etapa)).toEqual(['MQL', 'Tentando Contato', 'Contato Efetivo', 'Diagnóstico'])
    expect(tl.nos.map(n => n.camada)).toEqual(['MQL', 'SDR', 'SDR', 'Closer'])
    expect(tl.desfecho.tipo).toBe('em_andamento')
    expect(tl.fim).toEqual(AGORA)
    // trechos: MQL→TC, TC→CE (2 toques, 1 atrasado), CE→Diag, Diag→fim (1 toque)
    expect(tl.trechos.map(t => [t.toques, t.atrasados])).toEqual([[0, 0], [2, 1], [0, 0], [1, 0]])
    expect(tl.trechos[3].ateId).toBeNull()
    expect(tl.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(tl.fases[1].ator).toBe('Xayane')
    expect(tl.fases[2].ator).toBe('Jéssica')
    expect(tl.fases[1].duracaoDias).toBeCloseTo(11.13, 1)
    expect(tl.totais).toMatchObject({ toques: 3, atrasados: 1, reunioes: 0 })
  })

  it('funde o handoff SDR→Closer em Reunião Agendada SQL num nó só', () => {
    const tl = montarTimeline([
      etapa('2026-08-11T11:05:00Z', 'Reunião Agendada SQL', { meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: 'sdr' } }),
      etapa('2026-08-11T11:05:20Z', 'Reunião Agendada SQL', { meta: { kind: 'etapa', etapaAnterior: null, funil: 'Closer', idEtapa: 'closer' } }),
      simples('2026-08-11T11:05:10Z', 'mudanca_funil', 'Mudou de funil', { meta: { kind: 'campo', campo: 'Funil', de: 'SDR', para: 'Closer' } }),
    ], cab('Em andamento'), AGORA)
    expect(tl.nos).toHaveLength(1)
    expect(tl.nos[0].detalhe).toBe('passou pro funil do Closer')
    // handoff normal não é desvio
    expect(tl.momentos.find(m => m.tipo === 'mudanca_funil')?.desvio).toBeUndefined()
  })

  it('NÃO funde repetição da mesma etapa longe no tempo (reentrada real, não handoff)', () => {
    const tl = montarTimeline([
      etapa('2026-08-11T11:05:00Z', 'Diagnóstico'),
      etapa('2026-08-13T11:05:00Z', 'Diagnóstico'), // 2 dias depois: reentrada real, não artefato de handoff
    ], cab('Em andamento'), AGORA)
    expect(tl.nos).toHaveLength(2)
    expect(tl.nos.map(n => n.etapa)).toEqual(['Diagnóstico', 'Diagnóstico'])
  })

  it('marca desvios: voltou, pulou, no_show, trocou_funil, perdeu, reciclou; retomada abre ciclo 2 e fase Reaberto', () => {
    const tl = montarTimeline([
      etapa('2026-08-06T12:00:00Z', 'MQL'),
      etapa('2026-08-07T12:00:00Z', 'Reunião Agendada SQL'),          // pulou (de MQL direto pra SQL)
      etapa('2026-08-08T12:00:00Z', 'No Show'),
      etapa('2026-08-09T12:00:00Z', 'Tentando Contato'),              // voltou
      simples('2026-08-10T12:00:00Z', 'mudanca_funil', 'Mudou de funil', { meta: { kind: 'campo', campo: 'Funil', de: 'SDR', para: 'Prospecção Ativa' } }),
      simples('2026-08-11T12:00:00Z', 'perda', 'Perdido', { meta: { kind: 'perda', motivo: 'Sem interesse', anotacao: null } }),
      simples('2026-08-20T12:00:00Z', 'retomada', 'Reaberto'),
      etapa('2026-08-21T12:00:00Z', 'Contato Efetivo'),
    ], cab('Em andamento', { ciclo: 2 }), AGORA)
    const por = (tipoOuEtapa: string) => tl.momentos.find(m => m.etapa === tipoOuEtapa || m.tipo === tipoOuEtapa)
    expect(por('Reunião Agendada SQL')?.desvio).toBe('pulou')
    expect(por('no_show')?.desvio).toBe('no_show')
    expect(por('Tentando Contato')?.desvio).toBe('voltou')
    expect(por('mudanca_funil')?.desvio).toBe('trocou_funil')
    expect(por('perda')?.desvio).toBe('perdeu')
    expect(por('retomada')?.desvio).toBe('reciclou')
    expect(por('retomada')?.ciclo).toBe(2)
    expect(por('Contato Efetivo')?.ciclo).toBe(2)
    expect(tl.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Reaberto', 'SDR'])
    expect(tl.fases[2].duracaoDias).toBeCloseTo(9, 1)
    // trecho perda→retomada não existe (é a fase Reaberto)
    expect(tl.trechos.some(t => t.deId === por('perda')!.id)).toBe(false)
  })

  it('tarefa registrada durante a janela perda→retomada conta na fase Reaberto, não em nenhum trecho', () => {
    const tl = montarTimeline([
      etapa('2026-08-06T12:00:00Z', 'MQL'),
      simples('2026-08-10T12:00:00Z', 'perda', 'Perdido', { meta: { kind: 'perda', motivo: 'Sem interesse', anotacao: null } }),
      tarefa('2026-08-15T12:00:00Z'), // deal ainda perdido, sem reabrir: cai na janela perda→retomada
      simples('2026-08-20T12:00:00Z', 'retomada', 'Reaberto'),
      etapa('2026-08-21T12:00:00Z', 'Contato Efetivo'),
    ], cab('Em andamento', { ciclo: 2 }), AGORA)
    const reaberto = tl.fases.find(f => f.tipo === 'Reaberto')
    expect(reaberto?.toques).toBe(1)
    expect(tl.trechos.every(t => t.toques === 0)).toBe(true)
  })

  it('etapa crua desconhecida herda a camada do nó anterior', () => {
    const tl = montarTimeline([etapa('2026-08-18T12:00:00Z', 'SAL'), etapa('2026-08-19T12:00:00Z', null)], cab('Em andamento'), AGORA)
    expect(tl.nos[1].camada).toBe('Closer')
    expect(tl.nos[1].etapaCrua).toBe('Etapa X')
  })

  it('a trava de venda manda no desfecho: status Ganho usa o nó de ganho (ou data_venda)', () => {
    const ganho = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL'), simples('2026-09-01T12:00:00Z', 'ganho', 'Ganho')], cab('Ganho'), AGORA)
    expect(ganho.desfecho).toMatchObject({ tipo: 'ganho', instante: d('2026-09-01T12:00:00Z') })
    const semEvento = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL')], cab('Ganho', { data_venda: '2026-08-30T12:00:00Z' }), AGORA)
    expect(semEvento.desfecho).toMatchObject({ tipo: 'ganho', instante: d('2026-08-30T12:00:00Z'), momentoId: null })
    const perdido = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL'), simples('2026-08-10T12:00:00Z', 'perda', 'Perdido')], cab('Perdido'), AGORA)
    expect(perdido.desfecho.tipo).toBe('perda')
    expect(perdido.fim).toEqual(d('2026-08-10T12:00:00Z'))
  })

  it('deal só com MQL: 1 fase, 1 trecho aberto, sem quebrar', () => {
    const tl = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL')], cab('Em andamento'), AGORA)
    expect(tl.fases).toHaveLength(1)
    expect(tl.trechos).toHaveLength(1)
    expect(tl.totais.diasNoFunil).toBeCloseTo(27, 0)
  })
})
