export interface ScatterPoint {
  x: number
  y: number
  size: number
  label?: string
}

interface Props {
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  height?: number
}

export function Scatter({ points, xLabel, yLabel, height = 300 }: Props) {
  const W = 560, H = height, padL = 46, padR = 14, padT = 14, padB = 34
  const iw = W - padL - padR, ih = H - padT - padB

  if (points.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ws-text-secondary)', fontSize: 12 }}>Sem dados</div>
  }

  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const xMax = Math.max(...xs) * 1.1, xMin = Math.min(...xs) * 0.85
  const yMax = Math.max(...ys) * 1.15, yMin = 0
  const sMax = Math.max(...points.map(p => p.size), 1)
  const X = (v: number) => padL + ((v - xMin) / ((xMax - xMin) || 1)) * iw
  const Y = (v: number) => padT + ih - ((v - yMin) / ((yMax - yMin) || 1)) * ih

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g}
          stroke="var(--ws-border)" strokeWidth="1" />
      ))}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={X(p.x)} cy={Y(p.y)} r={8 + 16 * (p.size / sMax)}
            fill="var(--brand-accent)" fillOpacity="0.28"
            stroke="var(--brand-accent)" strokeWidth="1.5" />
          {p.label && (
            <text x={X(p.x)} y={Y(p.y) - 12 - 16 * (p.size / sMax)}
              textAnchor="middle" fontSize="10.5" fill="var(--ws-text-secondary)">
              {p.label}
            </text>
          )}
        </g>
      ))}
      <text x={padL} y={H - 6} fontSize="11" fill="var(--ws-text-secondary)">{xLabel} →</text>
      <text x={10} y={padT + 6} fontSize="11" fill="var(--ws-text-secondary)"
        transform={`rotate(-90 10 ${padT + 6})`}>{yLabel} →</text>
    </svg>
  )
}
