import { describe, expect, it } from 'vitest'
import { momentosDeEventos, type DealEventoRow } from './eventos'
import { momentosDeTarefas, type TarefaRow } from './tarefas'
import { momentosDeCadencias, type CadenciaRow } from './cadencias'
import { montarTimeline } from './montar'
import { CATEGORIAS, donosDaFase, montarHistorico, nomeCurto, type CategoriaHistorico } from './historico'
import type { DealCabecalho } from './tipos'
import type { FunnelRow } from '@/lib/funnelTypes'

// Alberto Cardoso (6ad353df18e4e30001c9677d), como estava em 17/11/2026.
const ID = '6ad353df18e4e30001c9677d'
let n = 0
const ev = (data: string, tipo: string, p: Partial<DealEventoRow> = {}): DealEventoRow => ({
  id_evento: ++n, id_deal: ID, tipo_evento: tipo, nome_funil: 'SDR', id_etapa: null, nome_etapa: null,
  nome_etapa_anterior: null, responsavel: null, valor_anterior: null, valor_novo: null, data_evento: data,
  motivo_perda: null, anotacao_perda: null, ...p,
})
const EVENTOS: DealEventoRow[] = [
  ev('2026-10-17T10:54:00Z', 'mudanca_etapa', { nome_etapa: 'Novo MQL' }),
  ev('2026-10-17T10:56:00Z', 'mudanca_etapa', { nome_etapa: 'Tentando Contato' }),
  ev('2026-10-17T13:57:00Z', 'mudanca_etapa', { nome_etapa: 'Conexão' }),
  ev('2026-10-23T14:22:00Z', 'troca_responsavel', { valor_anterior: 'Thiago Cotliarenco Gomes', valor_novo: 'Xayane', responsavel: 'Xayane' }),
  ev('2026-10-29T21:16:00Z', 'perda', { nome_etapa: 'Conexão', motivo_perda: 'Parou de responder', responsavel: 'Xayane' }),
  ev('2026-11-05T13:34:00Z', 'deal_retomado', { nome_etapa: 'Conexão', responsavel: 'Cassiana Lavall' }),
  ev('2026-11-05T13:34:00Z', 'troca_responsavel', { valor_anterior: 'Xayane', valor_novo: 'Cassiana Lavall', responsavel: 'Cassiana Lavall' }),
  ev('2026-11-05T13:33:50Z', 'mudanca_etapa', { nome_etapa: 'Conexão', nome_etapa_anterior: 'Tentando Contato' }), // gravada ANTES da retomada, como no RD
  ev('2026-11-16T20:13:00Z', 'mudanca_etapa', { nome_etapa: 'Reunião Agendada SQL' }),
  ev('2026-11-16T20:16:00Z', 'mudanca_etapa', { nome_etapa: 'Reunião Agendada SQL', nome_funil: 'Closer' }),
  ev('2026-11-16T20:16:00Z', 'mudanca_funil', { valor_anterior: 'SDR', valor_novo: 'Closer', nome_funil: 'Closer' }),
  ev('2026-11-16T20:19:00Z', 'troca_responsavel', { valor_anterior: 'Cassiana Lavall', valor_novo: 'Jéssica', responsavel: 'Jéssica' }),
]
const tarefa = (id: string, feita: string, type: string): TarefaRow => ({
  task_id: id, subject: `${type} - Eletrovias`, type, notes: null, done: true, status_calc: 'concluida_no_prazo',
  prazo: feita, done_date: feita, user_name: 'Cassiana Lavall', deal_id: ID,
})
const TAREFAS: TarefaRow[] = [
  tarefa('t1', '2026-11-09T20:07:00Z', 'call'), tarefa('t2', '2026-11-09T20:07:00Z', 'whatsapp'),
  tarefa('t3', '2026-11-09T20:07:30Z', 'call'), tarefa('t4', '2026-11-16T19:48:00Z', 'call'),
  tarefa('t5', '2026-11-05T13:33:55Z', 'task'), // encerrada segundos antes da reabertura
]
const cad = (id: string, tipo: string, instante: string, detalhe: string, status = 'encerrada'): CadenciaRow => ({
  id, id_deal: ID, tipo, instante, cadencia_nome: 'Conexão — Funis SDR e Prospecção Ativa', detalhe, status, ciclo: 1,
})
const CADENCIAS: CadenciaRow[] = [
  cad('exec:1:entrada', 'entrada', '2026-10-17T13:57:00Z', 'entrada'),
  cad('disparo:1', 'disparo', '2026-10-17T10:56:00Z', 'm1', 'enviado'),
  cad('exec:1:saida', 'saida', '2026-10-30T11:01:00Z', 'deal_fechado'),
  cad('exec:2:entrada', 'entrada', '2026-11-06T09:02:00Z', 'reconciliacao'),
]
const AGORA = new Date('2026-11-17T15:00:00Z')
const row = { id_lead: ID, ciclo: 2, status_atual: 'Em andamento', data_novo_mql: null, data_venda: null, data_perdido: null } as unknown as FunnelRow
const CAB: DealCabecalho = { row, ciclos: [row] }

