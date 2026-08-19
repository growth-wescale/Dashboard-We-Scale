import { useMemo, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Download, TrendingDown, Trophy, Info, X, ChevronDown } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { StageDealsDrawer } from '@/components/ui/StageDealsDrawer'
import { SimpleDealsDrawer } from '@/components/ui/SimpleDealsDrawer'
import { RepeatedDealsDrawer } from '@/components/ui/RepeatedDealsDrawer'
import { TrapFunnel } from '@/components/ui/TrapFunnel'
import type { FunnelStage } from '@/components/ui/TrapFunnel'
import { useDashboardNotice } from '@/hooks/useDashboardNotice'
import { useMediaData } from '@/hooks/useMediaData'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useFunilAging } from '@/hooks/useFunilAging'
import { useMetaResumo } from '@/hooks/useMetasPerformance'
import { computeAging } from '@/lib/aging'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { normalizeFonteMacro, normalizeSubFonte } from '@/lib/fonteMapping'
import {
  STAGE_DATE_FIELD, STAGE_ORDER, STAGE_LABEL, buildScopeFilter, cohortKeys, countSales, countStage,
  countStageEvents, dealsInStage, groupRepeatedDeals, isSale, repeatedDealsInStage, resolveStage, rowsInLoss,
  rowsInStage, sumRevenue, toWindow,
} from '@/lib/metrics'
import type { RepeatedDealGroup, StageDeal, StageKey } from '@/lib/metrics'
import {
  mesesDoPeriodo, periodoAnterior, periodoEmCurso, rangeAnteriorComparavel, rangeAnteriorDia, rangeForPeriod,
} from '@/lib/periodo'
import type { PeriodMode } from '@/lib/periodo'
import { BRAND_LIST, BRAND_OVERVIEW } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import { nf, money, moneyK } from '@/lib/format'
import { shortMonth } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'

/** Subconjunto de etapas mostrado na Visão Macro — o funil completo (12
 *  etapas) fica na Performance Detalhada, pra não operacionalizar o snapshot
 *  executivo. Rótulo local: "Oportunidade" em vez do técnico "Oportunidade · COF". */
const MACRO_STAGES: StageKey[] = [
  'MQL', 'Contato Efetivo', 'Reunião Agendada SQL', 'Diagnóstico', 'SAL', 'Oportunidade COF', 'Fechamento',
]
const MACRO_STAGE_LABEL: Partial<Record<StageKey, string>> = {
  'Oportunidade COF': 'Oportunidade',
}

/** Plural pro rótulo "N ___ selecionados" no subtítulo com multi-seleção. */
const PERIOD_LABEL_PLURAL: Record<'mes' | 'trimestre' | 'ano', string> = {
  mes: 'meses', trimestre: 'trimestres', ano: 'anos',
}

/** Modo de leitura do funil. Local à aba — não é um dos toggles globais. */
type FunnelMode = 'performance' | 'aging' | 'atual'

/** Etapas do funil + No Show, pra popup de repetidos — No Show fica fora do
 *  funil em si (STAGE_ORDER), mas também tem passagem repetida no histórico. */
const REPEATABLE_STAGES: StageKey[] = [...STAGE_ORDER, 'No Show']

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

// ─── AgingList ─────────────────────────────────────────────────────────────────

interface EtapaLeadtimeRow {
  etapa: StageKey
  label: string
  deals: number
  /** Média de dias parados NESSA etapa. */
  mediaEtapa: number | null
  /** Média de dias em andamento no funil inteiro (desde o MQL). */
  mediaAndamento: number | null
}

