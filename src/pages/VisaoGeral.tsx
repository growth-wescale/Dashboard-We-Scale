/* Visão Geral — dados reais via Supabase */
import { useState, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Filter, Download } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { PageTop } from '@/components/ui/PageTop'
import { useMediaData } from '@/hooks/useMediaData'
import { useCrmFunil } from '@/hooks/useCrmFunil'
import { useLeads } from '@/hooks/useLeads'
import { useMetas } from '@/hooks/useMetas'
import type { MediaDailyRaw, CrmFunilRaw, Lead, Meta } from '@/lib/types'
import { SLUG_TO_MARCA, getMtdDates, monthLabel } from '@/lib/dateUtils'

// ─── Static brand definitions ──────────────────────────────────────────────────
const BRAND_DEFS = [
  { key: 'oral-unic',  label: 'Oral Unic',  accent: '#7F0C72' },
  { key: 'inpot',      label: 'Inpot',      accent: '#C6D32D' },
  { key: 'eletrovias', label: 'Eletrovias', accent: '#ED6D3A' },
  { key: 'liso-laser', label: 'Lisô Laser', accent: '#FF6643' },
  { key: 'b2case',     label: 'B2Case',     accent: '#0169F2' },
  { key: 'viva',       label: 'Viva',       accent: '#FF0069' },
]

const VALID_MARCAS = new Set<string>(Object.values(SLUG_TO_MARCA))
const SQL_SET = new Set(['sql', 'sal', 'fechado'])

const isLeadMql = (r: { dados_extras: Record<string, unknown> | null }) => {
  const lt = r.dados_extras?.['lead_type']
  return typeof lt === 'string' && lt.toUpperCase() === 'MQL'
}

