import { useMemo, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Download, Clock, TrendingDown, Trophy, Info, X } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { useDashboardNotice } from '@/hooks/useDashboardNotice'
import { useMediaData } from '@/hooks/useMediaData'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useFunilAging } from '@/hooks/useFunilAging'
import { computeAging } from '@/lib/aging'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import {
  STAGE_ORDER, STAGE_LABEL, buildScopeFilter, cohortKeys, countSales, countStage,
  countStageEvents, isSale, resolveStage, sumRevenue, toWindow,
} from '@/lib/metrics'
import type { StageKey } from '@/lib/metrics'
import { BRANDS_WITH_OVERVIEW } from '@/constants/brands'
import { nf, money, moneyK } from '@/lib/format'
import { isoDate, shortMonth } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'

const BRANDS = BRANDS_WITH_OVERVIEW

/** Modo de leitura do funil. Local à aba — não é um dos toggles globais. */
type FunnelMode = 'performance' | 'aging' | 'atual'

function prevRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00')
  s.setMonth(s.getMonth() - 1); e.setMonth(e.getMonth() - 1)
  return { start: isoDate(s), end: isoDate(e) }
}

function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

function fmtDias(d: number | null): string {
  if (d === null) return '—'
  return d < 1 ? `${Math.round(d * 24)}h` : `${d.toFixed(d < 10 ? 1 : 0)}d`
}

// ─── TrapFunnel ────────────────────────────────────────────────────────────────

interface FunnelStage { key: string; label: string; value: number }

function TrapFunnel({ stages, invest, accent, dark }: {
  stages: FunnelStage[]; invest: number; accent: string; dark: string
}) {
  const v0 = Math.max(stages[0]?.value ?? 1, 1)
  const width = (v: number) => 30 + 70 * Math.sqrt(Math.max(0, v) / v0)

  function shade(i: number) {
    const pct = Math.max(38, 100 - i * 5)
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
        // Pode passar de 100%: deals pulam etapas, então o funil não é monotônico.
        const conv = i > 0 && stages[i - 1].value > 0
          ? (s.value / stages[i - 1].value) * 100 : null
        const subiu = conv !== null && conv > 100
        const cost = invest > 0 && s.value > 0 ? invest / s.value : 0

        return (
          <div key={s.key}>
            {i > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, alignItems: 'center', height: 15 }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: subiu ? 'var(--status-positivo)' : 'var(--status-risco)', fontSize: 10 }}>
                      {subiu ? '▲' : '▼'}
                    </span>
                    {conv !== null ? conv.toFixed(1) : '—'}%
                  </span>
                </div>
                <div />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, alignItems: 'center' }}>
              <div style={{ position: 'relative', height: 46 }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: shade(i),
                  clipPath: `polygon(${insetTop}% 0, ${100 - insetTop}% 0, ${100 - insetBot}% 100%, ${insetBot}% 100%)`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {nf(s.value)}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,.88)' }}>
                    {s.label}
                  </span>
                </div>
              </div>
              {invest > 0 && (
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Custo / {s.label.split(' · ')[0]}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.value > 0 ? money(cost) : '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── AgingList ─────────────────────────────────────────────────────────────────

function AgingList({ linhas, accent }: {
  linhas: { etapa: string; deals: number; p50: number | null; p75: number | null }[]
  accent: string
}) {
  if (linhas.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', padding: '24px 0' }}>
      Nenhum negócio em aberto no recorte selecionado.
    </div>
  }
  const maxDeals = Math.max(...linhas.map(l => l.deals), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 62px 62px', gap: 12, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ws-text-secondary)', fontWeight: 700 }}>
        <span>Etapa · negócios parados</span>
        <span style={{ textAlign: 'right' }}>Mediana</span>
        <span style={{ textAlign: 'right' }}>P75</span>
      </div>
      {linhas.map(l => (
        <div key={l.etapa} style={{ display: 'grid', gridTemplateColumns: '1fr 62px 62px', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
              <span style={{ color: 'var(--ws-text-primary)' }}>{l.etapa}</span>
              <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{nf(l.deals)}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'var(--ws-border)', overflow: 'hidden' }}>
              <div style={{ width: `${(l.deals / maxDeals) * 100}%`, height: '100%', background: accent, borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-primary)' }}>
            {fmtDias(l.p50)}
          </span>
          <span style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-secondary)' }}>
            {fmtDias(l.p75)}
          </span>
        </div>
      ))}
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

// ─── SCard / SectionHead / LeadtimeCard ────────────────────────────────────────

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

function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ margin: '32px 0 14px' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>
        {title}
      </h2>
    </div>
  )
}

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

