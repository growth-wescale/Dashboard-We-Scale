import type { CSSProperties } from 'react'
import type { StatusMarca } from '@/lib/configMetas'

// Estilos compartilhados pelos 7 passos do Hub de Metas — antes cada
// componente reimplementava o mesmo cartão com `background: '#fff'` cru e
// cores de banner hardcoded (#FEE2E2 etc.), divergindo dos tokens que o
// resto do dashboard usa (--ws-surface, --status-risco-bg…). Centralizado
// aqui em 08/09/2026 durante a revisão de layout pedida pelo Junior.

export const cardStyle: CSSProperties = {
  background: 'var(--ws-surface)',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--sp-6)',
  boxShadow: 'var(--shadow-sm)',
}

export const sectionTitleStyle: CSSProperties = {
  margin: '0 0 12px 0',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--ws-text-primary)',
}

export const inputStyle: CSSProperties = {
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--ws-text-primary)',
  background: 'var(--ws-surface)',
}

export const primaryButtonStyle: CSSProperties = {
  padding: '10px 20px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--brand-accent)',
  color: 'var(--brand-accent-contrast)',
  fontSize: 'var(--fs-button)',
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: 'var(--tracking-button)',
}

export const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: 'var(--ws-surface)',
  border: '1px solid var(--ws-border-strong)',
  color: 'var(--ws-text-primary)',
}

export const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: 'var(--ws-border)',
  color: 'var(--ws-text-secondary)',
  cursor: 'not-allowed',
}

type BannerKind = 'erro' | 'atencao' | 'sucesso'

const BANNER_TOKENS: Record<BannerKind, { bg: string; fg: string }> = {
  erro: { bg: 'var(--status-risco-bg)', fg: 'var(--status-risco)' },
  atencao: { bg: 'var(--status-atencao-bg)', fg: 'var(--status-atencao)' },
  sucesso: { bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
}

export function bannerStyle(kind: BannerKind): CSSProperties {
  const t = BANNER_TOKENS[kind]
  return { padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: t.bg, color: t.fg }
}

export function bannerColor(kind: BannerKind): string {
  return BANNER_TOKENS[kind].fg
}


export const MESES_LABEL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** '2026-10-01' → 'Outubro 2026' */
export function nomeMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return `${MESES_LABEL[m - 1]} ${ano}`
}

/** '2026-10-01' → 'outubro' */
export function nomeMesMinusculo(mes: string): string {
  const [, m] = mes.split('-').map(Number)
  return MESES_LABEL[m - 1].toLowerCase()
}

export function capitalizar(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

export function fmtDec(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR')
}

export function fmtBRL(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
}

/** 0,4717 → '47,2%' */
export function fmtPct(taxa: number): string {
  return `${(taxa * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export type PillKind = 'neutro' | 'sucesso' | 'atencao' | 'erro' | 'destaque'

const PILL_CORES: Record<PillKind, { bg: string; fg: string }> = {
  neutro: { bg: 'var(--ws-bg)', fg: 'var(--ws-text-secondary)' },
  sucesso: { bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
  atencao: { bg: 'var(--status-atencao-bg)', fg: 'var(--status-atencao)' },
  erro: { bg: 'var(--status-risco-bg)', fg: 'var(--status-risco)' },
  destaque: { bg: 'color-mix(in srgb, var(--brand-accent) 12%, var(--ws-surface))', fg: 'var(--brand-accent)' },
}

export function pillStyle(kind: PillKind): CSSProperties {
  const c = PILL_CORES[kind]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
    padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.fg, whiteSpace: 'nowrap',
  }
}

export const STATUS_MARCA_UI: Record<StatusMarca, { rotulo: string; kind: PillKind }> = {
  nao_configurada: { rotulo: 'Não configurada', kind: 'neutro' },
  em_configuracao: { rotulo: 'Em configuração', kind: 'atencao' },
  configurada: { rotulo: 'Configurada', kind: 'sucesso' },
}

export const ghostButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none',
  padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ws-text-secondary)', cursor: 'pointer',
}

export const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: '7px 12px', fontSize: 13 }

/** Caixa de orientação ("o que fazer agora") — neutra, não é alerta. */
export const infoBoxStyle: CSSProperties = {
  padding: '12px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, lineHeight: 1.5,
  background: 'var(--ws-bg)', border: '1px dashed var(--ws-border-strong)', color: 'var(--ws-text-primary)',
}
