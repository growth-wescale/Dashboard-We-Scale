import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { SOP_CLOSED_MONTH_KEY, SOP_CLOSED_MONTH_LABEL } from '@/constants/sopConfig'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Download } from 'lucide-react'
import { useMediaData } from '@/hooks/useMediaData'
import { useLeads } from '@/hooks/useLeads'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { useMetas } from '@/hooks/useMetas'
import { deduplicateLeads, isLeadMql } from '@/lib/leadUtils'
import type { Lead, Marca } from '@/lib/types'
import { InverseFunnel } from '@/components/ui/InverseFunnel'
import { getMetaVendas, getVendasRealizadasOverride, getUnidadesVendidasOverride, getFunilTaxas } from '@/constants/metasVendas'
import { useMediaOdontoLegacy } from '@/hooks/useMediaOdontoLegacy'

// ── Date helpers ───────────────────────────────────────────────────────────────

interface WeekRange { start: string; end: string; label: string }
interface DateRanges {
  weeks: WeekRange[]
  fiveWeeksStart: string
  mtdCurStart: string; mtdCurEnd: string
  mtdPrevStart: string; mtdPrevEnd: string
  monthStart: string
  recentWeekLabel: string
  mtdLabel: string; mtdPrevLabel: string
  isClosed: boolean
  monthSuffix: string     // "MTD" quando em curso, "(fechado)" quando mês fechado
  antShort: string        // "MTD ant" ou "mês ant"
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

// Normaliza qualquer variação textual do campo capital
// ("50k_100k", "De R$ 50 mil a R$ 100 mil", "R$ 60.000 – R$ 100.000",
// "Entre R$ 200.000 e R$ 300.000", "Acima de R$ 400.000", "mais de 900k",
// "Até R$ 60.000", "acima_400k", "700 a 900", etc.) para uma faixa canônica.
type CapitalBucket =
  | { kind: 'ate';   upper: number }
  | { kind: 'acima'; lower: number }
  | { kind: 'range'; lower: number; upper: number }
  | { kind: 'unknown'; raw: string }

function extractAmounts(s: string): number[] {
  const out: number[] = []
  const re = /(\d+(?:\.\d{3})+|\d+)\s*(k|mil)?/gi
  for (const m of s.matchAll(re)) {
    const numStr = m[1]
    const suffix = m[2]?.toLowerCase()
    const hasThousandsDot = /\d\.\d{3}/.test(numStr)
    const n = parseInt(numStr.replace(/\./g, ''), 10)
    if (!Number.isFinite(n) || n <= 0) continue
    // "60.000" já é R$60mil literal; "60k" e "60 mil" também; número puro (< 1000)
    // assumimos que representa milhares (padrão das LPs deste dashboard).
    const mul = hasThousandsDot ? 1 : (suffix || n < 1000) ? 1000 : 1
    out.push(n * mul)
  }
  return out
}

function parseCapital(raw: string): CapitalBucket {
  const s = raw.toLowerCase().trim()
  if (s.startsWith('nao_') || s.startsWith('ainda_')) return { kind: 'unknown', raw }
  const amounts = extractAmounts(s)
  if (amounts.length === 0) return { kind: 'unknown', raw }
  if (/^(at[eé])[\s_]/.test(s) || s.startsWith('até'))  return { kind: 'ate',   upper: amounts[0] }
  if (/^(acima|mais)[\s_]/.test(s))                     return { kind: 'acima', lower: amounts[0] }
  if (amounts.length >= 2)                              return { kind: 'range', lower: Math.min(amounts[0], amounts[1]), upper: Math.max(amounts[0], amounts[1]) }
  return { kind: 'unknown', raw }
}

function formatBucketLabel(b: CapitalBucket): string {
  const fmt = (n: number) => n >= 1000 ? `R$${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k` : `R$${n}`
  if (b.kind === 'ate')   return `Até ${fmt(b.upper)}`
  if (b.kind === 'acima') return `Acima de ${fmt(b.lower)}`
  if (b.kind === 'range') return `${fmt(b.lower)} – ${fmt(b.upper)}`
  return b.raw
}

function bucketKey(b: CapitalBucket): string {
  if (b.kind === 'ate')   return `ate:${b.upper}`
  if (b.kind === 'acima') return `acima:${b.lower}`
  if (b.kind === 'range') return `range:${b.lower}-${b.upper}`
  return `raw:${b.raw}`
}

function bucketSort(b: CapitalBucket): number {
  if (b.kind === 'ate')   return 0
  if (b.kind === 'acima') return b.lower
  if (b.kind === 'range') return b.lower
  return Number.MAX_SAFE_INTEGER
}

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function weekLabel(start: string, end: string): string {
  const s = localDate(start), e = localDate(end)
  const sd = s.getDate(), sm = s.getMonth() + 1
  const ed = e.getDate(), em = e.getMonth() + 1
  if (sm === em) return `${sd}–${ed}/${String(em).padStart(2, '0')}`
  return `${sd}/${String(sm).padStart(2, '0')}–${ed}/${String(em).padStart(2, '0')}`
}

function shortMonth(year: number, month: number) {
  return new Date(year, month, 1)
    .toLocaleDateString('pt-BR', { month: 'long' })
    .replace(/^\w/, c => c.toUpperCase())
}

function computeRanges(closedMonth?: string): DateRanges {
  const isClosed = !!closedMonth
  const anchor = isClosed
    ? (() => { const [ay, am] = closedMonth!.split('-').map(Number); return new Date(ay, am, 0) })()
    : new Date()

  const dow = anchor.getDay()
  const daysSinceMon = (dow + 6) % 7
  // MTD: last Sunday BEFORE the current week. Fechado: last Sunday <= last day of month.
  const lastSun = new Date(anchor)
  if (isClosed) lastSun.setDate(anchor.getDate() - dow)
  else          lastSun.setDate(anchor.getDate() - daysSinceMon - 1)

  const weeks: WeekRange[] = []
  for (let i = 4; i >= 0; i--) {
    const wEnd = new Date(lastSun); wEnd.setDate(lastSun.getDate() - i * 7)
    const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6)
    const s = isoDate(wStart), e = isoDate(wEnd)
    weeks.push({ start: s, end: e, label: weekLabel(s, e) })
  }

  const y = anchor.getFullYear(), m = anchor.getMonth(), day = anchor.getDate()
  const prevM = m === 0 ? 11 : m - 1
  const prevY = m === 0 ? y - 1 : y
  const lastDayPrev = new Date(y, m, 0).getDate()

  return {
    weeks,
    fiveWeeksStart: weeks[0].start,
    mtdCurStart:  isoDate(new Date(y, m, 1)),
    mtdCurEnd:    isClosed ? isoDate(new Date(y, m + 1, 0)) : isoDate(anchor),
    mtdPrevStart: isoDate(new Date(prevY, prevM, 1)),
    mtdPrevEnd:   isClosed
      ? isoDate(new Date(prevY, prevM + 1, 0))
      : isoDate(new Date(prevY, prevM, Math.min(day, lastDayPrev))),
    monthStart:   isoDate(new Date(y, m, 1)),
    recentWeekLabel: weeks[4].label,
    mtdLabel:     shortMonth(y, m),
    mtdPrevLabel: shortMonth(prevY, prevM),
    isClosed,
    monthSuffix:  isClosed ? '(fechado)' : 'MTD',
    antShort:     isClosed ? 'mês ant' : 'MTD ant',
  }
}

// ── CRM helpers ────────────────────────────────────────────────────────────────

