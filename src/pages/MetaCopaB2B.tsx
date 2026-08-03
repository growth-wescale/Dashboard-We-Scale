import { useMemo, useState } from 'react'
import { useMediaData } from '@/hooks/useMediaData'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { useLeads } from '@/hooks/useLeads'
import { StatusPill } from '@/components/ui/StatusPill'
import { MARCAS, MARCA_COR } from '@/lib/types'
import type { Marca } from '@/lib/types'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import {
  COPA_DATA_INICIO, COPA_DIAS_MES, COPA_MES_LABEL,
  COPA_CUSTO, COPA_SQL_TAXA_BASELINE,
  COPA_VOLUME_MARCAS, COPA_VOLUME_META, COPA_LEADS_TREND,
  COPA_BUDGET,
} from '@/constants/copab2b'


// ── Status helpers ────────────────────────────────────────────────────────
type Status = 'positivo' | 'atencao' | 'risco'

function custoStatus(cpmql: number | null, meta: number, baseline: number): Status {
  if (cpmql === null || cpmql === 0) return 'atencao'
  if (cpmql <= meta)     return 'positivo'
  if (cpmql <= baseline) return 'atencao'
  return 'risco'
}

function qualStatus(rate: number | null, baseline: number): Status {
  if (rate === null) return 'atencao'
  if (baseline === 0) return rate > 0 ? 'positivo' : 'atencao'
  if (rate >= baseline)        return 'positivo'
  if (rate >= baseline * 0.80) return 'atencao'
  return 'risco'
}

function volStatus(proj: number, meta: number): Status {
  if (proj >= meta)        return 'positivo'
  if (proj >= meta * 0.75) return 'atencao'
  return 'risco'
}

function paceStatus(ratio: number | null): Status {
  if (ratio === null)                         return 'atencao'
  if (ratio >= 0.85 && ratio <= 1.15)        return 'positivo'
  if (ratio >= 0.70 && ratio <= 1.30)        return 'atencao'
  return 'risco'
}

const STC: Record<Status, string> = {
  positivo: 'var(--status-positivo)',
  atencao:  'var(--status-atencao)',
  risco:    'var(--status-risco)',
}


// Etapas que mapeiam para SQL (stage-based, independente de won/lost)

const fmt = (n: number) => n.toLocaleString('pt-BR')
const fmtR = (n: number) => `R$ ${fmt(Math.round(n))}`

// ── Sub-components ────────────────────────────────────────────────────────
function FarolDot({ status }: { status: Status }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10,
      borderRadius: '50%', background: STC[status], flexShrink: 0,
    }} />
  )
}

function MiniBar({ pct, status, goalPct }: { pct: number; status: Status; goalPct?: number }) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${w}%`, background: STC[status], borderRadius: 'var(--radius-pill)', transition: 'width .3s' }} />
      {goalPct !== undefined && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${Math.min(99, Math.max(1, goalPct))}%`,
          width: 2, background: 'rgba(255,255,255,0.55)',
        }} />
      )}
    </div>
  )
}

