import type { ReactNode, CSSProperties } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  delta?: number | null
  deltaSuffix?: string
  deltaLabel?: string
  description?: ReactNode
  invertDelta?: boolean
  accent?: boolean
  style?: CSSProperties
  children?: ReactNode
}

export function MetricCard({
  label, value, unit, delta, deltaSuffix = '%', deltaLabel,
  description, invertDelta = false, accent = true, style, children,
}: MetricCardProps) {
  const hasDelta = delta != null
  const up = hasDelta && delta! >= 0
  const good = invertDelta ? !up : up
  const deltaColor = !hasDelta ? 'inherit' : good ? 'var(--status-positivo)' : 'var(--status-risco)'

  return (
    <div style={{
      background: 'var(--ws-surface)',
      border: '1px solid var(--ws-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style,
    }}>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 13,
        letterSpacing: '0.02em',
        color: 'var(--ws-text-secondary)',
      }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-metric)',
          lineHeight: 1,
          color: accent ? 'var(--brand-accent)' : 'var(--ws-text-primary)',
        }}>
          {value}{unit && <span style={{ fontSize: '0.5em', fontWeight: 500, marginLeft: 2 }}>{unit}</span>}
        </span>

        {hasDelta && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
            color: deltaColor,
          }}>
            <span style={{ fontSize: 11 }}>{up ? '▲' : '▼'}</span>
            {Math.abs(delta!)}{deltaSuffix}
            {deltaLabel && <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 2 }}>{deltaLabel}</span>}
          </span>
        )}
      </div>

      {description && (
        <div style={{ fontSize: 12, fontWeight: 300, color: 'var(--ws-text-secondary)', lineHeight: 1.4 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  )
}