interface Funnel {
  mql: number; sql: number; diag: number; sal: number; fech: number
  perdido: { mql: number; sql: number; diagnostico: number; sal: number }
}

function buildFunnel(rows: VwMarketingFunil[], di: string, df: string): Funnel {
  const d = rows.filter(r => r.status_atual !== 'Excluído')
  return {
    mql:  d.filter(r => inPeriod(r.data_mql, di, df)).length,
    sql:  d.filter(r => inPeriod(r.data_sql, di, df)).length,
    diag: d.filter(r => inPeriod(r.data_diagnostico, di, df)).length,
    sal:  d.filter(r => inPeriod(r.data_sal, di, df)).length,
    fech: d.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).length,
    perdido: {
      mql:         d.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_mql, di, df) && !inPeriod(r.data_sql, di, df)).length,
      sql:         d.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sql, di, df) && !inPeriod(r.data_diagnostico, di, df)).length,
      diagnostico: d.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_diagnostico, di, df) && !inPeriod(r.data_sal, di, df)).length,
      sal:         d.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sal, di, df)).length,
    },
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `R$ ${(v/1_000).toFixed(1)}k`
  return `R$ ${Math.round(v)}`
}
function fmtBRLshort(v: number) {
  if (v >= 1_000) return `R$${(v/1_000).toFixed(1)}k`
  return `R$${Math.round(v)}`
}

// For CP metrics: lower is better → invert color
function deltaLabel(cur: number, prev: number, lowerIsBetter = false) {
  if (prev === 0 && cur === 0) return { txt: '—', col: 'var(--ws-text-secondary)' }
  if (prev === 0) return { txt: `+${cur}`, col: 'var(--status-positivo)' }
  const p = ((cur - prev) / prev) * 100
  const up = p >= 0
  const positive = lowerIsBetter ? !up : up
  return {
    txt: `${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%`,
    col: positive ? 'var(--status-positivo)' : 'var(--status-risco)',
  }
}

// ── Slide configs ──────────────────────────────────────────────────────────────

interface SlideConfig {
  id: string; label: string; subLabel?: string; marca: Marca; accent: string
  filterFranquia?: boolean
}

const SLIDES: SlideConfig[] = [
  { id: 'eletrovias',    label: 'Eletrovias',   marca: 'Eletrovias',   accent: '#ED6D3A' },
  { id: 'inpot',         label: 'Inpot',        marca: 'Inpot',        accent: '#C6D32D' },
  { id: 'b2case',        label: 'B2Case',       marca: 'B2Case',       accent: '#0169F2' },
  { id: 'liso',          label: 'Lisô Laser',   marca: 'Lisô Laser',   accent: '#FF6643' },
  { id: 'viva',          label: 'Viva',         marca: 'Viva',         accent: '#FF0069' },
  { id: 'ou-franquia',   label: 'Oral Unic',    subLabel: 'Franquia',  marca: 'Oral Unic',    accent: '#7F0C72', filterFranquia: true },
  { id: 'odonto-scale',  label: 'Odonto Scale', marca: 'Odonto Scale', accent: '#0ea5e9' },
]

// ── SVG Charts ─────────────────────────────────────────────────────────────────

