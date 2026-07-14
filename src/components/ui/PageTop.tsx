import type { ReactNode, CSSProperties } from 'react'

interface PageTopProps {
  title: string
  subtitle?: string | null
  actions?: ReactNode
  badge?: ReactNode
  style?: CSSProperties
}

export function PageTop({ title, subtitle, actions, badge, style }: PageTopProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap', ...style }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, color: 'var(--ws-text-primary)', lineHeight: 1.1 }}>{title}</h1>
          {badge}
        </div>
        {subtitle && <div style={{ fontSize: 13, fontWeight: 300, color: 'var(--ws-text-secondary)', marginTop: 6 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>
    </div>
  )
}
