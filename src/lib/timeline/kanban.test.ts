import { describe, it, expect } from 'vitest'
import { KANBAN_COLUNAS, colunaDoDeal, diasParado, montarKanban } from '@/lib/timeline/kanban'
import { STAGE_ORDER } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-09-17T12:00:00Z')
/** Ids reais das duas "Reunião Agendada SQL" — a mesma etapa existe nos 2 funis. */
const SQL_CLOSER = '69b1badfe1def700137f1b89'
const SQL_SDR = '69380917e00ed10014daaa68'

const row = (over: Partial<FunnelRow>): FunnelRow => ({
  id_lead: 'd1',
  ciclo: 1,
  eh_ciclo_atual: true,
  status_atual: 'Em andamento',
  etapa_funil: 'Novo MQL',
  data_novo_mql: '2026-09-10T12:00:00Z',
  ...over,
} as FunnelRow)

describe('KANBAN_COLUNAS', () => {
  it('são as 12 etapas do catálogo + No Show logo depois do SQL', () => {
    expect(KANBAN_COLUNAS).toHaveLength(13)
    const i = KANBAN_COLUNAS.indexOf('Reunião Agendada SQL')
    expect(KANBAN_COLUNAS[i + 1]).toBe('No Show')
    expect(KANBAN_COLUNAS[i + 2]).toBe('Diagnóstico')
    // Tirando o No Show, é exatamente STAGE_ORDER, na mesma ordem.
    expect(KANBAN_COLUNAS.filter(s => s !== 'No Show')).toEqual(STAGE_ORDER)
  })
})

describe('colunaDoDeal', () => {
  it('deal ganho cai em Fechamento mesmo com a etapa crua em Pré-Contrato', () => {
    // Medido: os 40 ganhos da base estão todos parados em "Pré Contrato" — no RD
    // ganhar é flag de status, não movimento de etapa.
    const r = row({ status_atual: 'Ganho', etapa_funil: 'Pré Contrato', data_venda: '2026-09-15T12:00:00Z' })
    expect(colunaDoDeal(r)).toBe('Fechamento')
  })

  it('deal perdido fica na etapa onde morreu', () => {
    const r = row({ status_atual: 'Perdido', etapa_funil: 'Diagnóstico (1 dia)', data_perdido: '2026-09-12T12:00:00Z' })
    expect(colunaDoDeal(r)).toBe('Diagnóstico')
  })

  it('SQL do funil do Closer cai na coluna de SQL', () => {
    const r = row({ etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: SQL_CLOSER })
    expect(colunaDoDeal(r)).toBe('Reunião Agendada SQL')
  })

  it('SQL do funil do SDR também cai na coluna de SQL (currentStage devolve null)', () => {
    const r = row({ etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: SQL_SDR })
    expect(colunaDoDeal(r)).toBe('Reunião Agendada SQL')
  })

  it('etapa desconhecida não vira coluna', () => {
    expect(colunaDoDeal(row({ etapa_funil: 'Etapa Que Não Existe' }))).toBeNull()
  })
})

describe('diasParado', () => {
  it('conta da data da etapa atual do deal', () => {
    const r = row({ etapa_funil: 'Diagnóstico', data_reuniao_realizada: '2026-09-07T12:00:00Z' })
    expect(diasParado(r, 'Diagnóstico', AGORA)).toBeCloseTo(10, 5)
  })

  it('sem a data da etapa cai no MQL, depois na criação original', () => {
    const semEtapa = row({ etapa_funil: 'Diagnóstico', data_reuniao_realizada: null, data_novo_mql: '2026-09-15T12:00:00Z' })
    expect(diasParado(semEtapa, 'Diagnóstico', AGORA)).toBeCloseTo(2, 5)
    const semMql = row({ etapa_funil: 'Diagnóstico', data_reuniao_realizada: null, data_novo_mql: null, data_criacao_original: '2026-09-14T12:00:00Z' })
    expect(diasParado(semMql, 'Diagnóstico', AGORA)).toBeCloseTo(3, 5)
  })

  it('sem nenhuma data utilizável devolve null', () => {
    const r = row({ etapa_funil: 'Diagnóstico', data_reuniao_realizada: null, data_novo_mql: null, data_criacao_original: null })
    expect(diasParado(r, 'Diagnóstico', AGORA)).toBeNull()
  })
})

describe('montarKanban', () => {
  it('devolve as 13 colunas mesmo vazias', () => {
    const colunas = montarKanban([], AGORA)
    expect(colunas.map(c => c.etapa)).toEqual(KANBAN_COLUNAS)
    expect(colunas.every(c => c.cards.length === 0)).toBe(true)
  })

  it('ordena pelo mais parado primeiro, sem data por último', () => {
    const novo = row({ id_lead: 'novo', etapa_funil: 'Diagnóstico', data_reuniao_realizada: '2026-09-16T12:00:00Z' })
    const velho = row({ id_lead: 'velho', etapa_funil: 'Diagnóstico', data_reuniao_realizada: '2026-08-01T12:00:00Z' })
    const semData = row({ id_lead: 'sem-data', etapa_funil: 'Diagnóstico', data_reuniao_realizada: null, data_novo_mql: null, data_criacao_original: null })
    const col = montarKanban([novo, semData, velho], AGORA).find(c => c.etapa === 'Diagnóstico')
    expect(col?.cards.map(c => c.row.id_lead)).toEqual(['velho', 'novo', 'sem-data'])
    expect(col?.cards[0].dias).toBeCloseTo(47, 5)
    expect(col?.cards[2].dias).toBeNull()
  })

  it('espalha ganho, perdido e SQL do SDR nas colunas certas', () => {
    const ganho = row({ id_lead: 'g', status_atual: 'Ganho', etapa_funil: 'Pré Contrato', data_venda: '2026-09-15T12:00:00Z' })
    const perdido = row({ id_lead: 'p', status_atual: 'Perdido', etapa_funil: 'Contato Efetivo', data_contato_efetivo: '2026-09-01T12:00:00Z' })
    const sqlSdr = row({ id_lead: 's', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: SQL_SDR, data_agendamento_reuniao_sql: '2026-09-05T12:00:00Z' })
    const desconhecido = row({ id_lead: 'x', etapa_funil: 'Etapa Que Não Existe' })
    const colunas = montarKanban([ganho, perdido, sqlSdr, desconhecido], AGORA)
    const por = (e: string) => colunas.find(c => c.etapa === e)?.cards.map(c => c.row.id_lead) ?? []
    expect(por('Fechamento')).toEqual(['g'])
    expect(por('Contato Efetivo')).toEqual(['p'])
    expect(por('Reunião Agendada SQL')).toEqual(['s'])
    // Etapa que não resolve some do quadro: um card sem coluna não é inventado.
    expect(colunas.flatMap(c => c.cards).map(c => c.row.id_lead)).not.toContain('x')
  })
})