/** Lista de etapas com 2 leadtimes — usada pelos modos Aging e Atual. */
function EtapaLeadtimeList({ linhas, accent }: { linhas: EtapaLeadtimeRow[]; accent: string }) {
  if (linhas.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', padding: '24px 0' }}>
      Nenhum negócio em aberto no recorte selecionado.
    </div>
  }
  const maxDeals = Math.max(...linhas.map(l => l.deals), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 84px', gap: 12, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ws-text-secondary)', fontWeight: 700 }}>
        <span>Etapa · negócios parados</span>
        <span style={{ textAlign: 'right' }}>Média na etapa</span>
        <span style={{ textAlign: 'right' }}>Média em andamento</span>
      </div>
      {linhas.map(l => (
        <div key={l.etapa} style={{ display: 'grid', gridTemplateColumns: '1fr 84px 84px', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
              <span style={{ color: 'var(--ws-text-primary)' }}>{l.label}</span>
              <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{nf(l.deals)}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'var(--ws-border)', overflow: 'hidden' }}>
              <div style={{ width: `${(l.deals / maxDeals) * 100}%`, height: '100%', background: accent, borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-primary)' }}>
            {fmtDias(l.mediaEtapa)}
          </span>
          <span style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-secondary)' }}>
            {fmtDias(l.mediaAndamento)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── DonutChart ────────────────────────────────────────────────────────────────

interface DonutSlice { label: string; count: number; pct: number; color: string }

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

function SCard({ children, style, pad = 20, onClick }: { children: ReactNode; style?: CSSProperties; pad?: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: pad,
        cursor: onClick ? 'pointer' : undefined, transition: onClick ? 'border-color .15s' : undefined,
        ...style,
      }}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-accent)' } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = '' } : undefined}
    >
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

/** Barra de progresso Realizado vs. Meta. `meta` 0 = sem meta cadastrada nesse recorte. */
function MetaProgresso({ label, realizado, meta, formatter, accent, porMarca }: {
  label: string; realizado: number; meta: number; formatter: (n: number) => string; accent: string
  /** Quebra por marca, pro dropdown — só faz sentido com 2+ marcas. */
  porMarca?: { label: string; realizado: number; meta: number }[]
}) {
  const [aberto, setAberto] = useState(false)
  const pctAting = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0
  const temQuebra = (porMarca?.length ?? 0) > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ws-text-primary)' }}>
          {label}
          {temQuebra && (
            <button
              type="button"
              onClick={() => setAberto(a => !a)}
              title="Ver meta por marca"
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'var(--ws-text-secondary)' }}
            >
              <ChevronDown size={12} style={{ transform: aberto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            </button>
          )}
        </span>
        <span style={{ fontWeight: 600, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {meta > 0 ? `${formatter(realizado)} / ${formatter(meta)}` : '—'}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--ws-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pctAting}%`, height: '100%', background: accent, borderRadius: 4 }} />
      </div>
      {aberto && temQuebra && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2, paddingTop: 8, borderTop: '1px solid var(--ws-border)' }}>
          {porMarca!.map(m => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>
              <span>{m.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {m.meta > 0 ? `${formatter(m.realizado)} / ${formatter(m.meta)}` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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

/** Segunda linha de comparação nos 4 KPIs principais, só quando o período
 *  está em curso: mostra "vs. mês anterior inteiro" ao lado do MTD, que já
 *  vai no delta principal do card. */
function DeltaSecundario({ delta, label }: { delta: number | null; label: string }) {
  if (delta == null) return null
  const up = delta >= 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontFamily: 'var(--font-body)' }}>
      <span style={{ fontSize: 10 }}>{up ? '▲' : '▼'}</span>
      <span style={{ color: up ? 'var(--status-positivo)' : 'var(--status-risco)', fontWeight: 600 }}>
        {Math.abs(delta).toFixed(1)}%
      </span>
      <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400 }}>{label}</span>
    </span>
  )
}

// ─── FunilVendas ──────────────────────────────────────────────────────────────

export function FunilVendas() {
  const { brandKeys, periodMode, periodValues, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()
  const [modo, setModo] = useState<FunnelMode>('performance')
  const [clickedStage, setClickedStage] = useState<StageKey | null>(null)
  const [clickedRepeatStage, setClickedRepeatStage] = useState<StageKey | null>(null)
  const [totalRepeatsOpen, setTotalRepeatsOpen] = useState(false)
  const [popupKpi, setPopupKpi] = useState<'receita' | 'fechamentos' | 'fonte' | null>(null)
  const [dismissedNoticeId, setDismissedNoticeId] = useState<number | null>(null)
  const { notice } = useDashboardNotice()

  const marcasSelecionadas = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is BrandDef => !!b),
    [brandKeys],
  )
  const todasSelecionadas = marcasSelecionadas.length === BRAND_LIST.length
  const { accent, dark } = marcasSelecionadas.length === 1 ? marcasSelecionadas[0] : BRAND_OVERVIEW
  const scopeLabel = todasSelecionadas
    ? 'Consolidado'
    : marcasSelecionadas.length === 1
      ? marcasSelecionadas[0].label
      : marcasSelecionadas.length <= 3
        ? marcasSelecionadas.map(b => b.label).join(', ')
        : `${marcasSelecionadas.length} marcas selecionadas`
  // Busca no servidor filtrada por marca só quando é exatamente 1 selecionada
  // — mais rápido. Com 2+ marcas, busca tudo e filtra no cliente via `scope`,
  // junto com fonte/sub-fonte (mesmo padrão dos outros filtros).
  const marcaFetch = marcasSelecionadas.length === 1 ? marcasSelecionadas[0].marca : undefined

  // 2+ períodos selecionados: comparação "vs. período anterior" não faz
  // sentido pra um conjunto não-contíguo, então some da tela inteira.
  const multiPeriodo = periodMode !== 'dia' && periodValues.length > 1
  // Âncora pro cálculo de comparação — só usada quando há exatamente 1 período.
  const periodValue = periodValues[0] ?? ''

  // Comparação sempre com o período anterior de mesma granularidade — mês vs
  // mês, trimestre vs trimestre, ano vs ano — e truncada aos mesmos dias
  // corridos quando o período atual está em curso. Ver `rangeAnteriorComparavel`.
  const prev = useMemo(
    () => periodMode === 'dia' ? rangeAnteriorDia(range) : rangeAnteriorComparavel(periodMode, periodValue),
    [periodMode, periodValue, range],
  )

  // Período em curso (ex.: agosto pela metade) tem uma segunda leitura: além
  // do MTD (mesmos dias corridos do mês anterior, em `prev`), o card mostra
  // também o total do mês anterior INTEIRO, pra quem quer ver o tamanho do
  // mês fechado de referência. Período fechado não precisa disso — MTD e
  // "inteiro" seriam o mesmo número. Nunca em multi-seleção.
  const { emCurso, prevFull } = useMemo(() => {
    if (periodMode === 'dia' || multiPeriodo) return { emCurso: false, prevFull: null }
    const emCurso = periodoEmCurso(periodMode, periodValue)
    const prevFull = emCurso ? rangeForPeriod(periodMode, periodoAnterior(periodMode, periodValue)) : null
    return { emCurso, prevFull }
  }, [periodMode, periodValue, multiPeriodo])

  // Meses cobertos pela seleção atual — base da meta (mensal por natureza).
  // Sempre busca todas as marcas; a soma/quebra pelas marcas selecionadas é
  // feita abaixo, junto com o realizado (mesmo subconjunto dos dois lados).
  const mesesMeta = useMemo(() => mesesDoPeriodo(periodMode, periodValues), [periodMode, periodValues])
  const { porMarca: metaPorMarca } = useMetaResumo({ mesesKeys: mesesMeta })

  // ── Dados ───────────────────────────────────────────────────────────────────
  const { data: rows, loading, error } = useFunilVendas(marcaFetch)
  const { data: curMedia } = useMediaData({ marca: marcaFetch, dataInicio: range.start, dataFim: range.end })
  const { data: prevMedia } = useMediaData({ marca: marcaFetch, dataInicio: prev.start, dataFim: prev.end })

  // Os DOIS modos de contagem leem o histórico de eventos. Antes, "Deals
  // únicos" vinha da tabela plana e "Passagens" dos eventos — bases diferentes,
  // e Passagens chegava a aparecer MENOR que Únicos, o que é impossível.
  const { data: eventos } = useFunilEventos({
    enabled: true,
    marca: marcaFetch,
    inicio: range.start,
    // No modo safra o evento pode ser posterior à janela do MQL.
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { periodos } = useFunilAging(modo === 'aging')

  // ── Escopo e janelas ────────────────────────────────────────────────────────
  // Marca entra no escopo mesmo quando `marcaFetch` já filtrou no servidor —
  // nesse caso é um no-op (as linhas já são só daquela marca); é essencial
  // quando 2+ marcas estão selecionadas e a busca trouxe tudo.
  const marcasParaEscopo: string[] = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is Marca => !!m),
    [marcasSelecionadas],
  )
  const scope = useMemo(
    () => buildScopeFilter({ marcas: marcasParaEscopo, fontes, subFontes }),
    [marcasParaEscopo, fontes, subFontes],
  )
  // Mesmo escopo, mas sem restrição de marca — base pra quebrar KPIs por marca
  // no dropdown do card de Meta (funciona com o quanto de dado já veio: se
  // `marcaFetch` filtrou 1 marca no servidor, só tem aquela marca mesmo).
  const scopeSemMarca = useMemo(() => buildScopeFilter({ fontes, subFontes }), [fontes, subFontes])

  // `ranges` é a união exata dos períodos selecionados (1 ou vários) — nunca
  // usar `range` (caixa delimitadora) aqui, senão multi-seleção não-contígua
  // (ex.: Jun + Ago) incluiria Julho por engano.
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )
  const winPrev = useMemo(() => toWindow(null, { from: prev.start, to: prev.end }), [prev.start, prev.end])
  const winPrevFull = useMemo(
    () => prevFull && toWindow(null, { from: prevFull.start, to: prevFull.end }),
    [prevFull],
  )

  // Mídia é buscada num intervalo único (min–max da seleção) mas somada só
  // pras linhas cujo dia cai de fato em algum dos períodos selecionados, e só
  // das marcas selecionadas (quando a busca trouxe mais de uma) — mesma união
  // exata usada pra filtrar deals.
  const emEscopo = useMemo(() => (r: { dia: string; marca: string | null }) =>
    ranges.some(rg => r.dia >= rg.start && r.dia <= rg.end) && marcasParaEscopo.includes(r.marca ?? ''),
  [ranges, marcasParaEscopo])
  const invest = useMemo(
    () => curMedia.reduce((s, r) => s + (emEscopo(r) ? r.spend_brl : 0), 0),
    [curMedia, emEscopo],
  )
  const prevInvest = useMemo(
    () => prevMedia.reduce((s, r) => s + (marcasParaEscopo.includes(r.marca ?? '') ? r.spend_brl : 0), 0),
    [prevMedia, marcasParaEscopo],
  )

  /** Deals do escopo — marca, fonte e sub-fonte, seja o filtro do servidor ou do cliente. */
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  /** Mesmo recorte, sem restrição de marca — usado só pra quebra por marca. */
  const scopedSemMarca = useMemo(() => rows.filter(scopeSemMarca), [rows, scopeSemMarca])

  // Opções dos filtros de origem saem dos próprios dados, nunca de lista fixa:
  // valor novo no CRM (como "Prospecção Ativa") precisa aparecer sozinho.
  // Derivadas de `rows`, não de `scoped`, senão filtrar esconde as demais opções.
  const fontesDisponiveis = useMemo(
    () => [...new Set(rows.map(r => normalizeFonteMacro(r.fonte_macro)))],
    [rows],
  )
  const subFontesDisponiveis = useMemo(
    () => [...new Set(rows.map(r => normalizeSubFonte(r.utm_source) as string))],
    [rows],
  )

  // ── Funil ───────────────────────────────────────────────────────────────────
  // Só usado no modo Performance — Aging e Atual usam EtapaLeadtimeList (abaixo).
  const funnel = useMemo<FunnelStage[]>(() => {
    if (modo !== 'performance') return []
    const safra = viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null
    const idsEscopo = new Set(scoped.map(r => String(r.id_lead)))

    return MACRO_STAGES.map(s => ({
      key: s,
      label: MACRO_STAGE_LABEL[s] ?? STAGE_LABEL[s],
      // Fechamento não é etapa no histórico — venda é um tipo de evento à parte.
      // Procurar por etapa "Fechamento" nos eventos devolvia sempre zero, e a
      // venda sumia da tela ao ligar Passagens. Sempre pela trava de venda.
      value: s === 'Fechamento'
        ? countSales(scoped, win, viewModes)
        : countStageEvents(eventos, s, win, viewModes, {
            cohortIds: safra,
            extra: e => idsEscopo.has(String(e.id_deal)),
          }),
    }))
  }, [modo, scoped, eventos, win, viewModes])

  // MQL de cada deal vivo — alimenta "média em andamento" nos modos Aging e Atual.
  const mqlPorDealVivo = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of scoped) {
      if (r.eh_ciclo_atual && r.status_atual === 'Em andamento' && r.data_novo_mql) {
        map.set(String(r.id_lead), r.data_novo_mql)
      }
    }
    return map
  }, [scoped])

  // Etapas na mesma sequência do funil Performance — só as que têm negócio parado.
  function ordenarPorMacroStages(porStageKey: Map<StageKey, { deals: number; mediaEtapa: number | null; mediaAndamento: number | null }>): EtapaLeadtimeRow[] {
    return MACRO_STAGES
      .map(s => {
        const a = porStageKey.get(s)
        if (!a || a.deals === 0) return null
        return { etapa: s, label: MACRO_STAGE_LABEL[s] ?? STAGE_LABEL[s], ...a }
      })
      .filter((x): x is EtapaLeadtimeRow => x !== null)
  }

  const aging = useMemo(() => {
    if (modo !== 'aging') return []
    const vivos = new Set(mqlPorDealVivo.keys())
    const porEtapaRaw = computeAging(periodos, vivos, mqlPorDealVivo)
    const porStageKey = new Map(
      porEtapaRaw
        .map(a => [resolveStage(a.etapa), a] as const)
        .filter((x): x is [StageKey, typeof porEtapaRaw[number]] => x[0] !== null),
    )
    return ordenarPorMacroStages(porStageKey)
  }, [modo, periodos, mqlPorDealVivo])

  // Atual: mesma lista/leadtimes do Aging, mas a partir da etapa corrente de
  // cada deal vivo (ignora período de propósito) — sem depender da tabela de
  // períodos de aging, que só carrega tempo parado numa etapa específica.
  const atualLeadtime = useMemo(() => {
    if (modo !== 'atual') return []
    const agora = Date.now()
    const DIA_MS = 86_400_000
    const porStageKey = new Map<StageKey, { deals: number; etapaDias: number[]; andamentoDias: number[] }>()

    for (const r of scoped) {
      if (!r.eh_ciclo_atual || r.status_atual !== 'Em andamento') continue
      const etapa = resolveStage(r.etapa_funil)
      if (!etapa) continue

      const bucket = porStageKey.get(etapa) ?? { deals: 0, etapaDias: [], andamentoDias: [] }
      bucket.deals += 1

      const dataEtapa = r[STAGE_DATE_FIELD[etapa]]
      if (dataEtapa) {
        const dias = (agora - new Date(dataEtapa).getTime()) / DIA_MS
        if (!Number.isNaN(dias) && dias >= 0) bucket.etapaDias.push(dias)
      }
      if (r.data_novo_mql) {
        const dias = (agora - new Date(r.data_novo_mql).getTime()) / DIA_MS
        if (!Number.isNaN(dias) && dias >= 0) bucket.andamentoDias.push(dias)
      }
      porStageKey.set(etapa, bucket)
    }

    const media = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
    const resumido = new Map(
      [...porStageKey.entries()].map(([s, b]) => [s, { deals: b.deals, mediaEtapa: media(b.etapaDias), mediaAndamento: media(b.andamentoDias) }]),
    )
    return ordenarPorMacroStages(resumido)
  }, [modo, scoped])

  // Deals por trás da etapa clicada no funil — mesma regra usada pra contar,
  // pra nunca mostrar uma lista diferente do número que a pessoa clicou.
  const dealsDoClique = useMemo(() => {
    if (!clickedStage) return []
    return dealsInStage(scoped, eventos, clickedStage, win, viewModes, modo === 'atual' ? 'atual' : 'performance')
  }, [clickedStage, scoped, eventos, win, viewModes, modo])

  // Deals ganhos no recorte — base dos pop-ups leves de Receita/Fechamentos/Vendas por fonte.
  const ganhosNoPeriodo = useMemo(
    () => rowsInStage(scoped, 'Fechamento', win, viewModes),
    [scoped, win, viewModes],
  )
  const ganhosPorValor = useMemo(
    () => [...ganhosNoPeriodo].sort((a, b) => (b.valor_contrato ?? 0) - (a.valor_contrato ?? 0)),
    [ganhosNoPeriodo],
  )
  const ganhosPorData = useMemo(
    () => [...ganhosNoPeriodo].sort((a, b) => (b.data_venda ?? '').localeCompare(a.data_venda ?? '')),
    [ganhosNoPeriodo],
  )
  const ganhosPorFonte = useMemo(
    () => [...ganhosNoPeriodo].sort((a, b) =>
      normalizeFonteMacro(a.fonte_macro).localeCompare(normalizeFonteMacro(b.fonte_macro), 'pt-BR')
      || (b.valor_contrato ?? 0) - (a.valor_contrato ?? 0)),
    [ganhosNoPeriodo],
  )

  // Repetidos por etapa — só existe em modo Passagens + Performance (Atual lê
  // a etapa corrente do deal, Aging é outra métrica; nenhum dos dois é passagem).
  const repeatedByStage = useMemo(() => {
    const map = new Map<StageKey, StageDeal[]>()
    if (viewModes.eventSource !== 'passages' || modo !== 'performance') return map
    for (const s of REPEATABLE_STAGES) map.set(s, repeatedDealsInStage(scoped, eventos, s, win, viewModes))
    return map
  }, [viewModes, modo, scoped, eventos, win])

  const repeatedCounts = useMemo(
    () => new Map(STAGE_ORDER.map(s => [s, repeatedByStage.get(s)?.length ?? 0])),
    [repeatedByStage],
  )
  const totalRepeated = useMemo(
    () => [...repeatedCounts.values()].reduce((s, n) => s + n, 0),
    [repeatedCounts],
  )
  const totalPassagens = useMemo(
    () => funnel.filter(s => s.key !== 'Fechamento').reduce((s, f) => s + f.value, 0),
    [funnel],
  )
  const noShowRepeated = repeatedByStage.get('No Show')?.length ?? 0

  // Agrupado por deal — cada grupo carrega `vezes`, pra quem vê o popup saber
  // quantas repetições cada deal teve sem contar linha.
  const repeatedGroupsByStage = useMemo(
    () => new Map(REPEATABLE_STAGES.map(s => [s, groupRepeatedDeals(repeatedByStage.get(s) ?? [], s)])),
    [repeatedByStage],
  )
  const repeatedGroupsDoClique = useMemo<RepeatedDealGroup[]>(
    () => (clickedRepeatStage ? (repeatedGroupsByStage.get(clickedRepeatStage) ?? []) : []),
    [clickedRepeatStage, repeatedGroupsByStage],
  )
  const allRepeatedGroups = useMemo<RepeatedDealGroup[]>(
    () => STAGE_ORDER.flatMap(s => repeatedGroupsByStage.get(s) ?? []),
    [repeatedGroupsByStage],
  )

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

    // Segunda leitura só quando o período está em curso: MTD (`prev`, acima)
    // já compara dias corridos como dias corridos; isso aqui é o contraponto
    // "quão grande foi o mês anterior inteiro", pedido explicitamente pra não
    // esconder que o MTD é parcial.
    let deltasFull: { receita: number | null; fechamentos: number | null; ticket: number | null; convGlobal: number } | undefined
    if (winPrevFull) {
      const prevFullFechamentos = countSales(scoped, winPrevFull, viewModes)
      const prevFullReceita = sumRevenue(scoped, winPrevFull, viewModes)
      const prevFullMql = countStage(scoped, 'MQL', winPrevFull, viewModes)
      const prevFullTicket = prevFullFechamentos > 0 ? prevFullReceita / prevFullFechamentos : 0
      const prevFullConvGlobal = prevFullMql > 0 ? (prevFullFechamentos / prevFullMql) * 100 : 0
      deltasFull = {
        receita: pctDelta(receita, prevFullReceita),
        fechamentos: pctDelta(fechamentos, prevFullFechamentos),
        ticket: pctDelta(ticket, prevFullTicket),
        convGlobal: convGlobal - prevFullConvGlobal,
      }
    }

    const noShow = countStage(scoped, 'No Show', win, viewModes)

    // Origem das vendas — por fonte_macro, a classificação de negócio do CRM.
    const ganhos = scoped.filter(r => isSale(r) && countStage([r], 'Fechamento', win, viewModes) > 0)
    const cont: Record<string, number> = {}
    for (const r of ganhos) {
      const k = normalizeFonteMacro(r.fonte_macro)
      cont[k] = (cont[k] ?? 0) + 1
    }
    const CORES: Record<string, string> = {
      'Inbound': accent,
      'Resgate': 'var(--ws-vinho-b)',
      'Sem Classificação': 'var(--ws-border-strong)',
    }
    const total = Math.max(ganhos.length, 1)
    const sources: DonutSlice[] = Object.entries(cont)
      .map(([label, n]) => ({ label, count: n, pct: (n / total) * 100, color: CORES[label] ?? 'var(--status-atencao)' }))
      .sort((a, b) => b.pct - a.pct)
    if (sources.length === 0) sources.push({ label: 'Sem dados', count: 0, pct: 100, color: 'var(--ws-border)' })

    // Tempo de ciclo — sempre a partir da entrada como MQL. Respeita o mesmo
    // toggle "Deals criados no período" (stageDate/cohort) do resto da página.
    const ms = (a: string, b: string) => Math.max(0, new Date(b).getTime() - new Date(a).getTime())
    const media = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0

    // Reciclagem às vezes não gera novo evento de MQL no ciclo atual. Nesse
    // caso usa a data de MQL mais antiga que esse lead já teve, em outro ciclo.
    const primeiroMql = new Map<string, string>()
    for (const r of scoped) {
      if (!r.data_novo_mql) continue
      const atual = primeiroMql.get(r.id_lead)
      if (!atual || r.data_novo_mql < atual) primeiroMql.set(r.id_lead, r.data_novo_mql)
    }
    const mqlEfetivo = (r: (typeof scoped)[number]) => r.data_novo_mql ?? primeiroMql.get(r.id_lead) ?? null

    const perdidos = rowsInLoss(scoped, win, viewModes).filter(r => mqlEfetivo(r))
    const ganhosLt = rowsInStage(scoped, 'Fechamento', win, viewModes).filter(r => mqlEfetivo(r))

    const leadtimes = {
      perda: { value: fmtMs(media(perdidos.map(r => ms(mqlEfetivo(r)!, r.data_perdido!)))) },
      fechamento: { value: fmtMs(media(ganhosLt.map(r => ms(mqlEfetivo(r)!, r.data_venda!)))) },
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
        deltasFull,
      },
      noShow, sources, leadtimes,
    }
  }, [scoped, win, winPrev, winPrevFull, viewModes, invest, prevInvest, accent])

  // ── Meta e realizado por marca ──────────────────────────────────────────────
  // Base pro dropdown "ver por marca" do card de Meta: soma receita/fechamentos
  // por marca a partir do recorte SEM restrição de marca (`scopedSemMarca`),
  // pra que o dropdown reflita exatamente as marcas selecionadas no filtro.
  const realizadoPorMarca = useMemo(() => {
    const map = new Map<string, { receita: number; fechamentos: number }>()
    for (const b of marcasSelecionadas) {
      if (!b.marca) continue
      const rowsDaMarca = scopedSemMarca.filter(r => r.marca === b.marca)
      map.set(b.marca, {
        receita: sumRevenue(rowsDaMarca, win, viewModes),
        fechamentos: countSales(rowsDaMarca, win, viewModes),
      })
    }
    return map
  }, [marcasSelecionadas, scopedSemMarca, win, viewModes])

  const metaSelecionada = useMemo(() => {
    let metaFinanceira = 0, metaQtdVendas = 0
    for (const b of marcasSelecionadas) {
      const m = b.marca ? metaPorMarca.get(b.marca) : undefined
      metaFinanceira += m?.metaFinanceira ?? 0
      metaQtdVendas += m?.metaQtdVendas ?? 0
    }
    return { metaFinanceira, metaQtdVendas }
  }, [marcasSelecionadas, metaPorMarca])

  // Só faz sentido detalhar por marca quando há 2+ marcas em jogo.
  const quebraPorMarca = marcasSelecionadas.length > 1
  const metaReceitaPorMarca = useMemo(() => marcasSelecionadas.map(b => ({
    label: b.label,
    realizado: (b.marca && realizadoPorMarca.get(b.marca)?.receita) ?? 0,
    meta: (b.marca && metaPorMarca.get(b.marca)?.metaFinanceira) ?? 0,
  })), [marcasSelecionadas, realizadoPorMarca, metaPorMarca])
  const metaFechamentosPorMarca = useMemo(() => marcasSelecionadas.map(b => ({
    label: b.label,
    realizado: (b.marca && realizadoPorMarca.get(b.marca)?.fechamentos) ?? 0,
    meta: (b.marca && metaPorMarca.get(b.marca)?.metaQtdVendas) ?? 0,
  })), [marcasSelecionadas, realizadoPorMarca, metaPorMarca])

  const heroStyle: CSSProperties = {
    '--fs-metric': '26px',
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 15%, white), white 68%)`,
    borderColor: `color-mix(in srgb, ${accent} 34%, var(--ws-border))`,
  } as CSSProperties
  const metricStyle: CSSProperties = { '--fs-metric': '26px' } as CSSProperties

  // Período em curso: o rótulo principal deixa explícito que a comparação é
  // "até o mesmo dia" (MTD/QTD/YTD), pra não parecer que é contra o mês
  // anterior inteiro — é exatamente essa confusão que gerou a dúvida original.
  const SUFIXO_EM_CURSO = { mes: 'MTD', trimestre: 'QTD', ano: 'YTD' } as const
  const prevLabel = `vs. ${shortMonth(prev.start)}`
    + (emCurso && periodMode !== 'dia' ? ` (${SUFIXO_EM_CURSO[periodMode]})` : '')
  const prevFullLabel = prevFull ? `${shortMonth(prevFull.start)} inteiro` : ''
  // Comparação não faz sentido com 2+ períodos selecionados — some da tela.
  const delta = (v: number | null) => multiPeriodo ? undefined : v ?? undefined
  const deltasFull = multiPeriodo ? undefined : kpis.deltasFull

  const unidadeSufixo = viewModes.salesMode === 'units' ? ' (unidades)' : ''
  const subtitlePeriodo = multiPeriodo
    ? `${periodValues.length} ${PERIOD_LABEL_PLURAL[periodMode as Exclude<PeriodMode, 'dia'>]} selecionados`
    : `${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`

  return (
    <div style={{ padding: '32px 32px 48px', background: 'var(--ws-bg)', minHeight: '100vh' }}
      {...(marcasSelecionadas.length === 1 ? { 'data-brand': marcasSelecionadas[0].key } : {})}>

      <PageTop
        title="Visão Macro"
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        actions={
          <button
            onClick={() => downloadCsv(scoped as unknown as Record<string, unknown>[], `visao-macro-${marcasSelecionadas.map(b => b.key).join('-') || 'todas'}-${range.start}-${range.end}`)}
            disabled={!scoped.length}
            title={!scoped.length ? 'Sem dados no período' : 'Exportar deals do recorte em CSV'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', background: 'var(--ws-surface)', fontSize: 13, color: 'var(--ws-text-primary)', cursor: scoped.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', opacity: scoped.length ? 1 : 0.5 }}
          >
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar fontesDisponiveis={fontesDisponiveis} subFontesDisponiveis={subFontesDisponiveis} />

      <QueryErrorBanner errors={[error]} scope="Visão Macro" />

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
        <MetricCard style={heroStyle} label="Receita no período" value={moneyK(kpis.receita)} delta={delta(kpis.deltas.receita)} deltaLabel={prevLabel} accent={false}
          onClick={() => setPopupKpi('receita')}
          description={deltasFull && <DeltaSecundario delta={deltasFull.receita} label={`vs. ${prevFullLabel}`} />} />
        <MetricCard style={metricStyle} label={`Fechamentos${unidadeSufixo}`} value={nf(kpis.fechamentos)} delta={delta(kpis.deltas.fechamentos)} deltaLabel={prevLabel} accent={false}
          onClick={() => setPopupKpi('fechamentos')}
          description={deltasFull && <DeltaSecundario delta={deltasFull.fechamentos} label={`vs. ${prevFullLabel}`} />} />
        <MetricCard style={metricStyle} label="Ticket médio" value={moneyK(kpis.ticket)} delta={delta(kpis.deltas.ticket)} deltaLabel={prevLabel} accent={false}
          description={deltasFull && <DeltaSecundario delta={deltasFull.ticket} label={`vs. ${prevFullLabel}`} />} />
        <MetricCard style={metricStyle} label="Conversão MQL→Ganho" value={kpis.convGlobal.toFixed(1)} unit="%" delta={delta(kpis.deltas.convGlobal)} deltaLabel={prevLabel} accent={false}
          description={deltasFull && <DeltaSecundario delta={deltasFull.convGlobal} label={`vs. ${prevFullLabel}`} />} />
        <MetricCard style={metricStyle} label="CAC (custo/ganho)" value={kpis.cac > 0 ? money(kpis.cac) : '—'} delta={delta(kpis.deltas.cac)} deltaLabel={prevLabel} invertDelta accent={false} />
        <MetricCard style={metricStyle} label="ROAS de mídia" value={kpis.roas > 0 ? kpis.roas.toFixed(1) + 'x' : '—'} delta={delta(kpis.deltas.roas)} deltaLabel={prevLabel} accent={false} />
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
              {totalRepeated > 0 && (
                <button type="button" onClick={() => setTotalRepeatsOpen(true)} title="Ver todos os repetidos" style={{
                  border: 'none', padding: 0, cursor: 'pointer', background: 'none', borderRadius: 'var(--radius-pill)',
                }}>
                  <Badge tone="atencao">
                    Repetidos · {nf(totalRepeated)}
                    {totalPassagens > 0 && ` (${((totalRepeated / totalPassagens) * 100).toFixed(1)}%)`}
                  </Badge>
                </button>
              )}
            </div>
          </div>
          <div style={{ padding: '14px 24px 24px', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            {modo === 'aging'
              ? <EtapaLeadtimeList linhas={aging} accent={accent} />
              : modo === 'atual'
                ? <EtapaLeadtimeList linhas={atualLeadtime} accent={accent} />
                : <TrapFunnel stages={funnel} invest={invest} accent={accent} dark={dark}
                    onStageClick={key => setClickedStage(key as StageKey)}
                    repeatedCounts={repeatedCounts} onRepeatClick={key => setClickedRepeatStage(key as StageKey)}
                    noShow={noShow} noShowRepeated={noShowRepeated} />}
          </div>
        </SCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SCard onClick={() => setPopupKpi('fonte')}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Vendas por fonte</div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 14 }}>Origem das oportunidades ganhas · fonte macro do CRM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <DonutChart slices={sources} size={130} />
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {sources.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--ws-text-primary)' }}>{s.label}</span>
                    <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {nf(s.count)}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SCard>

          {mesesMeta.length > 0 && (
            <SCard style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, marginBottom: 4 }}>Meta do período</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Receita e fechamentos vs. meta cadastrada · {scopeLabel}</div>
              </div>
              <MetaProgresso label="Receita" realizado={kpis.receita} meta={metaSelecionada.metaFinanceira} formatter={moneyK} accent={accent} porMarca={quebraPorMarca ? metaReceitaPorMarca : undefined} />
              <MetaProgresso label="Fechamentos" realizado={kpis.fechamentos} meta={metaSelecionada.metaQtdVendas} formatter={nf} accent={accent} porMarca={quebraPorMarca ? metaFechamentosPorMarca : undefined} />
            </SCard>
          )}
        </div>
      </div>

      <SectionHead title="Tempo de ciclo" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <LeadtimeCard label="Leadtime médio até a perda" value={leadtimes.perda.value}
          sub="Média das negociações perdidas no período" tone="risco" icon={<TrendingDown size={17} />} />
        <LeadtimeCard label="Leadtime médio de fechamento" value={leadtimes.fechamento.value}
          sub="Da entrada do MQL até o ganho, no período" tone="positivo" icon={<Trophy size={17} />} />
      </div>

      <StageDealsDrawer
        open={clickedStage !== null}
        onClose={() => setClickedStage(null)}
        stage={clickedStage}
        stageLabel={clickedStage ? (MACRO_STAGE_LABEL[clickedStage] ?? STAGE_LABEL[clickedStage]) : ''}
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        deals={dealsDoClique}
        accent={accent}
      />

      <RepeatedDealsDrawer
        open={clickedRepeatStage !== null}
        onClose={() => setClickedRepeatStage(null)}
        title={clickedRepeatStage ? `Repetidos · ${STAGE_LABEL[clickedRepeatStage]}` : ''}
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        groups={repeatedGroupsDoClique}
        accent={accent}
      />

      <RepeatedDealsDrawer
        open={totalRepeatsOpen}
        onClose={() => setTotalRepeatsOpen(false)}
        title="Repetidos · todas as etapas"
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        groups={allRepeatedGroups}
        accent={accent}
        multiStage
      />

      <SimpleDealsDrawer
        open={popupKpi === 'receita'}
        onClose={() => setPopupKpi(null)}
        title="Receita no período"
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        deals={ganhosPorValor}
        accent={accent}
      />
      <SimpleDealsDrawer
        open={popupKpi === 'fechamentos'}
        onClose={() => setPopupKpi(null)}
        title={`Fechamentos${unidadeSufixo}`}
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        deals={ganhosPorData}
        accent={accent}
      />
      <SimpleDealsDrawer
        open={popupKpi === 'fonte'}
        onClose={() => setPopupKpi(null)}
        title="Vendas por fonte"
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        deals={ganhosPorFonte}
        accent={accent}
        destacarFonte
      />
    </div>
  )
}
