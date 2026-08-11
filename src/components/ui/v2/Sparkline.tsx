interface Props {
  values: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
}

/** Micro chart de linha ou área — ao lado de KPI. */
export function Sparkline({ values, color = 'var(--brand-accent)', width = 80, height = 22, fill = false }: Props) {
  if (values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - ((v - min) / range) * (height - 2) - 1
  const linePath = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')
  const areaPath = fill ? `${linePath} L ${width} ${height} L 0 ${height} Z` : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {fill && <path d={areaPath} fill={color} fillOpacity="0.15" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
