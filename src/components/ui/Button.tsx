import type { ReactNode, MouseEvent, CSSProperties } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark'
  size?: 'sm' | 'md'
  iconLeft?: ReactNode
  iconRight?: ReactNode
  disabled?: boolean
  style?: CSSProperties
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit' | 'reset'
}

const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 'var(--radius-pill)',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  letterSpacing: '0.02em',
  border: '1px solid transparent',
  cursor: 'pointer',
  lineHeight: 1,
  transition: 'filter .15s ease, transform .05s ease',
  whiteSpace: 'nowrap' as const,
}

const VARIANTS: Record<string, CSSProperties> = {
  primary:   { background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)' },
  secondary: { background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', border: '1px solid var(--ws-border-strong)' },
  ghost:     { background: 'transparent', color: 'var(--ws-vinho-b)' },
  dark:      { background: 'var(--ws-vinho-a)', color: '#FFFFFF' },
}

const SIZES: Record<string, CSSProperties> = {
  sm: { fontSize: 13, padding: '7px 14px', height: 32 },
  md: { fontSize: 14, padding: '10px 20px', height: 40 },
}

export function Button({
  children, variant = 'primary', size = 'md',
  iconLeft, iconRight, disabled, style, onClick, type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(.98)')}
      onMouseUp={e => (e.currentTarget.style.transform = '')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}
      style={{ ...BASE, ...VARIANTS[variant], ...SIZES[size], opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  )
}
