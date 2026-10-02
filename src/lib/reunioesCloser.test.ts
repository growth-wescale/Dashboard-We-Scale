import { describe, expect, it } from 'vitest'
import { toWindow } from '@/lib/metrics'
import {
  agruparReunioes, filtrarReunioes, resumirReunioes,
  type FiltroReunioes, type ReuniaoRow,
} from './reunioesCloser'

let seq = 0
function reuniao(p: Partial<ReuniaoRow> = {}): ReuniaoRow {
  seq++
  return {
    call_id: seq,
    tipo: 'R1',
    call_timestamp: '2026-09-10T14:00:00+00:00',
    duracao_min: 60,
    ai_score: 0.8,
    closer: 'Jéssica',
    id_deal: `deal${seq}`,
    deal_no_funil: true,
    negociacao: `Negócio ${seq}`,
    titulo: null,
    url: null,
    marca: 'Eletrovias',
    origem_comercial: 'Inbound',
    fonte_macro: 'Inbound',
    utm_source: 'meta',
    sub_fonte_crm: null,
    nome_sdr: 'Sarah Padilha',
    status_atual: 'Em andamento',
    ...p,
  }
}

const SET_26 = toWindow(null, null, [{ from: '2026-09-01', to: '2026-09-30' }])

function filtro(p: Partial<FiltroReunioes> = {}): FiltroReunioes {
  return {
    origem: 'Inbound', marcas: ['Eletrovias', 'Inpot'], consolidado: true,
    fontes: [], subFontes: [], sdrs: [], closers: [],
    win: SET_26, eventSource: 'passages', ...p,
  }
}

describe('filtrarReunioes', () => {
  it('recorta pela data da reunião em Brasília', () => {
    const rows = [
      reuniao({ call_timestamp: '2026-09-01T02:00:00+00:00' }), // 31/08 23h em Brasília
      reuniao({ call_timestamp: '2026-09-30T23:30:00+00:00' }), // 30/09 20h30
      reuniao({ call_timestamp: '2026-10-01T03:30:00+00:00' }), // 01/10 00h30
    ]
    expect(filtrarReunioes(rows, filtro()).map(r => r.call_id)).toEqual([rows[1].call_id])
  })

  it('reunião sem negócio entra só no Consolidado e conta como Inbound', () => {
    const solta = reuniao({ id_deal: null, deal_no_funil: false, marca: null, origem_comercial: null })
    expect(filtrarReunioes([solta], filtro())).toHaveLength(1)
    expect(filtrarReunioes([solta], filtro({ consolidado: false, marcas: ['Eletrovias'] }))).toHaveLength(0)
    expect(filtrarReunioes([solta], filtro({ origem: 'Prospecção Ativa' }))).toHaveLength(0)
  })

  it('seleção parcial de marca filtra pela marca do negócio', () => {
    const rows = [reuniao({ marca: 'Eletrovias' }), reuniao({ marca: 'Viva' })]
    const r = filtrarReunioes(rows, filtro({ consolidado: false, marcas: ['Viva'] }))
    expect(r.map(x => x.marca)).toEqual(['Viva'])
  })

  it('Closer filtra por quem conduziu; SDR e fonte pelo negócio', () => {
    const rows = [
      reuniao({ closer: 'Douglas', nome_sdr: 'Xayane', fonte_macro: 'INBOUND' }),
      reuniao({ closer: 'Jéssica', nome_sdr: 'Sarah Padilha', fonte_macro: 'Resgate' }),
      reuniao({ closer: 'Douglas', id_deal: null, deal_no_funil: false, marca: null, nome_sdr: null, fonte_macro: null }),
    ]
    expect(filtrarReunioes(rows, filtro({ closers: ['Douglas'] }))).toHaveLength(2)
    expect(filtrarReunioes(rows, filtro({ sdrs: ['Xayane'] })).map(r => r.closer)).toEqual(['Douglas'])
    // fonte normalizada ('INBOUND' → 'Inbound'); reunião sem negócio sai
    expect(filtrarReunioes(rows, filtro({ fontes: ['Inbound'] }))).toHaveLength(1)
    expect(filtrarReunioes(rows, filtro({ subFontes: ['Meta'] }))).toHaveLength(2)
  })

  it('Deals únicos: mesmo negócio e tipo no mês conta 1 vez; tipos diferentes e sem negócio não somem', () => {
    const rows = [
      reuniao({ id_deal: 'X', tipo: 'R1', call_timestamp: '2026-09-10T15:00:00+00:00' }),
      reuniao({ id_deal: 'X', tipo: 'R1', call_timestamp: '2026-09-10T14:00:00+00:00' }), // regravação
      reuniao({ id_deal: 'X', tipo: 'R2', call_timestamp: '2026-09-15T14:00:00+00:00' }),
      reuniao({ id_deal: null, deal_no_funil: false, marca: null }),
      reuniao({ id_deal: null, deal_no_funil: false, marca: null }),
      // sem tipo do mesmo negócio: podem ser reuniões diferentes, ficam as duas
      reuniao({ id_deal: 'X', tipo: null, call_timestamp: '2026-09-20T14:00:00+00:00' }),
      reuniao({ id_deal: 'X', tipo: null, call_timestamp: '2026-09-22T14:00:00+00:00' }),
    ]
    const unicas = filtrarReunioes(rows, filtro({ eventSource: 'unique' }))
    expect(unicas).toHaveLength(6)
    // fica a primeira gravação do dia
    expect(unicas.find(r => r.id_deal === 'X' && r.tipo === 'R1')?.call_timestamp).toBe('2026-09-10T14:00:00+00:00')
    expect(filtrarReunioes(rows, filtro({ eventSource: 'passages' }))).toHaveLength(7)
  })

  it('Deals únicos: o mesmo negócio em meses diferentes conta nos dois', () => {
    const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-09-30' }])
    const rows = [
      reuniao({ id_deal: 'X', call_timestamp: '2026-08-20T14:00:00+00:00' }),
      reuniao({ id_deal: 'X', call_timestamp: '2026-09-20T14:00:00+00:00' }),
    ]
    expect(filtrarReunioes(rows, filtro({ win, eventSource: 'unique' }))).toHaveLength(2)
  })
})

