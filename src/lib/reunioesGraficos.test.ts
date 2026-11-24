import { describe, expect, it } from 'vitest'
import type { FunnelRow } from './funnelTypes'
import type { Reuniao } from './reunioesLive'
import {
  FILTRO_REUNIOES_VAZIO, filtrarReunioesPorGraficos, paresPorDimensao, valoresDaReuniao,
} from './reunioesGraficos'

function row(over: Partial<FunnelRow>): FunnelRow {
  return { id_lead: 'x', ciclo: 1, marca: 'Eletrovias', nome_sdr: 'Xayane', nome_closer: 'Jéssica', ...over } as FunnelRow
}

const live: Reuniao = {
  chave: 'live:1', tipo: 'live', data: '2026-11-19T23:00:00+00:00', closer: 'Jéssica',
  sdrs: ['Xayane', 'Sarah Padilha'],
  negocios: [
    { row: row({ id_lead: 'a', nome_sdr: 'Xayane' }), dataDiagnostico: '2026-11-19' },
    { row: row({ id_lead: 'b', nome_sdr: 'Sarah Padilha' }), dataDiagnostico: '2026-11-19' },
    { row: row({ id_lead: 'c', nome_sdr: 'Xayane' }), dataDiagnostico: '2026-11-19' },
  ],
}
const estimada: Reuniao = {
  chave: 'est:Jéssica|2026-11-23', tipo: 'live-estimada', data: '2026-11-23', closer: 'Jéssica', sdrs: ['Cassiana Lavall'],
  negocios: [{ row: row({ id_lead: 'd', nome_sdr: 'Cassiana Lavall' }), dataDiagnostico: '2026-11-23' }],
}
const individual: Reuniao = {
  chave: 'ind:e', tipo: 'individual', data: '2026-11-18', closer: 'Douglas', sdrs: [''],
  negocios: [{ row: row({ id_lead: 'e', marca: 'Inpot', nome_sdr: null, nome_closer: 'Douglas' }), dataDiagnostico: '2026-11-18' }],
}
const todas = [live, estimada, individual]

describe('valoresDaReuniao', () => {
  it('tipo: estimada conta como LIVE', () => {
    expect(valoresDaReuniao(live, 'tipo')).toEqual(['LIVE'])
    expect(valoresDaReuniao(estimada, 'tipo')).toEqual(['LIVE'])
    expect(valoresDaReuniao(individual, 'tipo')).toEqual(['Individual'])
  })

  it('marca e SDR sem repetir; Closer da reunião', () => {
    expect(valoresDaReuniao(live, 'marca')).toEqual(['Eletrovias'])
    expect(valoresDaReuniao(live, 'sdr')).toEqual(['Xayane', 'Sarah Padilha'])
    expect(valoresDaReuniao(individual, 'closer')).toEqual(['Douglas'])
    expect(valoresDaReuniao(individual, 'sdr')).toEqual([''])
  })
})

describe('paresPorDimensao', () => {
  it('uma reunião conta 1 vez por valor (a LIVE com 2 SDRs conta para os dois)', () => {
    const sdrs = paresPorDimensao(todas, 'sdr').map(p => p.valor)
    expect(sdrs.filter(s => s === 'Xayane')).toHaveLength(1)
    expect(sdrs).toEqual(['Xayane', 'Sarah Padilha', 'Cassiana Lavall', ''])
  })
})

describe('filtrarReunioesPorGraficos', () => {
  it('sem filtro devolve tudo', () => {
    expect(filtrarReunioesPorGraficos(todas, FILTRO_REUNIOES_VAZIO)).toEqual(todas)
  })

  it('a reunião entra se algum valor dela está marcado', () => {
    const f = { ...FILTRO_REUNIOES_VAZIO, sdr: ['Sarah Padilha'] }
    expect(filtrarReunioesPorGraficos(todas, f)).toEqual([live])
  })

  it('dimensões diferentes se somam (E); a ignorada fica de fora', () => {
    const f = { ...FILTRO_REUNIOES_VAZIO, tipo: ['LIVE'], closer: ['Douglas'] }
    expect(filtrarReunioesPorGraficos(todas, f)).toEqual([])
    expect(filtrarReunioesPorGraficos(todas, f, 'closer')).toEqual([live, estimada])
    expect(filtrarReunioesPorGraficos(todas, f, 'tipo')).toEqual([individual])
  })
})
