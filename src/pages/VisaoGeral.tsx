/* Visão Geral — dados reais via Supabase */
import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Filter, Download } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { PageTop } from '@/components/ui/PageTop'
import { useMediaData } from '@/hooks/useMediaData'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { useLeads } from '@/hooks/useLeads'
import { useMetas } from '@/hooks/useMetas'
import { useAllBrandsMqlPacing } from '@/hooks/useMqlPacing'
import type { MediaDailyRaw, Lead, Meta } from '@/lib/types'
import { SLUG_TO_MARCA, getMtdDates, monthLabel } from '@/lib/dateUtils'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import { getMetaVendas } from '@/constants/metasVendas'
import { PacingCard, MiniCard } from '@/pages/Pacing'
import { MqlDrawer } from '@/components/ui/MqlDrawer'
import { CompareControl } from '@/components/ui/CompareControl'
import { previousMonthSameRange, computeDeltaPct, formatCompareLabel, type DateRange } from '@/lib/periodCompare'

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

// ─── Types ─────────────────────────────────────────────────────────────────────
type BrandRow = {
  key: string; label: string; accent: string
  leads: number; mql: number; sql: number
  cpmql: number; cpsql: number; invest: number
  meta: number; status: 'positivo' | 'atencao' | 'risco'
  sqlPerdido: number; valorTotal: number
  vendas: number; metaVenda: number | null; atingPct: number | null
}

type Scope = {
  leads: number; mql: number; sql: number; sal: number; fech: number
  invest: number; cpmql: number; cpsql: number; conv: number
  vis: number; lpv: number
  sqlPerdido: number; salPerdido: number; valorTotal: number
}

// ─── Funnel ────────────────────────────────────────────────────────────────────
const FUNNEL_STAGES = [
  { key: 'leads', label: 'Leads' },
  { key: 'mql',   label: 'MQLs' },
  { key: 'sql',   label: 'SQL · Reuniões agendadas' },
  { key: 'sal',   label: 'SAL' },
  { key: 'fech',  label: 'Fechamentos' },
]

function funnelFor(scope: Pick<Scope, 'leads' | 'mql' | 'sql' | 'sal' | 'fech'>) {
  const { leads, mql, sql, sal, fech } = scope
  return [leads, mql, sql, sal, fech].map((x) => Math.round(x))
}

// ─── Data computation ─────────────────────────────────────────────────────────
function computeScope(media: MediaDailyRaw[], leadRows: Lead[], crm: VwMarketingFunil[], brandSlug: string, di: string, df: string): Scope {
  const marca = brandSlug !== 'overview' ? SLUG_TO_MARCA[brandSlug] : undefined
  const mRows = (marca ? media.filter(r => r.marca === marca) : media).filter(r => VALID_MARCAS.has(r.marca))
  const lRows = (marca ? leadRows.filter(r => r.marca === marca) : leadRows).filter(r => VALID_MARCAS.has(r.marca))
  const cRows = (marca ? crm.filter(r => r.marca === marca) : crm).filter(r => r.marca && VALID_MARCAS.has(r.marca))
  const active = cRows.filter(r => r.status_atual !== 'Excluído')
  const uniqueLeads = deduplicateLeads(lRows)
  const invest = mRows.reduce((s, r) => s + r.spend_brl, 0)
  const leads  = uniqueLeads.length
  const vis    = mRows.reduce((s, r) => s + r.impressoes, 0)
  const lpv    = mRows.reduce((s, r) => s + r.lpv, 0)
  const mql    = uniqueLeads.filter(isLeadMql).length
  const sql    = active.filter(r => inPeriod(r.data_sql, di, df)).length
  const sal    = active.filter(r => inPeriod(r.data_sal, di, df)).length
  const fech   = active.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).length
  const sqlPerdido = active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sql, di, df) && !inPeriod(r.data_sal, di, df)).length
  const salPerdido = active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sal, di, df)).length
  const valorTotal = active.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)
  return {
    invest, leads, vis, lpv, mql, sql, sal, fech,
    cpmql: mql > 0 ? Math.round(invest / mql) : 0,
    cpsql: sql > 0 ? Math.round(invest / sql) : 0,
    conv:  mql > 0 ? (sql / mql) * 100 : 0,
    sqlPerdido, salPerdido, valorTotal,
  }
}

