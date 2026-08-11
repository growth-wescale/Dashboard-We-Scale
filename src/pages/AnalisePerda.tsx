import { useEffect, useMemo, useState } from 'react'
import { Download, Filter } from 'lucide-react'
import { usePerdas, type PerdaEvento } from '@/hooks/usePerdas'
import { usePerformanceEquipe, type FunilCompatRow } from '@/hooks/usePerformanceEquipe'
import { useLeads } from '@/hooks/useLeads'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import type { Lead } from '@/lib/types'
import { businessDaysBetween } from '@/lib/businessHours'
import { classificarMotivo, type CategoriaMotivo } from '@/constants/motivosPerda'
import { BRANDS_WITH_OVERVIEW, BRAND_ACCENT } from '@/constants/brands'
import { nf, pct } from '@/lib/format'
import { currentMonthRange, fmtBR, monthLabelLong as monthLabel } from '@/lib/dateUtils'
import { SCard, KTile } from '@/components/ui/v2'

// ─── Brand config ──────────────────────────────────────────────────────────

const BRANDS = BRANDS_WITH_OVERVIEW
const BRAND_COLOR = BRAND_ACCENT

// ─── Colors ──────────────────────────────────────────────────────────────

const DARK_ACCENT = '#3D0F3D'  // roxo escuro (header)
const TEAL        = '#2ABCB5'
const RED         = '#E4585B'
const AMBER       = '#F3B34B'

// ─── Cálculos ─────────────────────────────────────────────────────────────

interface KpisHeader {
  perdidasDeals: number   // distinct id_deal com evento de perda no período
  mqlsPeriodo: number     // count de data_mql em período
  taxaPerda: number       // %
  emAberto: number
  leadtimeDias: number    // média data_evento - data_mql (dias, corrido)
  etapaTop: string        // etapa_canonica que mais perde
}

function computeKpis(perdas: PerdaEvento[], deals: FunilCompatRow[], mqlCount: number): KpisHeader {
  const activeDeals = deals.filter(d => d.status_atual !== 'Excluído')
  // MQLs vêm do banco Marketing (P1): já contados no chamador
  const mqlsPeriodo = mqlCount

  // Deduplica perda por deal (1 deal pode ter 2 eventos de perda em reciclagem)
  const perdaByDeal = new Map<string, PerdaEvento>()
  for (const p of perdas) {
    if (!p.id_deal) continue
    const cur = perdaByDeal.get(p.id_deal)
    if (!cur || (p.data_evento && cur.data_evento && p.data_evento > cur.data_evento)) {
      perdaByDeal.set(p.id_deal, p)
    }
  }
  const perdidasDeals = perdaByDeal.size

  // leadtime médio: para cada perda deduplicada, se acharmos o data_mql do deal, calcula
  const dealByLead = new Map<string, FunilCompatRow>()
  for (const d of activeDeals) dealByLead.set(d.id_lead, d)

  // Leadtime em dias úteis (P3: horário comercial seg-sex 9-18)
  const leadtimes: number[] = []
  for (const [id, ev] of perdaByDeal) {
    const deal = dealByLead.get(id)
    if (!deal?.data_novo_mql || !ev.data_evento) continue
    const d = businessDaysBetween(deal.data_novo_mql, ev.data_evento)
    if (d > 0) leadtimes.push(d)
  }
  const leadtimeDias = leadtimes.length > 0
    ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length
    : 0

  // Etapa que mais perde (ignorando null)
  const etapaCount = new Map<string, number>()
  for (const p of perdas) {
    if (!p.etapa_canonica) continue
    etapaCount.set(p.etapa_canonica, (etapaCount.get(p.etapa_canonica) ?? 0) + 1)
  }
  const etapaTop = Array.from(etapaCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  const emAberto = activeDeals.filter(d => d.status_atual === 'Em andamento').length
  const taxaPerda = mqlsPeriodo > 0 ? (perdidasDeals / mqlsPeriodo) * 100 : 0

  return { perdidasDeals, mqlsPeriodo, taxaPerda, emAberto, leadtimeDias, etapaTop }
}

interface MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null }
function computeMotivos(perdas: PerdaEvento[]): MotivoRow[] {
  const total = perdas.filter(p => p.motivo_perda).length || 1
  const bucket = new Map<string, number>()
  for (const p of perdas) {
    if (!p.motivo_perda) continue
    const m = p.motivo_perda.replace(/^\[NOVO\]\s*/, '').trim() // limpa prefixo [NOVO]
    bucket.set(m, (bucket.get(m) ?? 0) + 1)
  }
  return Array.from(bucket.entries())
    .map(([motivo, qtd]) => ({ motivo, qtd, pct: (qtd / total) * 100, categoria: classificarMotivo(motivo) }))
    .sort((a, b) => b.qtd - a.qtd)
}

