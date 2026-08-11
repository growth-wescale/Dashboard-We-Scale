export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface Props {
  slices: DonutSlice[]
  size?: number
}

/** Donut chart (pie com furo central). SVG puro. */
export function Donut({ slices, size = 150 }: Props) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const r = size / 2, ir = r * 0.58, cx = r, cy = r
  let acc = 0

  const arc = (v: number): string => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2
    acc += v
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (ang: number, rad: number): [number, number] => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
    const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, ir), [x3, y3] = p(a0, ir)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ir} ${ir} 0 ${large} 0 ${x3} ${y3} Z`
  }

  if (total === 0) {
    return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}><circle cx={cx} cy={cy} r={r - 1} fill="var(--ws-border)" /></svg>
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices.map(s => <path key={s.label} d={arc(s.value)} fill={s.color} />)}
    </svg>
  )
}
