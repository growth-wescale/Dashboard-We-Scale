import type { ReactNode, CSSProperties } from 'react'

type Tone = 'neutral' | 'brand' | 'positivo' | 'atencao' | 'risco'
type Variant = 'soft' | 'solid'

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  variant?: Variant
  style?: CSSProperties
}

const TONE_MAP: Record<Tone, { fg: string; bg: string; solidBg: string; solidFg: string }> = {
  neutral:  { fg: 'var(--ws-text-secondary)', bg: 'var(--ws-bg)',                                                solidBg: 'var(--ws-border-strong)',  solidFg: 'var(--ws-text-primary)' },
  brand:    { fg: 'var(--brand-accent)',       bg: 'color-mix(in srgb, var(--brand-accent) 14%, #fff)',          solidBg: 'var(--brand-accent)',      solidFg: 'var(--brand-accent-contrast)' },
  positivo: { fg: 'var(--status-positivo)',    bg: 'var(--status-positivo-bg)',                                  solidBg: 'var(--status-positivo)',   solidFg: '#fff' },
  atencao:  { fg: '#B77410',                   bg: 'var(--status-atencao-bg)',                                   solidBg: 'var(--status-atencao)',    solidFg: '#fff' },
  risco:    { fg: 'var(--status-risco)',        bg: 'var(--status-risco-bg)',                                     solidBg: 'var(--status-risco)',      solidFg: '#fff' },
}

function getStyles(tone: Tone, variant: Variant): CSSProperties {
  const t = TONE_MAP[tone]
  return variant === 'solid'
    ? { background: t.solidBg, color: t.solidFg }
    : { background: t.bg, color: t.fg }
}

export function Badge({ children, tone = 'neutral', variant = 'soft', style }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--fw-medium)' as unknown as number,
      fontSize: 12,
      letterSpacing: 'var(--tracking-button)',
      padding: '5px 10px',
      whiteSpace: 'nowrap',
      ...getStyles(tone, variant),
      ...style,
    }}>
      {children}
    </span>
  )
}