interface EvitavelStats { pctEvitavel: number; qtdProcesso: number; qtdMercado: number }
function computeEvitavel(perdas: PerdaEvento[]): EvitavelStats {
  let qtdProcesso = 0, qtdMercado = 0
  for (const p of perdas) {
    const c = classificarMotivo(p.motivo_perda)
    if (c === 'processo') qtdProcesso += 1
    else if (c === 'mercado') qtdMercado += 1
  }
  const total = qtdProcesso + qtdMercado
  const pctEvitavel = total > 0 ? (qtdProcesso / total) * 100 : 0
  return { pctEvitavel, qtdProcesso, qtdMercado }
}

interface EtapaRow { etapa: string; ordem: number; qtd: number; leadtime: number }
function computeEtapas(perdas: PerdaEvento[], deals: FunilCompatRow[]): EtapaRow[] {
  const dealByLead = new Map<string, FunilCompatRow>()
  for (const d of deals) dealByLead.set(d.id_lead, d)

  const bucket = new Map<string, { ordem: number; qtd: number; leadtimeAcum: number; leadtimeN: number }>()
  for (const p of perdas) {
    if (!p.etapa_canonica) continue
    const key = p.etapa_canonica
    const cur = bucket.get(key) ?? { ordem: p.ordem_funil ?? 999, qtd: 0, leadtimeAcum: 0, leadtimeN: 0 }
    cur.qtd += 1
    const deal = dealByLead.get(p.id_deal)
    if (deal?.data_novo_mql && p.data_evento) {
      const d = businessDaysBetween(deal.data_novo_mql, p.data_evento)
      if (d > 0) { cur.leadtimeAcum += d; cur.leadtimeN += 1 }
    }
    bucket.set(key, cur)
  }
  return Array.from(bucket.entries())
    .map(([etapa, v]) => ({ etapa, ordem: v.ordem, qtd: v.qtd, leadtime: v.leadtimeN > 0 ? v.leadtimeAcum / v.leadtimeN : 0 }))
    .sort((a, b) => a.ordem - b.ordem)
}

interface CruzCel { motivo: string; etapa: string; qtd: number }
function computeCruzamentos(perdas: PerdaEvento[]): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] } {
  const motivos = computeMotivos(perdas).slice(0, 10).map(m => m.motivo)
  const etapasMap = new Map<string, number>()
  for (const p of perdas) {
    if (!p.etapa_canonica) continue
    etapasMap.set(p.etapa_canonica, p.ordem_funil ?? 999)
  }
  const etapas = Array.from(etapasMap.entries())
    .map(([etapa, ordem]) => ({ etapa, ordem }))
    .sort((a, b) => a.ordem - b.ordem)

  const cel = new Map<string, number>()
  for (const p of perdas) {
    if (!p.motivo_perda || !p.etapa_canonica) continue
    const m = p.motivo_perda.replace(/^\[NOVO\]\s*/, '').trim()
    if (!motivos.includes(m)) continue
    const key = `${m}|||${p.etapa_canonica}`
    cel.set(key, (cel.get(key) ?? 0) + 1)
  }
  const celulas: CruzCel[] = []
  for (const m of motivos) for (const e of etapas) {
    celulas.push({ motivo: m, etapa: e.etapa, qtd: cel.get(`${m}|||${e.etapa}`) ?? 0 })
  }
  return { motivos, etapas, celulas }
}
interface EtapaMeta { etapa: string; ordem: number }

interface RespRow { nome: string; camada: 'SDR' | 'Closer' | '—'; qtd: number }
function computeResponsaveis(perdas: PerdaEvento[]): RespRow[] {
  const bucket = new Map<string, { camada: 'SDR' | 'Closer' | '—'; qtd: number }>()
  for (const p of perdas) {
    if (!p.responsavel) continue
    const cur = bucket.get(p.responsavel) ?? { camada: (p.camada as any) ?? '—', qtd: 0 }
    if (p.camada) cur.camada = p.camada
    cur.qtd += 1
    bucket.set(p.responsavel, cur)
  }
  return Array.from(bucket.entries())
    .map(([nome, v]) => ({ nome, camada: v.camada, qtd: v.qtd }))
    .sort((a, b) => b.qtd - a.qtd)
}

