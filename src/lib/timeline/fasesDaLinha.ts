import { STAGE_DATE_FIELD, STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { diasEntre, type Desfecho, type Fase, type TipoFase } from './tipos'

const parse = (s: string | null | undefined): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
const menor = (ds: Array<Date | null>): Date | null =>
  ds.reduce<Date | null>((acc, d) => (d && (!acc || d < acc) ? d : acc), null)

/**
 * Fases (MQL · SDR · Closer) só a partir das datas de etapa da linha de
 * `vw_funil_vendas` — pro cartão Macro da lista, sem consultar eventos.
 * Início de cada fase = a data mais antiga das etapas daquela camada.
 */
export function fasesDaLinha(row: FunnelRow, agora: Date): { fases: Fase[]; desfecho: Desfecho; inicio: Date; fim: Date } {
  const etapas = STAGE_ORDER.filter(s => s !== 'MQL' && s !== 'Fechamento')
  const sdr = menor(etapas.filter(s => stageOwnerRole(s) === 'sdr').map(s => parse(row[STAGE_DATE_FIELD[s]])))
  const closer = menor(etapas.filter(s => stageOwnerRole(s) === 'closer').map(s => parse(row[STAGE_DATE_FIELD[s]])))
  const inicio = parse(row.data_novo_mql) ?? parse(row.data_criacao_original) ?? sdr ?? closer ?? agora

  let desfecho: Desfecho
  if (row.status_atual === 'Ganho') desfecho = { tipo: 'ganho', instante: parse(row.data_venda) ?? agora, momentoId: null }
  else if (row.status_atual === 'Perdido') desfecho = { tipo: 'perda', instante: parse(row.data_perdido) ?? agora, momentoId: null }
  else desfecho = { tipo: 'em_andamento', instante: agora, momentoId: null }
  const fim = desfecho.instante < inicio ? inicio : desfecho.instante

  const marcos: Array<[TipoFase, Date]> = [['MQL', inicio]]
  if (sdr && sdr > inicio) marcos.push(['SDR', sdr])
  if (closer && closer > (sdr ?? inicio)) marcos.push(['Closer', closer])
  const fases: Fase[] = marcos.map(([tipo, ini], i) => {
    const f = marcos[i + 1]?.[1] ?? fim
    return { tipo, inicio: ini, fim: f, duracaoDias: diasEntre(ini, f), ator: tipo === 'Closer' ? row.nome_closer : tipo === 'SDR' ? row.nome_sdr : null, etapas: 0, toques: 0, atrasados: 0, noShows: 0, reunioes: 0 }
  })
  return { fases, desfecho, inicio, fim }
}