// Deduplicate leads by contact info (email > phone), keeping first seen per key
function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter(r => {
    const key = (r.email && r.email !== '') ? r.email : (r.telefone && r.telefone !== '') ? r.telefone : null
    if (key === null) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Deduplicate CRM rows by deal_id, keeping the most recent stage per deal
function dedupCrm(crm: CrmFunilRaw[]): CrmFunilRaw[] {
  const latest = new Map<string, CrmFunilRaw>()
  for (const r of crm) {
    if (!r.deal_id) continue
    const ex = latest.get(r.deal_id)
    if (!ex || r.atualizado_em > ex.atualizado_em) latest.set(r.deal_id, r)
  }
  return Array.from(latest.values())
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type BrandRow = {
  key: string; label: string; accent: string
  leads: number; mql: number; sql: number
  cpmql: number; cpsql: number; invest: number
  meta: number; status: 'positivo' | 'atencao' | 'risco'
}

type Scope = {
  leads: number; mql: number; sql: number; sal: number; fech: number
  invest: number; cpmql: number; cpsql: number; conv: number
  vis: number; lpv: number
}

// ─── Funnel ────────────────────────────────────────────────────────────────────
const FUNNEL_STAGES = [
  { key: 'vis',   label: 'Visualizações' },
  { key: 'lpv',   label: 'Landing Page Views' },
  { key: 'leads', label: 'Leads' },
  { key: 'mql',   label: 'MQLs' },
  { key: 'sql',   label: 'SQL · Reuniões agendadas' },
  { key: 'sal',   label: 'SAL' },
  { key: 'fech',  label: 'Fechamentos' },
]

function funnelFor(scope: Pick<Scope, 'vis' | 'lpv' | 'leads' | 'mql' | 'sql' | 'sal' | 'fech'>) {
  const { vis, lpv, leads, mql, sql, sal, fech } = scope
  return [vis, lpv, leads, mql, sql, sal, fech].map((x) => Math.round(x))
}

// ─── Data computation ─────────────────────────────────────────────────────────
function computeScope(media: MediaDailyRaw[], leadRows: Lead[], crm: CrmFunilRaw[], brandSlug: string): Scope {
  const marca = brandSlug !== 'overview' ? SLUG_TO_MARCA[brandSlug] : undefined
  const mRows = (marca ? media.filter(r => r.marca === marca) : media).filter(r => VALID_MARCAS.has(r.marca))
  const lRows = (marca ? leadRows.filter(r => r.marca === marca) : leadRows).filter(r => VALID_MARCAS.has(r.marca))
  const cRows = (marca ? crm.filter(r => r.marca === marca) : crm).filter(r => r.marca && VALID_MARCAS.has(r.marca))
  const deduped = dedupCrm(cRows)
  const uniqueLeads = deduplicateLeads(lRows)
  const invest = mRows.reduce((s, r) => s + r.spend_brl, 0)
  const leads  = uniqueLeads.length
  const vis    = mRows.reduce((s, r) => s + r.impressoes, 0)
  const lpv    = mRows.reduce((s, r) => s + r.lpv, 0)
  const mql    = uniqueLeads.filter(isLeadMql).length
  const sql    = deduped.filter(r => r.etapa_categoria && SQL_SET.has(r.etapa_categoria)).length
  const sal    = deduped.filter(r => r.etapa_categoria === 'sal' || r.etapa_categoria === 'fechado').length
  const fech   = deduped.filter(r => r.etapa_categoria === 'fechado').length
  return {
    invest, leads, vis, lpv, mql, sql, sal, fech,
    cpmql: mql > 0 ? Math.round(invest / mql) : 0,
    cpsql: sql > 0 ? Math.round(invest / sql) : 0,
    conv:  mql > 0 ? (sql / mql) * 100 : 0,
  }
}

function computeBrands(media: MediaDailyRaw[], leadRows: Lead[], crm: CrmFunilRaw[], metas: Meta[]): BrandRow[] {
  return BRAND_DEFS.map(def => {
    const marca = SLUG_TO_MARCA[def.key]
    const mRows = media.filter(r => r.marca === marca)
    const lRows = leadRows.filter(r => r.marca === marca)
    const cRows = crm.filter(r => r.marca === marca)
    const deduped = dedupCrm(cRows)
    const uniqueLeads = deduplicateLeads(lRows)
    const invest = mRows.reduce((s, r) => s + r.spend_brl, 0)
    const leads  = uniqueLeads.length
    const mql    = uniqueLeads.filter(isLeadMql).length
    const sql    = deduped.filter(r => r.etapa_categoria && SQL_SET.has(r.etapa_categoria)).length
    const cpmql  = mql > 0 ? Math.round(invest / mql) : 0
    const cpsql  = sql > 0 ? Math.round(invest / sql) : 0
    const metaMql = metas.find(m => m.marca === marca && m.metrica === 'mql')?.valor_meta ?? 0
    const metaPct = metaMql > 0 ? Math.round((mql / metaMql) * 100) : 0
    const status: BrandRow['status'] = metaPct >= 90 ? 'positivo' : metaPct >= 70 ? 'atencao' : 'risco'
    return { ...def, leads, mql, sql, cpmql, cpsql, invest: Math.round(invest), meta: metaPct, status }
  })
}

function buildSeries(
  media: MediaDailyRaw[],
  leadRows: Lead[],
  crm: CrmFunilRaw[],
  brandSlug: string,
  startDate: string,
  totalDays: number,
): Record<string, number[]> {
  const marca = brandSlug !== 'overview' ? SLUG_TO_MARCA[brandSlug] : undefined
  const mRows = (marca ? media.filter(r => r.marca === marca) : media).filter(r => VALID_MARCAS.has(r.marca))
  const lRows = (marca ? leadRows.filter(r => r.marca === marca) : leadRows).filter(r => VALID_MARCAS.has(r.marca))
  const cRows = (marca ? crm.filter(r => r.marca === marca) : crm).filter(r => r.marca && VALID_MARCAS.has(r.marca))
  const deduped = dedupCrm(cRows)
  const uniqueLRows = deduplicateLeads(lRows)
  const ym = startDate.slice(0, 7) // 'YYYY-MM'

  type DailyBucket = { invest: number; leads: number; vis: number; mql: number; sql: number; fech: number }
  const daily: DailyBucket[] = Array.from({ length: totalDays }, () => ({ invest: 0, leads: 0, vis: 0, mql: 0, sql: 0, fech: 0 }))

  for (const r of mRows) {
    if (r.dia.slice(0, 7) !== ym) continue
    const d = parseInt(r.dia.slice(-2), 10) - 1
    if (d < 0 || d >= totalDays) continue
    daily[d].invest += r.spend_brl
    daily[d].vis    += r.impressoes
  }

  for (const r of uniqueLRows) {
    if (!r.dia || r.dia.slice(0, 7) !== ym) continue
    const d = parseInt(r.dia.slice(-2), 10) - 1
    if (d < 0 || d >= totalDays) continue
    daily[d].leads++
    if (isLeadMql(r)) daily[d].mql++
  }

  for (const r of deduped) {
    if (!r.data_criacao || !r.etapa_categoria) continue
    if (r.data_criacao.slice(0, 7) !== ym) continue
    const d = parseInt(r.data_criacao.slice(8, 10), 10) - 1
    if (d < 0 || d >= totalDays) continue
    const cat = r.etapa_categoria
    if (SQL_SET.has(cat)) daily[d].sql++
    if (cat === 'fechado') daily[d].fech++
  }

  const cum = (key: keyof DailyBucket) => { let c = 0; return daily.map(b => (c += b[key])) }
  return {
    invest: cum('invest'),
    leads:  cum('leads'),
    vis:    cum('vis'),
    mql:    cum('mql'),
    sql:    cum('sql'),
    fech:   cum('fech'),
  }
}

function getPrevNthMtdDates(refStart: string, n: number, days: number): { start: string; end: string } {
  let [y, m] = refStart.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  const ms = String(m).padStart(2, '0')
  const maxDay = new Date(y, m, 0).getDate()
  const d = Math.min(days, maxDay)
  return { start: `${y}-${ms}-01`, end: `${y}-${ms}-${String(d).padStart(2, '0')}` }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const nf    = (n: number) => Math.round(n).toLocaleString('pt-BR')
const money = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const moneyK = (n: number) => n >= 1000
  ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  : 'R$ ' + Math.round(n).toLocaleString('pt-BR')

// ─── Shared local primitives ──────────────────────────────────────────────────
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 16, boxShadow: 'var(--shadow-sm)', padding: 20, ...style }}>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange, size = 'md' }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? '5px 12px' : '6px 14px'
  const fs  = size === 'sm' ? 12 : 13
  return (
    <div style={{ display: 'inline-flex', background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: fs, padding: pad, borderRadius: 999,
              background: on ? 'var(--brand-accent)' : 'transparent',
              color: on ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
              transition: 'all .15s ease', whiteSpace: 'nowrap' }}>
            {o.value === value ? o.label : o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ scope, prevScope, prevLabel }: { scope: Scope; prevScope: Scope; prevLabel: string }) {
  const pct = (cur: number, prev: number) => prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0
  const d = {
    invest: pct(scope.invest, prevScope.invest),
    mql:    pct(scope.mql, prevScope.mql),
    sql:    pct(scope.sql, prevScope.sql),
    cpmql:  pct(scope.cpmql, prevScope.cpmql),
    cpsql:  pct(scope.cpsql, prevScope.cpsql),
    conv:   pct(scope.conv, prevScope.conv),
  }
  const small = { '--fs-metric': '28px' } as CSSProperties
  const invest: CSSProperties = {
    ...small,
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 15%, var(--ws-surface)), var(--ws-surface) 68%)',
    borderColor: 'color-mix(in srgb, var(--brand-accent) 34%, var(--ws-border))',
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
      <MetricCard style={invest} label="Investimento no período" value={money(scope.invest)} delta={d.invest}  deltaLabel={prevLabel} />
      <MetricCard style={small}  label="MQLs"                   value={nf(scope.mql)}       delta={d.mql}    deltaLabel={prevLabel} />
      <MetricCard style={small}  label="SQLs"                   value={nf(scope.sql)}       delta={d.sql}    deltaLabel={prevLabel} />
      <MetricCard style={small}  label="CP-MQL médio"           value={money(scope.cpmql)}  delta={d.cpmql}  invertDelta deltaLabel={prevLabel} />
      <MetricCard style={small}  label="CP-SQL médio"           value={money(scope.cpsql)}  delta={d.cpsql}  invertDelta deltaLabel={prevLabel} />
      <MetricCard style={small}  label="Conversão MQL→SQL"      value={scope.conv.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unit="%" delta={d.conv} accent={false} />
    </div>
  )
}

