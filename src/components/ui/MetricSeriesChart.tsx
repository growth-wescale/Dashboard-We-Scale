import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MediaDailyRaw, Lead } from '@/lib/types'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'

type MetricKey = 'mql' | 'lead' | 'cpmql' | 'cpl' | 'ctr' | 'cpm' | 'connect'
type ChartType = 'bar' | 'line' | 'area'
type Granularity = 'day' | 'week' | 'month'

interface MetricDef {
  key: MetricKey
  label: string
  color: string
  unit: 'int' | 'brl' | 'pct'
  axis: 'volume' | 'derived'
}

const METRICS: MetricDef[] = [
  { key: 'mql',     label: 'MQL',          color: '#7C5CFF', unit: 'int', axis: 'volume'  },
  { key: 'lead',    label: 'Leads',        color: '#22C6A1', unit: 'int', axis: 'volume'  },
  { key: 'cpmql',   label: 'CP-MQL',       color: '#FF7043', unit: 'brl', axis: 'derived' },
  { key: 'cpl',     label: 'CPL',          color: '#F5A623', unit: 'brl', axis: 'derived' },
  { key: 'ctr',     label: 'CTR',          color: '#4A9EFF', unit: 'pct', axis: 'derived' },
  { key: 'cpm',     label: 'CPM',          color: '#B04AFF', unit: 'brl', axis: 'derived' },
  { key: 'connect', label: 'Connect Rate', color: '#00B8D9', unit: 'pct', axis: 'derived' },
]

interface State { enabled: boolean; type: ChartType }
type Config = Record<MetricKey, State>

const DEFAULT_CFG: Config = {
  mql:     { enabled: true,  type: 'bar'  },
  lead:    { enabled: true,  type: 'line' },
  cpmql:   { enabled: false, type: 'line' },
  cpl:     { enabled: false, type: 'line' },
  ctr:     { enabled: false, type: 'line' },
  cpm:     { enabled: false, type: 'line' },
  connect: { enabled: false, type: 'line' },
}

// ── formatters ────────────────────────────────────────────────────────────────
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR')
const fmtBrl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const fmtPct = (n: number) => n.toFixed(2) + '%'

function fmtValue(v: number, unit: MetricDef['unit']): string {
  if (!isFinite(v)) return '—'
  if (unit === 'int') return fmtInt(v)
  if (unit === 'brl') return fmtBrl(v)
  return fmtPct(v)
}

// ── bucketing ─────────────────────────────────────────────────────────────────
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function bucketKey(iso: string, gran: Granularity): string {
  const s = iso.slice(0, 10)
  if (gran === 'day') return s
  if (gran === 'month') return s.slice(0, 7)
  // week — Monday-start ISO-ish
  const d = parseISODate(s)
  const day = d.getDay() // 0=Sun, 1=Mon…6=Sat
  const diff = (day + 6) % 7 // days since Monday
  d.setDate(d.getDate() - diff)
  return toISODate(d)
}

function bucketLabel(key: string, gran: Granularity): string {
  if (gran === 'day') {
    const [_, m, d] = key.split('-')
    return `${d}/${m}`
  }
  if (gran === 'month') {
    const [_, m] = key.split('-')
    const names = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
    return names[Number(m) - 1]
  }
  const [_, m, d] = key.split('-')
  return `${d}/${m}`
}

// ── main component ────────────────────────────────────────────────────────────
interface Props {
  media: MediaDailyRaw[]
  leads: Lead[]
}

