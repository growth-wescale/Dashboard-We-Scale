import { describe, it, expect } from 'vitest'
import { mostrarReunioes, resumirReunioes, type ReuniaoLiveRow } from '@/lib/reunioesLive'
import { DEFAULT_VIEW_MODES, dealKey, noEscopoDoCiclo, toWindow, type FunnelEventRow, type ViewModes } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const out = toWindow(null, null, [{ from: '2026-10-01', to: '2026-10-31' }])
const nov = toWindow(null, null, [{ from: '2026-11-01', to: '2026-11-30' }])
const dez = toWindow(null, null, [{ from: '2026-12-01', to: '2026-12-31' }])

function r(p: Partial<FunnelRow>): FunnelRow {
  return {
    id_lead: 'x', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Eletrovias', nome_funil: 'Closer', origem_comercial: 'Inbound',
    etapa_funil: null, id_etapa_atual: null, status_atual: 'Em andamento',
    nome_negociacao: null, nome_sdr: null, nome_closer: null,
    fonte_macro: null, sub_fonte: null, utm_source: null, sub_fonte_crm: null,
    valor_contrato: null, quantidade_unidades: null, valor_produto: null, motivo_perda: null,
    data_novo_mql: null, data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    tipo_r1: 'Individual',
    ...p,
  }
}

const ev = (id: string, dia: string, ciclo = 1): FunnelEventRow =>
  ({ id_deal: id, dia, etapa_canonica: 'Diagnóstico', ciclo })

function gravada(id: string, callId: number, quando: string, closer = 'Jéssica'): ReuniaoLiveRow {
  return {
    id_deal: id, ciclo: 1, tipo_r1: 'LIVE', data_diagnostico: null,
    call_id: callId, call_timestamp: quando, closer,
    titulo: 'LIVE: ELETROVIAS', url: 'https://meetrox/x', convidados_externos: 10,
  }
}
function semGravacao(id: string): ReuniaoLiveRow {
  return {
    id_deal: id, ciclo: 1, tipo_r1: 'LIVE', data_diagnostico: null,
    call_id: null, call_timestamp: null, closer: null, titulo: null, url: null, convidados_externos: null,
  }
}

function resumir(
  rows: FunnelRow[], eventos: FunnelEventRow[], lives: ReuniaoLiveRow[],
  win = nov, modes: ViewModes = DEFAULT_VIEW_MODES,
) {
  return resumirReunioes({ eventos, rows, lives, win, modes, opts: { extra: noEscopoDoCiclo(rows) } })
}

