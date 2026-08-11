import { fmt } from '@/lib/v2/format'

export interface MiniStage {
  label: string
  value: number
  fmt?: (v: number) => string
}

interface Props {
  stages: MiniStage[]
}

/** Funil horizontal minimalista: 1 linha/etapa, barra sqrt-scaled + conversão % entre linhas. */
export function MiniFunnel({ stages }: Props) {
  if (stages.length === 0) return null
  const max = stages[0].value || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {stages.map((s, i) => {
        const w = Math.max(9, Math.sqrt(s.value / max) * 100)
        const conv = i > 0 ? s.value / (stages[i - 1].value || 1) : 1
        return (
          <div key={s.label}>
            {i > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0 3px 168px',
                color: 'var(--ws-text-secondary)', fontSize: 11.5,
              }}>
                <span style={{ opacity: 0.6 }}>↓</span>{(conv * 100).toFixed(1)}%
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 154, flex: '0 0 auto', fontSize: 13, color: 'var(--ws-text-secondary)', textAlign: 'right' }}>
                {s.label}
              </div>
              <div style={{ flex: 1, height: 34, background: 'var(--ws-bg)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{
                  width: `${w}%`, height: '100%',
                  background: `color-mix(in srgb, var(--brand-accent) ${Math.round(40 + 60 * (s.value / max))}%, var(--brand-dark))`,
                  borderRadius: 12, display: 'flex', alignItems: 'center', paddingLeft: 12,
                }}>
                  <span style={{ color: '#fff', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {s.fmt ? s.fmt(s.value) : fmt(s.value)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
