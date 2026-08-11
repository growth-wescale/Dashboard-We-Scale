interface Props<K extends string> {
  data: Array<Record<K, number> & Record<string, unknown>>
  aKey: K
  bKey: K
  aLabel: string
  bLabel: string
  aColor: string
  bColor: string
  xLabels?: (string | null)[]
  height?: number
}

/** Chart de duas séries com eixos Y independentes (esquerdo/direito). SVG puro. */
export function DualLine<K extends string>({ data, aKey, bKey, aLabel, bLabel, aColor, bColor, xLabels, height = 230 }: Props<K>) {
  const W = 560, H = height, padL = 8, padR = 8, padT = 16, padB = 26
  const iw = W - padL - padR, ih = H - padT - padB

  const av = data.map(d => d[aKey] as number)
  const bv = data.map(d => d[bKey] as number)
  const aMax = Math.max(...av) * 1.1, aMin = Math.min(...av) * 0.9
  const bMax = Math.max(...bv) * 1.1, bMin = Math.min(...bv) * 0.9

  const x = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * iw
  const yA = (v: number) => padT + ih - ((v - aMin) / ((aMax - aMin) || 1)) * ih
  const yB = (v: number) => padT + ih - ((v - bMin) / ((bMax - bMin) || 1)) * ih
  const path = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 8, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, background: aColor, borderRadius: 2 }} />{aLabel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, background: bColor, borderRadius: 2 }} />{bLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g}
            stroke="var(--ws-border)" strokeWidth="1" />
        ))}
        <path d={path(av, yA)} fill="none" stroke={aColor} strokeWidth="2.4" strokeLinejoin="round" />
        <path d={path(bv, yB)} fill="none" stroke={bColor} strokeWidth="2.4" strokeLinejoin="round" />
        {xLabels && xLabels.map((l, i) => l && (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--ws-text-secondary)" fontFamily="var(--font-body)">{l}</text>
        ))}
      </svg>
    </div>
  )
}
