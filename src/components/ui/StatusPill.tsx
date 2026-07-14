import type { CSSProperties } from 'react'

type Status = 'positivo' | 'atencao' | 'risco'

interface StatusPillProps {
  status?: Status
  value?: string | null
  label?: string | null
  size?: 'sm' | 'md'
  style?: CSSProperties
}

const CONFIG = {
  positivo: { fg: 'var(--status-positivo)', dot: 'var(--status-positivo)', bg: 'var(--status-positivo-bg)' },
  atencao:  { fg: '#B77410',                dot: 'var(--status-atencao)',   bg: 'var(--status-atencao-bg)' },
  risco:    { fg: 'var(--status-risco)',     dot: 'var(--status-risco)',     bg: 'var(--status-risco-bg)' },
}

export function StatusPill({ status = 'positivo', value, label, size = 'md', style }: StatusPillProps) {
  const c = CONFIG[status]
  const pad = size === 'sm' ? '4px 9px' : '6px 12px'
  const fs = size === 'sm' ? 12 : 13

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      borderRadius: 'var(--radius-pill)',
      padding: pad,
      background: c.bg,
      color: c.fg,
      fontSize: fs,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flex: '0 0 auto' }} />
      {label && <span style={{ fontWeight: 500 }}>{label}</span>}
      {value && <span>{value}</span>}
    </span>
  )
}
