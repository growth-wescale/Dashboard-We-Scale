import { useMemo } from 'react'
import { useMediaData } from '@/hooks/useMediaData'
import { useCrmFunil } from '@/hooks/useCrmFunil'
import { useLeads } from '@/hooks/useLeads'
import { StatusPill } from '@/components/ui/StatusPill'
import { MARCAS, MARCA_COR } from '@/lib/types'
import type { Marca, Lead } from '@/lib/types'
import {
  COPA_DATA_INICIO, COPA_DIAS_MES, COPA_MES_LABEL,
  COPA_CUSTO, COPA_QUALIDADE_BASELINE, COPA_CAPITAL_QUALIFICADO,
  COPA_VOLUME_MARCAS, COPA_VOLUME_META, COPA_LEADS_TREND,
  COPA_BUDGET,
} from '@/constants/copab2b'

const isLeadMql = (r: { dados_extras: Record<string, unknown> | null }) => {
  const lt = r.dados_extras?.['lead_type']
  return typeof lt === 'string' && lt.toUpperCase() === 'MQL'
}

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

// ── Date helpers ──────────────────────────────────────────────────────────
const hoje     = new Date()
const diaAtual = hoje.getFullYear() === 2026 && hoje.getMonth() === 6 ? hoje.getDate() : 13
const dataFim  = `2026-07-${String(diaAtual).padStart(2, '0')}`
const pctMes   = diaAtual / COPA_DIAS_MES

// ── Status helpers ────────────────────────────────────────────────────────
type Status = 'positivo' | 'atencao' | 'risco'

function custoStatus(cpmql: number | null, meta: number, baseline: number): Status {
  if (cpmql === null || cpmql === 0) return 'atencao'
  if (cpmql <= meta)     return 'positivo'
  if (cpmql <= baseline) return 'atencao'
  return 'risco'
}

function qualStatus(pct: number | null, baseline: number): Status {
  if (pct === null) return 'atencao'
  if (pct >= baseline)        return 'positivo'
  if (pct >= baseline * 0.90) return 'atencao'
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

function MiniBar({ pct, status }: { pct: number; status: Status }) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div style={{ height: 5, background: 'var(--ws-bg)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${w}%`, background: STC[status], borderRadius: 'var(--radius-pill)', transition: 'width .3s' }} />
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
  const mediaJul = useMediaData({ dataInicio: COPA_DATA_INICIO, dataFim })
  const crmJul   = useCrmFunil({ dataInicio: COPA_DATA_INICIO, dataFim })
  const leadsJul = useLeads({ dataInicio: COPA_DATA_INICIO, dataFim })

  const loading = mediaJul.loading || crmJul.loading || leadsJul.loading

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

      // QUALIDADE
      const whitelist       = COPA_CAPITAL_QUALIFICADO[marca]
      const comCapital      = leadsM.filter(r => {
        const c = r.dados_extras?.['capital'] as string | null | undefined
        return c != null && c !== ''
      })
      const qualificados    = comCapital.filter(r =>
        whitelist.includes(r.dados_extras?.['capital'] as string)
      )
      const pctQual         = comCapital.length > 0 ? (qualificados.length / comCapital.length) * 100 : null
      const qualBase        = COPA_QUALIDADE_BASELINE[marca]
      const qSt             = qualStatus(pctQual, qualBase)

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
        marca, spendTotal, mqlCount, cpmql, custMeta, custBase, cSt,
        pctQual, qualBase, qSt, comCapital: comCapital.length, qualificados: qualificados.length,
        spendGoogle, spendMeta, budget, paceG, paceM, paceT, iSt,
      }
    }),
    [mediaJul.data, crmJul.data, leadsJul.data])

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

  return (
    <div style={{ padding: 'var(--container-pad)' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-page-title)', color: 'var(--ws-text-primary)', lineHeight: 'var(--lh-heading)' }}>
          Meta Copa B2B
        </h1>
        <p style={{ color: 'var(--ws-text-secondary)', fontSize: 13, marginTop: 3 }}>
          {COPA_MES_LABEL} · Dia {diaAtual}/{COPA_DIAS_MES} · {Math.round(pctMes * 100)}% do mês decorrido
        </p>
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
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
                base {fmtR(b.custBase)}
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
        titulo="QUALIDADE — % capital qualificado"
        descricao="Leads de julho com capital ≥ faixa mínima da marca"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {stats.map(b => (
            <div key={b.marca} style={{ ...CARD, borderTop: `3px solid ${STC[b.qSt]}` }}>
              <BrandLabel marca={b.marca} />
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ws-text-primary)' }}>
                  {b.pctQual !== null ? `${b.pctQual.toFixed(1)}%` : '—'}
                </span>
                <FarolDot status={b.qSt} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
                base {b.qualBase.toFixed(1)}%
                {b.pctQual !== null && (
                  <span style={{ marginLeft: 6, fontWeight: 700, color: b.pctQual >= b.qualBase ? STC.positivo : STC.risco }}>
                    {b.pctQual >= b.qualBase ? '▲' : '▼'} {Math.abs(b.pctQual - b.qualBase).toFixed(1)} pp
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', borderTop: '1px solid var(--ws-border)', paddingTop: 8 }}>
                {b.qualificados} de {b.comCapital} leads
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
