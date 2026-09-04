import { useMemo, useState } from 'react'
import { Download, Users, Handshake } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FunilCompletoSection } from '@/components/ui/FunilCompletoSection'
import { MetaRitmoCard } from '@/components/ui/MetaRitmoCard'
import { MetaBreakdownDrawer } from '@/components/ui/MetaBreakdownDrawer'
import { SCard } from '@/components/ui/v2'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useMetasPerformance, findMeta } from '@/hooks/useMetasPerformance'
import { useMetasTimeResumo } from '@/hooks/useMetasTimeResumo'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { buildSdrRows, buildCloserRows } from '@/lib/performanceRows'
import type { SdrRow, CloserRow } from '@/lib/performanceRows'
import { buildPersonMetaRows, buildPersonSimplesRows } from '@/lib/metaBreakdown'
import { funilFilterOptions } from '@/lib/funilFilterOptions'
import {
  buildScopeFilter, cohortKeys, countStage, countStageEvents, countSales, sumRevenue, toWindow,
} from '@/lib/metrics'
import { BRAND_LIST } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import { nf, pct, moneyK, nfCeil } from '@/lib/format'
import { shortMonth, todayLocal } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'

/** nome -> valor de uma coluna numérica de SdrRow/CloserRow — base dos Maps
 *  período/hoje que os popups de desdobramento (MetaBreakdownDrawer) usam. */
function mapaSdr(rows: SdrRow[], campo: 'sql' | 'rr' | 'sal'): Map<string, number> {
  return new Map(rows.map(r => [r.nome, r[campo]]))
}
function mapaCloser(rows: CloserRow[], campo: 'cof' | 'ganhos' | 'faturamento'): Map<string, number> {
  return new Map(rows.map(r => [r.nome, r[campo]]))
}

type MetaDrawerKey = 'sql' | 'rr' | 'sal' | 'cof' | 'fechamentos' | 'receita'

// ─── Colors ──────────────────────────────────────────────────────────────

const SDR_ACCENT    = '#EFA94A' // laranja
const CLOSER_ACCENT = '#2ABCB5' // teal
const GARGALO       = '#E4585B' // vermelho suave

// ─── Abas SDR / Closer ─────────────────────────────────────────────────────
// Separadas em abas (2026-09-04, pedido do Junior) — antes as duas seções
// ficavam empilhadas na mesma tela, o que ficava longo e desorganizado.

type PerfTab = 'sdr' | 'closer'

const PERF_TABS: { key: PerfTab; label: string; icon: React.ComponentType<{ size?: number }>; accent: string }[] = [
  { key: 'sdr',    label: 'SDR',    icon: Users,      accent: SDR_ACCENT },
  { key: 'closer', label: 'Closer', icon: Handshake,  accent: CLOSER_ACCENT },
]

function TabsBar({ current, onChange }: { current: PerfTab; onChange: (t: PerfTab) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
      {PERF_TABS.map(({ key, label, icon: Icon, accent }) => {
        const ativo = key === current
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px',
              border: ativo ? `1px solid ${accent}` : '1px solid var(--ws-border)',
              background: ativo ? accent : 'var(--ws-surface)',
              color: ativo ? '#fff' : 'var(--ws-text-primary)',
              borderRadius: 999, cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              transition: 'all .15s',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── UI blocks ─────────────────────────────────────────────────────────────

function Avatar({ nome, accent }: { nome: string; accent: string }) {
  const parts = nome.split(' ')
  const initial = parts.length > 1 ? parts[0][0] + parts[1][0] : nome.slice(0, 1)
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%',
      border: `1px solid ${accent}55`, color: 'var(--ws-text-primary)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
      background: 'var(--ws-surface)',
    }}>{initial}</div>
  )
}

function RankNum({ i, accent }: { i: number; accent: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 15, color: accent, fontVariantNumeric: 'tabular-nums' }}>
      {i + 1}º
    </span>
  )
}