function Sparkline({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map(([, v]) => v), 1)
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 44 }}>
      {data.map(([label, val]) => (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: '100%',
            height: Math.max(3, Math.round((val / max) * 36)),
            background: 'var(--brand-accent)',
            borderRadius: '2px 2px 0 0',
            opacity: 0.55,
          }} />
          <div style={{ fontSize: 9, color: 'var(--ws-text-secondary)', lineHeight: 1 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

interface SectionProps {
  numero: string
  titulo: string
  descricao: string
  children: React.ReactNode
}

function Section({ numero, titulo, descricao, children }: SectionProps) {
  return (
    <div style={{
      background: 'var(--ws-surface)',
      border: '1px solid var(--ws-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--ws-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{numero}</span>
        <div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ws-text-primary)' }}>{titulo}</span>
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginLeft: 10 }}>{descricao}</span>
        </div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function BrandLabel({ marca }: { marca: Marca }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: MARCA_COR[marca], flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ws-text-primary)' }}>{marca}</span>
    </div>
  )
}

const CARD = {
  background: 'var(--ws-bg)',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--radius-sm)',
  padding: 14,
} as const

// ── Main component ────────────────────────────────────────────────────────
export function MetaCopaB2B() {
  const [filterFonte, setFilterFonte] = useState('__all__')

  const { diaAtual, dataFim, pctMes } = useMemo(() => {
    const d = new Date()
    const dia = d.getFullYear() === 2026 && d.getMonth() === 6 ? d.getDate() : 13
    return { diaAtual: dia, dataFim: `2026-07-${String(dia).padStart(2, '0')}`, pctMes: dia / COPA_DIAS_MES }
  }, [])

  const mediaJul     = useMediaData({ dataInicio: COPA_DATA_INICIO, dataFim })
  const crmJulRaw    = useVendasFunil({ dataInicio: COPA_DATA_INICIO, dataFim })
  const leadsJul     = useLeads({ dataInicio: COPA_DATA_INICIO, dataFim })

  const loading = mediaJul.loading || crmJulRaw.loading || leadsJul.loading
  const error   = mediaJul.error ?? crmJulRaw.error ?? leadsJul.error

  const crmJulData = useMemo(() =>
    filterFonte === '__all__' ? crmJulRaw.data : crmJulRaw.data.filter(r => mapFonte(r.fonte) === filterFonte),
    [crmJulRaw.data, filterFonte])

  // ── Computed per brand ─────────────────────────────────────────────────
  const stats = useMemo(() =>
    MARCAS.map(marca => {
      // CUSTO
      const spendTotal  = mediaJul.data.filter(r => r.marca === marca).reduce((s, r) => s + r.spend_brl, 0)
      const leadsM      = deduplicateLeads(leadsJul.data.filter(r => r.marca === marca))
      const mqlCount    = leadsM.filter(isLeadMql).length
      const cpmql       = mqlCount > 0 ? spendTotal / mqlCount : null
      const { meta: custMeta, baseline: custBase } = COPA_CUSTO[marca]
      const cSt         = custoStatus(cpmql, custMeta, custBase)
      // barra de atingimento: progresso de baseline → meta (maior = melhor)
      const atingimentoPct = (cpmql !== null && custBase > custMeta)
        ? Math.min(100, Math.max(0, (custBase - cpmql) / (custBase - custMeta) * 100))
        : 0
      const projMql = diaAtual > 0 ? Math.round((mqlCount / diaAtual) * COPA_DIAS_MES) : 0

      // QUALIDADE — taxa de conversão MQL → SQL
      const sqlCount   = crmJulData.filter(r => r.marca === marca && inPeriod(r.data_sql, COPA_DATA_INICIO, dataFim)).length
      const totalAtivo = crmJulData.filter(r =>
        r.marca === marca && r.status_atual === 'Em andamento'
      ).length
      const taxaSql    = mqlCount > 0 ? (sqlCount / mqlCount) * 100 : null
      const sqlBase    = COPA_SQL_TAXA_BASELINE[marca]
      const hasQualBase = sqlBase > 0
      const qSt        = qualStatus(taxaSql, sqlBase)
      const qualBarPct = hasQualBase && taxaSql !== null
        ? Math.min(100, (taxaSql / sqlBase) * 100)
        : (taxaSql !== null ? Math.min(100, taxaSql * 2.5) : 0)

      // INVESTIMENTO
      const spendGoogle = mediaJul.data.filter(r => r.marca === marca && r.canal === 'google').reduce((s, r) => s + r.spend_brl, 0)
      const spendMeta   = mediaJul.data.filter(r => r.marca === marca && r.canal === 'meta').reduce((s, r) => s + r.spend_brl, 0)
      const budget      = COPA_BUDGET[marca]
      const expG        = budget.google * pctMes
      const expM        = budget.meta   * pctMes
      const paceG       = expG > 0 ? spendGoogle / expG : null
      const paceM       = expM > 0 ? spendMeta   / expM : null
      const expTot      = (budget.google + budget.meta) * pctMes
      const paceT       = expTot > 0 ? spendTotal / expTot : null
      const iSt         = paceStatus(paceT)

      return {
        marca, spendTotal, mqlCount, cpmql, custMeta, custBase, cSt, atingimentoPct, projMql,
        sqlCount, totalAtivo, taxaSql, sqlBase, hasQualBase, qSt, qualBarPct,
        spendGoogle, spendMeta, budget, paceG, paceM, paceT, iSt,
      }
    }),
    [mediaJul.data, crmJulData, leadsJul.data])

  const volumeStats = useMemo(() =>
    COPA_VOLUME_MARCAS.map(marca => {
      const mqlCount = deduplicateLeads(leadsJul.data.filter(r => r.marca === marca)).filter(isLeadMql).length
      const meta     = COPA_VOLUME_META[marca]!
      const proj     = diaAtual > 0 ? Math.round((mqlCount / diaAtual) * COPA_DIAS_MES) : 0
      const vSt      = volStatus(proj, meta)
      const trend    = COPA_LEADS_TREND[marca] ?? []
      return { marca, mqlCount, meta, proj, vSt, trend }
    }),
    [leadsJul.data])

  if (loading) {
    return (
      <div style={{ padding: 'var(--container-pad)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <span style={{ color: 'var(--ws-text-secondary)', fontSize: 14 }}>Carregando dados...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--container-pad)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <span style={{ color: 'var(--status-risco)', fontSize: 14 }}>Erro ao carregar dados: {error}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'var(--container-pad)' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-page-title)', color: 'var(--ws-text-primary)', lineHeight: 'var(--lh-heading)' }}>
              Acompanhamento Meta
            </h1>
            <p style={{ color: 'var(--ws-text-secondary)', fontSize: 13, marginTop: 3 }}>
              {COPA_MES_LABEL} · Dia {diaAtual}/{COPA_DIAS_MES} · {Math.round(pctMes * 100)}% do mês decorrido
            </p>
          </div>
          <select
            value={filterFonte}
            onChange={e => setFilterFonte(e.target.value)}
            style={{ appearance: 'none', padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 20, fontSize: 13, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none', alignSelf: 'center' }}
          >
            <option value="__all__">Todas as fontes</option>
            {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* ── 1. CUSTO ────────────────────────────────────────────────────── */}
      <Section
        numero="1"
        titulo="CUSTO — CP-MQL"
        descricao="Custo por MQL de julho ≤ baseline Jan–Jun × 0,85"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {stats.map(b => (
            <div key={b.marca} style={{ ...CARD, borderTop: `3px solid ${STC[b.cSt]}` }}>
              <BrandLabel marca={b.marca} />
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ws-text-primary)' }}>
                  {b.cpmql !== null ? fmtR(b.cpmql) : '—'}
                </span>
                <FarolDot status={b.cSt} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 2 }}>
                meta ≤ {fmtR(b.custMeta)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>
                base {fmtR(b.custBase)}
              </div>
              <MiniBar pct={b.atingimentoPct} status={b.cSt} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 2, marginBottom: 8 }}>
                <span style={{ color: STC[b.cSt], fontWeight: 600 }}>{b.atingimentoPct.toFixed(0)}% atingido</span>
                <span style={{ color: 'var(--ws-text-secondary)' }}>proj. {b.projMql} MQLs</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', borderTop: '1px solid var(--ws-border)', paddingTop: 8 }}>
                {b.mqlCount} MQLs · {fmtR(b.spendTotal)} inv.
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 2. QUALIDADE ─────────────────────────────────────────────────── */}
      <Section
        numero="2"
        titulo="QUALIDADE — taxa MQL → SQL"
        descricao="Conversão MQL→SQL no CRM jul/26 vs. baseline mai/26"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {stats.map(b => (
            <div key={b.marca} style={{ ...CARD, borderTop: `3px solid ${STC[b.qSt]}` }}>
              <BrandLabel marca={b.marca} />
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ws-text-primary)' }}>
                  {b.taxaSql !== null ? `${b.taxaSql.toFixed(1)}%` : '—'}
                </span>
                <FarolDot status={b.qSt} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>
                {b.hasQualBase ? (
                  <>
                    base mai {b.sqlBase.toFixed(1)}%
                    {b.taxaSql !== null && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: b.taxaSql >= b.sqlBase ? STC.positivo : STC.risco }}>
                        {b.taxaSql >= b.sqlBase ? '▲' : '▼'} {Math.abs(b.taxaSql - b.sqlBase).toFixed(1)} pp
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>sem baseline mai/26</span>
                )}
              </div>
              <MiniBar pct={b.qualBarPct} status={b.qSt} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 2, marginBottom: 8 }}>
                <span style={{ color: STC[b.qSt], fontWeight: 600 }}>
                  {b.hasQualBase ? `${b.qualBarPct.toFixed(0)}% da base` : `${b.taxaSql !== null ? b.taxaSql.toFixed(1) : '0.0'}% taxa jul`}
                </span>
                <span style={{ color: 'var(--ws-text-secondary)' }}>{b.sqlCount} SQLs</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', borderTop: '1px solid var(--ws-border)', paddingTop: 8 }}>
                {b.sqlCount} SQL · {b.totalAtivo} ativos (SQL+MQL)
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3. VOLUME ─────────────────────────────────────────────────────── */}
      <Section
        numero="3"
        titulo="VOLUME — MQL digital"
        descricao="Lisô Laser ≥ 25 · Viva ≥ 35 · Oral Unic ≥ 65 MQLs em julho"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {volumeStats.map(v => {
            const pct = Math.round((v.mqlCount / v.meta) * 100)
            return (
              <div key={v.marca} style={{ ...CARD, borderTop: `3px solid ${STC[v.vSt]}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <BrandLabel marca={v.marca} />
                  <StatusPill status={v.vSt} value={`${pct}%`} size="sm" />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 36, color: 'var(--ws-text-primary)', lineHeight: 1 }}>
                      {v.mqlCount}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>MQLs jul/26</div>
                  </div>
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>meta <strong style={{ color: 'var(--ws-text-primary)' }}>{v.meta}</strong></div>
                    <div style={{ fontSize: 12, color: STC[v.vSt], fontWeight: 700 }}>
                      proj. {v.proj} até 31/jul
                    </div>
                  </div>
                </div>

                <MiniBar pct={pct} status={v.vSt} />
                <div style={{ fontSize: 10, color: 'var(--ws-text-secondary)', marginTop: 2, marginBottom: 12 }}>
                  {v.mqlCount} / {v.meta} MQLs
                </div>

                {v.trend.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--ws-text-secondary)', marginBottom: 4 }}>
                      Leads/mês (Jan–Jun, histórico)
                    </div>
                    <Sparkline data={v.trend} />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 4. INVESTIMENTO ──────────────────────────────────────────────── */}
      <Section
        numero="4"
        titulo="INVESTIMENTO — pace de budget"
        descricao={`Budget de mídia paga jul/26 · ${Math.round(pctMes * 100)}% do mês decorrido`}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {stats.map(b => {
            const budgetTot = b.budget.google + b.budget.meta
            const pctG = budgetTot > 0 ? (b.spendGoogle / b.budget.google) * 100 : 0
            const pctM = budgetTot > 0 ? (b.spendMeta / b.budget.meta) * 100 : 0
            const pctTot = budgetTot > 0 ? (b.spendTotal / budgetTot) * 100 : 0
            const gSt   = paceStatus(b.paceG)
            const mSt   = paceStatus(b.paceM)

            return (
              <div key={b.marca} style={{ ...CARD, borderTop: `3px solid ${STC[b.iSt]}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <BrandLabel marca={b.marca} />
                  <StatusPill status={b.iSt} value={b.paceT !== null ? `${Math.round(b.paceT * 100)}% ritmo` : '—'} size="sm" />
                </div>

                {/* Google */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 600 }}>Google</span>
                    <span style={{ color: 'var(--ws-text-primary)' }}>
                      {fmtR(b.spendGoogle)} <span style={{ color: 'var(--ws-text-secondary)' }}>/ {fmtR(b.budget.google)}</span>
                    </span>
                  </div>
                  <MiniBar pct={pctG} status={gSt} />
                  <div style={{ fontSize: 10, color: STC[gSt], fontWeight: 600, marginTop: 2 }}>
                    {pctG.toFixed(0)}% do budget
                  </div>
                </div>

                {/* Meta Ads */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 600 }}>Meta Ads</span>
                    <span style={{ color: 'var(--ws-text-primary)' }}>
                      {fmtR(b.spendMeta)} <span style={{ color: 'var(--ws-text-secondary)' }}>/ {fmtR(b.budget.meta)}</span>
                    </span>
                  </div>
                  <MiniBar pct={pctM} status={mSt} />
                  <div style={{ fontSize: 10, color: STC[mSt], fontWeight: 600, marginTop: 2 }}>
                    {pctM.toFixed(0)}% do budget
                  </div>
                </div>

                {/* Total */}
                <div style={{
                  borderTop: '1px solid var(--ws-border)',
                  paddingTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                }}>
                  <span style={{ color: 'var(--ws-text-secondary)' }}>
                    Total: <strong style={{ color: 'var(--ws-text-primary)' }}>{fmtR(b.spendTotal)}</strong>
                    <span style={{ color: 'var(--ws-text-secondary)' }}> / {fmtR(budgetTot)}</span>
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 11, color: STC[b.iSt] }}>
                    {pctTot.toFixed(0)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