describe('resumirReunioes', () => {
  it('individual: 2 negócios sem LIVE → 2 reuniões, total igual aos Diagnósticos', () => {
    const rows = [r({ id_lead: 'a', nome_closer: 'Douglas' }), r({ id_lead: 'b', nome_closer: 'Bruna' })]
    const res = resumir(rows, [ev('a', '2026-11-05'), ev('b', '2026-11-06')], [])
    expect(res.total).toBe(2)
    expect(res.deLive).toBe(0)
    expect(res.diagnosticos).toBe(2)
    expect(res.reunioes.every(x => x.tipo === 'individual')).toBe(true)
  })

  it('LIVE com 3 negócios na mesma gravação → 1 reunião com os 3 negócios', () => {
    const rows = ['a', 'b', 'c'].map(id => r({ id_lead: id, tipo_r1: 'LIVE', nome_closer: 'Jéssica' }))
    const lives = ['a', 'b', 'c'].map(id => gravada(id, 1, '2026-11-09T22:00:00+00:00'))
    const res = resumir(rows, [ev('a', '2026-11-10'), ev('b', '2026-11-10'), ev('c', '2026-11-11')], lives)
    expect(res.total).toBe(1)
    expect(res.deLive).toBe(1)
    expect(res.diagnosticos).toBe(3)
    expect(res.reunioes[0].tipo).toBe('live')
    expect(res.reunioes[0].negocios).toHaveLength(3)
    expect(res.reunioes[0].live?.convidadosExternos).toBe(10)
  })

  it('LIVE + 2 individuais → 3 reuniões; a LIVE vai pro Closer que conduziu', () => {
    const rows = [
      r({ id_lead: 'a', tipo_r1: 'LIVE', nome_closer: 'Jéssica' }),
      r({ id_lead: 'b', tipo_r1: 'LIVE', nome_closer: 'Jéssica' }),
      r({ id_lead: 'c', nome_closer: 'Douglas' }),
      r({ id_lead: 'd', nome_closer: 'Jéssica' }),
    ]
    const lives = [gravada('a', 1, '2026-11-09T22:00:00+00:00'), gravada('b', 1, '2026-11-09T22:00:00+00:00')]
    const res = resumir(rows, ['a', 'b', 'c', 'd'].map(id => ev(id, '2026-11-10')), lives)
    expect(res.total).toBe(3)
    expect(res.porCloser.get('Jéssica')).toBe(2)
    expect(res.porCloser.get('Douglas')).toBe(1)
  })

  it('estimada: negócios LIVE sem gravação agrupam por Closer + dia do Diagnóstico', () => {
    const rows = ['a', 'b', 'c'].map(id => r({ id_lead: id, tipo_r1: 'LIVE', nome_closer: 'Jéssica' }))
    const res = resumir(rows, [ev('a', '2026-11-18'), ev('b', '2026-11-18'), ev('c', '2026-11-23')],
      ['a', 'b', 'c'].map(semGravacao))
    expect(res.total).toBe(2)
    expect(res.deLive).toBe(2)
    expect(res.reunioes.every(x => x.tipo === 'live-estimada')).toBe(true)
    expect(res.reunioes.map(x => x.negocios.length).sort()).toEqual([1, 2])
  })

  it('negócio LIVE com Diagnóstico antes de 01/11/2026 conta como R1 individual', () => {
    const rows = [r({ id_lead: 'a', tipo_r1: 'LIVE' }), r({ id_lead: 'b', tipo_r1: 'LIVE' })]
    const res = resumir(rows, [ev('a', '2026-10-20'), ev('b', '2026-10-20')], [], out)
    expect(res.total).toBe(2)
    expect(res.deLive).toBe(0)
  })

  it('LIVE de 30/11 com Diagnósticos em 02/12: conta em novembro, dezembro explica', () => {
    const rows = ['a', 'b'].map(id => r({ id_lead: id, tipo_r1: 'LIVE', nome_closer: 'Jéssica' }))
    const lives = ['a', 'b'].map(id => gravada(id, 7, '2026-11-30T23:00:00+00:00'))
    const eventos = [ev('a', '2026-12-02'), ev('b', '2026-12-02')]

    const emDez = resumir(rows, eventos, lives, dez)
    expect(emDez.total).toBe(0)
    expect(emDez.diagnosticos).toBe(2)
    expect(emDez.diagsDeLiveForaDoRecorte).toHaveLength(2)
    expect(emDez.diagsDeLiveForaDoRecorte[0].motivo).toBe('periodo')

    const emNov = resumir(rows, eventos, lives, nov)
    expect(emNov.total).toBe(1)
    expect(emNov.diagnosticos).toBe(0)
  })

  it('filtro de Closer vale para quem conduziu a LIVE', () => {
    const todos = [
      r({ id_lead: 'a', tipo_r1: 'LIVE', nome_closer: 'Douglas' }),
      r({ id_lead: 'b', tipo_r1: 'LIVE', nome_closer: 'Douglas' }),
    ]
    const lives = ['a', 'b'].map(id => gravada(id, 1, '2026-11-09T22:00:00+00:00', 'Jéssica'))
    const eventos = [ev('a', '2026-11-10'), ev('b', '2026-11-10')]
    const base = { eventos, rows: todos, lives, win: nov, modes: DEFAULT_VIEW_MODES }

    // Closer = Douglas: os Diagnósticos são dele, a LIVE não.
    const douglas = resumirReunioes({
      ...base, opts: { extra: noEscopoDoCiclo(todos) }, optsSessao: { extra: noEscopoDoCiclo(todos) },
      closersFiltro: ['Douglas'],
    })
    expect(douglas.diagnosticos).toBe(2)
    expect(douglas.total).toBe(0)
    expect(douglas.diagsDeLiveForaDoRecorte.map(d => d.motivo)).toEqual(['closer', 'closer'])

    // Closer = Jéssica: nenhum Diagnóstico no nome dela, mas a LIVE é dela.
    const jessica = resumirReunioes({
      ...base, opts: { extra: noEscopoDoCiclo([]) }, optsSessao: { extra: noEscopoDoCiclo(todos) },
      closersFiltro: ['Jéssica'],
    })
    expect(jessica.diagnosticos).toBe(0)
    expect(jessica.total).toBe(1)
    expect(jessica.deLive).toBe(1)
  })

  it('safra: a sessão conta se tem negócio da safra, sem olhar a data da LIVE', () => {
    const rows = ['a', 'b'].map(id => r({ id_lead: id, tipo_r1: 'LIVE', nome_closer: 'Jéssica' }))
    const lives = ['a', 'b'].map(id => gravada(id, 3, '2026-10-30T22:00:00+00:00'))
    const res = resumirReunioes({
      eventos: [ev('a', '2026-11-03'), ev('b', '2026-11-04')], rows, lives, win: nov,
      modes: { ...DEFAULT_VIEW_MODES, funnelView: 'cohort' },
      opts: { extra: noEscopoDoCiclo(rows), cohortIds: new Set([dealKey({ id_lead: 'a', ciclo: 1 })]) },
    })
    expect(res.diagnosticos).toBe(1)
    expect(res.total).toBe(1)
    expect(res.deLive).toBe(1)
  })

  it('passagens: LIVE com 2 eventos do mesmo negócio = 1 sessão; individual com 2 eventos = 2', () => {
    const rows = [r({ id_lead: 'a', tipo_r1: 'LIVE', nome_closer: 'Jéssica' }), r({ id_lead: 'c', nome_closer: 'Douglas' })]
    const lives = [gravada('a', 1, '2026-11-04T22:00:00+00:00')]
    const res = resumir(rows,
      [ev('a', '2026-11-05'), ev('a', '2026-11-20'), ev('c', '2026-11-06'), ev('c', '2026-11-21')],
      lives, nov, { ...DEFAULT_VIEW_MODES, eventSource: 'passages' })
    expect(res.diagnosticos).toBe(4)
    expect(res.total).toBe(3)
    expect(res.deLive).toBe(1)
  })

  it('porSdr: a sessão conta 1 para cada SDR que tinha negócio nela', () => {
    const rows = [
      r({ id_lead: 'a', tipo_r1: 'LIVE', nome_sdr: 'Sarah Padilha', nome_closer: 'Jéssica' }),
      r({ id_lead: 'b', tipo_r1: 'LIVE', nome_sdr: 'Cassiana Lavall', nome_closer: 'Jéssica' }),
      r({ id_lead: 'c', tipo_r1: 'LIVE', nome_sdr: 'Sarah Padilha', nome_closer: 'Jéssica' }),
    ]
    const lives = ['a', 'b', 'c'].map(id => gravada(id, 1, '2026-11-09T22:00:00+00:00'))
    const res = resumir(rows, ['a', 'b', 'c'].map(id => ev(id, '2026-11-10')), lives)
    expect(res.total).toBe(1)
    expect(res.porSdr.get('Sarah Padilha')).toBe(1)
    expect(res.porSdr.get('Cassiana Lavall')).toBe(1)
  })
})

describe('mostrarReunioes', () => {
  const base = { reunioes: [], deLive: 0, diagsDeLiveForaDoRecorte: [], porSdr: new Map(), porCloser: new Map() }
  it('só mostra com a base da view carregada e números diferentes', () => {
    expect(mostrarReunioes({ ...base, total: 5, diagnosticos: 8 }, true)).toBe(true)
    expect(mostrarReunioes({ ...base, total: 5, diagnosticos: 5 }, true)).toBe(false)
    expect(mostrarReunioes({ ...base, total: 5, diagnosticos: 8 }, false)).toBe(false)
    expect(mostrarReunioes(null, true)).toBe(false)
  })
})