function WeeklyBarChart({ values, labels, accent }: { values: number[]; labels: string[]; accent: string }) {
  const VW = 300, VH = 130, PAD_T = 22, PAD_B = 20, PAD_S = 4
  const n = values.length, max = Math.max(...values, 1)
  const chartH = VH - PAD_T - PAD_B
  const slotW = (VW - PAD_S * 2) / n
  const barW = slotW * 0.62

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {values.map((v, i) => {
        const bH = Math.max(3, (v / max) * chartH)
        const x = PAD_S + i * slotW + (slotW - barW) / 2
        const y = PAD_T + chartH - bH
        const isLast = i === n - 1
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH}
              fill={isLast ? accent : `${accent}66`} rx={2} />
            {v > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                fontSize={isLast ? 14 : 11} fontWeight={isLast ? 700 : 500}
                fill={isLast ? accent : 'var(--ws-text-secondary)'}>{v}</text>
            )}
            <text x={x + barW / 2} y={VH - 2} textAnchor="middle" fontSize={8} fill="#94a3b8">
              {labels[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SparkLine({ values, accent }: { values: number[]; accent: string }) {
  const VW = 300, VH = 70, PAD = 18
  const n = values.length
  if (n < 2) return null
  const valid = values.filter(v => v > 0)
  if (valid.length < 2) return null
  const max = Math.max(...valid, 1)
  const min = Math.min(...valid, 0)
  const range = max - min || 1
  const pts = values.map((v, i) => ({
    x: PAD + (i / (n - 1)) * (VW - PAD * 2),
    y: PAD + (1 - (v > 0 ? (v - min) / range : 0)) * (VH - PAD * 2),
    v,
  }))
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={accent} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={accent} />
          {(i === 0 || i === n - 1) && p.v > 0 && (
            <text x={p.x} y={p.y - 6} textAnchor={i === 0 ? 'start' : 'end'}
              fontSize={10} fill={accent} fontWeight={700}>
              {fmtBRLshort(p.v)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

interface MtdItem { label: string; cur: number; prev: number }

function MtdBarChart({ items, accent }: { items: MtdItem[]; accent: string }) {
  // Extra PAD_T so delta label (y=PAD_T-12) and bar value (y=PAD_T at max) never overlap
  const VW = 300, VH = 200, PAD_T = 52, PAD_B = 24
  const n = items.length
  const max = Math.max(...items.flatMap(it => [it.cur, it.prev]), 1)
  const chartH = VH - PAD_T - PAD_B
  const groupW = VW / n
  const bW = groupW * 0.30
  const gap = groupW * 0.06

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {/* Legend */}
      <rect x={6} y={4} width={10} height={10} fill="#CBD5E1" rx={2} />
      <text x={20} y={13} fontSize={10} fill="#64748b">Mês anterior</text>
      <rect x={90} y={4} width={10} height={10} fill={accent} rx={2} />
      <text x={104} y={13} fontSize={10} fill="#64748b">Mês atual</text>

      {items.map((it, gi) => {
        const cx = groupW * gi + groupW / 2
        const curH = Math.max(3, (it.cur / max) * chartH)
        const prevH = Math.max(3, (it.prev / max) * chartH)
        const prevX = cx - bW - gap / 2
        const curX = cx + gap / 2
        const delta = deltaLabel(it.cur, it.prev)
        return (
          <g key={gi}>
            <rect x={prevX} y={PAD_T + chartH - prevH} width={bW} height={prevH} fill="#CBD5E1" rx={2} />
            <rect x={curX}  y={PAD_T + chartH - curH}  width={bW} height={curH}  fill={accent}   rx={2} />
            {/* Values above bars */}
            <text x={prevX + bW/2} y={PAD_T + chartH - prevH - 4}
              textAnchor="middle" fontSize={12} fill="#94a3b8">{it.prev}</text>
            <text x={curX + bW/2}  y={PAD_T + chartH - curH - 4}
              textAnchor="middle" fontSize={13} fontWeight={700} fill={accent}>{it.cur}</text>
            {/* Delta — sits clearly above both bars with extra PAD_T */}
            <text x={cx} y={PAD_T - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill={delta.col}>
              {delta.txt}
            </text>
            {/* X label */}
            <text x={cx} y={VH - 6} textAnchor="middle" fontSize={12} fill="#64748b">{it.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

interface FunnelStage { label: string; count: number; perdido?: number }

// ── SopWaterfallFunnel ─────────────────────────────────────────────────────────

function SopWaterfallFunnel({ stages, accent }: { stages: FunnelStage[]; accent: string }) {
  const N      = stages.length
  const bandH  = 80
  const colW   = 100 / N
  const barMaxH = bandH - 16
  const baseY  = bandH - 4
  const maxV   = stages[0]?.count || 1
  const barY   = (v: number) => baseY - (v / maxV) * barMaxH
  const cx     = (i: number) => (i + 0.5) * colW
  const vals   = stages.map(s => s.count)
  const progPts  = vals.map((v, i) => `${cx(i)},${barY(v)}`).join(' ')
  const progArea = `${cx(0)},${baseY} ${progPts} ${cx(N - 1)},${baseY}`

  return (
    <div style={{ overflow: 'hidden' }}>
      {/* Top: stage name + count */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{
            padding: '8px 8px 6px',
            borderLeft:  i === 0 ? '1px solid #e2e8f0' : 'none',
            borderRight: '1px solid #e2e8f0',
            borderTop:   '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 10, color: 'var(--ws-text-secondary)', lineHeight: 1.25 }}>{s.label}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ws-text-primary)', marginTop: 2 }}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* Middle: SVG bar chart + conversion badges */}
      <div style={{ position: 'relative', height: bandH, borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
        <svg viewBox={`0 0 100 ${bandH}`} preserveAspectRatio="none" width="100%" height={bandH} style={{ position: 'absolute', inset: 0 }}>
          <polygon points={progArea} fill="#F0F2F5" stroke="#cbd5e1" strokeWidth="0.4" />
          {vals.map((v, i) => {
            const bw = colW * 0.5
            return <rect key={i} x={cx(i) - bw / 2} y={barY(v)} width={bw} height={baseY - barY(v)} fill={accent} rx="0.6" />
          })}
        </svg>
        {vals.map((v, i) => {
          const topY   = barY(v)
          const barH   = baseY - topY
          const inside = barH > 20
          const topPct = inside ? (topY + 4) / bandH * 100 : (topY - 14) / bandH * 100
          return (
            <div key={`lbl-${i}`} style={{
              position: 'absolute', left: `${cx(i)}%`, top: `${topPct}%`,
              transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700,
              color: inside ? '#fff' : 'var(--ws-text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              {v}
            </div>
          )
        })}
        {vals.slice(0, -1).map((v, i) => {
          const conv = v > 0 ? vals[i + 1] / v : 0
          return (
            <div key={i} style={{
              position: 'absolute', left: `${(i + 1) * colW}%`, top: '50%',
              transform: 'translate(-50%,-50%)',
              background: 'var(--ws-text-secondary)', color: '#fff', fontSize: 9.5, fontWeight: 700,
              padding: '2px 5px', borderRadius: 3, whiteSpace: 'nowrap',
            }}>
              {(conv * 100).toFixed(1)}%
            </div>
          )
        })}
      </div>

      {/* Bottom: drop row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {stages.map((s, i) => {
          const last    = i === N - 1
          const loss    = last ? 0 : vals[i] - vals[i + 1]
          const lossPct = last || vals[i] === 0 ? 0 : (loss / vals[i]) * 100
          return (
            <div key={s.label} style={{
              borderLeft:   i === 0 ? '1px solid #e2e8f0' : 'none',
              borderRight:  '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              padding: '4px 8px 8px',
            }}>
              {!last && (
                <>
                  <div style={{ textAlign: 'center', color: 'var(--status-risco)', fontSize: 11, lineHeight: 1, paddingTop: 4 }}>▼</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)' }}>{loss}</div>
                  <div style={{ fontSize: 10, color: 'var(--status-risco)', fontWeight: 600 }}>{lossPct.toFixed(1)}%</div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SopSlide ───────────────────────────────────────────────────────────────────

interface SopSlideProps {
  slide: SlideConfig; dates: DateRanges
  slideIndex: number; total: number
  onPrev: () => void; onNext: () => void
  isFullscreen: boolean; onToggleFullscreen: () => void
  exportHeight?: number
  monthMode: 'current' | 'closed'
  onMonthModeChange: (mode: 'current' | 'closed') => void
  closedMonthLabel: string
  onReady?: () => void   // chamado quando todos os hooks async terminaram (usado no export PDF)
}

function SopSlide({ slide, dates, slideIndex, total, onPrev, onNext, isFullscreen, onToggleFullscreen, exportHeight, monthMode, onMonthModeChange, closedMonthLabel, onReady }: SopSlideProps) {
  const acc = slide.accent
  const [filterFonte, setFilterFonte] = useState('__all__')
  const [funilPeriod, setFunilPeriod] = useState<'semana' | 'mes'>('mes')
  const [funilUnit, setFunilUnit] = useState<'one' | 'target'>('target')
  const [compareMonthKey, setCompareMonthKey] = useState<string | null>(null)

  // Compare range dinâmico (dropdown de mês). Default = mês anterior.
  // Sempre MTD: recorta pelo dia de hoje (ou último dia do mês, o que for menor),
  // independente do toggle Julho fechado — assim o gráfico compara os mesmos
  // dias iniciais de cada mês.
  const compareRange = useMemo(() => {
    const curKey = dates.monthStart.slice(0, 7)
    const [curY, curM] = curKey.split('-').map(Number)
    const defaultPrevM = curM === 1 ? 12 : curM - 1
    const defaultPrevY = curM === 1 ? curY - 1 : curY
    const key = compareMonthKey ?? `${defaultPrevY}-${String(defaultPrevM).padStart(2, '0')}`
    const [y, m] = key.split('-').map(Number)
    const start = isoDate(new Date(y, m - 1, 1))
    const lastDayOfMonth = new Date(y, m, 0).getDate()
    const todayDay = new Date().getDate()
    const day = Math.min(todayDay, lastDayOfMonth)
    const end = isoDate(new Date(y, m - 1, day))
    const label = shortMonth(y, m - 1)
    return { start, end, label, key }
  }, [compareMonthKey, dates])

  // Opções para o dropdown: últimos 12 meses, excluindo o mês corrente
  const monthOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = []
    const [curY, curM] = dates.monthStart.slice(0, 7).split('-').map(Number)
    for (let i = 1; i <= 12; i++) {
      let m = curM - i, y = curY
      while (m <= 0) { m += 12; y -= 1 }
      const key = `${y}-${String(m).padStart(2, '0')}`
      const label = `${shortMonth(y, m - 1)} ${String(y).slice(-2)}`
      opts.push({ key, label })
    }
    return opts
  }, [dates.monthStart])

  // ── Data hooks ───────────────────────────────────────────────────────────────
  // Odonto Scale (=Odonto Legacy/Consultoria) mora dentro da conta Oral Unic desde ~ago/26,
  // com histórico próprio até 27/jul/26. Usa hook que combina as duas fontes.
  const isOdontoLegacy = slide.marca === 'Odonto Scale'
  const mediaAllStd    = useMediaData({ marca: slide.marca, dataInicio: dates.fiveWeeksStart, dataFim: dates.mtdCurEnd })
  const mediaPrevStd   = useMediaData({ marca: slide.marca, dataInicio: compareRange.start,   dataFim: compareRange.end })
  const mediaAllOdl    = useMediaOdontoLegacy({ dataInicio: dates.fiveWeeksStart, dataFim: dates.mtdCurEnd })
  const mediaPrevOdl   = useMediaOdontoLegacy({ dataInicio: compareRange.start,   dataFim: compareRange.end })
  const allMedia  = isOdontoLegacy ? mediaAllOdl.data  : mediaAllStd.data
  const prevMedia = isOdontoLegacy ? mediaPrevOdl.data : mediaPrevStd.data
  const leadsAll   = useLeads({ marca: slide.marca, dataInicio: dates.fiveWeeksStart, dataFim: dates.mtdCurEnd })
  const leadsPrev  = useLeads({ marca: slide.marca, dataInicio: compareRange.start,   dataFim: compareRange.end })
  const crmCurRes  = useVendasFunil({ marca: slide.marca, dataInicio: dates.mtdCurStart,    dataFim: dates.mtdCurEnd })
  const crmPrevRes = useVendasFunil({ marca: slide.marca, dataInicio: compareRange.start,   dataFim: compareRange.end })
  const crmWeekRes = useVendasFunil({ marca: slide.marca, dataInicio: dates.weeks[4].start, dataFim: dates.weeks[4].end })
  const crmPriorRes= useVendasFunil({ marca: slide.marca, dataInicio: dates.weeks[3].start, dataFim: dates.weeks[3].end })
  const crmAllRes  = useVendasFunil({ marca: slide.marca })
  const metasRes   = useMetas({ marca: slide.marca, mes: dates.monthStart })
  const { data: allLeads } = leadsAll
  const { data: prevLeads } = leadsPrev
  const { data: rawCrmCur } = crmCurRes
  const { data: rawCrmPrev } = crmPrevRes
  const { data: rawCrmWeek } = crmWeekRes
  const { data: rawCrmPrior } = crmPriorRes
  const { data: rawCrmAll } = crmAllRes
  const { data: metas } = metasRes

  // Sinal pro downloadPDF: dispara onReady quando TODOS os fetches async terminaram
  const allLoaded =
    !mediaAllStd.loading && !mediaPrevStd.loading &&
    !mediaAllOdl.loading && !mediaPrevOdl.loading &&
    !leadsAll.loading && !leadsPrev.loading &&
    !crmCurRes.loading && !crmPrevRes.loading &&
    !crmWeekRes.loading && !crmPriorRes.loading &&
    !crmAllRes.loading && !metasRes.loading
  useEffect(() => {
    if (allLoaded) onReady?.()
  }, [allLoaded, onReady])

  const applyF = useCallback((rows: VwMarketingFunil[]) =>
    filterFonte === '__all__' ? rows : rows.filter(r => mapFonte(r.fonte) === filterFonte),
    [filterFonte])
  const crmCur   = useMemo(() => applyF(rawCrmCur),   [rawCrmCur,   applyF])
  const crmPrev  = useMemo(() => applyF(rawCrmPrev),  [rawCrmPrev,  applyF])
  const crmWeek  = useMemo(() => applyF(rawCrmWeek),  [rawCrmWeek,  applyF])
  const crmPrior = useMemo(() => applyF(rawCrmPrior), [rawCrmPrior, applyF])

  const filterLeads = useCallback((leads: Lead[]) => {
    if (slide.filterFranquia) return leads.filter(l => !l.formulario || l.formulario === 'oralunic_multistep')
    return leads
  }, [slide.filterFranquia])

  const filterMedia = useCallback(<T extends { campanha?: string | null }>(media: T[]) => {
    if (slide.filterFranquia) {
      // Franquia OU = campanhas SEM prefixo [LEGACY] (Comunidade) / [CMD] (Comunidade) / [ODL] (Odonto Legacy)
      return media.filter(r => {
        const c = (r.campanha ?? '').toUpperCase()
        return !c.includes('[LEGACY]') && !c.includes('LEGACY]') && !c.includes('[CMD]') && !c.includes('[ODL]')
      })
    }
    return media
  }, [slide.filterFranquia])

  const activeMedia     = useMemo(() => filterMedia(allMedia),  [allMedia,  filterMedia])
  const activePrevMedia = useMemo(() => filterMedia(prevMedia), [prevMedia, filterMedia])

  // mqlLeads kept for potential downstream use

  // ── Weekly computations ──────────────────────────────────────────────────────
  const weeklyData = useMemo(() => dates.weeks.map(w => {
    const wMedia = activeMedia.filter(r => r.dia >= w.start && r.dia <= w.end)
    const wLeads = filterLeads(deduplicateLeads(allLeads.filter(l => l.dia >= w.start && l.dia <= w.end)))
    const invest = wMedia.reduce((s, r) => s + r.spend_brl, 0)
    const leads  = wLeads.length
    const mql    = wLeads.filter(isLeadMql).length
    return { invest, leads, mql, cpmql: mql > 0 ? invest / mql : 0 }
  }), [activeMedia, allLeads, dates.weeks, filterLeads])

  const funnelWeek  = useMemo(() => buildFunnel(crmWeek, dates.weeks[4].start, dates.weeks[4].end), [crmWeek, dates.weeks])
  const funnelPrior = useMemo(() => buildFunnel(crmPrior, dates.weeks[3].start, dates.weeks[3].end), [crmPrior, dates.weeks])

  // ── MTD computations ─────────────────────────────────────────────────────────
  const mtdLeads     = useMemo(() => filterLeads(deduplicateLeads(allLeads.filter(l => l.dia >= dates.mtdCurStart))), [allLeads, dates.mtdCurStart, filterLeads])
  const mtdPrevLeads = useMemo(() => filterLeads(deduplicateLeads(prevLeads)), [prevLeads, filterLeads])

  const mtdInvest     = useMemo(() => activeMedia.filter(r => r.dia >= dates.mtdCurStart).reduce((s, r) => s + r.spend_brl, 0), [activeMedia, dates.mtdCurStart])
  const mtdPrevInvest = useMemo(() => activePrevMedia.reduce((s, r) => s + r.spend_brl, 0), [activePrevMedia])

  const mtdLeadsCnt = mtdLeads.length
  const mtdMql      = mtdLeads.filter(isLeadMql).length
  const mtdPrevMql  = mtdPrevLeads.filter(isLeadMql).length
  const mtdPrevLeadsCnt = mtdPrevLeads.length

  const funnelMtd  = useMemo(() => buildFunnel(crmCur, dates.mtdCurStart, dates.mtdCurEnd), [crmCur, dates.mtdCurStart, dates.mtdCurEnd])
  const funnelMtdP = useMemo(() => buildFunnel(crmPrev, compareRange.start, compareRange.end), [crmPrev, compareRange.start, compareRange.end])

  // ── Chart-specific: sempre MTD-vs-MTD (mesmo em modo Julho fechado) ──────────
  // Recorta o lado "atual" até o dia de hoje (ou último dia do mês, o que for menor),
  // pra que o gráfico compare os mesmos N dias iniciais de cada mês.
  const chartCurEnd = useMemo(() => {
    const [y, m] = dates.monthStart.slice(0, 7).split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const today = new Date().getDate()
    return isoDate(new Date(y, m - 1, Math.min(today, lastDay)))
  }, [dates.monthStart])

  const chartCurLeads = useMemo(
    () => filterLeads(deduplicateLeads(allLeads.filter(l => l.dia >= dates.mtdCurStart && l.dia <= chartCurEnd))),
    [allLeads, dates.mtdCurStart, chartCurEnd, filterLeads],
  )
  const chartPrevLeads = useMemo(
    () => filterLeads(deduplicateLeads(prevLeads.filter(l => l.dia >= compareRange.start && l.dia <= compareRange.end))),
    [prevLeads, compareRange.start, compareRange.end, filterLeads],
  )

  const chartCurMql  = chartCurLeads.filter(isLeadMql).length
  const chartPrevMql = chartPrevLeads.filter(isLeadMql).length

  const chartFunnelCur  = useMemo(
    () => buildFunnel(crmCur, dates.mtdCurStart, chartCurEnd),
    [crmCur, dates.mtdCurStart, chartCurEnd],
  )
  const chartFunnelPrev = useMemo(
    () => buildFunnel(crmPrev, compareRange.start, compareRange.end),
    [crmPrev, compareRange.start, compareRange.end],
  )

  const mtdCPMQL  = mtdMql > 0 ? mtdInvest / mtdMql : 0
  const mtdPrevCPMQL = mtdPrevMql > 0 ? mtdPrevInvest / mtdPrevMql : 0
  const mtdCPSQL  = funnelMtd.sql  > 0 ? mtdInvest / funnelMtd.sql  : 0
  const mtdPrevCPSQL = funnelMtdP.sql > 0 ? mtdPrevInvest / funnelMtdP.sql : 0

  // ── KPI cards: last complete week (weeks[4]) + comparison ───────────────────
  const w4 = weeklyData[4] ?? { invest: 0, leads: 0, mql: 0, cpmql: 0 }
  const w3 = weeklyData[3] ?? { invest: 0, leads: 0, mql: 0, cpmql: 0 }
  const w4sql = funnelWeek.sql, w3sql = funnelPrior.sql
  const w4sal = funnelWeek.sal, w3sal = funnelPrior.sal
  const w4cpsql = w4sql > 0 ? w4.invest / w4sql : 0
  const w3cpsql = w3sql > 0 ? w3.invest / w3sql : 0

  const mqlMeta    = metas.find(m => m.metrica === 'mql')?.valor_meta ?? 0
  const mqlMetaPct = mqlMeta > 0 ? Math.round((mtdMql / mqlMeta) * 100) : null

  const investMeta    = Number(metas.find(m => m.metrica === 'investimento')?.valor_meta ?? 0)
  const investMetaPct = investMeta > 0 ? Math.round((mtdInvest / investMeta) * 100) : null

  interface KpiCard {
    label: string; value: string
    semAnt: { txt: string; col: string }
    mtdAnt: { txt: string; col: string }
  }

  const kpiCards: KpiCard[] = [
    {
      label: 'INVEST.',
      value: fmtBRL(w4.invest),
      semAnt: deltaLabel(w4.invest, w3.invest),
      mtdAnt: deltaLabel(mtdInvest, mtdPrevInvest),
    },
    {
      label: 'LEADS',
      value: String(w4.leads),
      semAnt: deltaLabel(w4.leads, w3.leads),
      mtdAnt: deltaLabel(mtdLeadsCnt, mtdPrevLeadsCnt),
    },
    {
      label: 'MQL',
      value: String(w4.mql),
      semAnt: deltaLabel(w4.mql, w3.mql),
      mtdAnt: deltaLabel(mtdMql, mtdPrevMql),
    },
    {
      label: 'CP-MQL',
      value: w4.cpmql > 0 ? fmtBRL(w4.cpmql) : '—',
      semAnt: deltaLabel(w4.cpmql, w3.cpmql, true),
      mtdAnt: deltaLabel(mtdCPMQL, mtdPrevCPMQL, true),
    },
    {
      label: 'SQL',
      value: String(w4sql),
      semAnt: deltaLabel(w4sql, w3sql),
      mtdAnt: deltaLabel(funnelMtd.sql, funnelMtdP.sql),
    },
    {
      label: 'CP-SQL',
      value: w4cpsql > 0 ? fmtBRL(w4cpsql) : '—',
      semAnt: deltaLabel(w4cpsql, w3cpsql, true),
      mtdAnt: deltaLabel(mtdCPSQL, mtdPrevCPSQL, true),
    },
    {
      label: 'SAL',
      value: String(w4sal),
      semAnt: deltaLabel(w4sal, w3sal),
      mtdAnt: deltaLabel(funnelMtd.sal, funnelMtdP.sal),
    },
  ]

  // ── MTD chart items (sempre MTD-vs-MTD) ──────────────────────────────────────
  const mtdItems: MtdItem[] = [
    { label: 'MQL', cur: chartCurMql,        prev: chartPrevMql },
    { label: 'SQL', cur: chartFunnelCur.sql, prev: chartFunnelPrev.sql },
    { label: 'SAL', cur: chartFunnelCur.sal, prev: chartFunnelPrev.sal },
  ]

  // ── MQLs por faixa de capital de investimento ────────────────────────────────
  // Agrupa valores equivalentes (ex.: "50k_100k" e "De R$ 50 mil a R$ 100 mil"
  // caem no mesmo bucket canônico). Ignora "não possui" — quem preenche isso
  // não é MQL pela definição das LPs; registros assim são inconsistências.
  const mqlByCapital = useMemo(() => {
    const collect = (leads: Lead[]) => {
      const acc = new Map<string, { label: string; sort: number; count: number }>()
      for (const l of leads.filter(isLeadMql)) {
        const raw = l.dados_extras?.['capital'] ?? l.dados_extras?.['capital_disponivel']
        if (typeof raw !== 'string' || raw.trim() === '') continue
        const b = parseCapital(raw)
        if (b.kind === 'unknown') continue
        const k = bucketKey(b)
        const prev = acc.get(k)
        if (prev) prev.count += 1
        else acc.set(k, { label: formatBucketLabel(b), sort: bucketSort(b), count: 1 })
      }
      return acc
    }
    const cur  = collect(chartCurLeads)
    const prev = collect(chartPrevLeads)
    const keys = new Set<string>([...cur.keys(), ...prev.keys()])
    const rows: { label: string; sort: number; cur: number; prev: number }[] = []
    keys.forEach(k => {
      const meta = cur.get(k) ?? prev.get(k)!
      rows.push({ label: meta.label, sort: meta.sort, cur: cur.get(k)?.count ?? 0, prev: prev.get(k)?.count ?? 0 })
    })
    rows.sort((a, b) => a.sort - b.sort)
    return rows.map(({ label, cur: c, prev: p }) => ({ label, cur: c, prev: p }))
  }, [chartCurLeads, chartPrevLeads])

  // ── Funnel stages ─────────────────────────────────────────────────────────────
  // Fechado: usa override manual quando existir (RD Marketing não popula
  // `quantidade_unidades` — todo deal grava 1; override reflete unidades reais)
  const fechOverride = getUnidadesVendidasOverride(slide.marca, dates.monthStart.slice(0, 7))
  const funnelStages: FunnelStage[] = [
    { label: 'MQL',         count: mtdMql },
    { label: 'SQL',         count: funnelMtd.sql },
    { label: 'Diagnóstico', count: funnelMtd.diag },
    { label: 'SAL',         count: funnelMtd.sal },
    { label: 'Fechado',     count: fechOverride ?? funnelMtd.fech },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: exportHeight != null ? exportHeight : '100vh', background: 'var(--ws-bg)',
      fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 36px 16px', gap: 16,
      boxSizing: 'border-box', overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: acc, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {slide.label}
            </span>
            {slide.subLabel && (
              <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>— {slide.subLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
            {dates.recentWeekLabel} · visão executiva de performance e CRM
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)' }}>{slideIndex + 1}/{total}</span>
        <div style={{
          display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 12,
          overflow: 'hidden', background: '#fff',
        }}>
          {([
            { key: 'current' as const, label: 'MTD' },
            { key: 'closed'  as const, label: closedMonthLabel },
          ]).map(opt => {
            const on = monthMode === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => onMonthModeChange(opt.key)}
                style={{
                  padding: '4px 10px', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, outline: 'none',
                  background: on ? acc : 'transparent',
                  color: on ? '#fff' : 'var(--ws-text-secondary)',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <select
          value={filterFonte}
          onChange={e => setFilterFonte(e.target.value)}
          style={{ appearance: 'none', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11, background: '#fff', color: 'var(--ws-text-primary)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="__all__">Todas as fontes</option>
          {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={onPrev} style={navBtnStyle}><ChevronLeft size={13} /></button>
        <button onClick={onNext} style={navBtnStyle}><ChevronRight size={13} /></button>
        <button onClick={onToggleFullscreen} style={navBtnStyle}>
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* ── Semana: KPI strip (só no modo MTD) ── */}
      {!dates.isClosed && (
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            background: `${acc}14`, border: `1px solid ${acc}38`,
            borderRadius: 4, padding: '2px 9px',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.11em',
            color: acc, textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            Semana · {dates.recentWeekLabel}
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--ws-border)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {kpiCards.map(card => (
            <div key={card.label} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '14px 20px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ws-text-primary)', lineHeight: 1.1, marginBottom: 6 }}>
                {card.value}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, color: card.semAnt.col, lineHeight: 1.3 }}>
                  {card.semAnt.txt} <span style={{ color: 'var(--ws-text-secondary)' }}>sem ant</span>
                </div>
                <div style={{ fontSize: 12, color: card.mtdAnt.col, lineHeight: 1.3 }}>
                  {card.mtdAnt.txt} <span style={{ color: 'var(--ws-text-secondary)' }}>vs {compareRange.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── Mês (MTD): charts + funnel ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            background: '#2ABCB514', border: '1px solid #2ABCB538',
            borderRadius: 4, padding: '2px 9px',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.11em',
            color: 'var(--status-positivo)', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            Mês · {dates.mtdLabel}
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--ws-border)' }} />
        </div>

        {/* Grid: 3 cols (MTD) | 2 cols equal (fechado) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: dates.isClosed ? '1fr 1fr' : '1fr 1fr 1.4fr',
          gap: 14, flex: 1, minHeight: 0,
        }}>

        {/* Col 1: MQL semanal + CP-MQL (oculto no modo fechado) */}
        {!dates.isClosed && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 6 }}>
            <div style={colTitle(acc)}>MQL Semanal</div>
          </div>
          <div style={{ height: 180 }}>
            <WeeklyBarChart
              values={weeklyData.map(w => w.mql)}
              labels={dates.weeks.map(w => w.label)}
              accent={acc}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
              CP-MQL
            </div>
            <div style={{ height: 110 }}>
              <SparkLine values={weeklyData.map(w => w.cpmql)} accent={acc} />
            </div>
          </div>
        </div>
        )}

        {/* Col 2: MTD comparativo */}
        <div style={{ ...cardStyle, overflowY: 'auto' }}>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={colTitle(acc)}>{compareRange.label} MTD vs {dates.mtdLabel} MTD</div>
            <select
              value={compareRange.key}
              onChange={e => setCompareMonthKey(e.target.value)}
              style={{
                appearance: 'none', padding: '3px 8px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 10, background: '#fff',
                color: 'var(--ws-text-primary)', cursor: 'pointer', outline: 'none',
                fontWeight: 600,
              }}
              title="Mês comparativo"
            >
              {monthOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ height: 240, flexShrink: 0 }}>
            <MtdBarChart items={mtdItems} accent={acc} />
          </div>
          {investMetaPct !== null && (
            <div style={{
              marginTop: 10, flexShrink: 0,
              background: 'var(--ws-bg)', border: '1px solid #e2e8f0', borderRadius: 6,
              padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase' }}>
                  Investimento
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtBRL(mtdInvest)} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 500 }}>/ {fmtBRL(investMeta)}</span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--ws-border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(investMetaPct, 100)}%`, height: '100%', borderRadius: 2,
                    background: investMetaPct >= 85 ? 'var(--status-positivo)' : investMetaPct >= 60 ? 'var(--status-atencao)' : 'var(--status-risco)',
                    transition: 'width .5s',
                  }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 38, textAlign: 'right',
                  color: investMetaPct >= 85 ? 'var(--status-positivo)' : investMetaPct >= 60 ? 'var(--status-atencao)' : 'var(--status-risco)',
                }}>
                  {investMetaPct}%
                </span>
              </div>
            </div>
          )}
          {mqlMetaPct !== null && (
            <div style={{ marginTop: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ws-text-secondary)', marginBottom: 4 }}>
                <span>Meta MQL: {mqlMeta}</span>
                <span style={{ fontWeight: 700, color: mqlMetaPct >= 85 ? 'var(--status-positivo)' : mqlMetaPct >= 60 ? 'var(--status-atencao)' : 'var(--status-risco)' }}>
                  {mqlMetaPct}% atingido
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--ws-border)', borderRadius: 2 }}>
                <div style={{
                  width: `${Math.min(mqlMetaPct, 100)}%`, height: '100%', borderRadius: 2,
                  background: mqlMetaPct >= 85 ? 'var(--status-positivo)' : mqlMetaPct >= 60 ? 'var(--status-atencao)' : 'var(--status-risco)',
                  transition: 'width .5s',
                }} />
              </div>
            </div>
          )}
          {mqlByCapital.length > 0 && (
            <div style={{ marginTop: 12, flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                MQLs por capital de investimento
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 40px 40px',
                gap: 8, padding: '0 8px', marginBottom: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                color: 'var(--ws-text-secondary)', textTransform: 'uppercase',
              }}>
                <span></span>
                <span style={{ textAlign: 'right' }}>{compareRange.label}</span>
                <span style={{ textAlign: 'right' }}>{dates.mtdLabel}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {mqlByCapital.map(row => (
                  <div key={row.label} style={{
                    display: 'grid', gridTemplateColumns: '1fr 40px 40px',
                    gap: 8, alignItems: 'baseline',
                    padding: '4px 8px', background: 'var(--ws-bg)',
                    borderRadius: 4, fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--ws-text-primary)' }}>{row.label}</span>
                    <span style={{ textAlign: 'right', color: row.prev > 0 ? 'var(--ws-text-secondary)' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                      {row.prev}
                    </span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: row.cur > 0 ? 'var(--ws-text-primary)' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                      {row.cur}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Col 3: Funil inverso vs meta do período */}
        {(() => {
          const mesKey = dates.monthStart.slice(0, 7)
          const metaMes = getMetaVendas(slide.marca, mesKey)
          const [yStr, mStr] = mesKey.split('-')
          const diasNoMes = new Date(Number(yStr), Number(mStr), 0).getDate()
          const dayNum = Number(dates.mtdCurEnd.slice(-2))
          const pctMes = dates.isClosed ? 1 : Math.max(0.01, dayNum / diasNoMes)

          // Ajustes por período (semana = weeks[4], meta / 4, pct = 1 pois é semana completa)
          const isSemana = funilPeriod === 'semana'
          const actualData = isSemana ? rawCrmWeek : rawCrmCur
          const metaPeriodo = metaMes == null
            ? null
            : isSemana ? metaMes / 4 : metaMes
          const pctPeriod = isSemana ? 1 : pctMes
          const periodLabel = isSemana ? 'semana' : 'mês'
          // Override manual de vendas (só em período mês):
          // - Mês fechado → getVendasRealizadasOverride (números confirmados manualmente)
          // - Mês corrente → getUnidadesVendidasOverride (RD Marketing não popula quantidade_unidades)
          const vendasOverride = isSemana
            ? null
            : dates.isClosed
              ? getVendasRealizadasOverride(slide.marca, mesKey)
              : getUnidadesVendidasOverride(slide.marca, mesKey)

          return (
            <div style={{ ...cardStyle, overflow: dates.isClosed ? 'hidden' : 'visible' }}>
              <div style={{
                marginBottom: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
              }}>
                <div style={colTitle(acc)}>Funil inverso</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ToggleGroup
                    accent={acc}
                    value={funilPeriod}
                    onChange={v => setFunilPeriod(v as 'semana' | 'mes')}
                    options={[
                      { key: 'semana', label: 'Semana' },
                      { key: 'mes',    label: 'Mês' },
                    ]}
                  />
                  {!(dates.isClosed && !isSemana) && (
                    <ToggleGroup
                      accent={acc}
                      value={funilUnit}
                      onChange={v => setFunilUnit(v as 'one' | 'target')}
                      options={[
                        { key: 'one',    label: '1 venda' },
                        { key: 'target', label: 'Meta' },
                      ]}
                    />
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: dates.isClosed ? 'hidden' : 'visible' }}>
                {dates.isClosed && !isSemana ? (
                  <ClosedInverseFunnel
                    marca={slide.marca}
                    meta={metaMes}
                    vendas={vendasOverride}
                    accent={acc}
                    monthLabel={closedMonthLabel}
                  />
                ) : (
                  <InverseFunnel
                    histData={rawCrmAll}
                    actualData={actualData}
                    meta={metaPeriodo}
                    pctPeriod={pctPeriod}
                    unit={funilUnit}
                    periodLabel={periodLabel}
                    accent={acc}
                    vendasOverride={vendasOverride}
                  />
                )}
              </div>
            </div>
          )
        })()}
      </div>

        {/* ── Horizontal Waterfall Funnel ── */}
        {funnelStages.length > 0 && (
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', flexShrink: 0,
          }}>
            <div style={{ padding: '10px 16px 0' }}>
              <div style={colTitle(acc)}>{`Funil — ${dates.mtdLabel}`}</div>
            </div>
            <SopWaterfallFunnel stages={funnelStages} accent={acc} />
          </div>
        )}
      </div>{/* end Mês wrapper */}

      {/* ── Footer bar ── */}
      <div style={{ height: 4, background: acc, borderRadius: 2, flexShrink: 0 }} />
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
  color: 'var(--ws-text-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
}

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
  padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0,
}

function colTitle(accent: string): React.CSSProperties {
  return { fontSize: 14, fontWeight: 700, color: accent, marginBottom: 2, letterSpacing: '-0.01em' }
}

interface ToggleGroupProps {
  value: string
  onChange: (v: string) => void
  options: { key: string; label: string }[]
  accent: string
}
function ToggleGroup({ value, onChange, options, accent }: ToggleGroupProps) {
  return (
    <div style={{
      display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 8,
      overflow: 'hidden', background: '#fff',
    }}>
      {options.map(opt => {
        const on = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              padding: '3px 9px', border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, outline: 'none',
              background: on ? accent : 'transparent',
              color: on ? '#fff' : 'var(--ws-text-secondary)',
              letterSpacing: '0.02em',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── ClosedInverseFunnel — funil inverso simplificado pra mês fechado ────────────────
// Projeta volumes necessários por etapa a partir da meta + taxas históricas hardcoded.
// Zero fetch — cálculo puro. Usado só quando o toggle "Julho" está ativo + período Mês.
interface ClosedInverseFunnelProps {
  marca: Marca
  meta: number | null
  vendas: number | null   // realizado em unidades
  accent: string
  monthLabel: string
}
function ClosedInverseFunnel({ marca, meta, vendas, accent, monthLabel }: ClosedInverseFunnelProps) {
  if (meta == null) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
        Sem meta cadastrada para {monthLabel}
      </div>
    )
  }
  const taxas = getFunilTaxas(marca)
  // Volumes necessários (topo → base) para bater a META.
  // Cada etapa = próxima ÷ taxa. Ex: Opp = Vendas / taxa_venda_por_opp.
  const oppNeeded  = meta / taxas.venda_por_opp
  const salNeeded  = oppNeeded / taxas.opp_por_sal
  const diagNeeded = salNeeded / taxas.sal_por_diag
  const sqlNeeded  = diagNeeded / taxas.diag_por_sql
  const mqlNeeded  = sqlNeeded / taxas.sql_por_mql

  const stages = [
    { key: 'venda',   label: 'Vendas',      needed: meta,       rate: taxas.venda_por_opp, rateLabel: 'Vendas/Opp', isTop: true },
    { key: 'opp',     label: 'Oportunidades', needed: oppNeeded, rate: taxas.opp_por_sal,   rateLabel: 'Opp/SAL' },
    { key: 'sal',     label: 'SAL',         needed: salNeeded,  rate: taxas.sal_por_diag,  rateLabel: 'SAL/R1' },
    { key: 'diag',    label: 'R1 (Diag.)',  needed: diagNeeded, rate: taxas.diag_por_sql,  rateLabel: 'R1/SQL' },
    { key: 'sql',     label: 'SQL',         needed: sqlNeeded,  rate: taxas.sql_por_mql,   rateLabel: 'SQL/MQL' },
    { key: 'mql',     label: 'MQL',         needed: mqlNeeded,  rate: null,                rateLabel: '' },
  ]

  const v = vendas ?? 0
  const pctVendas = meta > 0 ? (v / meta) * 100 : 0
  const colorVendas = pctVendas >= 100 ? '#16a34a' : pctVendas >= 70 ? '#eab308' : '#dc2626'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#334155' }}>
      {/* Header com meta */}
      <div style={{ padding: '8px 10px', background: accent, color: '#fff', borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
            Meta de vendas · {monthLabel}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
            {meta}
          </span>
        </div>
        <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
          Volumes abaixo = <strong>necessário pra bater {meta} venda{meta === 1 ? '' : 's'}</strong> · ~{formatNum(mqlNeeded / meta)} MQL por venda
        </div>
      </div>

      {/* Linhas do funil */}
      {stages.map((s) => {
        const isVenda = s.key === 'venda'
        const displayNeeded = Math.ceil(s.needed)
        const showActual = isVenda   // só na linha vendas mostramos o realizado
        const progressPct = isVenda ? Math.min(200, pctVendas) : 100
        const color = isVenda ? colorVendas : '#64748b'

        return (
          <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '78px 1fr 60px',
              gap: 8, alignItems: 'center', padding: '5px 8px',
              background: s.isTop ? '#fef3c7' : '#f8fafc',
              border: `1px solid ${s.isTop ? '#fbbf24' : '#e2e8f0'}`,
              borderRadius: 6,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>
                {s.label}
              </span>
              <div style={{ position: 'relative', height: 14, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, progressPct)}%`, background: color,
                }} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: progressPct > 50 ? '#fff' : '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {showActual ? `${v} de ${displayNeeded}` : `precisa ${displayNeeded}`}
                </div>
              </div>
              <span style={{
                textAlign: 'right', fontSize: 10, fontWeight: 700,
                color: isVenda ? color : '#94a3b8', fontVariantNumeric: 'tabular-nums',
              }}>
                {isVenda ? `${Math.round(pctVendas)}%` : '—'}
              </span>
            </div>

            {/* Taxa até a próxima etapa */}
            {s.rate !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingLeft: 78 + 8, paddingRight: 8,
                fontSize: 9.5, color: '#64748b',
              }}>
                <div style={{ flex: 0, color: '#cbd5e1', fontSize: 10, lineHeight: 1 }}>▲</div>
                <div style={{
                  flex: 0, padding: '1px 6px', borderRadius: 8,
                  background: '#eef2f7', border: '1px solid #e2e8f0',
                  fontSize: 9.5, fontWeight: 700, color: '#334155',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {(s.rate * 100).toFixed(0)}%
                </div>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <div style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
                  taxa {s.rateLabel}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Legenda */}
      <div style={{ marginTop: 4, padding: '5px 8px', background: '#f1f5f9', borderRadius: 6, fontSize: 9, color: '#64748b' }}>
        Taxas históricas · vendas em unidades · projeção calculada, sem consulta ao CRM
      </div>
    </div>
  )
}

function formatNum(n: number): string {
  if (n < 10) return n.toFixed(1)
  if (n < 1000) return Math.round(n).toString()
  return `${(n / 1000).toFixed(1)}k`
}

// ── SopMarketing ───────────────────────────────────────────────────────────────

export function SopMarketing() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPdfExporting, setIsPdfExporting] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  // Índice do slide sendo exportado no container hidden (renderiza 1 por vez
  // pra garantir que as queries do useVendasFunil daquele slide terminem)
  const [exportingIdx, setExportingIdx] = useState<number | null>(null)
  const exportSlideRef = useRef<HTMLDivElement | null>(null)
  const [monthMode, setMonthMode] = useState<'current' | 'closed'>('current')
  // Mês fechado atual — atualizar quando fechar novo mês.
  // TODO: mover pra src/constants/sopConfig.ts junto com outras configs do S&OP
  const CLOSED_MONTH_KEY = SOP_CLOSED_MONTH_KEY
  const CLOSED_MONTH_LABEL = SOP_CLOSED_MONTH_LABEL
  const containerRef = useRef<HTMLDivElement>(null)
  const dates = useMemo(
    () => computeRanges(monthMode === 'closed' ? CLOSED_MONTH_KEY : undefined),
    [monthMode],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActiveSlide(s => (s + 1) % SLIDES.length) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActiveSlide(s => (s - 1 + SLIDES.length) % SLIDES.length) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function toggleFullscreen() {
    if (!isFullscreen) containerRef.current?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  // Promise resolver setada por downloadPDF a cada slide; SopSlide dispara via onReady
  const readyResolverRef = useRef<(() => void) | null>(null)
  const handleSlideReady = useCallback(() => {
    readyResolverRef.current?.()
    readyResolverRef.current = null
  }, [])

  async function downloadPDF() {
    if (isPdfExporting) return
    setIsPdfExporting(true)
    setPdfProgress('Iniciando...')

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      await document.fonts.ready

      // 297 × 167mm → landscape 16:9 slide format
      const slideW = 297, slideH = 167
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [slideW, slideH],
        compress: true,
      })

      for (let i = 0; i < SLIDES.length; i++) {
        setPdfProgress(`Carregando slide ${i + 1}/${SLIDES.length}...`)

        // Aguarda o SopSlide sinalizar que todos os fetches terminaram (via onReady).
        // Timeout de 30s por slide como fallback.
        await new Promise<void>((resolve) => {
          readyResolverRef.current = resolve
          setExportingIdx(i)
          setTimeout(() => {
            if (readyResolverRef.current) {
              console.warn(`[downloadPDF] timeout aguardando slide ${i + 1}`)
              readyResolverRef.current = null
              resolve()
            }
          }, 30000)
        })

        // Frame extra pra Charts/SVG terminarem o layout depois do último setState
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        await new Promise(r => setTimeout(r, 400))

        const el = exportSlideRef.current
        if (!el) continue
        setPdfProgress(`Renderizando slide ${i + 1}/${SLIDES.length}...`)

        const canvas = await html2canvas(el, {
          scale: 1,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#F8F9FB',
          width: 1920,
          height: 1080,
          windowWidth: 1920,
          windowHeight: 1080,
        })
        const imgData = canvas.toDataURL('image/jpeg', 0.78)
        canvas.width = 0; canvas.height = 0
        if (i > 0) pdf.addPage([slideW, slideH], 'landscape')
        pdf.addImage(imgData, 'JPEG', 0, 0, slideW, slideH, undefined, 'FAST')
      }

      pdf.save('sop-marketing.pdf')
    } catch (err) {
      console.error('[downloadPDF] falhou:', err)
      alert(`Falha ao gerar PDF: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      readyResolverRef.current = null
      setExportingIdx(null)
      setIsPdfExporting(false)
      setPdfProgress('')
    }
  }

  const slide = SLIDES[activeSlide]

  return (
    <div ref={containerRef} style={{ height: '100vh', background: 'var(--ws-bg)', overflow: 'hidden' }}>

      {/* ── Hidden export container ── */}
      {/* Renderiza 1 slide por vez off-screen. Sequencial pra garantir que
          as queries do useVendasFunil terminem antes da captura. */}
      {isPdfExporting && exportingIdx !== null && (
        <div style={{
          position: 'fixed', top: 0, left: -20000,
          pointerEvents: 'none',
          background: '#F8F9FB',
        }}>
          <div
            ref={el => { exportSlideRef.current = el }}
            style={{ width: 1920, height: 1080, overflow: 'hidden', background: '#F8F9FB' }}
          >
            <SopSlide
              key={SLIDES[exportingIdx].id}
              slide={SLIDES[exportingIdx]} dates={dates}
              slideIndex={exportingIdx} total={SLIDES.length}
              onPrev={() => {}} onNext={() => {}}
              isFullscreen={false} onToggleFullscreen={() => {}}
              exportHeight={1080}
              monthMode={monthMode} onMonthModeChange={setMonthMode}
              closedMonthLabel={CLOSED_MONTH_LABEL}
              onReady={handleSlideReady}
            />
          </div>
        </div>
      )}

      {/* ── PDF progress overlay ── */}
      {isPdfExporting && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(6px)',
          color: '#fff', fontSize: 12, fontWeight: 600,
          padding: '8px 18px', borderRadius: 20, zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          {pdfProgress}
        </div>
      )}

      <SopSlide
        key={slide.id} slide={slide} dates={dates}
        slideIndex={activeSlide} total={SLIDES.length}
        onPrev={() => setActiveSlide(s => (s - 1 + SLIDES.length) % SLIDES.length)}
        onNext={() => setActiveSlide(s => (s + 1) % SLIDES.length)}
        isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen}
        monthMode={monthMode} onMonthModeChange={setMonthMode}
        closedMonthLabel={CLOSED_MONTH_LABEL}
      />

      <div style={{
        position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, zIndex: 200, alignItems: 'center',
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)',
        padding: '5px 12px', borderRadius: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        {SLIDES.map((s, i) => (
          <button key={s.id} onClick={() => setActiveSlide(i)}
            title={`${s.label}${s.subLabel ? ` — ${s.subLabel}` : ''}`}
            style={{
              width: i === activeSlide ? 18 : 6, height: 6,
              borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0, outline: 'none',
              background: i === activeSlide ? s.accent : '#cbd5e1', transition: 'all 0.2s',
            }} />
        ))}
      </div>

      <button
        onClick={downloadPDF}
        disabled={isPdfExporting}
        title="Baixar PDF"
        style={{
          position: 'fixed', bottom: 12, right: 16, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)',
          border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer',
          padding: '5px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-primary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          opacity: isPdfExporting ? 0.6 : 1,
        }}>
        <Download size={12} />
        {isPdfExporting ? pdfProgress : 'PDF'}
      </button>
    </div>
  )
}