// ─── Status das marcas ────────────────────────────────────────────────────────
function StatusTable({ brands, selected, onSelect, periodLabel }: {
  brands: BrandRow[]
  selected: string
  onSelect: (k: string) => void
  periodLabel: string
}) {
  const cols = [
    { k: 'invest', h: 'Investimento', fmt: (b: BrandRow) => money(b.invest) },
    { k: 'mql',    h: 'MQLs',        fmt: (b: BrandRow) => nf(b.mql) },
    { k: 'cpmql',  h: 'CP-MQL',      fmt: (b: BrandRow) => money(b.cpmql) },
    { k: 'sql',    h: 'SQL',         fmt: (b: BrandRow) => nf(b.sql) },
    { k: 'cpsql',  h: 'CP-SQL',      fmt: (b: BrandRow) => money(b.cpsql) },
  ]
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Status das marcas</h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>Clique numa marca para filtrar a página inteira</div>
        </div>
        <Badge tone="neutral">{periodLabel}</Badge>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ws-text-secondary)', fontSize: 11.5, fontWeight: 500 }}>
              <th style={{ padding: '8px 20px', fontWeight: 500 }}>Marca</th>
              {cols.map((c) => <th key={c.k} style={{ padding: '8px 10px', fontWeight: 500, textAlign: 'right' }}>{c.h}</th>)}
              <th style={{ padding: '8px 20px', fontWeight: 500, textAlign: 'right' }}>Atingimento</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => {
              const on = selected === b.key
              return (
                <tr key={b.key} onClick={() => onSelect(on ? 'overview' : b.key)}
                  style={{ borderTop: '1px solid var(--ws-border)', cursor: 'pointer',
                    background: on ? 'color-mix(in srgb, var(--brand-accent) 8%, transparent)' : 'transparent',
                    boxShadow: on ? 'inset 3px 0 0 var(--brand-accent)' : 'none',
                    transition: 'background .12s ease' }}>
                  <td style={{ padding: '13px 20px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: b.accent, flex: '0 0 auto' }} />
                      <span style={{ fontWeight: 500 }}>{b.label}</span>
                    </span>
                  </td>
                  {cols.map((c) => (
                    <td key={c.k} style={{ padding: '13px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: c.k.startsWith('cp') ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
                      {c.fmt(b)}
                    </td>
                  ))}
                  <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                    <StatusPill status={b.status} value={b.meta + '%'} size="sm" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── MTD Chart ────────────────────────────────────────────────────────────────
const MTD_METRICS_DEF: Record<string, { label: string; money?: boolean }> = {
  invest: { label: 'Investimento', money: true },
  leads:  { label: 'Leads' },
  mql:    { label: 'MQLs' },
  sql:    { label: 'SQLs' },
  vis:    { label: 'Visualizações' },
  fech:   { label: 'Fechamentos' },
}

interface MtdGroup {
  label: string
  color: string
  dashed?: boolean
  series: Record<string, number[]>
}

function MtdChart({ groups, scopeLabel, days }: {
  groups: MtdGroup[]
  scopeLabel: string
  days: number
}) {
  const [metric, setMetric] = useState('mql')
  const [chart,  setChart]  = useState('linha')
  const [hoverDay, setHoverDay] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const meta = MTD_METRICS_DEF[metric] ?? MTD_METRICS_DEF.mql
  const fmt  = meta.money ? moneyK : nf

  const visibleSeries = groups
    .map(g => ({ label: g.label, color: g.color, dashed: !!g.dashed, data: (g.series[metric] ?? []).slice(0, days) }))
    .filter(s => s.data.length > 0)

  const curTot  = visibleSeries[0]?.data[visibleSeries[0].data.length - 1] ?? 0
  const prevTot = visibleSeries[1]?.data[days - 1] ?? visibleSeries[1]?.data[visibleSeries[1].data.length - 1] ?? 0
  const delta   = prevTot > 0 ? ((curTot - prevTot) / prevTot) * 100 : 0

  const daily = (arr: number[]) => arr.map((v, i) => i === 0 ? v : v - arr[i - 1])

  const W = 560, H = 190, padL = 8, padR = 8, padT = 12, padB = 22
  const iw = W - padL - padR, ih = H - padT - padB
  const xFn = (i: number) => padL + (i / Math.max(1, days - 1)) * iw
  const maxLine = Math.max(...visibleSeries.flatMap(s => s.data), 1) * 1.1
  const maxBar  = Math.max(...visibleSeries.flatMap(s => daily(s.data)), 1) * 1.15
  const yL = (v: number) => padT + ih - (v / maxLine) * ih
  const yB = (v: number) => padT + ih - (v / maxBar)  * ih
  const M  = visibleSeries.length
  const group = iw / Math.max(1, days)
  const barW  = Math.max(2, (group * 0.74) / M)
  const tickDays = [1, Math.ceil(days / 2), days].filter((d, i, a) => a.indexOf(d) === i)

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const frac = Math.max(0, Math.min(1, (svgX - padL) / iw))
    setHoverDay(Math.round(frac * (days - 1)))
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>Comparativo Month-to-Date</div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>Dias 1–{days} de cada mês · {scopeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented size="sm" value={chart} onChange={setChart}
            options={[{ value: 'linha', label: 'Linha' }, { value: 'barras', label: 'Barras' }]} />
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)',
              background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: '7px 14px', cursor: 'pointer' }}>
            {Object.entries(MTD_METRICS_DEF).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 32, color: 'var(--brand-accent)', lineHeight: 1 }}>{fmt(curTot)}</span>
        {prevTot > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13, color: delta >= 0 ? 'var(--status-positivo)' : 'var(--status-risco)' }}>
            <span style={{ fontSize: 11 }}>{delta >= 0 ? '▲' : '▼'}</span>{Math.abs(delta).toFixed(1)}%
            <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400 }}>vs. {groups[1]?.label ?? ''}</span>
          </span>
        )}
      </div>

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
          style={{ overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverDay(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g} stroke="var(--ws-border)" strokeWidth="1" />
          ))}
          {hoverDay !== null && (
            <line x1={xFn(hoverDay)} x2={xFn(hoverDay)} y1={padT} y2={padT + ih}
              stroke="var(--ws-text-secondary)" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
          )}
          {chart === 'linha' ? (
            <>
              {visibleSeries.slice().reverse().map((s) => {
                const d = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFn(i)} ${yL(v)}`).join(' ')
                return <path key={s.label} d={d} fill="none" stroke={s.color}
                  strokeWidth={!s.dashed ? 3 : 2} strokeDasharray={s.dashed ? '5 4' : ''}
                  strokeLinejoin="round" strokeLinecap="round" opacity={!s.dashed ? 1 : 0.85} />
              })}
              {visibleSeries.filter(s => !s.dashed).map(s => (
                <circle key={s.label} cx={xFn(s.data.length - 1)} cy={yL(s.data[s.data.length - 1])} r={4} fill={s.color} />
              ))}
              {hoverDay !== null && visibleSeries.map(s => s.data[hoverDay] !== undefined && (
                <circle key={s.label + '-h'} cx={xFn(hoverDay)} cy={yL(s.data[hoverDay])}
                  r={4} fill={s.color} stroke="var(--ws-surface)" strokeWidth="2" />
              ))}
            </>
          ) : (
            Array.from({ length: days }).map((_, d) => (
              <g key={d}>
                {visibleSeries.map((s, mi) => {
                  const v  = daily(s.data)[d] ?? 0
                  const gx = padL + d * group + (group - barW * M) / 2 + mi * barW
                  return <rect key={s.label} x={gx} y={yB(v)} width={Math.max(1.5, barW - 1)} height={padT + ih - yB(v)}
                    fill={s.color} rx="1" opacity={hoverDay === d ? 1 : (!s.dashed ? 0.9 : 0.6)} />
                })}
              </g>
            ))
          )}
          {tickDays.map((d) => (
            <text key={d} x={xFn(d - 1)} y={H - 5} textAnchor="middle" fontFamily="var(--font-body)" fontSize="11" fill="var(--ws-text-secondary)">dia {d}</text>
          ))}
        </svg>

        {hoverDay !== null && wrapRef.current && (() => {
          const ww  = wrapRef.current!.offsetWidth
          const svgX = padL + (hoverDay / Math.max(1, days - 1)) * iw
          const pxX  = (svgX / W) * ww
          const flip = pxX > ww * 0.62
          return (
            <div style={{
              position: 'absolute',
              left:  flip ? undefined : pxX + 14,
              right: flip ? (ww - pxX + 14) : undefined,
              top: 4, pointerEvents: 'none', zIndex: 10,
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border-strong)',
              borderRadius: 10, boxShadow: 'var(--shadow-md)',
              padding: '8px 12px', fontSize: 12, minWidth: 148,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--ws-text-secondary)', fontSize: 11, marginBottom: 6 }}>Dia {hoverDay + 1}</div>
              {visibleSeries.map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: '0 0 auto' }} />
                    {s.label}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(s.data[hoverDay] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {visibleSeries.map((s) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ws-text-primary)' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, opacity: s.dashed ? 0.7 : 1 }} />
            {s.label}
          </span>
        ))}
      </div>
    </Card>
  )
}

// ─── Waterfall Funnel ─────────────────────────────────────────────────────────
function WaterfallFunnel({ scope, scopeLabel }: {
  scope: Pick<Scope, 'vis' | 'lpv' | 'leads' | 'mql' | 'sql' | 'sal' | 'fech'>
  scopeLabel: string
}) {
  const stages = FUNNEL_STAGES
  const vals   = funnelFor(scope)
  const N      = stages.length

  const bandH  = 210
  const colW   = 100 / N
  const barMaxH = bandH - 24
  const baseY  = bandH - 4
  const maxV   = vals[0]
  const barY   = (v: number) => baseY - (v / maxV) * barMaxH
  const cx     = (i: number) => (i + 0.5) * colW
  const progPts = vals.map((v, i) => `${cx(i)},${barY(v)}`).join(' ')
  const progArea = `${cx(0)},${baseY} ${progPts} ${cx(N - 1)},${baseY}`

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Funil consolidado</h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>Marketing → Vendas · {scopeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--brand-accent)' }} />Etapa
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--status-risco)' }} />Queda
          </span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', padding: '4px 20px 20px' }}>
        <div style={{ minWidth: N * 92 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)` }}>
            {stages.map((s, i) => (
              <div key={s.key} style={{ padding: '10px 8px',
                borderLeft: i === 0 ? '1px solid var(--ws-border)' : 'none',
                borderRight: '1px solid var(--ws-border)', borderTop: '1px solid var(--ws-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', lineHeight: 1.25, minHeight: 28 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{nf(vals[i])}</div>
              </div>
            ))}
          </div>

          <div style={{ position: 'relative', height: bandH, borderLeft: '1px solid var(--ws-border)', borderRight: '1px solid var(--ws-border)' }}>
            <svg viewBox={`0 0 100 ${bandH}`} preserveAspectRatio="none" width="100%" height={bandH} style={{ position: 'absolute', inset: 0 }}>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2="100" y1={4 + barMaxH * g} y2={4 + barMaxH * g} stroke="var(--ws-border)" strokeWidth="0.4" />
              ))}
              <polygon points={progArea} fill="var(--ws-bg)" stroke="var(--ws-border-strong)" strokeWidth="0.4" />
              {vals.map((v, i) => {
                const bw = colW * 0.5
                return <rect key={i} x={cx(i) - bw / 2} y={barY(v)} width={bw} height={baseY - barY(v)} fill="var(--brand-accent)" rx="0.6" />
              })}
            </svg>
            {vals.slice(0, -1).map((v, i) => {
              const conv = vals[i + 1] / v
              return (
                <div key={i} style={{ position: 'absolute', left: `${(i + 1) * colW}%`, top: '50%', transform: 'translate(-50%,-50%)',
                  background: 'var(--ws-text-secondary)', color: '#fff', fontSize: 10.5, fontWeight: 700,
                  padding: '3px 7px', borderRadius: 4, whiteSpace: 'nowrap',
                  boxShadow: 'var(--shadow-sm)', fontVariantNumeric: 'tabular-nums' }}>
                  {(conv * 100).toFixed(1)}%
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)` }}>
            {stages.map((s, i) => {
              const last    = i === N - 1
              const loss    = last ? 0 : vals[i] - vals[i + 1]
              const lossPct = last ? 0 : (loss / vals[i]) * 100
              return (
                <div key={s.key} style={{
                  borderLeft: i === 0 ? '1px solid var(--ws-border)' : 'none',
                  borderRight: '1px solid var(--ws-border)', borderBottom: '1px solid var(--ws-border)' }}>
                  {!last && (
                    <>
                      <div style={{ textAlign: 'center', color: 'var(--status-risco)', fontSize: 14, lineHeight: 1, paddingTop: 6 }}>▼</div>
                      <div style={{ padding: '4px 8px 10px' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{nf(loss)}</div>
                        <div style={{ fontSize: 11, color: 'var(--status-risco)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{lossPct.toFixed(1)}%</div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Filtros do topo ──────────────────────────────────────────────────────────
function BrandSelect({ brands, value, onChange }: { brands: BrandRow[]; value: string; onChange: (k: string) => void }) {
  const cur    = brands.find((b) => b.key === value)
  const accent = cur ? cur.accent : 'var(--brand-accent)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: '0 12px 0 14px', height: 40 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flex: '0 0 auto' }} />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer', paddingRight: 4, height: '100%' }}>
        <option value="overview">Consolidado · 6 marcas</option>
        {brands.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
      </select>
    </div>
  )
}

function DateRange({ range, onChange, monthStart }: {
  range: { start: string; end: string }
  onChange: (r: { start: string; end: string }) => void
  monthStart: string
}) {
  const monthEnd = (() => {
    const [y, m] = monthStart.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return `${monthStart.slice(0, 7)}-${String(last).padStart(2, '0')}`
  })()
  const inputStyle: CSSProperties = { border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer' }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: '0 14px', height: 40 }}>
      <span style={{ display: 'inline-flex', color: 'var(--ws-text-secondary)' }}><Filter size={16} /></span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)' }}>Período</span>
      <span style={{ width: 1, height: 18, background: 'var(--ws-border)' }} />
      <input type="date" value={range.start} min={monthStart} max={range.end}
        onChange={(e) => onChange({ ...range, start: e.target.value })} style={inputStyle} />
      <span style={{ color: 'var(--ws-text-secondary)' }}>–</span>
      <input type="date" value={range.end} min={range.start} max={monthEnd}
        onChange={(e) => onChange({ ...range, end: e.target.value })} style={inputStyle} />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function VisaoGeral() {
  const initDates = getMtdDates()
  const [brand,  setBrand]  = useState('overview')
  const [range,  setRange]  = useState({ start: initDates.start, end: initDates.end })

  const days = Math.min(31, Math.max(2, new Date(range.end + 'T00:00').getDate() || 1))

  const prevDates  = useMemo(() => getPrevNthMtdDates(range.start, 1, days), [range.start, days])
  const prev2Dates = useMemo(() => getPrevNthMtdDates(range.start, 2, days), [range.start, days])
  const prev3Dates = useMemo(() => getPrevNthMtdDates(range.start, 3, days), [range.start, days])

  const { data: mediaCur,   loading: l1 } = useMediaData({ dataInicio: range.start,     dataFim: range.end })
  const { data: mediaPrev,  loading: l2 } = useMediaData({ dataInicio: prevDates.start,  dataFim: prevDates.end })
  const { data: mediaPrev2, loading: l3 } = useMediaData({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end })
  const { data: mediaPrev3, loading: l4 } = useMediaData({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end })
  const { data: crmCur,     loading: l5 } = useCrmFunil({ dataInicio: range.start,      dataFim: range.end + 'T23:59:59' })
  const { data: crmPrev,    loading: l6 } = useCrmFunil({ dataInicio: prevDates.start,  dataFim: prevDates.end + 'T23:59:59' })
  const { data: crmPrev2,   loading: l7 } = useCrmFunil({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end + 'T23:59:59' })
  const { data: crmPrev3,   loading: l8 } = useCrmFunil({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end + 'T23:59:59' })
  const { data: leadsCur,   loading: l9  } = useLeads({ dataInicio: range.start,      dataFim: range.end })
  const { data: leadsPrev,  loading: l10 } = useLeads({ dataInicio: prevDates.start,  dataFim: prevDates.end })
  const { data: leadsPrev2, loading: l11 } = useLeads({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end })
  const { data: leadsPrev3, loading: l12 } = useLeads({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end })
  const { data: metas } = useMetas({ mes: initDates.mes })

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12

  const brands    = useMemo(() => computeBrands(mediaCur, leadsCur, crmCur, metas),     [mediaCur, leadsCur, crmCur, metas])
  const scope     = useMemo(() => computeScope(mediaCur, leadsCur, crmCur, brand),      [mediaCur, leadsCur, crmCur, brand])
  const prevScope = useMemo(() => computeScope(mediaPrev, leadsPrev, crmPrev, brand),   [mediaPrev, leadsPrev, crmPrev, brand])

  const curLabel   = monthLabel(range.start)
  const prevLabel  = monthLabel(prevDates.start)
  const prev2Label = monthLabel(prev2Dates.start)
  const prev3Label = monthLabel(prev3Dates.start)

  const isConsolidated = !brand || brand === 'overview'
  const brandObj       = brands.find((b) => b.key === brand)
  const scopeLabel     = isConsolidated ? 'Consolidado · 6 marcas' : (brandObj?.label ?? brand)
  const rootProps      = isConsolidated ? {} : { 'data-brand': brand }

  const curSeries   = useMemo(() => buildSeries(mediaCur,   leadsCur,   crmCur,   brand, range.start,      days), [mediaCur,   leadsCur,   crmCur,   brand, range.start,      days])
  const prevSeries  = useMemo(() => buildSeries(mediaPrev,  leadsPrev,  crmPrev,  brand, prevDates.start,  days), [mediaPrev,  leadsPrev,  crmPrev,  brand, prevDates.start,  days])
  const prev2Series = useMemo(() => buildSeries(mediaPrev2, leadsPrev2, crmPrev2, brand, prev2Dates.start, days), [mediaPrev2, leadsPrev2, crmPrev2, brand, prev2Dates.start, days])
  const prev3Series = useMemo(() => buildSeries(mediaPrev3, leadsPrev3, crmPrev3, brand, prev3Dates.start, days), [mediaPrev3, leadsPrev3, crmPrev3, brand, prev3Dates.start, days])

  const mtdGroups: MtdGroup[] = [
    { label: curLabel,   color: 'var(--brand-accent)', dashed: false, series: curSeries },
    { label: prevLabel,  color: '#60A5C8',              dashed: true,  series: prevSeries },
    { label: prev2Label, color: '#C6A855',              dashed: true,  series: prev2Series },
    { label: prev3Label, color: '#A870A8',              dashed: true,  series: prev3Series },
  ].filter(g => (g.series.invest?.length ?? 0) > 0)

  if (loading) {
    return (
      <div style={{ padding: 'var(--container-pad)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ color: 'var(--ws-text-secondary)', fontSize: 14 }}>Carregando dados...</div>
      </div>
    )
  }

  return (
    <div {...rootProps} style={{ padding: 'var(--container-pad)' }}>
      <PageTop
        title="Visão Geral"
        subtitle={`${scopeLabel} · ${curLabel}`}
        actions={
          <>
            <BrandSelect brands={brands} value={brand} onChange={setBrand} />
            <DateRange range={range} onChange={setRange} monthStart={initDates.start} />
            <Button variant="secondary" size="md" iconLeft={<Download size={16} />}>Exportar</Button>
          </>
        }
      />

      <KpiStrip scope={scope} prevScope={prevScope} prevLabel={`vs. ${prevLabel}`} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>
        <StatusTable brands={brands} selected={brand} onSelect={setBrand} periodLabel={curLabel} />
        <MtdChart groups={mtdGroups} scopeLabel={scopeLabel} days={days} />
      </div>

      <WaterfallFunnel scope={scope} scopeLabel={scopeLabel} />
    </div>
  )
}
