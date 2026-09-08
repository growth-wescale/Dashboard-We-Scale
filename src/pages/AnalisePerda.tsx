import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FiltrosObrigatoriosAviso } from '@/components/ui/FiltrosObrigatoriosAviso'
import { PerdaDealsDrawer } from '@/components/ui/PerdaDealsDrawer'
import { SCard, KTile } from '@/components/ui/v2'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { buildScopeFilter, toWindow, mqlWord, stageLabel } from '@/lib/metrics'
import type { OrigemComercial, StageKey } from '@/lib/metrics'
import { funilFilterOptions } from '@/lib/funilFilterOptions'
import {
  perdidos, computeKpis, computeMotivos, computeEvitavel, computeEtapas,
  computeCruzamentos, computeResponsaveis, computeMarcas, dealsReceitaPerdida,
} from '@/lib/perdaRows'
import type { EtapaMeta, CruzCel } from '@/lib/perdaRows'
import { BRAND_LIST, BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodMode } from '@/contexts/SharedFiltersContext'
import { nf, pct, money } from '@/lib/format'
import { shortMonth, fmtBR } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'

// ─── Colors ──────────────────────────────────────────────────────────────

const DARK_ACCENT = '#3D0F3D'  // roxo escuro (header)
const TEAL        = '#2ABCB5'
const RED         = '#E4585B'
const AMBER       = '#F3B34B'

// Mesmo mapa que FunilVendas.tsx usa pro subtítulo de período (não é
// exportado de lá — cada página de Vendas mantém a própria cópia local).
const PERIOD_LABEL_PLURAL: Record<'mes' | 'trimestre' | 'ano', string> = {
  mes: 'meses', trimestre: 'trimestres', ano: 'anos',
}

// ─── UI blocks ────────────────────────────────────────────────────────────

function DarkKpi({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub?: string; tone?: 'amber' | 'muted'; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{ padding: '20px 26px', flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : undefined }}
    >
      <div style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#E9C5E3' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 40, color: '#fff', marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: tone === 'amber' ? '#F3C979' : '#D0AEC9' }}>{sub}</div>
      )}
    </div>
  )
}