function computeBrands(media: MediaDailyRaw[], leadRows: Lead[], crm: VwMarketingFunil[], _metas: Meta[], di: string, df: string): BrandRow[] {
  // Meta de vendas do mês (chave YYYY-MM do início do período)
  const mesKey = di.slice(0, 7)
  // Proporção do mês decorrido dentro do período — se período cobre o mês inteiro, é 100%
  const [yy, mm] = mesKey.split('-').map(Number)
  const diasNoMes = new Date(yy, mm, 0).getDate()
  const dayEnd = Number(df.slice(-2))
  const isSameMonthEnd = df.slice(0, 7) === mesKey
  const pctPeriodo = isSameMonthEnd ? Math.min(1, dayEnd / diasNoMes) : 1

  return BRAND_DEFS.map(def => {
    const marca = SLUG_TO_MARCA[def.key]
    const mRows = media.filter(r => r.marca === marca)
    const lRows = leadRows.filter(r => r.marca === marca)
    const cRows = crm.filter(r => r.marca === marca && r.status_atual !== 'Excluído')
    const uniqueLeads = deduplicateLeads(lRows)
    const invest = mRows.reduce((s, r) => s + r.spend_brl, 0)
    const leads  = uniqueLeads.length
    const mql    = uniqueLeads.filter(isLeadMql).length
    const sql    = cRows.filter(r => inPeriod(r.data_sql, di, df)).length
    const cpmql  = mql > 0 ? Math.round(invest / mql) : 0
    const cpsql  = sql > 0 ? Math.round(invest / sql) : 0
    const sqlPerdido = cRows.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sql, di, df) && !inPeriod(r.data_sal, di, df)).length
    const valorTotal = cRows.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)

    // Vendas realizadas (deals Ganhos com data_venda dentro do período)
    const vendas = cRows.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).length
    const metaVenda = getMetaVendas(marca, mesKey)
    const atingPct = metaVenda && metaVenda > 0 ? (vendas / metaVenda) * 100 : null

    // Farol de atingimento — ratio compara vs pace esperado do período
    let status: BrandRow['status'] = 'atencao'
    if (atingPct !== null && metaVenda !== null && metaVenda > 0) {
      const ratio = (vendas / metaVenda) / Math.max(pctPeriodo, 0.01)
      status = ratio >= 1 ? 'positivo' : ratio >= 0.7 ? 'atencao' : 'risco'
    }

    return {
      ...def, leads, mql, sql, cpmql, cpsql, invest: Math.round(invest),
      meta: atingPct !== null ? Math.round(atingPct) : 0,
      status, sqlPerdido, valorTotal,
      vendas, metaVenda, atingPct,
    }
  })
}

function buildSeries(
  media: MediaDailyRaw[],
  leadRows: Lead[],
  crm: VwMarketingFunil[],
  brandSlug: string,
  startDate: string,
  totalDays: number,
): Record<string, number[]> {
  const marca = brandSlug !== 'overview' ? SLUG_TO_MARCA[brandSlug] : undefined
  const mRows = (marca ? media.filter(r => r.marca === marca) : media).filter(r => VALID_MARCAS.has(r.marca))
  const lRows = (marca ? leadRows.filter(r => r.marca === marca) : leadRows).filter(r => VALID_MARCAS.has(r.marca))
  const cRows = (marca ? crm.filter(r => r.marca === marca) : crm).filter(r => r.marca && VALID_MARCAS.has(r.marca))
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

  for (const r of cRows) {
    if (r.status_atual === 'Excluído') continue
    if (r.data_sql && r.data_sql.slice(0, 7) === ym) {
      const d = parseInt(r.data_sql.slice(8, 10), 10) - 1
      if (d >= 0 && d < totalDays) daily[d].sql++
    }
    if (r.status_atual === 'Ganho' && r.data_venda && r.data_venda.slice(0, 7) === ym) {
      const d = parseInt(r.data_venda.slice(8, 10), 10) - 1
      if (d >= 0 && d < totalDays) daily[d].fech++
    }
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
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 20, ...style }}>
      {children}
    </div>
  )
}