const tl = montarTimeline([
  ...momentosDeEventos(EVENTOS), ...momentosDeTarefas(TAREFAS, AGORA), ...momentosDeCadencias(CADENCIAS),
], CAB, AGORA)
const TODAS = new Set<CategoriaHistorico>(CATEGORIAS.map(c => c.chave))

describe('montarHistorico — Alberto Cardoso', () => {
  const h = montarHistorico(tl, TODAS)
  const titulos = (c: number) => h[c].dias.flatMap(d => d.itens.map(i => (i.tipo === 'tarefas' ? `${i.tarefas.length} tarefas` : i.momento.titulo)))

  it('dois ciclos: o 1º perdido com o motivo, o 2º resgate em andamento depois de ~7 dias parado', () => {
    expect(h.map(c => [c.ciclo, c.desfecho, c.resgate])).toEqual([[1, 'perdido', false], [2, 'em_andamento', true]])
    expect(h[0].motivoPerda).toBe('Parou de responder')
    expect(Math.round(h[1].diasParado!)).toBe(7)
  })

  it('ciclo 1 traz tudo, em ordem: etapas, WhatsApp automático, cadência, troca de responsável e perda', () => {
    expect(titulos(0)).toEqual([
      'MQL', 'Tentando contato', 'WhatsApp automático enviado', 'Conexão', 'Entrou na cadência',
      'Troca de responsável', 'Perdido', 'Saiu da cadência',
    ])
  })

  it('ciclo 2: reabertura sem o eco da etapa, tarefas do dia juntas, funil e responsável', () => {
    const t = titulos(1)
    expect(t[0]).toBe('Reaberto')
    expect(t[1]).toBe('1 tarefas') // encerrada segundos antes da reabertura, mas na lista fica no ciclo 2
    expect(t).not.toContain('Conexão') // eco da retomada some
    expect(t).toContain('3 tarefas')
    expect(t).toContain('Mudou de funil')
    expect(t[t.length - 1]).toBe('Troca de responsável')
  })

  it('filtro: só cadência e tarefas', () => {
    const so = montarHistorico(tl, new Set<CategoriaHistorico>(['cadencia']))
    expect(so[1].dias.flatMap(d => d.itens).every(i => i.tipo === 'tarefas' || i.momento.tipo === 'cadencia' || i.momento.tipo === 'disparo')).toBe(true)
    expect(so[0].totalSemFiltro).toBeGreaterThan(so[0].dias.flatMap(d => d.itens).length)
  })
})

describe('donosDaFase', () => {
  it('SDR do ciclo 1: Thiago → Xayane; SDR do ciclo 2: Cassiana → Jéssica', () => {
    const sdr = tl.fases.filter(f => f.tipo === 'SDR')
    expect(donosDaFase(sdr[0], tl.momentos)).toEqual(['Thiago Cotliarenco', 'Xayane'])
    expect(donosDaFase(sdr[1], tl.momentos)).toEqual(['Cassiana Lavall', 'Jéssica'])
  })
  it('nomeCurto', () => expect(nomeCurto('  Thiago Cotliarenco Gomes ')).toBe('Thiago Cotliarenco'))
})