function BarRow({ label, subLabel, value, max, color, right, onClick }: {
  label: string; subLabel?: string; value: number; max: number; color: string; right?: React.ReactNode; onClick?: () => void
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, alignItems: 'center', padding: '10px 0',
        borderBottom: '1px solid var(--ws-border)', cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{label}</span>
          {subLabel && <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 6px', border: '1px solid var(--ws-border)', borderRadius: 4 }}>{subLabel}</span>}
        </div>
        <div style={{ marginTop: 6, height: 6, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ws-text-primary)', fontWeight: 600 }}>
        {right ?? nf(value)}
      </div>
    </div>
  )
}

function Heatmap({ motivos, etapas, celulas, onCellClick, origem }: {
  motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[]
  onCellClick?: (motivo: string, etapa: StageKey) => void
  origem: OrigemComercial
}) {
  const maxQ = Math.max(1, ...celulas.map(c => c.qtd))
  const val = (m: string, e: StageKey) => celulas.find(c => c.motivo === m && c.etapa === e)?.qtd ?? 0

  function shade(v: number): string {
    if (v === 0) return 'transparent'
    const t = Math.max(0.15, v / maxQ)
    return `rgba(93, 24, 91, ${t.toFixed(3)})`
  }
  function color(v: number): string { return v / maxQ > 0.45 ? '#fff' : 'var(--ws-text-primary)' }

  const gridCols = `minmax(180px, 1fr) repeat(${etapas.length}, minmax(70px, 1fr))`

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, minWidth: 480 }}>
        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', letterSpacing: '.05em', textTransform: 'uppercase' }}>MOTIVO</div>
        {etapas.map(e => (
          <div key={e.etapa} style={{ fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center', letterSpacing: '.03em' }}>{stageLabel(e.etapa, origem)}</div>
        ))}
        {motivos.map(m => (
          <>
            <div key={m} style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{m}</div>
            {etapas.map(e => {
              const v = val(m, e.etapa)
              const clickavel = !!onCellClick && v > 0
              return (
                <div key={`${m}-${e.etapa}`}
                  onClick={clickavel ? () => onCellClick!(m, e.etapa) : undefined}
                  style={{
                    background: shade(v), color: color(v),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: v === 0 ? 400 : 600, fontVariantNumeric: 'tabular-nums',
                    padding: '10px 6px', borderRadius: 6, border: v === 0 ? '1px solid var(--ws-border)' : 'none',
                    minHeight: 32, cursor: clickavel ? 'pointer' : undefined,
                  }}>{v === 0 ? '·' : v}</div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────

interface DrawerState { title: string; subtitle: string; deals: FunnelRow[] }

export function AnalisePerda() {
  const {
    origem, brandKeys, periodMode, periodValues, ranges, range,
    fontes, subFontes, sdrs, closers, viewModes,
  } = useSharedFilters()

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
  const marcasParaEscopo = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is Marca => !!m),
    [marcasSelecionadas],
  )

  // Sempre carrega o recorte inteiro da origem — marca filtrada no cliente
  // (via `scope`), igual Fonte/SDR. Ver comentário em FunilVendas.
  const { data: rows, error: rowsError } = useFunilVendas(origem)

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes, sdrs, closers }),
    [origem, marcasParaEscopo, fontes, subFontes, sdrs, closers],
  )
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )

  const opcoes = useMemo(
    () => funilFilterOptions({
      rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers,
      cohort: viewModes.funnelView === 'cohort',
    }),
    [rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, viewModes.funnelView],
  )
  const marcasDisponiveis = useMemo(
    () => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key),
    [opcoes.marcas],
  )

  const multiPeriodo = periodMode !== 'dia' && periodValues.length > 1
  const subtitlePeriodo = multiPeriodo
    ? `${periodValues.length} ${PERIOD_LABEL_PLURAL[periodMode as Exclude<PeriodMode, 'dia'>]} selecionados`
    : `${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`
  const drawerSubtitle = `${scopeLabel} · ${subtitlePeriodo}`

  const perdas = useMemo(() => perdidos(scoped, win, viewModes), [scoped, win, viewModes])
  const kpis = useMemo(() => computeKpis(scoped, win, viewModes), [scoped, win, viewModes])
  const receitaPerdidaDeals = useMemo(() => dealsReceitaPerdida(perdas), [perdas])
  const motivos = useMemo(() => computeMotivos(perdas), [perdas])
  const evitavel = useMemo(() => computeEvitavel(perdas), [perdas])
  const etapas = useMemo(() => computeEtapas(perdas), [perdas])
  const cruz = useMemo(() => computeCruzamentos(perdas), [perdas])
  const resps = useMemo(() => computeResponsaveis(perdas), [perdas])
  const marcas = useMemo(() => computeMarcas(perdas, scoped, win, viewModes), [perdas, scoped, win, viewModes])

  const [motivoTab, setMotivoTab] = useState<'todos' | 'processo' | 'mercado'>('todos')
  const [respTab, setRespTab] = useState<'todos' | 'SDR' | 'Closer'>('todos')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const motivosFiltrados = motivoTab === 'todos' ? motivos : motivos.filter(m => m.categoria === motivoTab)
  const respFiltrados = respTab === 'todos' ? resps : resps.filter(r => r.camada === respTab)

  // Filtro obrigatório sem nada marcado → esconde os dados e pede a seleção.
  const faltandoObrigatorio = [
    brandKeys.length === 0 ? 'uma marca' : null,
    periodMode !== 'dia' && periodValues.length === 0 ? 'um período' : null,
  ].filter((x): x is string => x !== null)

  if (faltandoObrigatorio.length > 0) {
    return (
      <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
        <PageTop title="Análise de Perda" titleAside={<OrigemToggle />} subtitle="Selecione os filtros obrigatórios" />
        <FilterBar
          marcasDisponiveis={marcasDisponiveis}
          fontesDisponiveis={opcoes.fontes}
          subFontesDisponiveis={opcoes.subFontes}
          sdrsDisponiveis={opcoes.sdrs}
          closersDisponiveis={opcoes.closers}
          hideVendasToggle
          hideContagemToggle
        />
        <QueryErrorBanner errors={[rowsError]} scope="Análise de Perda" />
        <FiltrosObrigatoriosAviso faltando={faltandoObrigatorio} />
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <PageTop
        title="Análise de Perda"
        titleAside={<OrigemToggle />}
        subtitle={drawerSubtitle}
        actions={
          <button
            onClick={() => downloadCsv(perdas, `analise-perda-${scopeLabel}-${range.start}-${range.end}`)}
            disabled={!perdas.length}
            title={!perdas.length ? 'Sem dados no período' : 'Exportar perdas em CSV'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
              color: 'var(--ws-text-primary)', fontSize: 13, cursor: perdas.length ? 'pointer' : 'not-allowed',
              boxShadow: 'var(--shadow-sm)', opacity: perdas.length ? 1 : 0.5,
            }}>
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar
        marcasDisponiveis={marcasDisponiveis}
        fontesDisponiveis={opcoes.fontes}
        subFontesDisponiveis={opcoes.subFontes}
        sdrsDisponiveis={opcoes.sdrs}
        closersDisponiveis={opcoes.closers}
        hideVendasToggle
        hideContagemToggle
      />

      <QueryErrorBanner errors={[rowsError]} scope="Análise de Perda" />

      {/* Card dark 3 KPIs ── */}
      <div style={{
        display: 'flex', background: DARK_ACCENT, borderRadius: 18,
        boxShadow: 'var(--shadow-md)', color: '#fff', overflow: 'hidden', flexWrap: 'wrap',
      }}>
        <DarkKpi
          label="Negociações Perdidas"
          value={nf(kpis.perdidasDeals)}
          sub={`Taxa de perda de ${pct(kpis.taxaPerda)} sobre os ${mqlWord(origem, true)} do período`}
          onClick={() => setDrawer({ title: 'Negociações Perdidas', subtitle: drawerSubtitle, deals: perdas })}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
        <DarkKpi
          label="Perda Evitável"
          value={evitavel.qtdProcesso + evitavel.qtdMercado > 0 ? pct(evitavel.pctEvitavel, 0) : '—'}
          sub={`${nf(evitavel.qtdProcesso)} por falha de processo · ${nf(evitavel.qtdMercado)} por fit ou momento`}
          tone="amber"
          onClick={() => setDrawer({ title: 'Perda Evitável', subtitle: drawerSubtitle, deals: perdas })}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
        <DarkKpi
          label="Receita Perdida"
          value={receitaPerdidaDeals.length > 0 ? money(kpis.receitaPerdida) : '—'}
          sub="Só deals que chegaram em Oportunidade ou depois"
          onClick={() => setDrawer({ title: 'Receita Perdida', subtitle: drawerSubtitle, deals: receitaPerdidaDeals })}
        />
      </div>

      {/* 4 KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        <KTile label="Taxa de perda"            value={pct(kpis.taxaPerda)} />
        <KTile label="Em aberto (pipeline)"     value={nf(kpis.emAberto)} />
        <KTile label="Leadtime médio até perda" value={`${kpis.leadtimeDias.toFixed(1)}d`} />
        <KTile label="Etapa que mais perde"     value={kpis.etapaTop ? stageLabel(kpis.etapaTop, origem) : '—'} />
      </div>

      {/* Por que se perde ── */}
      <div style={{ margin: '32px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>Por que se perde</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Motivos de perda</div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>PROCESSO = endereçável pelo time · MERCADO = perfil/momento</div>
            </div>
            <div style={{
              display: 'inline-flex', borderRadius: 999, background: 'var(--ws-border)', padding: 2,
            }}>
              {(['todos', 'processo', 'mercado'] as const).map(t => (
                <button key={t}
                  onClick={() => setMotivoTab(t)}
                  style={{
                    padding: '4px 12px', fontSize: 11, textTransform: 'capitalize',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    background: motivoTab === t ? TEAL : 'transparent',
                    color: motivoTab === t ? '#fff' : 'var(--ws-text-secondary)', fontWeight: 500,
                  }}>{t}</button>
              ))}
            </div>
          </div>
          {motivosFiltrados.slice(0, 10).map(m => (
            <BarRow key={m.motivo} label={m.motivo}
              subLabel={m.categoria === 'processo' ? 'PROCESSO' : m.categoria === 'mercado' ? 'MERCADO' : undefined}
              value={m.qtd}
              max={motivosFiltrados[0]?.qtd ?? 1}
              color={m.categoria === 'mercado' ? TEAL : m.categoria === 'processo' ? RED : '#94A3B8'}
              right={<span>{m.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{pct(m.pct)}</span></span>}
              onClick={() => setDrawer({ title: m.motivo, subtitle: drawerSubtitle, deals: m.deals })}
            />
          ))}
          {motivosFiltrados.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem motivos {motivoTab !== 'todos' ? `de ${motivoTab} ` : ''}no período.</div>
          )}
        </SCard>

        <SCard>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 4 }}>Onde e quando se perde</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Volume por etapa e leadtime médio até a perda</div>
          {etapas.map(e => (
            <BarRow key={e.etapa} label={stageLabel(e.etapa, origem)} value={e.qtd}
              max={Math.max(...etapas.map(x => x.qtd), 1)} color={DARK_ACCENT}
              right={<span>{e.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{e.leadtime > 0 ? `${e.leadtime.toFixed(1)}d` : '—'}</span></span>}
              onClick={() => setDrawer({ title: stageLabel(e.etapa, origem), subtitle: drawerSubtitle, deals: e.deals })}
            />
          ))}
          {etapas.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem etapas mapeadas no período.</div>
          )}
        </SCard>
      </div>

      {/* Cruzamentos ── */}
      <div style={{ margin: '32px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>Cruzamentos</div>
      </div>
      <SCard>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Motivo × Etapa</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>Onde cada motivo derruba a negociação. Célula mais escura = mais perdas</div>
        </div>
        {cruz.motivos.length > 0 && cruz.etapas.length > 0
          ? <Heatmap
              motivos={cruz.motivos} etapas={cruz.etapas} celulas={cruz.celulas} origem={origem}
              onCellClick={(motivo, etapa) => {
                const celula = cruz.celulas.find(c => c.motivo === motivo && c.etapa === etapa)
                if (celula && celula.qtd > 0) {
                  setDrawer({ title: `${motivo} · ${stageLabel(etapa, origem)}`, subtitle: drawerSubtitle, deals: celula.deals })
                }
              }}
            />
          : <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Dados insuficientes pra heatmap.</div>}
      </SCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Perda por responsável</div>
            <div style={{ display: 'inline-flex', borderRadius: 999, background: 'var(--ws-border)', padding: 2 }}>
              {(['todos', 'SDR', 'Closer'] as const).map(t => (
                <button key={t}
                  onClick={() => setRespTab(t)}
                  style={{
                    padding: '4px 12px', fontSize: 11,
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    background: respTab === t ? TEAL : 'transparent',
                    color: respTab === t ? '#fff' : 'var(--ws-text-secondary)', fontWeight: 500,
                  }}>{t === 'todos' ? 'Todos' : t}</button>
              ))}
            </div>
          </div>
          {respFiltrados.slice(0, 10).map(r => (
            <BarRow key={r.nome}
              label={r.nome}
              subLabel={r.camada !== '—' ? r.camada : undefined}
              value={r.qtd}
              max={respFiltrados[0]?.qtd ?? 1}
              color={r.camada === 'SDR' ? AMBER : r.camada === 'Closer' ? TEAL : '#94A3B8'}
              onClick={() => setDrawer({ title: r.nome, subtitle: drawerSubtitle, deals: r.deals })}
            />
          ))}
          {respFiltrados.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem responsáveis mapeados.</div>
          )}
        </SCard>

        <SCard>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 4 }}>Perda por marca</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Volume absoluto e taxa sobre os {mqlWord(origem, true)} da própria marca</div>
          {marcas.map(m => (
            <BarRow key={m.marca}
              label={marcaLabel(m.marca)}
              value={m.qtd}
              max={marcas[0]?.qtd ?? 1}
              color={BRAND_ACCENT[m.marca] ?? '#7F0C72'}
              right={<span>{m.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{m.pctSobreMql > 0 ? pct(m.pctSobreMql) : '—'}</span></span>}
              onClick={() => setDrawer({ title: marcaLabel(m.marca), subtitle: drawerSubtitle, deals: m.deals })}
            />
          ))}
        </SCard>
      </div>

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        Período: {fmtBR(range.start)} – {fmtBR(range.end)} · Fonte: <code>vw_funil_vendas</code>
      </div>

      <PerdaDealsDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer?.title ?? ''}
        subtitle={drawer?.subtitle ?? ''}
        deals={drawer?.deals ?? []}
        accent={TEAL}
      />
    </div>
  )
}
