import { describe, it, expect } from 'vitest'
import { computeAging, dealsInAging } from '@/lib/aging'
import type { EtapaPeriodoRow, FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-08-14T12:00:00Z').getTime()
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

const periodo = (over: Partial<EtapaPeriodoRow>): EtapaPeriodoRow => ({
  deal_id: 'd1',
  etapa: 'Contato Efetivo',
  data_entrada: diasAtras(10),
  data_saida: null,
  e_ultima_passagem: true,
  ...over,
})

const SEM_MQL = new Map<string, string>()

describe('computeAging', () => {
  it('conta apenas deals vivos, ignorando os mortos', () => {
    // Este é o ponto central: vw_deal_etapa_periodos não fecha o período quando
    // o deal é perdido. Sem o filtro, um deal morto há 300 dias entra na média.
    const periodos = [
      periodo({ deal_id: 'vivo', data_entrada: diasAtras(10) }),
      periodo({ deal_id: 'morto', data_entrada: diasAtras(300) }),
    ]
    const [r] = computeAging(periodos, new Set(['vivo']), SEM_MQL, AGORA)

    expect(r.deals).toBe(1)
    expect(r.mediaEtapa).toBeCloseTo(10, 5)
  })

  it('devolve vazio quando nenhum deal está vivo', () => {
    expect(computeAging([periodo({ deal_id: 'morto' })], new Set(), SEM_MQL, AGORA)).toEqual([])
  })

  it('agrupa por etapa canônica, resolvendo variantes de rótulo', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: 'SAL' }),
      periodo({ deal_id: 'b', etapa: 'Contato Efetivo' }),
      // "SQL" e "Reunião Agendada SQL" resolvem pra mesma etapa canônica.
      periodo({ deal_id: 'c', etapa: 'SQL' }),
      periodo({ deal_id: 'd', etapa: 'Reunião Agendada SQL' }),
    ]
    const r = computeAging(periodos, new Set(['a', 'b', 'c', 'd']), SEM_MQL, AGORA)
    const porEtapa = Object.fromEntries(r.map(x => [x.etapa, x.deals]))

    expect(porEtapa['SAL']).toBe(1)
    expect(porEtapa['Contato Efetivo']).toBe(1)
    expect(porEtapa['Reunião Agendada SQL']).toBe(2)
  })

  it('calcula a média dos dias parados na etapa', () => {
    const periodos = [2, 4, 6, 8].map((d, i) =>
      periodo({ deal_id: `d${i}`, data_entrada: diasAtras(d) }),
    )
    const [r] = computeAging(periodos, new Set(['d0', 'd1', 'd2', 'd3']), SEM_MQL, AGORA)

    expect(r.mediaEtapa).toBeCloseTo(5, 5) // (2+4+6+8)/4
  })

  it('calcula a média de dias em andamento (desde o MQL), separado da etapa', () => {
    const periodos = [
      periodo({ deal_id: 'a', data_entrada: diasAtras(3) }),
      periodo({ deal_id: 'b', data_entrada: diasAtras(5) }),
    ]
    const mqlPorDeal = new Map([
      ['a', diasAtras(20)],
      ['b', diasAtras(40)],
    ])
    const [r] = computeAging(periodos, new Set(['a', 'b']), mqlPorDeal, AGORA)

    expect(r.mediaEtapa).toBeCloseTo(4, 5) // (3+5)/2
    expect(r.mediaAndamento).toBeCloseTo(30, 5) // (20+40)/2
  })

  it('deal sem MQL conhecido conta em deals mas não entra na média de andamento', () => {
    const periodos = [
      periodo({ deal_id: 'a', data_entrada: diasAtras(3) }),
      periodo({ deal_id: 'b', data_entrada: diasAtras(5) }),
    ]
    const mqlPorDeal = new Map([['a', diasAtras(20)]]) // 'b' sem MQL
    const [r] = computeAging(periodos, new Set(['a', 'b']), mqlPorDeal, AGORA)

    expect(r.deals).toBe(2)
    expect(r.mediaAndamento).toBeCloseTo(20, 5)
  })

  it('descarta linha sem etapa ou sem data de entrada', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: null }),
      periodo({ deal_id: 'a', data_entrada: null }),
      periodo({ deal_id: 'a', data_entrada: 'não é data' }),
    ]
    expect(computeAging(periodos, new Set(['a']), SEM_MQL, AGORA)).toEqual([])
  })

  it('ignora entrada no futuro em vez de gerar dias negativos', () => {
    const futuro = [periodo({ deal_id: 'a', data_entrada: diasAtras(-5) })]
    expect(computeAging(futuro, new Set(['a']), SEM_MQL, AGORA)).toEqual([])
  })
})

