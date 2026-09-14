import type { CSSProperties } from 'react'

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
