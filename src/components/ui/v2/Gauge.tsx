interface Props {
  value: number
  max?: number
  /** Posição do "aviso" no eixo (marcador amarelo). */
  warn?: number
  /** Se true, valor cresce à esquerda. */
  invert?: boolean
  format?: (v: number) => string
}

/** Semicilíndrico 0..max, arc preenchida até `value`, linha amarela em `warn`. */
export function Gauge({ value, max = 100, warn, format }: Props) {
  const W = 220, H = 130, cx = W / 2, cy = H - 12, r = 92
  const a = (t: number) => Math.PI - t * Math.PI
  const pt = (t: number, rad = r): [number, number] => [cx + rad * Math.cos(a(t)), cy - rad * Math.sin(a(t))]
  const clampedT = Math.min(1, Math.max(0, value / max))

  const arc = (t0: number, t1: number, rad: number, w: number, color: string) => {
    const [x0, y0] = pt(t0, rad), [x1, y1] = pt(t1, rad)
    return <path d={`M ${x0} ${y0} A ${rad} ${rad} 0 ${t1 - t0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="butt" />
  }

  const warnLine = warn !== undefined ? pt(Math.min(1, Math.max(0, warn / max))) : null
  const disp = format ? format(value) : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth: 260 }}>
      {arc(0, 1, r, 22, 'var(--ws-border)')}
      {arc(0, clampedT, r, 22, 'var(--brand-accent)')}
      {warnLine && (
        <line x1={cx} y1={cy} x2={warnLine[0]} y2={warnLine[1]} stroke="var(--status-atencao)" strokeWidth="3" />
      )}
      <text x={pt(0, r + 14)[0]} y={cy + 6} textAnchor="middle" fontSize="11" fill="var(--ws-text-secondary)">0</text>
      <text x={cx} y={20} textAnchor="middle" fontSize="14" fontWeight="500" fill="var(--ws-text-primary)">{disp}</text>
      <text x={pt(1, r + 10)[0]} y={cy + 6} textAnchor="middle" fontSize="11" fill="var(--ws-text-secondary)">{max}</text>
    </svg>
  )
}