export function MetricSeriesChart({ media, leads }: Props) {
  const [gran, setGran] = useState<Granularity>('day')
  const [cfg, setCfg] = useState<Config>(DEFAULT_CFG)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState<number>(900)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWrapW(el.clientWidth || 900)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setHoverIdx(null), [wrapW, gran])

  const uniqueLeads = useMemo(() => deduplicateLeads(leads), [leads])

  const buckets = useMemo(() => {
    type Agg = {
      key: string
      spend: number
      impressoes: number
      cliques: number
      lpv: number
      leadsCount: number
      mqlCount: number
    }
    const map = new Map<string, Agg>()
    const get = (k: string): Agg => {
      let v = map.get(k)
      if (!v) { v = { key: k, spend: 0, impressoes: 0, cliques: 0, lpv: 0, leadsCount: 0, mqlCount: 0 }; map.set(k, v) }
      return v
    }

    for (const r of media) {
      const k = bucketKey(r.dia, gran)
      const a = get(k)
      a.spend      += r.spend_brl || 0
      a.impressoes += r.impressoes || 0
      a.cliques    += r.cliques_link || 0
      a.lpv        += r.lpv || 0
    }
    for (const l of uniqueLeads) {
      const k = bucketKey(l.dia, gran)
      const a = get(k)
      a.leadsCount += 1
      if (isLeadMql(l)) a.mqlCount += 1
    }

    const arr = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
    return arr.map(a => ({
      key:    a.key,
      values: {
        mql:     a.mqlCount,
        lead:    a.leadsCount,
        cpmql:   a.mqlCount    > 0 ? a.spend / a.mqlCount              : 0,
        cpl:     a.leadsCount  > 0 ? a.spend / a.leadsCount            : 0,
        ctr:     a.impressoes  > 0 ? (a.cliques / a.impressoes) * 100  : 0,
        cpm:     a.impressoes  > 0 ? (a.spend / a.impressoes) * 1000   : 0,
        connect: a.cliques     > 0 ? (a.lpv / a.cliques) * 100         : 0,
      } as Record<MetricKey, number>,
    }))
  }, [media, uniqueLeads, gran])

  const activeMetrics = METRICS.filter(m => cfg[m.key].enabled)

  const maxByMetric: Record<MetricKey, number> = useMemo(() => {
    const out = {} as Record<MetricKey, number>
    for (const m of METRICS) {
      let mx = 0
      for (const b of buckets) mx = Math.max(mx, b.values[m.key])
      out[m.key] = mx || 1
    }
    return out
  }, [buckets])

  // totals / avgs for legend chip
  const legendVal = (key: MetricKey): number => {
    const def = METRICS.find(m => m.key === key)!
    if (def.unit === 'int') {
      return buckets.reduce((s, b) => s + b.values[key], 0)
    }
    // derived: recompute from aggregated totals across whole range for accuracy
    const tot = buckets.reduce((s, b) => ({
      spend:  s.spend  + (b.values.cpl * b.values.lead + b.values.cpmql * 0), // fallback below
    }), { spend: 0 })
    void tot
    // simpler: compute from raw media & leads sums
    let spend = 0, impressoes = 0, cliques = 0, lpv = 0
    for (const r of media) {
      spend      += r.spend_brl || 0
      impressoes += r.impressoes || 0
      cliques    += r.cliques_link || 0
      lpv        += r.lpv || 0
    }
    const mqlT = buckets.reduce((s, b) => s + b.values.mql, 0)
    const leadT = buckets.reduce((s, b) => s + b.values.lead, 0)
    switch (key) {
      case 'cpmql':   return mqlT > 0 ? spend / mqlT : 0
      case 'cpl':     return leadT > 0 ? spend / leadT : 0
      case 'ctr':     return impressoes > 0 ? cliques / impressoes * 100 : 0
      case 'cpm':     return impressoes > 0 ? spend / impressoes * 1000 : 0
      case 'connect': return cliques > 0 ? lpv / cliques * 100 : 0
    }
    return 0
  }

  // ── layout ──────────────────────────────────────────────────────────────────
  // W follows container width; H scales down for narrow screens, up for wider —
  // clamped so it never gets awkward. Also nudged by data density so daily
  // (many points) gets a bit more vertical room than mensal.
  const W = Math.max(320, wrapW)
  const nBuckets = buckets.length
  const densityBonus = gran === 'day' ? 20 : gran === 'week' ? 10 : 0
  const aspect = W < 520 ? 0.55 : W < 780 ? 0.42 : W < 1100 ? 0.34 : 0.28
  const H = Math.round(Math.max(240, Math.min(420, W * aspect + densityBonus)))
  const PAD_L = 36
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 34
  const iw = W - PAD_L - PAD_R
  const ih = H - PAD_T - PAD_B
  const n = nBuckets
  const bw = n > 0 ? iw / n : 0

  const xCenter = (i: number) => PAD_L + bw * (i + 0.5)
  const yFor = (metric: MetricKey, v: number) => {
    const norm = v / maxByMetric[metric]
    return PAD_T + ih - norm * ih
  }

  // x-axis tick spacing — target ~60px between labels
  const targetTicks = Math.max(2, Math.min(n, Math.floor(iw / 60)))
  const tickStep = Math.max(1, Math.ceil(n / targetTicks))

  // hover column background rect
  const hoverX = hoverIdx !== null ? PAD_L + bw * hoverIdx : 0

  function toggleMetric(k: MetricKey) {
    setCfg(c => ({ ...c, [k]: { ...c[k], enabled: !c[k].enabled } }))
  }
  function cycleType(k: MetricKey) {
    setCfg(c => {
      const order: ChartType[] = ['bar', 'line', 'area']
      const cur = c[k].type
      const nx = order[(order.indexOf(cur) + 1) % order.length]
      return { ...c, [k]: { ...c[k], type: nx } }
    })
  }

  return (
    <div>
      {/* controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: 'var(--ws-bg)', borderRadius: 'var(--radius-pill)', padding: 3, gap: 2 }}>
          {(['day','week','month'] as Granularity[]).map(g => (
            <button
              key={g}
              onClick={() => setGran(g)}
              style={{
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
                padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                background: gran === g ? 'var(--ws-surface)' : 'transparent',
                color: gran === g ? 'var(--brand-accent)' : 'var(--ws-text-secondary)',
                boxShadow: gran === g ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {g === 'day' ? 'Diário' : g === 'week' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>
          Valores normalizados por métrica — passe o mouse para ver reais
        </div>
      </div>

      {/* legend / metric picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {METRICS.map(m => {
          const on = cfg[m.key].enabled
          const t = cfg[m.key].type
          const val = on ? legendVal(m.key) : 0
          return (
            <div
              key={m.key}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1px solid ${on ? m.color : 'var(--ws-border)'}`,
                background: on ? `color-mix(in srgb, ${m.color} 10%, var(--ws-surface))` : 'var(--ws-surface)',
                borderRadius: 'var(--radius-pill)',
                padding: '4px 4px 4px 10px',
                fontSize: 12, fontFamily: 'var(--font-body)',
                transition: 'all .15s',
              }}
            >
              <button
                onClick={() => toggleMetric(m.key)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, color: 'inherit' }}
                title={on ? 'Ocultar métrica' : 'Mostrar métrica'}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: on ? m.color : 'transparent', border: `1.5px solid ${m.color}` }} />
                <span style={{ fontWeight: 600, color: on ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)' }}>{m.label}</span>
                {on && (
                  <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    · {fmtValue(val, m.unit)}
                  </span>
                )}
              </button>
              {on && (
                <button
                  onClick={() => cycleType(m.key)}
                  title="Alternar tipo (barra/linha/área)"
                  style={{
                    border: 'none', cursor: 'pointer',
                    background: 'var(--ws-surface)', color: m.color,
                    borderRadius: 'var(--radius-pill)', padding: '2px 8px',
                    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  }}
                >
                  {t === 'bar' ? '▮ BAR' : t === 'line' ? '━ LINE' : '▲ AREA'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* chart */}
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={e => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * W
            const idx = Math.floor((x - PAD_L) / bw)
            setHoverIdx(idx >= 0 && idx < n ? idx : null)
          }}
          style={{ display: 'block', overflow: 'visible', maxWidth: '100%' }}
        >
          {/* grid lines (horizontal, 4 divisions) */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line
              key={f}
              x1={PAD_L} x2={PAD_L + iw}
              y1={PAD_T + ih * (1 - f)} y2={PAD_T + ih * (1 - f)}
              stroke="var(--ws-border)" strokeWidth={f === 0 ? 1 : 0.5} strokeDasharray={f === 0 ? '0' : '2 3'}
            />
          ))}

          {/* hover column */}
          {hoverIdx !== null && (
            <rect
              x={hoverX} y={PAD_T} width={bw} height={ih}
              fill="var(--brand-accent)" opacity={0.06}
            />
          )}

          {/* BAR metrics (behind) */}
          {activeMetrics.filter(m => cfg[m.key].type === 'bar').map((m, mi, arr) => {
            const groupBars = arr.length
            const barW = Math.max(2, (bw * 0.7) / groupBars)
            const offset = -bw * 0.35 + barW * mi + barW / 2
            return (
              <g key={m.key}>
                {buckets.map((b, i) => {
                  const y = yFor(m.key, b.values[m.key])
                  const h = PAD_T + ih - y
                  const x = xCenter(i) + offset - barW / 2
                  return (
                    <rect
                      key={i}
                      x={x} y={y} width={barW} height={Math.max(0, h)}
                      fill={m.color} opacity={0.85} rx={2}
                    />
                  )
                })}
              </g>
            )
          })}

          {/* AREA metrics */}
          {activeMetrics.filter(m => cfg[m.key].type === 'area').map(m => {
            if (buckets.length === 0) return null
            const pts = buckets.map((b, i) => `${xCenter(i)},${yFor(m.key, b.values[m.key])}`)
            const first = xCenter(0)
            const last  = xCenter(buckets.length - 1)
            const path = `M ${first},${PAD_T + ih} L ${pts.join(' L ')} L ${last},${PAD_T + ih} Z`
            return (
              <g key={m.key}>
                <path d={path} fill={m.color} opacity={0.18} />
                <polyline
                  points={pts.join(' ')}
                  fill="none" stroke={m.color} strokeWidth={2}
                />
              </g>
            )
          })}

          {/* LINE metrics (on top) */}
          {activeMetrics.filter(m => cfg[m.key].type === 'line').map(m => {
            if (buckets.length === 0) return null
            const pts = buckets.map((b, i) => `${xCenter(i)},${yFor(m.key, b.values[m.key])}`)
            return (
              <g key={m.key}>
                <polyline
                  points={pts.join(' ')}
                  fill="none" stroke={m.color} strokeWidth={2.2}
                />
                {buckets.map((b, i) => (
                  <circle
                    key={i}
                    cx={xCenter(i)}
                    cy={yFor(m.key, b.values[m.key])}
                    r={2.5}
                    fill={m.color}
                  />
                ))}
              </g>
            )
          })}

          {/* x-axis labels */}
          {buckets.map((b, i) => {
            if (i % tickStep !== 0 && i !== n - 1) return null
            return (
              <text
                key={b.key}
                x={xCenter(i)} y={H - 12}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--ws-text-secondary)"
              >
                {bucketLabel(b.key, gran)}
              </text>
            )
          })}
        </svg>

        {/* tooltip */}
        {hoverIdx !== null && buckets[hoverIdx] && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: `${(hoverX + bw + 8) / W * 100}%`,
              transform: (hoverX + 220) > W ? 'translateX(calc(-100% - 20px))' : 'none',
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border)',
              borderRadius: 8,
              padding: '8px 10px',
              boxShadow: 'var(--shadow-md)',
              fontSize: 12,
              minWidth: 170,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--ws-text-primary)' }}>
              {bucketLabel(buckets[hoverIdx].key, gran)}
              {gran === 'week' && <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400 }}> (semana)</span>}
              {gran === 'month' && <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400 }}> (mês)</span>}
            </div>
            {activeMetrics.map(m => (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color }} />
                <span style={{ color: 'var(--ws-text-secondary)', flex: 1 }}>{m.label}</span>
                <span style={{ fontWeight: 600, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtValue(buckets[hoverIdx].values[m.key], m.unit)}
                </span>
              </div>
            ))}
          </div>
        )}

        {n === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--ws-text-secondary)', fontSize: 13 }}>
            Sem dados no período selecionado.
          </div>
        )}
      </div>
    </div>
  )
}