function ConversionBar({ label, pctVal, gargalo }: { label: string; pctVal: number; gargalo?: boolean }) {
  const color = gargalo ? GARGALO : CLOSER_ACCENT
  const w = Math.min(100, Math.max(0, pctVal))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 60px', gap: 16, alignItems: 'center', padding: '10px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{label}</span>
      <div style={{ height: 6, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct(pctVal)}
      </span>
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)', lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{sub}</div>
    </div>
  )
}

// ─── Tabelas ───────────────────────────────────────────────────────────────

function SdrTable({ rows }: { rows: SdrRow[] }) {
  const cols = '40px 1fr 70px 70px 70px 70px 90px 70px 90px'
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: SDR_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        PRÉ-VENDAS · EXECUTIVOS DE EXPANSÃO
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>MQL</span>
          <span style={{ textAlign: 'right' }}>SQL</span>
          <span style={{ textAlign: 'right' }}>RR</span>
          <span style={{ textAlign: 'right' }}>SAL</span>
          <span style={{ textAlign: 'right' }}>META SQL</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>MQL→SQL</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhum SDR com atividade no recorte.</div>
        )}
        {rows.map((r, i) => (
          <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: cols, padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums' }}>
            <RankNum i={i} accent={SDR_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={SDR_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right' }}>{nf(r.mql)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.sql)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.rr)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{nf(r.sal)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.metaSql > 0 ? nf(r.metaSql) : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.metaSql > 0 ? pct(r.pctAting) : '—'}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.mqlToSql)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}

function CloserTable({ rows }: { rows: CloserRow[] }) {
  const cols = '40px 1fr 70px 70px 70px 80px 120px 110px 70px 80px'
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: CLOSER_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        VENDAS · CLOSERS
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>RR</span>
          <span style={{ textAlign: 'right' }}>SAL</span>
          <span style={{ textAlign: 'right' }}>COF</span>
          <span style={{ textAlign: 'right' }}>GANHOS</span>
          <span style={{ textAlign: 'right' }}>FATURAMENTO</span>
          <span style={{ textAlign: 'right' }}>META FAT.</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>WIN RATE</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhum Closer com atividade no recorte.</div>
        )}
        {rows.map((r, i) => (
          <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: cols, padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums' }}>
            <RankNum i={i} accent={CLOSER_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={CLOSER_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right' }}>{nf(r.rr)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.sal)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.cof)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.ganhos)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{moneyK(r.faturamento)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.metaFinanceira > 0 ? moneyK(r.metaFinanceira) : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.metaFinanceira > 0 ? pct(r.pctAting) : '—'}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.winRate)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}

// ─── Conversões (SCard reutilizável) ──────────────────────────────────────

function ConversoesCard({ titulo, linhas }: { titulo: string; linhas: { label: string; val: number }[] }) {
  const worst = Math.min(...linhas.map(x => x.val))
  return (
    <SCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>{titulo}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ws-text-secondary)' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: GARGALO, marginRight: 4 }} />Gargalo</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CLOSER_ACCENT, marginRight: 4 }} />Melhor</span>
        </div>
      </div>
      {linhas.map((c, i) => (
        <ConversionBar key={i} label={c.label} pctVal={c.val} gargalo={c.val === worst && linhas.length > 1} />
      ))}
    </SCard>
  )
}

// ─── Página ────────────────────────────────────────────────────────────────

export function PerformanceVendas() {
  const { origem, brandKeys, periodMode, periodValues, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()

  const marcasSelecionadas = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is BrandDef => !!b),
    [brandKeys],
  )
  const todasSelecionadas = marcasSelecionadas.length === BRAND_LIST.length
  const scopeLabel = todasSelecionadas
    ? 'Consolidado'
    : marcasSelecionadas.length === 1
      ? marcasSelecionadas[0].label
      : marcasSelecionadas.length <= 3
        ? marcasSelecionadas.map(b => b.label).join(', ')
        : `${marcasSelecionadas.length} marcas selecionadas`
  const marcaFetch = marcasSelecionadas.length === 1 ? marcasSelecionadas[0].marca : undefined
  const marcasParaEscopo = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is Marca => !!m),
    [marcasSelecionadas],
  )

  const { data: rows, error: rowsError, loading } = useFunilVendas(origem, marcaFetch)
  const { data: eventos } = useFunilEventos({
    enabled: true,
    origem,
    inicio: range.start,
    // No modo safra o evento pode ser posterior à janela do MQL.
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { data: roster } = useRosterVendas()

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes }),
    [origem, marcasParaEscopo, fontes, subFontes],
  )
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  // `ranges` é a união exata dos períodos selecionados — nunca `range`.
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )
  const idsEscopo = useMemo(() => new Set(scoped.map(r => String(r.id_lead))), [scoped])
  const safra = useMemo(
    () => (viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null),
    [scoped, win, viewModes.funnelView],
  )

  const opcoes = useMemo(
    () => funilFilterOptions({
      rows, win, marcasParaEscopo, fontes, subFontes,
      cohort: viewModes.funnelView === 'cohort',
    }),
    [rows, win, marcasParaEscopo, fontes, subFontes, viewModes.funnelView],
  )
  const marcasDisponiveis = useMemo(
    () => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key),
    [opcoes.marcas],
  )

  // ── Contagens por evento (strips) ──────────────────────────────────────────
  const evOpts = useMemo(
    () => ({ cohortIds: safra, extra: (e: { id_deal: unknown }) => idsEscopo.has(String(e.id_deal)) }),
    [safra, idsEscopo],
  )

  const strip = useMemo(() => ({
    mql: countStage(scoped, 'MQL', win, viewModes),
    // denominador por evento p/ casar com tentando/ce/sql, que também são countStageEvents
    mqlEvento: countStageEvents(eventos, 'MQL', win, viewModes, evOpts),
    sql: countStageEvents(eventos, 'Reunião Agendada SQL', win, viewModes, evOpts),
    rr:  countStageEvents(eventos, 'Diagnóstico', win, viewModes, evOpts),
    sal: countStageEvents(eventos, 'SAL', win, viewModes, evOpts),
    cof: countStageEvents(eventos, 'Oportunidade COF', win, viewModes, evOpts),
    fechamentos: countSales(scoped, win, viewModes),
    receita: sumRevenue(scoped, win, viewModes),
    contatoEfetivo: countStageEvents(eventos, 'Contato Efetivo', win, viewModes, evOpts),
    tentando: countStageEvents(eventos, 'Tentando Contato', win, viewModes, evOpts),
  }), [scoped, eventos, win, viewModes, evOpts])

  // Meta só quando o período resolve para exatamente 1 mês.
  const mesUnico = periodMode === 'mes' && periodValues.length === 1 ? periodValues[0] : null
  const fimJanela = ranges[0]?.end ?? range.end

  const { porMarca: metaTime, error: metaTimeError } = useMetasTimeResumo({ mesesKeys: mesUnico ? [mesUnico] : [] })
  const metaTimeSel = useMemo(() => {
    const acc = { metaSql: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0, metaSal: 0 }
    for (const b of marcasSelecionadas) {
      const m = b.marca ? metaTime.get(b.marca) : undefined
      if (!m) continue
      acc.metaSql += m.metaSql; acc.metaReuniao += m.metaReuniao; acc.metaCof += m.metaCof
      acc.metaFinanceira += m.metaFinanceira; acc.metaQtdVendas += m.metaQtdVendas; acc.metaSal += m.metaSal
    }
    return acc
  }, [marcasSelecionadas, metaTime])

  // Metas por pessoa (para a coluna % das tabelas).
  const { data: metasPessoa, error: metasError } = useMetasPerformance({
    mesKey: mesUnico ?? range.start.slice(0, 7),
    marca: marcaFetch,
  })
  // Fora de um único mês (Trimestre/Ano/multi-mês) a meta mensal não faz sentido
  // contra um `win` que soma vários meses — sem isso o % de atingimento dispararia
  // (ex.: 1200%) e distorceria o rank. Vazio aqui = META/`%` renderiza "—".
  const sdrRows: SdrRow[] = useMemo(
    () => buildSdrRows(scoped, win, mesUnico ? metasPessoa : [], roster),
    [scoped, win, mesUnico, metasPessoa, roster],
  )
  const closerRows: CloserRow[] = useMemo(
    () => buildCloserRows(scoped, win, mesUnico ? metasPessoa : [], roster),
    [scoped, win, mesUnico, metasPessoa, roster],
  )

  const [tab, setTab] = useState<PerfTab>('sdr')

  // ── Popup de desdobramento por pessoa (clique num card com meta) ───────────
  const [metaDrawer, setMetaDrawer] = useState<MetaDrawerKey | null>(null)
  const winHoje = useMemo(() => toWindow(null, null, [{ from: todayLocal(), to: todayLocal() }]), [])
  const sdrRowsHoje = useMemo(() => buildSdrRows(scoped, winHoje, [], roster), [scoped, winHoje, roster])
  const closerRowsHoje = useMemo(() => buildCloserRows(scoped, winHoje, [], roster), [scoped, winHoje, roster])

  const sqlBreakdown = useMemo(() => !mesUnico ? [] : buildPersonMetaRows({
    periodo: mapaSdr(sdrRows, 'sql'), hoje: mapaSdr(sdrRowsHoje, 'sql'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'SDR')?.metaSql ?? 0,
    mesKey: mesUnico, fimJanela,
  }), [mesUnico, sdrRows, sdrRowsHoje, metasPessoa, fimJanela])

  const rrBreakdown = useMemo(() => !mesUnico ? [] : buildPersonMetaRows({
    periodo: mapaSdr(sdrRows, 'rr'), hoje: mapaSdr(sdrRowsHoje, 'rr'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'SDR')?.metaReuniao ?? 0,
    mesKey: mesUnico, fimJanela,
  }), [mesUnico, sdrRows, sdrRowsHoje, metasPessoa, fimJanela])

  const salBreakdown = useMemo(() => !mesUnico ? [] : buildPersonMetaRows({
    periodo: mapaSdr(sdrRows, 'sal'), hoje: mapaSdr(sdrRowsHoje, 'sal'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'SDR')?.metaSal ?? 0,
    mesKey: mesUnico, fimJanela,
  }), [mesUnico, sdrRows, sdrRowsHoje, metasPessoa, fimJanela])

  const cofBreakdown = useMemo(() => !mesUnico ? [] : buildPersonMetaRows({
    periodo: mapaCloser(closerRows, 'cof'), hoje: mapaCloser(closerRowsHoje, 'cof'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'Closer')?.metaCof ?? 0,
    mesKey: mesUnico, fimJanela,
  }), [mesUnico, closerRows, closerRowsHoje, metasPessoa, fimJanela])

  const fechamentosBreakdown = useMemo(() => buildPersonSimplesRows({
    periodo: mapaCloser(closerRows, 'ganhos'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'Closer')?.metaQtdVendas ?? 0,
  }), [closerRows, metasPessoa])

  const receitaBreakdown = useMemo(() => buildPersonSimplesRows({
    periodo: mapaCloser(closerRows, 'faturamento'),
    metaMensalPorNome: nome => findMeta(metasPessoa, nome, 'Closer')?.metaFinanceira ?? 0,
  }), [closerRows, metasPessoa])

  const convTopo = useMemo(() => [
    { label: 'MQL → Tentando contato', val: strip.mqlEvento > 0 ? (strip.tentando / strip.mqlEvento) * 100 : 0 },
    { label: 'Tentando contato → Contato efetivo', val: strip.tentando > 0 ? (strip.contatoEfetivo / strip.tentando) * 100 : 0 },
    { label: 'Contato efetivo → SQL · Reunião agendada', val: strip.contatoEfetivo > 0 ? (strip.sql / strip.contatoEfetivo) * 100 : 0 },
  ], [strip])
  const convFundo = useMemo(() => [
    { label: 'SQL · Reunião agendada → Diagnóstico', val: strip.sql > 0 ? (strip.rr / strip.sql) * 100 : 0 },
    { label: 'Diagnóstico → SAL', val: strip.rr > 0 ? (strip.sal / strip.rr) * 100 : 0 },
    { label: 'SAL → Oportunidade · COF', val: strip.sal > 0 ? (strip.cof / strip.sal) * 100 : 0 },
    { label: 'Oportunidade · COF → Fechamento', val: strip.cof > 0 ? (strip.fechamentos / strip.cof) * 100 : 0 },
  ], [strip])

  const subtitlePeriodo = periodMode !== 'dia' && periodValues.length > 1
    ? `${periodValues.length} períodos selecionados`
    : `${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`

  return (
    <div style={{ padding: '32px 32px 48px', background: 'var(--ws-bg)', minHeight: '100vh' }}
      {...(marcasSelecionadas.length === 1 ? { 'data-brand': marcasSelecionadas[0].key } : {})}>

      <PageTop
        title="Performance"
        titleAside={<OrigemToggle />}
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        actions={
          <button
            onClick={() => downloadCsv(scoped as unknown as Record<string, unknown>[], `performance-${marcasSelecionadas.map(b => b.key).join('-') || 'todas'}-${range.start}-${range.end}`)}
            disabled={!scoped.length}
            title={!scoped.length ? 'Sem dados no período' : 'Exportar deals do recorte em CSV'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', background: 'var(--ws-surface)', fontSize: 13, color: 'var(--ws-text-primary)', cursor: scoped.length ? 'pointer' : 'not-allowed', opacity: scoped.length ? 1 : 0.5 }}
          >
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar
        marcasDisponiveis={marcasDisponiveis}
        fontesDisponiveis={opcoes.fontes}
        subFontesDisponiveis={opcoes.subFontes}
      />

      <QueryErrorBanner errors={[rowsError, metasError, metaTimeError]} scope="Performance" />

      <TabsBar current={tab} onChange={setTab} />

      {tab === 'sdr' && (
        <>
          <SectionHeader title="Executivos de Expansão (SDR)"
            sub="Do MQL à reunião agendada — cadência, contato efetivo e agendamento" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '12px 0 8px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            <MetaRitmoCard label="MQL no período" realizado={strip.mql} metaMensal={0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={SDR_ACCENT} />
            <MetaRitmoCard label="SQL (reuniões agendadas)" realizado={strip.sql}
              metaMensal={mesUnico ? metaTimeSel.metaSql : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nfCeil} accent={SDR_ACCENT}
              onClick={mesUnico && metaTimeSel.metaSql > 0 ? () => setMetaDrawer('sql') : undefined} />
            <MetaRitmoCard label="RR (reuniões realizadas)" realizado={strip.rr}
              metaMensal={mesUnico ? metaTimeSel.metaReuniao : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nfCeil} accent={SDR_ACCENT}
              onClick={mesUnico && metaTimeSel.metaReuniao > 0 ? () => setMetaDrawer('rr') : undefined} />
            <MetaRitmoCard label="SAL qualificados" realizado={strip.sal}
              metaMensal={mesUnico ? metaTimeSel.metaSal : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nfCeil} accent={SDR_ACCENT}
              onClick={mesUnico && metaTimeSel.metaSal > 0 ? () => setMetaDrawer('sal') : undefined} />
          </div>

          <p style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '0 0 16px' }}>
            Os cards usam a mesma contagem por evento da Visão Macro (a etapa “Reunião Agendada SQL” só conta no funil do Closer). A tabela abaixo soma pelo SDR atribuído ao negócio — negócios sem responsável não entram nela, então uma pequena diferença é esperada.
          </p>

          <SdrTable rows={sdrRows} />

          <div style={{ marginTop: 14 }}>
            <ConversoesCard titulo="Conversões — topo do funil" linhas={convTopo} />
          </div>
        </>
      )}

      {tab === 'closer' && (
        <>
          <SectionHeader title="Closer"
            sub="Da reunião realizada ao fechamento — diagnóstico, SAL, oportunidade e receita" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, margin: '12px 0 8px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            <MetaRitmoCard label="Reuniões realizadas" realizado={strip.rr} metaMensal={0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
            <MetaRitmoCard label="SAL qualificados" realizado={strip.sal} metaMensal={0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
            <MetaRitmoCard label="Oportunidades (COF)" realizado={strip.cof}
              metaMensal={mesUnico ? metaTimeSel.metaCof : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nfCeil} accent={CLOSER_ACCENT}
              onClick={mesUnico && metaTimeSel.metaCof > 0 ? () => setMetaDrawer('cof') : undefined} />
            <MetaRitmoCard label="Fechamentos" realizado={strip.fechamentos}
              metaMensal={mesUnico ? metaTimeSel.metaQtdVendas : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nfCeil} accent={CLOSER_ACCENT}
              granularity="monthly"
              onClick={mesUnico && metaTimeSel.metaQtdVendas > 0 ? () => setMetaDrawer('fechamentos') : undefined} />
            <MetaRitmoCard label="Receita gerada" realizado={strip.receita}
              metaMensal={mesUnico ? metaTimeSel.metaFinanceira : 0}
              mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={moneyK} accent={CLOSER_ACCENT}
              granularity="monthly"
              onClick={mesUnico && metaTimeSel.metaFinanceira > 0 ? () => setMetaDrawer('receita') : undefined} />
          </div>

          <p style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '0 0 16px' }}>
            Mesma observação da seção de SDR: cards por evento (Visão Macro), tabela somada pelo Closer atribuído.
          </p>

          <CloserTable rows={closerRows} />

          <div style={{ marginTop: 14 }}>
            <ConversoesCard titulo="Conversões — fundo do funil" linhas={convFundo} />
          </div>
        </>
      )}

      <FunilCompletoSection />

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        {scopeLabel} · {subtitlePeriodo} · Fonte: <code>vw_funil_vendas</code> + <code>vw_funil_etapas_v2</code> + <code>DB_Metas_Performance</code>
      </div>

      <MetaBreakdownDrawer
        open={metaDrawer === 'sql'} onClose={() => setMetaDrawer(null)}
        title="Meta SQL × Realizado — por dia — por SDR" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={SDR_ACCENT} formatter={nfCeil} variant="daily" rows={sqlBreakdown}
      />
      <MetaBreakdownDrawer
        open={metaDrawer === 'rr'} onClose={() => setMetaDrawer(null)}
        title="Meta RR × Realizado — por dia — por SDR" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={SDR_ACCENT} formatter={nfCeil} variant="daily" rows={rrBreakdown}
      />
      <MetaBreakdownDrawer
        open={metaDrawer === 'sal'} onClose={() => setMetaDrawer(null)}
        title="Meta SAL × Realizado — por dia — por SDR" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={SDR_ACCENT} formatter={nfCeil} variant="daily" rows={salBreakdown}
      />
      <MetaBreakdownDrawer
        open={metaDrawer === 'cof'} onClose={() => setMetaDrawer(null)}
        title="Meta COF × Realizado — por dia — por Closer" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={CLOSER_ACCENT} formatter={nfCeil} variant="daily" rows={cofBreakdown}
      />
      <MetaBreakdownDrawer
        open={metaDrawer === 'fechamentos'} onClose={() => setMetaDrawer(null)}
        title="Meta Fechamentos × Realizado — por mês — por Closer" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={CLOSER_ACCENT} formatter={nfCeil} variant="monthly" rows={fechamentosBreakdown}
      />
      <MetaBreakdownDrawer
        open={metaDrawer === 'receita'} onClose={() => setMetaDrawer(null)}
        title="Meta Receita × Realizado — por mês — por Closer" subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        accent={CLOSER_ACCENT} formatter={moneyK} variant="monthly" rows={receitaBreakdown}
      />
    </div>
  )
}
