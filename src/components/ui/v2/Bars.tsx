export interface BarDatum {
  label: string
  value: number
}

interface Props {
  data: BarDatum[]
  color?: string
  height?: number
}

export function Bars({ data, color = 'var(--brand-accent)', height = 200 }: Props) {
  const W = 520, H = height, padL = 8, padR = 8, padT = 12, padB = 40
  const iw = W - padL - padR, ih = H - padT - padB
  const max = Math.max(...data.map(d => d.value), 1) * 1.12
  const bw = (iw / Math.max(data.length, 1)) * 0.6

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={padL} x2={W - padR} y1={padT + ih * (1 - g)} y2={padT + ih * (1 - g)}
          stroke="var(--ws-border)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * (iw / data.length)
        const h = (d.value / max) * ih
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={padT + ih - h} width={bw} height={h} rx="3" fill={color} />
            <text x={cx} y={H - 22} textAnchor="middle" fontSize="10" fill="var(--ws-text-secondary)">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