// ─── dealsInAging ─────────────────────────────────────────────────────────────

const fakeRow = (over: Partial<FunnelRow>): FunnelRow => ({
  id_lead: 'd1',
  ciclo: 1,
  eh_reciclagem: false,
  eh_ciclo_atual: true,
  marca: 'Oral Unic',
  nome_funil: 'Oral Unic',
  origem_comercial: 'Inbound',
  etapa_funil: 'Contato Efetivo',
  status_atual: 'Em andamento',
  nome_negociacao: 'Deal 1',
  nome_sdr: 'Xayane',
  nome_closer: null,
  fonte_macro: 'Inbound',
  sub_fonte: null,
  utm_source: null,
  valor_contrato: null,
  quantidade_unidades: null,
  motivo_perda: null,
  data_novo_mql: diasAtras(20),
  data_tentando_contato: null,
  data_contato_efetivo: null,
  data_interesse_reuniao: null,
  data_conexao: null,
  data_agendamento_reuniao_sql: null,
  data_reuniao_realizada: null,
  data_no_show: null,
  data_sal: null,
  data_oportunidade: null,
  data_comite: null,
  data_pre_contrato: null,
  data_venda: null,
  data_perdido: null,
  ...over,
})

const vivos = (rows: FunnelRow[]) => new Map(rows.map(r => [String(r.id_lead), r]))

describe('dealsInAging', () => {
  it('devolve exatamente as linhas que o computeAging conta na etapa', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: 'SAL', data_entrada: diasAtras(3) }),
      periodo({ deal_id: 'b', etapa: 'SAL', data_entrada: diasAtras(9) }),
      periodo({ deal_id: 'c', etapa: 'Contato Efetivo', data_entrada: diasAtras(4) }),
    ]
    const byId = vivos([fakeRow({ id_lead: 'a' }), fakeRow({ id_lead: 'b' }), fakeRow({ id_lead: 'c' })])

    const res = dealsInAging(periodos, byId, 'SAL', AGORA)
    const countAgg = computeAging(periodos, new Set(['a', 'b', 'c']), SEM_MQL, AGORA)
      .find(x => x.etapa === 'SAL')!.deals

    expect(res).toHaveLength(countAgg)
    expect(res.map(d => d.row.id_lead).sort()).toEqual(['a', 'b'])
    expect(res.map(d => d.dataEtapa).sort()).toEqual([diasAtras(9), diasAtras(3)].sort())
  })

  it('ignora deal fora do mapa de vivos (perdido/fora de escopo)', () => {
    const periodos = [
      periodo({ deal_id: 'vivo', data_entrada: diasAtras(10) }),
      periodo({ deal_id: 'morto', data_entrada: diasAtras(300) }),
    ]
    const res = dealsInAging(periodos, vivos([fakeRow({ id_lead: 'vivo' })]), 'Contato Efetivo', AGORA)

    expect(res).toHaveLength(1)
    expect(res[0].row.id_lead).toBe('vivo')
  })

  it('agrupa pela etapa canônica, resolvendo variantes de rótulo', () => {
    const periodos = [
      periodo({ deal_id: 'a', etapa: 'SQL' }),
      periodo({ deal_id: 'b', etapa: 'Reunião Agendada SQL' }),
      periodo({ deal_id: 'c', etapa: 'SAL' }),
    ]
    const byId = vivos([fakeRow({ id_lead: 'a' }), fakeRow({ id_lead: 'b' }), fakeRow({ id_lead: 'c' })])

    expect(dealsInAging(periodos, byId, 'Reunião Agendada SQL', AGORA).map(d => d.row.id_lead).sort())
      .toEqual(['a', 'b'])
  })

  it('descarta linha sem etapa, sem data, com data inválida ou no futuro', () => {
    const byId = vivos([fakeRow({ id_lead: 'a' })])
    const periodos = [
      periodo({ deal_id: 'a', etapa: null }),
      periodo({ deal_id: 'a', data_entrada: null }),
      periodo({ deal_id: 'a', data_entrada: 'não é data' }),
      periodo({ deal_id: 'a', data_entrada: diasAtras(-5) }),
    ]
    expect(dealsInAging(periodos, byId, 'Contato Efetivo', AGORA)).toEqual([])
  })
})
