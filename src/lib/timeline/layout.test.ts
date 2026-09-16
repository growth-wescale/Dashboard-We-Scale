import { describe, it, expect } from 'vitest'
import { layoutPista, PISTA, fmtDiasCurto, rotuloDia } from '@/lib/timeline/layout'
import { montarTimeline } from '@/lib/timeline/montar'
import type { MomentoBruto } from '@/lib/timeline/tipos'
import type { StageKey } from '@/lib/metrics'

const AGORA = new Date('2026-09-02T12:00:00Z')
let seq = 0
const etapa = (iso: string, e: StageKey): MomentoBruto => ({
  id: `evento:${++seq}`, idDeal: 'd1', instante: new Date(iso), tipo: e === 'No Show' ? 'no_show' : 'etapa', etapa: e, ator: 'Xayane', titulo: e,
  meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: null },
})
const tarefa = (iso: string, atrasada = false): MomentoBruto => ({
  id: `tarefa:${++seq}`, idDeal: 'd1', instante: new Date(iso), tipo: 'tarefa', ator: 'Xayane', titulo: 'Ligação',
  meta: { kind: 'tarefa', tipoTarefa: 'call', status: 'concluida_no_prazo', concluida: true, atrasada, prazo: null, feitaEm: iso, atrasoDias: null, assunto: 'Ligação', notas: null },
})
const tl = () => montarTimeline([
  etapa('2026-08-06T12:00:00Z', 'MQL'),
  etapa('2026-08-07T12:00:00Z', 'Tentando Contato'),
  etapa('2026-08-07T13:00:00Z', 'Contato Efetivo'),   // 1h depois: colide na mesma fileira? não — fileiras alternam
  etapa('2026-08-07T14:00:00Z', 'Reunião Agendada SQL'), // mesma fileira do TC, 2h depois → empurrado
  tarefa('2026-08-08T10:00:00Z'), tarefa('2026-08-08T10:05:00Z', true), tarefa('2026-08-15T10:00:00Z'),
  etapa('2026-08-18T12:00:00Z', 'Diagnóstico'),
], { row: { id_lead: 'd1', ciclo: 1, status_atual: 'Em andamento', data_novo_mql: '2026-08-06T12:00:00Z' } as never, ciclos: [] }, AGORA)

describe('layoutPista — etapas', () => {
  const lp = layoutPista(tl(), { k: 30, x0: 0, largura: 1200 }, 'etapas')
  it('chevron por fase com largura proporcional ao tempo e cor da camada', () => {
    expect(lp.chevrons.map(c => c.fase.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(lp.chevrons[1].w).toBeCloseTo(11 * 30, 3)
    expect(lp.chevrons[1].cor).toBe('var(--ws-vinho-b)')
    expect(lp.chevrons[0].labelVisivel).toBe(false) // 1 dia × 30px não cabe "MQL"? cabe: 30px < 3*7.2+24 → invisível
  })
  it('nós alternam cima/baixo e respeitam o gap mínimo na mesma fileira', () => {
    const nos = lp.nos.filter(n => !n.terminal)
    expect(nos.map(n => n.fileira)).toEqual(['cima', 'baixo', 'cima', 'baixo', 'cima'])
    // Tentando Contato (baixo) e SQL (baixo) estão a 2h — SQL é empurrado pra ≥ 190px
    expect(nos[3].x - nos[1].x).toBeGreaterThanOrEqual(PISTA.GAP_MIN)
    expect(nos[3].x).toBeGreaterThan(nos[3].xReal)
    expect(nos[2].x - nos[0].x).toBeGreaterThanOrEqual(PISTA.GAP_MIN) // Contato Efetivo (cima) empurrado pra longe do MQL
  })
  it('nó terminal em andamento fica sobre a pista no fim', () => {
    const t = lp.nos.find(n => n.terminal)!
    expect(t.fileira).toBe('pista')
    expect(t.y).toBe(PISTA.Y)
    expect(t.x).toBeCloseTo(PISTA.MARGEM_ESQ + 27 * 30, 3)
  })
  it('subtítulo do nó traz data e toques do trecho', () => {
    const sql = lp.nos.find(n => n.titulo === 'SQL')!
    expect(sql.detalhe).toContain('7 ago')
    expect(sql.detalhe).toContain('3 toques')
    expect(sql.detalhe).toContain('1 atrasado')
  })
  it('sem toques nem marcadores fora do micro', () => {
    expect(lp.toques).toEqual([])
    expect(lp.marcadores).toEqual([])
  })
})

describe('layoutPista — micro e macro', () => {
  it('micro: toques na fileira própria, clusterizados quando colam; atrasado tem contorno', () => {
    const lp = layoutPista(tl(), { k: 120, x0: 0, largura: 1200 }, 'micro')
    expect(lp.toques).toHaveLength(2) // 2 tarefas a 5 min viram 1 cluster + 1 solta
    expect(lp.toques[0].cluster).toHaveLength(2)
    expect(lp.toques[0].contorno).toBe('var(--status-atencao)')
    expect(lp.toques[0].y).toBe(PISTA.TOQUES_Y)
  })
  it('macro: um nó por fase SDR/Closer, com resumo', () => {
    const lp = layoutPista(tl(), { k: 5, x0: 0, largura: 1200 }, 'macro')
    const nos = lp.nos.filter(n => !n.terminal)
    expect(nos.map(n => n.titulo)).toEqual(['SDR · Xayane', 'Closer · Xayane'])
    expect(nos[0].detalhe).toContain('3 etapas')
    expect(nos[0].detalhe).toContain('3 toques')
  })
  it('eixo: ticks diários no micro, mensais no macro', () => {
    expect(layoutPista(tl(), { k: 120, x0: 0, largura: 1200 }, 'micro').eixo.length).toBeGreaterThan(20)
    expect(layoutPista(tl(), { k: 5, x0: 0, largura: 1200 }, 'macro').eixo.map(t => t.label)).toEqual(['set 26'])
  })
})

describe('formatadores', () => {
  it('fmtDiasCurto', () => {
    expect(fmtDiasCurto(0.3)).toBe('7H')
    expect(fmtDiasCurto(1.2)).toBe('1 DIA')
    expect(fmtDiasCurto(17.4)).toBe('17 DIAS')
  })
  it('rotuloDia em Brasília', () => {
    expect(rotuloDia(new Date('2026-08-07T01:00:00Z'))).toBe('6 ago') // 22h de 6/08 em BRT
  })
})
