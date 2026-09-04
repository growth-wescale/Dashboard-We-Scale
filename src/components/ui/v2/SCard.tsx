import type { CSSProperties, ReactNode } from 'react'

interface SCardProps {
  children?: ReactNode
  style?: CSSProperties
  pad?: number
  onClick?: () => void
}

export function SCard({ children, style, pad = 20, onClick }: SCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        background: 'var(--ws-surface)',
        border: '1px solid var(--ws-border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-sm)',
        padding: pad,
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'border-color .15s' : undefined,
        ...style,
      }}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-accent)' } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = '' } : undefined}
    >
      {children}
    </div>
  )
}

interface CardTitleProps {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
}

export function CardTitle({ title, sub, right }: CardTitleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-ui, var(--font-body))', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)', lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}