// Segmented iOS-style: trilho rebaixado (--r-fill), thumb com sombra de controle no ativo.
function Segmented({ options, value, onChange, size = 'md' }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? '5px 12px' : '6px 14px'
  const fs  = size === 'sm' ? 12 : 13
  return (
    <div style={{ display: 'inline-flex', background: 'var(--r-fill, rgba(51,3,45,0.055))', borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: fs, padding: pad, borderRadius: 999,
              background: on ? 'var(--r-seg-thumb, var(--brand-accent))' : 'transparent',
              color: on ? 'var(--r-seg-thumb-text, var(--brand-accent-contrast))' : 'var(--ws-text-secondary)',
              boxShadow: on ? 'var(--r-control, none)' : 'none',
              transition: 'background 180ms var(--r-ease, ease), color 180ms var(--r-ease, ease)', whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ scope, compareScope, compareLabel, compareEnabled, onMqlClick }: { scope: Scope; compareScope: Scope; compareLabel: string; compareEnabled: boolean; onMqlClick?: () => void }) {
  const d = {
    invest: computeDeltaPct(scope.invest, compareScope.invest),
    mql:    computeDeltaPct(scope.mql,    compareScope.mql),
    sql:    computeDeltaPct(scope.sql,    compareScope.sql),
    cpmql:  computeDeltaPct(scope.cpmql,  compareScope.cpmql),
    cpsql:  computeDeltaPct(scope.cpsql,  compareScope.cpsql),
    conv:   computeDeltaPct(scope.conv,   compareScope.conv),
  }
  const showAll = compareEnabled
  const small = { '--fs-metric': '28px' } as CSSProperties
  const invest: CSSProperties = {
    ...small,
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 15%, var(--ws-surface)), var(--ws-surface) 68%)',
    borderColor: 'color-mix(in srgb, var(--brand-accent) 34%, var(--ws-border))',
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
      <MetricCard style={invest} label="Investimento no período" value={money(scope.invest)} delta={showAll ? d.invest : null} deltaLabel={showAll ? compareLabel : undefined} />
      <MetricCard style={small}  label="MQLs"                   value={nf(scope.mql)}       delta={d.mql}                       deltaLabel={compareLabel} onClick={onMqlClick} />
      <MetricCard style={small}  label="SQLs"                   value={nf(scope.sql)}       delta={showAll ? d.sql : null}      deltaLabel={showAll ? compareLabel : undefined} description={scope.sqlPerdido > 0 ? <span style={{ color:'var(--status-risco)', opacity:0.85 }}>{nf(scope.sqlPerdido)} perdidos</span> : undefined} />
      <MetricCard style={small}  label="CP-MQL médio"           value={money(scope.cpmql)}  delta={showAll ? d.cpmql : null}    invertDelta deltaLabel={showAll ? compareLabel : undefined} />
      <MetricCard style={small}  label="CP-SQL médio"           value={money(scope.cpsql)}  delta={showAll ? d.cpsql : null}    invertDelta deltaLabel={showAll ? compareLabel : undefined} />
      <MetricCard style={small}  label="Conversão MQL→SQL"      value={scope.conv.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unit="%" delta={showAll ? d.conv : null} accent={false} deltaLabel={showAll ? compareLabel : undefined} />
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
    { k: 'sql',    h: 'SQL / Perdidos', fmt: (b: BrandRow) => b.sqlPerdido > 0 ? `${nf(b.sql)} / ${nf(b.sqlPerdido)}` : nf(b.sql) },
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
              <th style={{ padding: '8px 20px', fontWeight: 500, textAlign: 'right' }}>Vendas / Meta</th>
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
                    {b.metaVenda === null ? (
                      <span style={{ color: 'var(--ws-text-secondary)', fontSize: 12, fontStyle: 'italic' }}>sem meta</span>
                    ) : (
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)' }}>
                          {b.vendas} / {b.metaVenda}
                        </span>
                        <StatusPill status={b.status} value={`${b.meta}%`} size="sm" />
                      </div>
                    )}
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
    .filter(s => (s.data[s.data.length - 1] ?? 0) > 0)

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
              <div style={{ fontWeight: 700, color: 'var(--ws-text-secondary)', fontSize: 11, marginBottom: 6 }}>
                Dia {hoverDay + 1} · {chart === 'barras' ? 'no dia' : 'acumulado'}
              </div>
              {visibleSeries.map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: '0 0 auto' }} />
                    {s.label}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {chart === 'barras' ? fmt(daily(s.data)[hoverDay] ?? 0) : fmt(s.data[hoverDay] ?? 0)}
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
  scope: Pick<Scope, 'leads' | 'mql' | 'sql' | 'sal' | 'fech'>
  scopeLabel: string
}) {
  const stages = FUNNEL_STAGES
  const vals   = funnelFor(scope)
  const N      = stages.length

  const bandH  = 210
  const colW   = 100 / N
  const barMaxH = bandH - 24
  const baseY  = bandH - 4
  const maxV   = vals[0] || 1
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
            {vals.map((v, i) => {
              const topY  = barY(v)
              const barH  = baseY - topY
              const inside = barH > 24
              const topPct = inside ? (topY + 6) / bandH * 100 : (topY - 18) / bandH * 100
              return (
                <div key={`lbl-${i}`} style={{
                  position: 'absolute', left: `${(i + 0.5) * colW}%`, top: `${topPct}%`,
                  transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, lineHeight: 1,
                  color: inside ? '#fff' : 'var(--ws-text-primary)',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>
                  {nf(v)}
                </div>
              )
            })}
            {vals.slice(0, -1).map((v, i) => {
              const conv = v > 0 ? vals[i + 1] / v : 0
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
              const lossPct = last ? 0 : vals[i] > 0 ? (loss / vals[i]) * 100 : 0
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

function DateRange({ range, onChange }: {
  range: { start: string; end: string }
  onChange: (r: { start: string; end: string }) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const inputStyle: CSSProperties = { border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer' }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: '0 14px', height: 40 }}>
      <span style={{ display: 'inline-flex', color: 'var(--ws-text-secondary)' }}><Filter size={16} /></span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)' }}>Período</span>
      <span style={{ width: 1, height: 18, background: 'var(--ws-border)' }} />
      <input type="date" value={range.start} max={range.end}
        onChange={(e) => onChange({ ...range, start: e.target.value })} style={inputStyle} />
      <span style={{ color: 'var(--ws-text-secondary)' }}>–</span>
      <input type="date" value={range.end} min={range.start} max={today}
        onChange={(e) => onChange({ ...range, end: e.target.value })} style={inputStyle} />
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCsv(filename: string, rows: Record<string, unknown>[], cols: { key: string; label: string }[]) {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => c.label).join(',')
  const body   = rows.map(r => cols.map(c => escape(r[c.key])).join(',')).join('\n')
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const LEAD_COLS = [
  { key: 'dia',          label: 'Data' },
  { key: 'marca',        label: 'Marca' },
  { key: 'nome',         label: 'Nome' },
  { key: 'email',        label: 'Email' },
  { key: 'telefone',     label: 'Telefone' },
  { key: 'uf',           label: 'UF' },
  { key: 'cidade',       label: 'Cidade' },
  { key: 'lead_type',    label: 'Tipo' },
  { key: 'capital',      label: 'Capital Declarado' },
  { key: 'utm_source',   label: 'UTM Source' },
  { key: 'utm_medium',   label: 'UTM Medium' },
  { key: 'utm_campaign', label: 'UTM Campaign' },
  { key: 'formulario',   label: 'Formulário' },
]

const MEDIA_COLS = [
  { key: 'dia',            label: 'Data' },
  { key: 'marca',          label: 'Marca' },
  { key: 'canal',          label: 'Canal' },
  { key: 'campanha',       label: 'Campanha' },
  { key: 'conjunto',       label: 'Conjunto' },
  { key: 'anuncio',        label: 'Anúncio' },
  { key: 'spend_brl',      label: 'Investimento (R$)' },
  { key: 'impressoes',     label: 'Impressões' },
  { key: 'cliques_link',   label: 'Cliques' },
  { key: 'lpv',            label: 'LPV' },
  { key: 'cpm',            label: 'CPM' },
  { key: 'cpc',            label: 'CPC' },
  { key: 'leads',          label: 'Leads' },
  { key: 'video_p50',      label: 'Video 50%' },
  { key: 'video_thruplay', label: 'ThruPlay' },
]

// ─── Página principal ─────────────────────────────────────────────────────────
export function VisaoGeral() {
  const initDates = getMtdDates()
  const [brand,  setBrand]  = useState('overview')
  const [range,  setRange]  = useState({ start: initDates.start, end: initDates.end })
  const [filterFonte, setFilterFonte] = useState('__all__')
  const today = new Date()

  const endDate = new Date(range.end + 'T00:00')
  // Cap at today so future-dated ranges don't make previous months look fuller than current
  const effectiveEnd = (!Number.isNaN(endDate.getTime()) && endDate < today) ? endDate : today
  const days = Math.min(31, Math.max(2, effectiveEnd.getDate()))

  const [compareState, setCompareState] = useState<{ enabled: boolean; compareRange: DateRange | null }>({ enabled: false, compareRange: null })
  const effectiveCompareRange = useMemo<DateRange>(
    () => compareState.compareRange ?? previousMonthSameRange(range),
    [compareState.compareRange, range],
  )

  const prevDates  = useMemo(() => getPrevNthMtdDates(range.start, 1, days), [range.start, days])
  const prev2Dates = useMemo(() => getPrevNthMtdDates(range.start, 2, days), [range.start, days])
  const prev3Dates = useMemo(() => getPrevNthMtdDates(range.start, 3, days), [range.start, days])

  const { data: mediaCur,   loading: l1 } = useMediaData({ dataInicio: range.start,     dataFim: range.end })
  const { data: mediaPrev,  loading: l2 } = useMediaData({ dataInicio: prevDates.start,  dataFim: prevDates.end })
  const { data: mediaPrev2, loading: l3 } = useMediaData({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end })
  const { data: mediaPrev3, loading: l4 } = useMediaData({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end })
  const { data: mediaCompareRaw } = useMediaData({ dataInicio: effectiveCompareRange.start, dataFim: effectiveCompareRange.end })
  const { data: rawCrmCur,   loading: l5 } = useVendasFunil({ dataInicio: range.start,      dataFim: range.end })
  const { data: rawCrmPrev,  loading: l6 } = useVendasFunil({ dataInicio: prevDates.start,  dataFim: prevDates.end })
  const { data: rawCrmPrev2, loading: l7 } = useVendasFunil({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end })
  const { data: rawCrmPrev3, loading: l8 } = useVendasFunil({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end })
  const { data: rawCrmCompare } = useVendasFunil({ dataInicio: effectiveCompareRange.start, dataFim: effectiveCompareRange.end })
  const applyFonte = (rows: typeof rawCrmCur) => filterFonte === '__all__' ? rows : rows.filter(r => mapFonte(r.fonte) === filterFonte)
  const crmCur     = useMemo(() => applyFonte(rawCrmCur),     [rawCrmCur,     filterFonte])   // eslint-disable-line react-hooks/exhaustive-deps
  const crmPrev    = useMemo(() => applyFonte(rawCrmPrev),    [rawCrmPrev,    filterFonte])   // eslint-disable-line react-hooks/exhaustive-deps
  const crmPrev2   = useMemo(() => applyFonte(rawCrmPrev2),   [rawCrmPrev2,   filterFonte])   // eslint-disable-line react-hooks/exhaustive-deps
  const crmPrev3   = useMemo(() => applyFonte(rawCrmPrev3),   [rawCrmPrev3,   filterFonte])   // eslint-disable-line react-hooks/exhaustive-deps
  const crmCompare = useMemo(() => applyFonte(rawCrmCompare), [rawCrmCompare, filterFonte])   // eslint-disable-line react-hooks/exhaustive-deps
  const { data: leadsCur,   loading: l9  } = useLeads({ dataInicio: range.start,      dataFim: range.end })
  const { data: leadsPrev,  loading: l10 } = useLeads({ dataInicio: prevDates.start,  dataFim: prevDates.end })
  const { data: leadsPrev2, loading: l11 } = useLeads({ dataInicio: prev2Dates.start, dataFim: prev2Dates.end })
  const { data: leadsPrev3, loading: l12 } = useLeads({ dataInicio: prev3Dates.start, dataFim: prev3Dates.end })
  const { data: leadsCompare } = useLeads({ dataInicio: effectiveCompareRange.start, dataFim: effectiveCompareRange.end })
  const { data: metas } = useMetas({ mes: initDates.mes })
  const { data: pacingData, loading: pacingLoading, setTarget: setPacingTarget } = useAllBrandsMqlPacing()

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12

  const [mqlDrawerOpen, setMqlDrawerOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    function onOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [exportMenuOpen])

  function handleExportLeads() {
    const marca = brand !== 'overview' ? SLUG_TO_MARCA[brand] : undefined
    const rows = (marca ? leadsCur.filter(r => r.marca === marca) : leadsCur)
      .filter(r => VALID_MARCAS.has(r.marca))
      .map(r => ({
        dia: r.dia, marca: r.marca, nome: r.nome, email: r.email,
        telefone: r.telefone, uf: r.uf, cidade: r.cidade,
        lead_type: r.dados_extras?.['lead_type'] ?? '',
        capital: r.dados_extras?.['capital'] ?? '',
        utm_source: r.utm_source, utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign, formulario: r.formulario,
      }))
    downloadCsv(`leads_${scopeLabel}_${range.start}_${range.end}.csv`, rows as Record<string, unknown>[], LEAD_COLS)
    setExportMenuOpen(false)
  }

  function handleExportMedia() {
    const marca = brand !== 'overview' ? SLUG_TO_MARCA[brand] : undefined
    const rows = (marca ? mediaCur.filter(r => r.marca === marca) : mediaCur)
      .filter(r => VALID_MARCAS.has(r.marca)) as unknown as Record<string, unknown>[]
    downloadCsv(`midia_${scopeLabel}_${range.start}_${range.end}.csv`, rows, MEDIA_COLS)
    setExportMenuOpen(false)
  }

  const brands       = useMemo(() => computeBrands(mediaCur, leadsCur, crmCur, metas, range.start, range.end),     [mediaCur, leadsCur, crmCur, metas, range.start, range.end])
  const scope        = useMemo(() => computeScope(mediaCur, leadsCur, crmCur, brand, range.start, range.end),      [mediaCur, leadsCur, crmCur, brand, range.start, range.end])
  const compareScope = useMemo(() => computeScope(mediaCompareRaw, leadsCompare, crmCompare, brand, effectiveCompareRange.start, effectiveCompareRange.end), [mediaCompareRaw, leadsCompare, crmCompare, brand, effectiveCompareRange.start, effectiveCompareRange.end])
  const compareLabel = compareState.enabled
    ? `vs. ${formatCompareLabel(effectiveCompareRange)}`
    : `vs. ${formatCompareLabel(effectiveCompareRange)} (mês ant.)`

  const mqlLeads = useMemo(() => {
    const marca = brand !== 'overview' ? SLUG_TO_MARCA[brand] : undefined
    const lRows = (marca ? leadsCur.filter(r => r.marca === marca) : leadsCur).filter(r => VALID_MARCAS.has(r.marca))
    return deduplicateLeads(lRows).filter(isLeadMql)
  }, [leadsCur, brand])

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
  ].filter(g => Object.values(g.series).some(arr => (arr[arr.length - 1] ?? 0) > 0))

  return (
    <>
    <div {...rootProps} style={{ padding: 'var(--container-pad)', opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : undefined, transition: 'opacity 0.2s' }}>
      <PageTop
        title="Visão Geral"
        subtitle={`${scopeLabel} · ${curLabel}`}
        actions={
          <>
            <BrandSelect brands={brands} value={brand} onChange={setBrand} />
            <select
              value={filterFonte}
              onChange={e => setFilterFonte(e.target.value)}
              style={{ appearance: 'none', padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 20, fontSize: 13, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none' }}
            >
              <option value="__all__">Todas as fontes</option>
              {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <DateRange range={range} onChange={setRange} />
            <CompareControl
              baseRange={range}
              enabled={compareState.enabled}
              compareRange={compareState.compareRange}
              onChange={setCompareState}
            />
            <div ref={exportRef} style={{ position: 'relative' }}>
              <Button variant="secondary" size="md" iconLeft={<Download size={16} />} onClick={() => setExportMenuOpen(o => !o)}>
                Exportar
              </Button>
              {exportMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 200,
                  background: 'var(--ws-bg-card)', border: '1px solid var(--ws-border)',
                  borderRadius: 8, padding: '4px 0', minWidth: 170,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                }}>
                  {([
                    { label: 'Leads (.csv)',  action: handleExportLeads },
                    { label: 'Mídia (.csv)',  action: handleExportMedia },
                  ] as const).map(item => (
                    <button key={item.label} onClick={item.action} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 14px', background: 'none', border: 'none',
                      color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--ws-bg-hover, rgba(255,255,255,0.06))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        }
      />

      <KpiStrip scope={scope} compareScope={compareScope} compareLabel={compareLabel} compareEnabled={compareState.enabled} onMqlClick={() => setMqlDrawerOpen(true)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>
        <StatusTable brands={brands} selected={brand} onSelect={setBrand} periodLabel={curLabel} />
        <MtdChart groups={mtdGroups} scopeLabel={scopeLabel} days={days} />
      </div>

      <WaterfallFunnel scope={scope} scopeLabel={scopeLabel} />

      {/* ── Pacing de MQL ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Pacing de MQL</h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
            Ritmo de captação vs. meta mensal · {monthLabel(range.start)}
          </div>
        </div>

        <div style={{ opacity: pacingLoading ? 0.5 : 1, pointerEvents: pacingLoading ? 'none' : undefined, transition: 'opacity 0.2s' }}>
        {isConsolidated ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {pacingData.map(d => <MiniCard key={d.marca} d={d} />)}
          </div>
        ) : (() => {
          const selectedMarca = SLUG_TO_MARCA[brand]
          const selectedPacing = pacingData.find(d => d.marca === selectedMarca)
          const otherPacing = pacingData.filter(d => d.marca !== selectedMarca)
          return (
            <>
              {selectedPacing && (
                <PacingCard
                  d={selectedPacing}
                  onTargetChange={v => setPacingTarget(selectedMarca, v)}
                  today={today}
                />
              )}
              {otherPacing.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 12 }}>
                    Outras marcas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                    {otherPacing.map(d => <MiniCard key={d.marca} d={d} />)}
                  </div>
                </>
              )}
            </>
          )
        })()}
        </div>
      </div>
    </div>

    <MqlDrawer open={mqlDrawerOpen} onClose={() => setMqlDrawerOpen(false)} leads={mqlLeads} />
    </>
  )
}