interface MarcaRow { marca: string; qtd: number; pctSobreMql: number }
function computeMarcas(perdas: PerdaEvento[], leadsMql: Lead[]): MarcaRow[] {
  // MQL por marca vem do banco Marketing (leads deduplicados e filtrados por isLeadMql no chamador)
  const mqlsPorMarca = new Map<string, number>()
  for (const l of leadsMql) {
    if (!l.marca) continue
    mqlsPorMarca.set(l.marca, (mqlsPorMarca.get(l.marca) ?? 0) + 1)
  }
  const perdidoPorMarca = new Map<string, Set<string>>()
  for (const p of perdas) {
    if (!p.marca || !p.id_deal) continue
    const s = perdidoPorMarca.get(p.marca) ?? new Set<string>()
    s.add(p.id_deal); perdidoPorMarca.set(p.marca, s)
  }
  return Array.from(perdidoPorMarca.entries())
    .map(([marca, set]) => ({
      marca, qtd: set.size,
      pctSobreMql: (mqlsPorMarca.get(marca) ?? 0) > 0 ? (set.size / (mqlsPorMarca.get(marca) as number)) * 100 : 0,
    }))
    .sort((a, b) => b.qtd - a.qtd)
}

// ─── UI blocks ────────────────────────────────────────────────────────────

function DarkKpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' | 'muted' }) {
  return (
    <div style={{ padding: '20px 26px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#E9C5E3' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 40, color: '#fff', marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: tone === 'amber' ? '#F3C979' : '#D0AEC9' }}>{sub}</div>
      )}
    </div>
  )
}

