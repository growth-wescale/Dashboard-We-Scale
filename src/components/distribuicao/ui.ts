import type { CSSProperties } from 'react'
import type { ModoRegra, ResultadoAtribuicao } from '@/lib/distribuicao/regras'

export const th: CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', padding: '8px 10px', whiteSpace: 'nowrap' }
export const td: CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', fontSize: 13, whiteSpace: 'nowrap' }
export const tdNum: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export function pill(bg: string, fg: string): CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }
}

export const MODO_VISUAL: Record<ModoRegra, { label: string; bg: string; fg: string }> = {
  desligado: { label: 'Desligado', bg: 'var(--ws-bg)', fg: 'var(--ws-text-secondary)' },
  sombra:    { label: 'Sombra',    bg: 'var(--status-atencao-bg)', fg: 'var(--status-atencao)' },
  ativo:     { label: 'Ativo',     bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
}

export const RESULTADO_VISUAL: Record<ResultadoAtribuicao, { label: string; bg: string; fg: string }> = {
  atribuido: { label: 'Atribuído',          bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
  simulado:  { label: 'Simulado',           bg: 'var(--status-atencao-bg)',  fg: 'var(--status-atencao)' },
  barrado:   { label: 'Barrado',            bg: 'var(--ws-bg)',              fg: 'var(--ws-text-secondary)' },
  duplicado: { label: 'Duplicado',          bg: 'var(--ws-bg)',              fg: 'var(--ws-text-secondary)' },
  fallback:  { label: 'Responsável padrão', bg: 'var(--status-atencao-bg)',  fg: 'var(--status-atencao)' },
  erro:      { label: 'Erro',               bg: 'var(--status-risco-bg)',    fg: 'var(--status-risco)' },
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtRelativo(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return fmtDataHora(iso)
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

export const botaoTexto = (cor = 'var(--brand-accent)'): CSSProperties => ({
  border: 'none', background: 'none', padding: '4px 6px', fontSize: 13, fontWeight: 600, color: cor, cursor: 'pointer', fontFamily: 'var(--font-body)',
})
