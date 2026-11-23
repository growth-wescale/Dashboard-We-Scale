import type { AcaoBloqueio } from '@/lib/distribuicao/bloqueio'

export const ACAO_VISUAL: Record<AcaoBloqueio, { label: string; bg: string; fg: string }> = {
  bloqueio:    { label: 'Bloqueio',    bg: 'var(--status-risco-bg)',    fg: 'var(--status-risco)' },
  alteracao:   { label: 'Alteração',   bg: 'var(--status-atencao-bg)',  fg: 'var(--status-atencao)' },
  desbloqueio: { label: 'Desbloqueio', bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
}

/** Data e hora com ano (o histórico de um lead atravessa anos). */
export function fmtDataHoraAno(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const linkRd = (idDeal: string) => `https://crm.rdstation.com/app/deals/${idDeal}`