// ─── ModeToggle ────────────────────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: FunnelMode; onChange: (m: FunnelMode) => void }) {
  const opts: { v: FunnelMode; label: string; hint: string }[] = [
    { v: 'performance', label: 'Performance', hint: 'Volume que passou por cada etapa no período' },
    { v: 'aging', label: 'Aging', hint: 'Há quanto tempo os negócios em aberto estão parados' },
    { v: 'atual', label: 'Atual', hint: 'Onde os negócios estão agora — ignora o período' },
  ]
  return (
    <div style={{ display: 'inline-flex', background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 2, gap: 2 }}>
      {opts.map(o => {
        const on = o.v === value
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} title={o.hint}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 4, padding: '5px 12px',
              fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: 'var(--font-body)',
              background: on ? 'var(--ws-surface)' : 'transparent',
              color: on ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)',
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── FunilVendas ──────────────────────────────────────────────────────────────

export function FunilVendas() {
  const { brandKey, range, fontes, subFontes, viewModes } = useSharedFilters()
  const [modo, setModo] = useState<FunnelMode>('performance')
  const [dismissedNoticeId, setDismissedNoticeId] = useState<number | null>(null)
  const { notice } = useDashboardNotice()

  const brandDef = BRANDS.find(b => b.key === brandKey) ?? BRANDS[0]
  const marca = brandDef.marca
  const { accent, dark } = brandDef
  const scopeLabel = brandKey === 'overview' ? 'Consolidado' : brandDef.label

  const prev = useMemo(() => prevRange(range.start, range.end), [range.start, range.end])

  // ── Dados ───────────────────────────────────────────────────────────────────
  const { data: rows, loading, error } = useFunilVendas(marca)
  const { data: curMedia } = useMediaData({ marca, dataInicio: range.start, dataFim: range.end })
  const { data: prevMedia } = useMediaData({ marca, dataInicio: prev.start, dataFim: prev.end })

  const usaEventos = viewModes.eventSource === 'passages'
  const { data: eventos } = useFunilEventos({
    enabled: usaEventos,
    marca,
    inicio: range.start,
    // No modo safra o evento pode ser posterior à janela do MQL.
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { periodos } = useFunilAging(modo === 'aging')

  // ── Escopo e janelas ────────────────────────────────────────────────────────
  const scope = useMemo(() => buildScopeFilter({ fontes, subFontes }), [fontes, subFontes])
  const win = useMemo(() => toWindow(null, { from: range.start, to: range.end }), [range.start, range.end])
  const winPrev = useMemo(() => toWindow(null, { from: prev.start, to: prev.end }), [prev.start, prev.end])

  const invest = useMemo(() => curMedia.reduce((s, r) => s + r.spend_brl, 0), [curMedia])
  const prevInvest = useMemo(() => prevMedia.reduce((s, r) => s + r.spend_brl, 0), [prevMedia])

  /** Deals do escopo (marca já veio filtrada do servidor). */
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])

  // ── Funil ───────────────────────────────────────────────────────────────────
  const funnel = useMemo<FunnelStage[]>(() => {
    if (modo === 'atual') {
      // Onde os negócios estão agora. Ignora período de propósito.
      const porEtapa = new Map<StageKey, number>()
      for (const r of scoped) {
        if (!r.eh_ciclo_atual || r.status_atual !== 'Em andamento') continue
        const etapa = resolveStage(r.etapa_funil)
        if (!etapa) continue
        porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1)
      }
      return STAGE_ORDER.map(s => ({ key: s, label: STAGE_LABEL[s], value: porEtapa.get(s) ?? 0 }))
    }

    if (usaEventos) {
      const safra = viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null
      const idsEscopo = new Set(scoped.map(r => String(r.id_lead)))
      return STAGE_ORDER.map(s => ({
        key: s,
        label: STAGE_LABEL[s],
        value: countStageEvents(eventos, s, win, viewModes, {
          cohortIds: safra,
          extra: e => idsEscopo.has(String(e.id_deal)),
        }),
      }))
    }

    return STAGE_ORDER.map(s => ({
      key: s,
      label: STAGE_LABEL[s],
      value: countStage(scoped, s, win, viewModes),
    }))
  }, [modo, usaEventos, scoped, eventos, win, viewModes])

  const aging = useMemo(() => {
    if (modo !== 'aging') return []
    const vivos = new Set(
      scoped.filter(r => r.eh_ciclo_atual && r.status_atual === 'Em andamento').map(r => String(r.id_lead)),
    )
    return computeAging(periodos, vivos)
  }, [modo, scoped, periodos])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const { kpis, noShow, sources, leadtimes } = useMemo(() => {
    const mql = countStage(scoped, 'MQL', win, viewModes)
    const prevMql = countStage(scoped, 'MQL', winPrev, viewModes)

    const fechamentos = countSales(scoped, win, viewModes)
    const prevFechamentos = countSales(scoped, winPrev, viewModes)

    const receita = sumRevenue(scoped, win, viewModes)
    const prevReceita = sumRevenue(scoped, winPrev, viewModes)

    const ticket = fechamentos > 0 ? receita / fechamentos : 0
    const prevTicket = prevFechamentos > 0 ? prevReceita / prevFechamentos : 0
    const convGlobal = mql > 0 ? (fechamentos / mql) * 100 : 0
    const prevConvGlobal = prevMql > 0 ? (prevFechamentos / prevMql) * 100 : 0
    const cac = fechamentos > 0 ? invest / fechamentos : 0
    const prevCac = prevFechamentos > 0 ? prevInvest / prevFechamentos : 0
    const roas = invest > 0 ? receita / invest : 0
    const prevRoas = prevInvest > 0 ? prevReceita / prevInvest : 0

    const pctDelta = (c: number, p: number): number | null => p > 0 ? ((c - p) / p) * 100 : null

    const noShow = countStage(scoped, 'No Show', win, viewModes)

    // Origem das vendas — por fonte_macro, a classificação de negócio do CRM.
    const ganhos = scoped.filter(r => isSale(r) && countStage([r], 'Fechamento', win, viewModes) > 0)
    const cont: Record<string, number> = {}
    for (const r of ganhos) {
      const k = r.fonte_macro?.trim() || 'Sem Classificação'
      cont[k] = (cont[k] ?? 0) + 1
    }
    const CORES: Record<string, string> = {
      'Inbound': accent,
      'Resgate': 'var(--ws-vinho-b)',
      'Sem Classificação': 'var(--ws-border-strong)',
    }
    const total = Math.max(ganhos.length, 1)
    const sources: DonutSlice[] = Object.entries(cont)
      .map(([label, n]) => ({ label, pct: (n / total) * 100, color: CORES[label] ?? 'var(--status-atencao)' }))
      .sort((a, b) => b.pct - a.pct)
    if (sources.length === 0) sources.push({ label: 'Sem dados', pct: 100, color: 'var(--ws-border)' })

    // Tempo de ciclo — sempre a partir da entrada como MQL.
    const hoje = Date.now()
    const ms = (a: string, b: string) => Math.max(0, new Date(b).getTime() - new Date(a).getTime())
    const media = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0

    const emAndamento = scoped.filter(r => r.status_atual === 'Em andamento' && r.data_novo_mql)
    const perdidos = scoped.filter(r => r.status_atual === 'Perdido' && r.data_novo_mql && r.data_perdido)
    const ganhosLt = scoped.filter(r => isSale(r) && r.data_novo_mql && r.data_venda)

    const leadtimes = {
      andamento: {
        value: fmtMs(media(emAndamento.map(r => Math.max(0, hoje - new Date(r.data_novo_mql!).getTime())))),
        count: emAndamento.length,
      },
      perda: { value: fmtMs(media(perdidos.map(r => ms(r.data_novo_mql!, r.data_perdido!)))) },
      fechamento: { value: fmtMs(media(ganhosLt.map(r => ms(r.data_novo_mql!, r.data_venda!)))) },
    }

    return {
      kpis: {
        receita, fechamentos, ticket, convGlobal, cac, roas, mql,
        deltas: {
          receita: pctDelta(receita, prevReceita),
          fechamentos: pctDelta(fechamentos, prevFechamentos),
          ticket: pctDelta(ticket, prevTicket),
          convGlobal: convGlobal - prevConvGlobal,
          cac: pctDelta(cac, prevCac),
          roas: pctDelta(roas, prevRoas),
        },
      },
      noShow, sources, leadtimes,
    }
  }, [scoped, win, winPrev, viewModes, invest, prevInvest, accent])

  const heroStyle: CSSProperties = {
    '--fs-metric': '26px',
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 15%, white), white 68%)`,
    borderColor: `color-mix(in srgb, ${accent} 34%, var(--ws-border))`,
  } as CSSProperties
  const metricStyle: CSSProperties = { '--fs-metric': '26px' } as CSSProperties
  const prevLabel = `vs. ${shortMonth(prev.start)}`

  const unidadeSufixo = viewModes.salesMode === 'units' ? ' (unidades)' : ''

  return (
    <div style={{ padding: '32px 32px 48px', background: 'var(--ws-bg)', minHeight: '100vh' }}
      {...(brandKey !== 'overview' ? { 'data-brand': brandKey } : {})}>

      <PageTop
        title="Funil de Vendas"
        subtitle={`${scopeLabel} · ${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`}
        actions={
          <button
            onClick={() => downloadCsv(scoped as unknown as Record<string, unknown>[], `funil-vendas-${marca ?? 'todas'}-${range.start}-${range.end}`)}
            disabled={!scoped.length}
            title={!scoped.length ? 'Sem dados no período' : 'Exportar deals do recorte em CSV'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', background: 'var(--ws-surface)', fontSize: 13, color: 'var(--ws-text-primary)', cursor: scoped.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', opacity: scoped.length ? 1 : 0.5 }}
          >
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar />

      <QueryErrorBanner errors={[error]} scope="Funil de Vendas" />

      {notice && notice.mostrar_banner && notice.id !== dismissedNoticeId && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: notice.cor_fundo
            ? `color-mix(in srgb, ${notice.cor_fundo} 12%, var(--ws-surface))`
            : 'color-mix(in srgb, #F2A93B 10%, var(--ws-surface))',
          border: `1px solid ${notice.cor_fundo
            ? `color-mix(in srgb, ${notice.cor_fundo} 40%, transparent)`
            : 'color-mix(in srgb, #F2A93B 35%, transparent)'}`,
          borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
        }}>
          <Info size={16} style={{ color: notice.cor_fundo ?? 'var(--status-atencao)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-primary)', lineHeight: 1.5 }}>
            {notice.titulo && <><b>{notice.titulo}.</b>{' '}</>}
            {notice.mensagem}
          </div>
          <button onClick={() => setDismissedNoticeId(notice.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', padding: 2, display: 'flex', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24, opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
        <MetricCard style={heroStyle} label="Receita no período" value={moneyK(kpis.receita)} delta={kpis.deltas.receita ?? undefined} deltaLabel={prevLabel} accent={false} />
        <MetricCard style={metricStyle} label={`Fechamentos${unidadeSufixo}`} value={nf(kpis.fechamentos)} delta={kpis.deltas.fechamentos ?? undefined} deltaLabel={prevLabel} accent={false} />
        <MetricCard style={metricStyle} label="Ticket médio" value={moneyK(kpis.ticket)} delta={kpis.deltas.ticket ?? undefined} deltaLabel={prevLabel} accent={false} />
        <MetricCard style={metricStyle} label="Conversão MQL→Ganho" value={kpis.convGlobal.toFixed(1)} unit="%" delta={kpis.deltas.convGlobal ?? undefined} accent={false} />
        <MetricCard style={metricStyle} label="CAC (custo/ganho)" value={kpis.cac > 0 ? money(kpis.cac) : '—'} delta={kpis.deltas.cac ?? undefined} deltaLabel={prevLabel} invertDelta accent={false} />
        <MetricCard style={metricStyle} label="ROAS de mídia" value={kpis.roas > 0 ? kpis.roas.toFixed(1) + 'x' : '—'} delta={kpis.deltas.roas ?? undefined} deltaLabel={prevLabel} accent={false} />
      </div>

      {/* ── Funil + laterais ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>

        <SCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Funil de vendas</div>
              <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
                {modo === 'performance' && `Volume por etapa, conversão de passagem e custo acumulado · ${scopeLabel}`}
                {modo === 'aging' && `Negócios em aberto e há quanto tempo estão parados · ${scopeLabel}`}
                {modo === 'atual' && `Onde os negócios estão agora, independente do período · ${scopeLabel}`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ModeToggle value={modo} onChange={setModo} />
              <Badge tone="neutral">No-show · {nf(noShow)}</Badge>
            </div>
          </div>
          <div style={{ padding: '14px 24px 24px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            {modo === 'aging'
              ? <AgingList linhas={aging} accent={accent} />
              : <TrapFunnel stages={funnel} invest={modo === 'performance' ? invest : 0} accent={accent} dark={dark} />}
          </div>
        </SCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SCard>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Vendas por fonte</div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 14 }}>Origem das oportunidades ganhas · fonte macro do CRM</div>
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

      <SectionHead title="Tempo de ciclo" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <LeadtimeCard label="Leadtime médio em andamento" value={leadtimes.andamento.value}
          sub={`${nf(leadtimes.andamento.count)} negociações em aberto — da entrada até hoje`}
          tone="atencao" icon={<Clock size={17} />} />
        <LeadtimeCard label="Leadtime médio até a perda" value={leadtimes.perda.value}
          sub="Média das negociações perdidas no período" tone="risco" icon={<TrendingDown size={17} />} />
        <LeadtimeCard label="Leadtime médio de fechamento" value={leadtimes.fechamento.value}
          sub="Da entrada do MQL até o ganho" tone="positivo" icon={<Trophy size={17} />} />
      </div>
    </div>
  )
}
