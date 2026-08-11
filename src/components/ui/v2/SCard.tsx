import type { CSSProperties, ReactNode } from 'react'

interface SCardProps {
  children?: ReactNode
  style?: CSSProperties
  pad?: number
}

export function SCard({ children, style, pad = 20 }: SCardProps) {
  return (
    <div style={{
      background: 'var(--ws-surface)',
      border: '1px solid var(--ws-border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-sm)',
      padding: pad,
      ...style,
    }}>
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
