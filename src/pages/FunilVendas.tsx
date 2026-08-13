import { useState, useMemo } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Download, Clock, TrendingDown, Trophy, Info, X } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { PageTop } from '@/components/ui/PageTop'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import { useDashboardNotice } from '@/hooks/useDashboardNotice'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { useMediaData } from '@/hooks/useMediaData'
import { useLeads } from '@/hooks/useLeads'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { BRANDS_WITH_OVERVIEW } from '@/constants/brands'
import { nf, money, moneyK } from '@/lib/format'
import { isoDate, currentMonthRange, shortMonth } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'

const BRANDS = BRANDS_WITH_OVERVIEW

function prevMonthRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00')
  s.setMonth(s.getMonth() - 1); e.setMonth(e.getMonth() - 1)
  return { start: isoDate(s), end: isoDate(e) }
}

// ─── Data helpers ──────────────────────────────────────────────────────────────


function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

function buildFunnel(rows: VwMarketingFunil[], di: string, df: string) {
  const active = rows.filter(r => r.status_atual !== 'Excluído')
  return [
    { key: 'tent', label: 'Tentando contato',       value: active.filter(r => inPeriod(r.data_tentando_contato, di, df)).length },
    { key: 'cont', label: 'Contato efetivo',        value: active.filter(r => inPeriod(r.data_contato_efetivo, di, df)).length },
    { key: 'sql',  label: 'SQL · Reunião agendada', value: active.filter(r => inPeriod(r.data_sql, di, df)).length },
    { key: 'diag', label: 'Diagnóstico',            value: active.filter(r => inPeriod(r.data_diagnostico, di, df)).length },
    { key: 'sal',  label: 'SAL',                    value: active.filter(r => inPeriod(r.data_sal, di, df)).length },
    { key: 'cof',  label: 'Oportunidade · COF',     value: active.filter(r => inPeriod(r.data_oportunidade, di, df)).length },
    { key: 'fech', label: 'Fechamento',             value: active.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).length },
  ]
}

// ─── TrapFunnel ────────────────────────────────────────────────────────────────

interface FunnelStage { key: string; label: string; value: number }

function TrapFunnel({ stages, invest, accent, dark }: {
  stages: FunnelStage[]; invest: number; accent: string; dark: string
}) {
  const v0 = Math.max(stages[0]?.value ?? 1, 1)
  const width = (v: number) => 30 + 70 * Math.sqrt(Math.max(0, v) / v0)

  function shade(i: number) {
    const pct = Math.max(38, 100 - i * 8)
    return `color-mix(in srgb, ${accent} ${pct}%, ${dark})`
  }

  return (
    <div>
      {stages.map((s, i) => {
        const last = i === stages.length - 1
        const wTop = width(s.value)
        const wBot = last ? wTop * 0.86 : width(stages[i + 1].value)
        const insetTop = (100 - wTop) / 2
        const insetBot = (100 - wBot) / 2
        const conv = i > 0 && stages[i - 1].value > 0
          ? (s.value / stages[i - 1].value) * 100 : null
        const cost = invest > 0 && s.value > 0 ? invest / s.value : 0

        return (
          <div key={s.key}>
            {i > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 20, alignItems: 'center', height: 15 }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: 'var(--status-risco)', fontSize: 10 }}>▼</span>
                    {conv !== null ? conv.toFixed(1) : '—'}%
                  </span>
                </div>
                <div />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 20, alignItems: 'center' }}>
              <div style={{ position: 'relative', height: 50 }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: shade(i),
                  clipPath: `polygon(${insetTop}% 0, ${100 - insetTop}% 0, ${100 - insetBot}% 100%, ${insetBot}% 100%)`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {nf(s.value)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.88)' }}>
                    {s.label}
                  </span>
                </div>
              </div>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Custo / {s.label.split(' · ')[0]}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {invest > 0 && s.value > 0 ? money(cost) : '—'}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── DonutChart ────────────────────────────────────────────────────────────────

interface DonutSlice { label: string; pct: number; color: string }

function DonutChart({ slices, size = 140 }: { slices: DonutSlice[]; size?: number }) {
  const cx = size / 2, cy = size / 2
  const r = size * 0.33
  const strokeW = size * 0.22
  const circumference = 2 * Math.PI * r
  let cumPct = 0

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ws-border)" strokeWidth={strokeW} />
      {slices.map((s, i) => {
        const dashLen = (s.pct / 100) * circumference
        const dashOffset = circumference * 0.25 - (cumPct / 100) * circumference
        cumPct += s.pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={strokeW}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset}
          />
        )
      })}
    </svg>
  )
}

