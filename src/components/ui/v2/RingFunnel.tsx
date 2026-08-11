import { Fragment } from 'react'
import { fmtK } from '@/lib/v2/format'

export interface RingStage {
  label: string
  value: number
  fmt?: (v: number) => string
}

interface Props {
  stages: RingStage[]
}

/** Funil de aquisição em anéis concêntricos decrescentes; cor mistura brand-accent + brand-dark. */
export function RingFunnel({ stages }: Props) {
  if (stages.length === 0) return null
  const max = stages[0].value || 1

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
      {stages.map((s, i) => {
        const ratio = s.value / max
        const t = 0.35 + 0.65 * ratio
        const size = 96 + 44 * ratio
        const color = `color-mix(in srgb, var(--brand-accent) ${Math.round(t * 100)}%, var(--brand-dark))`
        return (
          <Fragment key={s.label}>
            <div style={{
              flex: '1 1 0', minWidth: 128,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
            }}>
              <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  border: `${10 + 6 * ratio}px solid ${color}`,
                  boxShadow: '6px 4px 0 -2px color-mix(in srgb, var(--brand-dark) 45%, transparent)',
                }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)' }}>{s.label}</div>
                <div style={{
                  fontFamily: 'var(--font-ui, var(--font-body))', fontWeight: 500, fontSize: 22,
                  color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.fmt ? s.fmt(s.value) : fmtK(s.value)}
                </div>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--brand-accent)', fontSize: 20, flex: '0 0 auto', paddingBottom: 44 }}>→</div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
