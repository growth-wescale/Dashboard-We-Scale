import { useState, type ReactNode, type CSSProperties } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string | null
  periods?: string[] | null
  activePeriod?: string | null
  onPeriodChange?: (p: string) => void
  height?: number
  style?: CSSProperties
  children?: ReactNode
  right?: ReactNode
}

export function ChartCard({
  title, subtitle, periods, activePeriod, onPeriodChange,
  style, children, right,
}: ChartCardProps) {
  const [localPeriod, setLocalPeriod] = useState(periods?.[0] ?? null)
  const active = activePeriod ?? localPeriod

  function handlePeriod(p: string) {
    setLocalPeriod(p)
    onPeriodChange?.(p)
  }

  return (
    <div style={{
      background: 'var(--ws-surface)',
      border: '1px solid var(--ws-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-section)', lineHeight: 'var(--lh-heading)', color: 'var(--ws-text-primary)' }}>
            {title}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
          {periods && periods.length > 1 && (
            <div style={{ display: 'inline-flex', background: 'var(--ws-bg)', borderRadius: 'var(--radius-pill)', padding: 3, gap: 2 }}>
              {periods.map(p => (
                <button key={p} onClick={() => handlePeriod(p)} style={{
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                  background: active === p ? 'var(--ws-surface)' : 'transparent',
                  color: active === p ? 'var(--brand-accent)' : 'var(--ws-text-secondary)',
                  boxShadow: active === p ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .15s',
                }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}
