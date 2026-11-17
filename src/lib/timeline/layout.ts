import { toLocalDate } from '@/lib/dateUtils'
import type { Camada } from './tipos'

/** Cores da linha do tempo por camada/desfecho (mesmas do card do quadro). */
export const CORES = {
  MQL: 'var(--ws-text-primary)', SDR: 'var(--ws-vinho-b)', Closer: 'var(--ws-verde)',
  Desfecho: '#E0A928', // sem token de design system pra esse dourado
  ganho: '#E0A928', // idem
  perda: 'var(--status-risco)', noShow: 'var(--status-atencao)', desconhecida: '#9CA3AF',
  hoje: 'var(--ws-border-strong)', reaberto: 'var(--ws-border-strong)',
} as const

export function corDaCamada(c: Camada): string { return CORES[c] }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "7 ago" no dia de Brasília. */
export function rotuloDia(d: Date): string {
  const iso = toLocalDate(d.toISOString()) ?? d.toISOString().slice(0, 10)
  const [, m, dia] = iso.split('-')
  return `${Number(dia)} ${MESES[Number(m) - 1]}`
}

/** "3 DIAS", "1 DIA", "5H" — usado no card do quadro. */
export function fmtDiasCurto(dias: number): string {
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))}H`
  const n = Math.round(dias)
  return n === 1 ? '1 DIA' : `${n} DIAS`
}

/** "12 dias", "1 dia", "5 h" — usado no resumo e no histórico. */
export function fmtDias(dias: number): string {
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))} h`
  const n = Math.round(dias)
  return n === 1 ? '1 dia' : `${n} dias`
}

/** "14:07" no horário de Brasília. */
export function horaBR(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "sex, 17 out" a partir de 'YYYY-MM-DD' (dia de Brasília). */
export function rotuloDiaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return `${DIAS_SEMANA[dow]}, ${d} ${MESES[m - 1]}`
}