// ─── SCard ────────────────────────────────────────────────────────────────────

function SCard({ children, style, pad = 20 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: pad, ...style,
    }}>
      {children}
    </div>
  )
}

// ─── SectionHead ──────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ margin: '32px 0 14px' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>
        {title}
      </h2>
    </div>
  )
}

// ─── LeadtimeCard ─────────────────────────────────────────────────────────────

function LeadtimeCard({ label, value, sub, tone, icon }: {
  label: string; value: string; sub: string; tone: string; icon: ReactNode
}) {
  const c = `var(--status-${tone})`
  return (
    <SCard pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, maxWidth: 180, lineHeight: 1.3 }}>
          {label}
        </div>
        <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c, flexShrink: 0 }}>
          {icon}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 28, color: 'var(--ws-text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.35 }}>{sub}</div>
    </SCard>
  )
}

// ─── BrandSelect ──────────────────────────────────────────────────────────────

function BrandSelect({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', paddingLeft: 28, paddingRight: 28, paddingTop: 7, paddingBottom: 7,
          border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13,
          background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer',
          fontFamily: 'var(--font-body)', outline: 'none',
        }}
      >
        {BRANDS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
      </select>
      {/* color dot */}
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 8, borderRadius: '50%',
        background: BRANDS.find(b => b.key === value)?.accent ?? '#ccc',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// ─── FunilVendas ──────────────────────────────────────────────────────────────

export function FunilVendas() {
  const [brandKey, setBrandKey] = useState('overview')
  const [range, setRange] = useState(currentMonthRange)
  const [filterFonte, setFilterFonte] = useState('__all__')
  const [dismissedNoticeId, setDismissedNoticeId] = useState<number | null>(null)
  const { notice } = useDashboardNotice()

  const brandDef = BRANDS.find(b => b.key === brandKey) ?? BRANDS[0]
  const marca = brandDef.marca
  const { accent, dark } = brandDef
  const scopeLabel = brandKey === 'overview' ? 'Consolidado' : brandDef.label

  const prev = useMemo(() => prevMonthRange(range.start, range.end), [range.start, range.end])
  const curMonthLabel = shortMonth(range.start)

  // ── Data ──────────────────────────────────────────────────────────────────────
  const { data: rawCurRows, loading, error: curError } = useVendasFunil({ marca, dataInicio: range.start, dataFim: range.end })
  const { data: rawPrevRows }         = useVendasFunil({ marca, dataInicio: prev.start, dataFim: prev.end })
  const { data: curMedia }            = useMediaData({ marca, dataInicio: range.start, dataFim: range.end })
  const { data: prevMedia }           = useMediaData({ marca, dataInicio: prev.start, dataFim: prev.end })
  const { data: rawCurLeads }         = useLeads({ marca, dataInicio: range.start, dataFim: range.end })
  const { data: rawPrevLeads }        = useLeads({ marca, dataInicio: prev.start, dataFim: prev.end })

  const curRows  = useMemo(() => filterFonte === '__all__' ? rawCurRows  : rawCurRows.filter(r => mapFonte(r.fonte) === filterFonte),  [rawCurRows,  filterFonte])
  const prevRows = useMemo(() => filterFonte === '__all__' ? rawPrevRows : rawPrevRows.filter(r => mapFonte(r.fonte) === filterFonte), [rawPrevRows, filterFonte])

  // MQL from leads table (marketing source of truth)
  const mqlLeads     = useMemo(() => {
    const leads = deduplicateLeads(rawCurLeads)
    const filtered = filterFonte === '__all__' ? leads : leads.filter(l => mapFonte(l.utm_source) === filterFonte)
    return filtered.filter(isLeadMql)
  }, [rawCurLeads, filterFonte])
  const prevMqlLeads = useMemo(() => {
    const leads = deduplicateLeads(rawPrevLeads)
    const filtered = filterFonte === '__all__' ? leads : leads.filter(l => mapFonte(l.utm_source) === filterFonte)
    return filtered.filter(isLeadMql)
  }, [rawPrevLeads, filterFonte])

  const invest     = useMemo(() => curMedia.reduce((s, r) => s + r.spend_brl, 0), [curMedia])
  const prevInvest = useMemo(() => prevMedia.reduce((s, r) => s + r.spend_brl, 0), [prevMedia])

  const funnel = useMemo(() => [
    { key: 'mql', label: 'MQL', value: mqlLeads.length },
    ...buildFunnel(curRows, range.start, range.end),
  ], [curRows, range.start, range.end, mqlLeads])

  const { kpis, noShow, sources, leadtimes } = useMemo(() => {
    const active     = curRows.filter(r => r.status_atual !== 'Excluído')
    const ganhos     = curRows.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, range.start, range.end))
    const prevGanhos = prevRows.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, prev.start, prev.end))

    const fechamentos     = ganhos.length
    const prevFechamentos = prevGanhos.length
    const mql     = mqlLeads.length
    const prevMql = prevMqlLeads.length

    const receita     = ganhos.reduce((s, r) => s + (r.valor_contrato ?? 0), 0)
    const prevReceita = prevGanhos.reduce((s, r) => s + (r.valor_contrato ?? 0), 0)
    const ticket     = fechamentos > 0 ? receita / fechamentos : 0
    const prevTicket = prevFechamentos > 0 ? prevReceita / prevFechamentos : 0

    const convGlobal     = mql > 0 ? (fechamentos / mql) * 100 : 0
    const prevConvGlobal = prevMql > 0 ? (prevFechamentos / prevMql) * 100 : 0
    const cac     = fechamentos > 0 ? invest / fechamentos : 0
    const prevCac = prevFechamentos > 0 ? prevInvest / prevFechamentos : 0
    const roas     = invest > 0 ? receita / invest : 0
    const prevRoas = prevInvest > 0 ? prevReceita / prevInvest : 0

    const pctDelta = (c: number, p: number): number | null => p > 0 ? ((c - p) / p) * 100 : null

    // No-show
    const noShow = active.filter(r => r.data_no_show).length

    // Sources from Ganhos
    const fonteCounts: Record<string, number> = {}
    for (const r of ganhos) {
      const key = mapFonte(r.fonte)
      fonteCounts[key] = (fonteCounts[key] ?? 0) + 1
    }
    const SOURCE_COLORS: Record<string, string> = {
      'Digital · Pago':         accent,
      'Indicação / Referência': 'var(--ws-vinho-b)',
      'Digital · Orgânico':    'var(--status-positivo)',
      'Direto / Prospecção':   'var(--status-atencao)',
      'Sem classificação':      'var(--ws-border-strong)',
    }
    const total = Math.max(ganhos.length, 1)
    const sources: DonutSlice[] = Object.entries(fonteCounts)
      .map(([label, cnt]) => ({ label, pct: (cnt / total) * 100, color: SOURCE_COLORS[label] ?? '#ccc' }))
      .sort((a, b) => b.pct - a.pct)
    if (sources.length === 0) {
      sources.push({ label: 'Sem dados', pct: 100, color: 'var(--ws-border)' })
    }

    // Leadtimes
    const today = Date.now()
    const emAndamento = active.filter(r => r.status_atual === 'Em andamento' && r.data_mql)
    const perdidos    = active.filter(r => r.status_atual === 'Perdido' && r.data_mql && r.data_perdido)
    const ganhosLt    = ganhos.filter(r => r.data_mql && r.data_venda)

    const avgMs = (pairs: [string, string][]) => pairs.length === 0 ? 0
      : pairs.reduce((s, [a, b]) => s + Math.max(0, new Date(b).getTime() - new Date(a).getTime()), 0) / pairs.length

    const andamentoMs = emAndamento.length > 0
      ? emAndamento.reduce((s, r) => s + Math.max(0, today - new Date(r.data_mql!).getTime()), 0) / emAndamento.length
      : 0

    const leadtimes = {
      andamento: { value: fmtMs(andamentoMs), count: emAndamento.length },
      perda:     { value: fmtMs(avgMs(perdidos.map(r => [r.data_mql!, r.data_perdido!]))) },
      fechamento:{ value: fmtMs(avgMs(ganhosLt.map(r => [r.data_mql!, r.data_venda!]))) },
    }

    return {
      kpis: {
        receita, fechamentos, ticket, convGlobal, cac, roas, mql,
        deltas: {
          receita:     pctDelta(receita, prevReceita),
          fechamentos: pctDelta(fechamentos, prevFechamentos),
          ticket:      pctDelta(ticket, prevTicket),
          convGlobal:  convGlobal - prevConvGlobal,
          cac:         pctDelta(cac, prevCac),
          roas:        pctDelta(roas, prevRoas),
        },
      },
      noShow,
      sources,
      leadtimes,
    }
  }, [curRows, prevRows, invest, prevInvest, accent, range.start, range.end, prev.start, prev.end, mqlLeads, prevMqlLeads])

  // ── Style helpers ─────────────────────────────────────────────────────────────
  const heroStyle: CSSProperties = {
    '--fs-metric': '26px',
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 15%, white), white 68%)`,
    borderColor: `color-mix(in srgb, ${accent} 34%, var(--ws-border))`,
  } as CSSProperties

  const metricStyle: CSSProperties = { '--fs-metric': '26px' } as CSSProperties

  const prevMonthLabel = `vs. ${shortMonth(prev.start)}`

  return (
    <div style={{ padding: '32px 32px 48px', background: 'var(--ws-bg)', minHeight: '100vh' }}
      {...(brandKey !== 'overview' ? { 'data-brand': brandKey } : {})}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <PageTop
        title="Funil de Vendas"
        subtitle={`${scopeLabel} · ${curMonthLabel} ${new Date(range.start + 'T12:00:00').getFullYear()}`}
        actions={
          <>
            <BrandSelect value={brandKey} onChange={setBrandKey} />
            <select
              value={filterFonte}
              onChange={e => setFilterFonte(e.target.value)}
              style={{ appearance: 'none', padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none' }}
            >
              <option value="__all__">Todas as fontes</option>
              {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', padding: '4px 12px', background: 'var(--ws-surface)', fontSize: 13 }}>
              <span style={{ color: 'var(--ws-text-secondary)' }}>Mês</span>
              <input type="date" value={range.start}
                onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
                style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer', outline: 'none' }} />
              <span style={{ color: 'var(--ws-text-secondary)' }}>—</span>
              <input type="date" value={range.end}
                onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
                style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer', outline: 'none' }} />
            </div>
            <button
              onClick={() => downloadCsv(
                rawCurRows,
                `funil-vendas-${marca ?? 'todas'}-${range.start}-${range.end}`,
              )}
              disabled={!rawCurRows.length}
              title={!rawCurRows.length ? 'Sem dados no período' : 'Exportar deals do período em CSV'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', background: 'var(--ws-surface)', fontSize: 13, color: 'var(--ws-text-primary)', cursor: rawCurRows.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', opacity: rawCurRows.length ? 1 : 0.5 }}
            >
              <Download size={14} /> Exportar
            </button>
          </>
        }
      />

      <QueryErrorBanner errors={[curError]} scope="Funil de Vendas" />

      {/* ── Data notice (dinâmico via dashboard_notices) ─────────────────────── */}
      {notice && notice.mostrar_banner && notice.id !== dismissedNoticeId && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: notice.cor_fundo
            ? `color-mix(in srgb, ${notice.cor_fundo} 12%, var(--ws-surface))`
            : 'color-mix(in srgb, #F2A93B 10%, var(--ws-surface))',
          border: `1px solid ${notice.cor_fundo
            ? `color-mix(in srgb, ${notice.cor_fundo} 40%, transparent)`
            : 'color-mix(in srgb, #F2A93B 35%, transparent)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 20,
        }}>
          <Info size={16} style={{ color: notice.cor_fundo ?? 'var(--status-atencao)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-primary)', lineHeight: 1.5 }}>
            {notice.titulo && <><b>{notice.titulo}.</b>{' '}</>}
            {notice.mensagem}
          </div>
          <button
            onClick={() => setDismissedNoticeId(notice.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', padding: 2, display: 'flex', flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard
          style={heroStyle}
          label="Receita no período"
          value={moneyK(kpis.receita)}
          delta={kpis.deltas.receita ?? undefined}
          deltaLabel={prevMonthLabel}
          accent={false}
        />
        <MetricCard
          style={metricStyle}
          label="Fechamentos"
          value={nf(kpis.fechamentos)}
          delta={kpis.deltas.fechamentos ?? undefined}
          deltaLabel={prevMonthLabel}
          accent={false}
        />
        <MetricCard
          style={metricStyle}
          label="Ticket médio"
          value={moneyK(kpis.ticket)}
          delta={kpis.deltas.ticket ?? undefined}
          deltaLabel={prevMonthLabel}
          accent={false}
        />
        <MetricCard
          style={metricStyle}
          label="Conversão MQL→Ganho"
          value={kpis.convGlobal.toFixed(1)}
          unit="%"
          delta={kpis.deltas.convGlobal ?? undefined}
          accent={false}
        />
        <MetricCard
          style={metricStyle}
          label="CAC (custo/ganho)"
          value={kpis.cac > 0 ? money(kpis.cac) : '—'}
          delta={kpis.deltas.cac ?? undefined}
          deltaLabel={prevMonthLabel}
          invertDelta
          accent={false}
        />
        <MetricCard
          style={metricStyle}
          label="ROAS de mídia"
          value={kpis.roas > 0 ? kpis.roas.toFixed(1) + 'x' : '—'}
          delta={kpis.deltas.roas ?? undefined}
          deltaLabel={prevMonthLabel}
          accent={false}
        />
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>

        {/* Left: Funnel card */}
        <SCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Funil de vendas</div>
              <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
                Volume por etapa, conversão de passagem e custo acumulado · {scopeLabel}
              </div>
            </div>
            <Badge tone="neutral">No-show · {nf(noShow)}</Badge>
          </div>
          <div style={{ padding: '14px 24px 24px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            <TrapFunnel stages={funnel} invest={invest} accent={accent} dark={dark} />
          </div>
        </SCard>

        {/* Right: Sources + Conversão global */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SCard>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Vendas por fonte</div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 14 }}>Origem das oportunidades ganhas</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <DonutChart slices={sources} size={130} />
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {sources.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--ws-text-primary)' }}>{s.label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SCard>

          <SCard pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>
              Conversão global
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, color: accent }}>
                {kpis.convGlobal.toFixed(1)}%
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)' }}>MQL → fechamento</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
              {nf(kpis.fechamentos)} ganhos de {nf(kpis.mql)} MQLs no período
            </div>
          </SCard>
        </div>
      </div>

      {/* ── Tempo de ciclo ───────────────────────────────────────────────────── */}
      <SectionHead title="Tempo de ciclo" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <LeadtimeCard
          label="Leadtime médio em andamento"
          value={leadtimes.andamento.value}
          sub={`${nf(leadtimes.andamento.count)} negociações em aberto — da entrada até hoje`}
          tone="atencao"
          icon={<Clock size={17} />}
        />
        <LeadtimeCard
          label="Leadtime médio até a perda"
          value={leadtimes.perda.value}
          sub="Média das negociações perdidas no período"
          tone="risco"
          icon={<TrendingDown size={17} />}
        />
        <LeadtimeCard
          label="Leadtime médio de fechamento"
          value={leadtimes.fechamento.value}
          sub="Da entrada do MQL até o ganho"
          tone="positivo"
          icon={<Trophy size={17} />}
        />
      </div>
    </div>
  )
}