describe('agruparReunioes', () => {
  it('conta por tipo, separa sem tipo e ordena pelo total', () => {
    const rows = [
      reuniao({ closer: 'Douglas', tipo: 'R1', duracao_min: 50, ai_score: 0.6 }),
      reuniao({ closer: 'Douglas', tipo: 'R2', duracao_min: 70, ai_score: null }),
      reuniao({ closer: 'Douglas', tipo: null, duracao_min: 300, ai_score: 0.1 }),
      reuniao({ closer: 'Jéssica', tipo: 'R1' }),
      reuniao({ closer: 'Bruna', tipo: null }),
    ]
    const linhas = agruparReunioes(rows, 'closer')
    expect(linhas.map(l => l.chave)).toEqual(['Douglas', 'Jéssica', 'Bruna'])
    const d = linhas[0]
    expect(d.porTipo).toEqual({ R1: 1, R2: 1, R3: 0, R4: 0, R5: 0 })
    expect(d.total).toBe(2)
    expect(d.semTipo).toBe(1)
    // médias só das tipadas; nota ignora quem não tem
    expect(d.duracaoMedia).toBe(60)
    expect(d.notaMedia).toBeCloseTo(0.6)
    expect(linhas[2]).toMatchObject({ total: 0, semTipo: 1, duracaoMedia: null, notaMedia: null })
  })

  it('por marca: sem negócio vira chave null e fica sempre por último', () => {
    const rows = [
      reuniao({ marca: null, id_deal: null, deal_no_funil: false }),
      reuniao({ marca: null, id_deal: null, deal_no_funil: false }),
      reuniao({ marca: null, id_deal: null, deal_no_funil: false }),
      reuniao({ marca: 'Viva' }),
      reuniao({ marca: 'Eletrovias' }),
      reuniao({ marca: 'Eletrovias' }),
    ]
    expect(agruparReunioes(rows, 'marca').map(l => l.chave)).toEqual(['Eletrovias', 'Viva', null])
  })
})

describe('resumirReunioes', () => {
  it('totaliza por tipo, com closers distintos', () => {
    const rows = [
      reuniao({ tipo: 'R1', closer: 'Douglas', duracao_min: 40 }),
      reuniao({ tipo: 'R1', closer: 'Jéssica', duracao_min: 60 }),
      reuniao({ tipo: 'R1', closer: 'Jéssica', duracao_min: null }),
      reuniao({ tipo: 'R5', closer: 'Douglas', ai_score: 1, duracao_min: 80 }),
      reuniao({ tipo: null, duracao_min: 500, ai_score: 0 }),
    ]
    const r = resumirReunioes(rows)
    expect(r.total).toBe(4)
    expect(r.semTipo).toBe(1)
    // médias gerais ignoram a reunião sem tipo
    expect(r.duracaoMedia).toBe(60)
    expect(r.notaMedia).toBeCloseTo((0.8 * 3 + 1) / 4)
    expect(r.porTipo[0]).toMatchObject({ tipo: 'R1', quantidade: 3, duracaoMedia: 50, closers: 2 })
    expect(r.porTipo[4]).toMatchObject({ tipo: 'R5', quantidade: 1, notaMedia: 1, closers: 1 })
    expect(r.porTipo[1]).toMatchObject({ tipo: 'R2', quantidade: 0, duracaoMedia: null, notaMedia: null, closers: 0 })
  })
})