function BarRow({ label, subLabel, value, max, color, right }: {
  label: string; subLabel?: string; value: number; max: number; color: string; right?: React.ReactNode
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--ws-border)' }}>
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

function Heatmap({ motivos, etapas, celulas }: { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] }) {
  const maxQ = Math.max(1, ...celulas.map(c => c.qtd))
  const val = (m: string, e: string) => celulas.find(c => c.motivo === m && c.etapa === e)?.qtd ?? 0

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
          <div key={e.etapa} style={{ fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center', letterSpacing: '.03em' }}>{e.etapa}</div>
        ))}
        {motivos.map(m => (
          <>
            <div key={m} style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{m}</div>
            {etapas.map(e => {
              const v = val(m, e.etapa)
              return (
                <div key={`${m}-${e.etapa}`} style={{
                  background: shade(v), color: color(v),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: v === 0 ? 400 : 600, fontVariantNumeric: 'tabular-nums',
                  padding: '10px 6px', borderRadius: 6, border: v === 0 ? '1px solid var(--ws-border)' : 'none',
                  minHeight: 32,
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

export function AnalisePerda() {
  const [brandKey, setBrandKey] = useState<string>('overview')
  const [{ start, end }, setRange] = useState(currentMonthRange())
  const [brandOpen, setBrandOpen] = useState(false)
  const [motivoTab, setMotivoTab] = useState<'todos' | 'processo' | 'mercado'>('todos')
  const [respTab, setRespTab] = useState<'todos' | 'SDR' | 'Closer'>('todos')

  const brand = BRANDS.find(b => b.key === brandKey) ?? BRANDS[0]
  const { data: perdas } = usePerdas({ marca: brand.marca, dataInicio: start, dataFim: end })
  const { data: deals } = usePerformanceEquipe({ marca: brand.marca, dataInicio: start, dataFim: end })
  // MQLs vêm do banco Marketing (P1)
  const { data: rawLeads } = useLeads({ marca: brand.marca, dataInicio: start, dataFim: end })
  const leadsMql = useMemo(() => deduplicateLeads(rawLeads).filter(isLeadMql), [rawLeads])

  useEffect(() => {
    const handler = () => setRange({ ...currentMonthRange() })
    window.addEventListener('dashboard:refresh', handler)
    return () => window.removeEventListener('dashboard:refresh', handler)
  }, [])

  const kpis     = useMemo(() => computeKpis(perdas, deals, leadsMql.length), [perdas, deals, leadsMql])
  const motivos  = useMemo(() => computeMotivos(perdas), [perdas])
  const etapas   = useMemo(() => computeEtapas(perdas, deals), [perdas, deals])
  const cruz     = useMemo(() => computeCruzamentos(perdas), [perdas])
  const resps    = useMemo(() => computeResponsaveis(perdas), [perdas])
  const marcas   = useMemo(() => computeMarcas(perdas, leadsMql), [perdas, leadsMql])
  const evitavel = useMemo(() => computeEvitavel(perdas), [perdas])

  const motivosFiltrados = motivoTab === 'todos'
    ? motivos
    : motivos.filter(m => m.categoria === motivoTab)

  const respFiltrados = respTab === 'todos' ? resps : resps.filter(r => r.camada === respTab)

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 34, lineHeight: 1.1, color: 'var(--ws-text-primary)', margin: 0 }}>Análise de Perda</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ws-text-secondary)' }}>{brand.label} · {monthLabel(start)}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setBrandOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 999,
                border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
                color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
              {brand.label}
              <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)' }}>▾</span>
            </button>
            {brandOpen && (
              <div style={{
                position: 'absolute', top: '110%', left: 0, zIndex: 20,
                background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
                borderRadius: 12, boxShadow: 'var(--shadow-md)', minWidth: 220, padding: 6,
              }}>
                {BRANDS.map(b => (
                  <button key={b.key}
                    onClick={() => { setBrandKey(b.key); setBrandOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none',
                      background: b.key === brandKey ? 'var(--ws-bg-alt, #F4F4F5)' : 'transparent',
                      cursor: 'pointer', borderRadius: 8, fontSize: 13, color: 'var(--ws-text-primary)',
                    }}
                  >{b.label}</button>
                ))}
              </div>
            )}
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 999,
            border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
            color: 'var(--ws-text-primary)', fontSize: 13, boxShadow: 'var(--shadow-sm)',
          }}>
            <Filter size={14} style={{ color: 'var(--ws-text-secondary)' }} />
            <span style={{ color: 'var(--ws-text-secondary)' }}>Mês</span>
            <input type="date" value={start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
              style={{ border: 'none', background: 'transparent', color: 'var(--ws-text-primary)', fontSize: 13 }} />
            <span style={{ color: 'var(--ws-text-secondary)' }}>–</span>
            <input type="date" value={end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
              style={{ border: 'none', background: 'transparent', color: 'var(--ws-text-primary)', fontSize: 13 }} />
          </div>

          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 999,
            border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
            color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
          }}>
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* Card dark 3 KPIs ── */}
      <div style={{
        display: 'flex', background: DARK_ACCENT, borderRadius: 18,
        boxShadow: 'var(--shadow-md)', color: '#fff', overflow: 'hidden', flexWrap: 'wrap',
      }}>
        <DarkKpi
          label="Negociações Perdidas"
          value={nf(kpis.perdidasDeals)}
          sub={`Taxa de perda de ${pct(kpis.taxaPerda)} sobre os MQLs do período`}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
        <DarkKpi
          label="Perda Evitável"
          value={evitavel.qtdProcesso + evitavel.qtdMercado > 0 ? pct(evitavel.pctEvitavel, 0) : '—'}
          sub={`${nf(evitavel.qtdProcesso)} por falha de processo · ${nf(evitavel.qtdMercado)} por fit ou momento`}
          tone="amber"
        />
      </div>

      {/* 4 KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        <KTile label="Taxa de perda"           value={pct(kpis.taxaPerda)} />
        <KTile label="Em aberto (pipeline)"    value={nf(kpis.emAberto)} />
        <KTile label="Leadtime médio até perda" value={`${kpis.leadtimeDias.toFixed(1)}d`} />
        <KTile label="Etapa que mais perde"    value={kpis.etapaTop} />
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
              {(['todos','processo','mercado'] as const).map(t => (
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
            <BarRow key={e.etapa} label={e.etapa} value={e.qtd}
              max={Math.max(...etapas.map(x => x.qtd), 1)} color={DARK_ACCENT}
              right={<span>{e.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{e.leadtime > 0 ? `${e.leadtime.toFixed(1)}d` : '—'}</span></span>}
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
          ? <Heatmap motivos={cruz.motivos} etapas={cruz.etapas} celulas={cruz.celulas} />
          : <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Dados insuficientes pra heatmap.</div>}
      </SCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Perda por responsável</div>
            <div style={{ display: 'inline-flex', borderRadius: 999, background: 'var(--ws-border)', padding: 2 }}>
              {(['todos','SDR','Closer'] as const).map(t => (
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
            />
          ))}
          {respFiltrados.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem responsáveis mapeados.</div>
          )}
        </SCard>

        <SCard>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 4 }}>Perda por marca</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Volume absoluto e taxa sobre os MQLs da própria marca</div>
          {marcas.map(m => (
            <BarRow key={m.marca}
              label={m.marca}
              value={m.qtd}
              max={marcas[0]?.qtd ?? 1}
              color={BRAND_COLOR[m.marca] ?? '#7F0C72'}
              right={<span>{m.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{m.pctSobreMql > 0 ? pct(m.pctSobreMql) : '—'}</span></span>}
            />
          ))}
        </SCard>
      </div>

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        Período: {fmtBR(start)} – {fmtBR(end)} · Fonte: <code>vw_perdas</code> + <code>vw_funil_compat</code>
      </div>
    </div>
  )
}
