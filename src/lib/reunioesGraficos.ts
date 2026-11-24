/**
 * Gráficos do pop-up "Reuniões" (rosca Individual × LIVE, Por Marca, Por
 * Closer, Por SDR) e o filtro que eles fazem na lista.
 *
 * A unidade é a REUNIÃO, não o Diagnóstico: uma LIVE conta 1. Quando a LIVE
 * tem negócios de 2 SDRs (ou 2 marcas), conta 1 para cada um — o mesmo da
 * coluna REUNIÕES da tabela de SDR. Por isso as barras de SDR e de marca podem
 * somar mais que o total; a rosca e o Closer somam o total.
 *
 * Filtro estilo Excel, igual aos outros pop-ups: clicar marca/desmarca, cada
 * gráfico conta com os filtros dos OUTROS gráficos, e a reunião entra se
 * algum valor dela estiver marcado.
 */

import type { Reuniao } from './reunioesLive'

export type DimReuniao = 'tipo' | 'marca' | 'closer' | 'sdr'
export type FiltroReunioes = Record<DimReuniao, string[]>

export const FILTRO_REUNIOES_VAZIO: FiltroReunioes = { tipo: [], marca: [], closer: [], sdr: [] }

export const TIPO_INDIVIDUAL = 'Individual'
export const TIPO_LIVE = 'LIVE'

const DIMS: DimReuniao[] = ['tipo', 'marca', 'closer', 'sdr']

/** Valores da reunião numa dimensão, sem repetir ('' = sem informação). */
export function valoresDaReuniao(r: Reuniao, dim: DimReuniao): string[] {
  switch (dim) {
    case 'tipo': return [r.tipo === 'individual' ? TIPO_INDIVIDUAL : TIPO_LIVE]
    case 'marca': return [...new Set(r.negocios.map(n => n.row.marca?.trim() ?? ''))]
    case 'closer': return [r.closer?.trim() ?? '']
    case 'sdr': return [...new Set(r.sdrs.map(s => s?.trim() ?? ''))]
  }
}

/** Um par por (reunião, valor) — entrada de `breakdownPorCategoria`. */
export function paresPorDimensao(rs: Reuniao[], dim: DimReuniao): { valor: string }[] {
  return rs.flatMap(r => valoresDaReuniao(r, dim).map(valor => ({ valor })))
}

/** `ignorar` deixa uma dimensão de fora (o gráfico dela conta sem o próprio filtro). */
export function filtrarReunioesPorGraficos(rs: Reuniao[], filtro: FiltroReunioes, ignorar?: DimReuniao): Reuniao[] {
  const ativas = DIMS.filter(d => d !== ignorar && filtro[d].length > 0)
  if (ativas.length === 0) return rs
  return rs.filter(r => ativas.every(d => valoresDaReuniao(r, d).some(v => filtro[d].includes(v))))
}

export function temFiltroReunioes(filtro: FiltroReunioes): boolean {
  return DIMS.some(d => filtro[d].length > 0)
}
