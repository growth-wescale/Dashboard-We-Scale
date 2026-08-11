export interface RadarAxis {
  key: string
  label: string
}

export interface RadarSeries {
  label: string
  color: string
  fill?: string
  values: Record<string, number> // valor 0..100 por eixo
}

interface Props {
  axes: RadarAxis[]
  series: RadarSeries[]
  size?: number
}

/** Radar/spider chart, múltiplas séries, valores em % (0..100). */
export function RadarChart({ axes, series, size = 340 }: Props) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 46
  const n = axes.length
  const ang = (i: number) => -Math.PI / 2 + (i / n) * 2 * Math.PI
  const pt = (i: number, t: number): [number, number] => [cx + r * t * Math.cos(ang(i)), cy + r * t * Math.sin(ang(i))]
  const ring = (t: number) => axes.map((_, i) => pt(i, t).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} style={{ maxWidth: size, overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map(t => (
        <polygon key={t} points={ring(t)} fill="none" stroke="var(--ws-border)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ws-border)" strokeWidth="1" />
      })}
      {series.map(s => {
        const poly = axes.map((a, i) =>
          pt(i, Math.max(0, Math.min(1, (s.values[a.key] || 0) / 100))).join(',')
        ).join(' ')
        return (
          <g key={s.label}>
            <polygon points={poly} fill={s.fill || 'none'} stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
            {axes.map((a, i) => {
              const [x, y] = pt(i, Math.max(0, Math.min(1, (s.values[a.key] || 0) / 100)))
              return <circle key={i} cx={x} cy={y} r="3" fill={s.color} />
            })}
          </g>
        )
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.16)
        return (
          <text key={i} x={x} y={y}
            textAnchor={Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end'}
            dominantBaseline="middle" fontSize="11.5" fontWeight="500"
            fill="var(--ws-text-secondary)">
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}
