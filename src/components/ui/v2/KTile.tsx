import type { CSSProperties, ReactNode } from 'react'

interface KTileProps {
  label: ReactNode
  value: ReactNode
  delta?: number | null
  /** Se true, delta negativo = bom (ex: CP-MQL caiu). */
  invert?: boolean
  style?: CSSProperties
}

export function KTile({ label, value, delta, invert, style }: KTileProps) {
  const has = delta !== undefined && delta !== null
  const up = has && (delta as number) >= 0
  const good = invert ? !up : up
  return (
    <div style={{
      background: 'var(--ws-surface)',
      border: '1px solid var(--ws-border)',
      borderRadius: 18,
      boxShadow: 'var(--shadow-sm)',
      padding: '14px 16px',
      ...style,
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-ui, var(--font-body))', fontWeight: 400, fontSize: 26, color: 'var(--ws-text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {has && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
          fontSize: 12.5, fontWeight: 500,
          color: good ? 'var(--status-positivo)' : 'var(--status-risco)',
        }}>
          <span style={{ fontSize: 10 }}>{up ? '▲' : '▼'}</span>
          {Math.abs(delta as number)}%
        </div>
      )}
    </div>
  )
}
