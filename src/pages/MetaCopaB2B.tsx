import { useEffect, useMemo, useState } from 'react'
import { useMediaData } from '@/hooks/useMediaData'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { useLeads } from '@/hooks/useLeads'
import { StatusPill } from '@/components/ui/StatusPill'
import { MARCAS, MARCA_COR } from '@/lib/types'
import type { Marca } from '@/lib/types'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import {
  COPA_MESES,
  COPA_MESES_ORDENADOS,
  getMesCorrente,
  type CopaMesConfig,
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

  // Mês selecionado (padrão = mês corrente)
  const [mesKey, setMesKey] = useState<string>(() => getMesCorrente().key)
  const mes: CopaMesConfig = COPA_MESES[mesKey] ?? getMesCorrente()

  // "Agora" — recomputado a cada 5min para atualizar após meia-noite
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const { diaAtual, dataFimEfetivo, pctMes } = useMemo(() => {
    if (mes.fechado) {
      return { diaAtual: mes.diasMes, dataFimEfetivo: mes.dataFim, pctMes: 1 }
    }
    const isMesAtual =
      now.getFullYear() === Number(mes.key.slice(0, 4)) &&
      now.getMonth() + 1 === Number(mes.key.slice(5, 7))
    const dia = isMesAtual ? Math.min(now.getDate(), mes.diasMes) : mes.diasMes
    const dataFimEfetivo = `${mes.key}-${String(dia).padStart(2, '0')}`
    return { diaAtual: dia, dataFimEfetivo, pctMes: dia / mes.diasMes }
  }, [mes, now])

  const mediaMes  = useMediaData({ dataInicio: mes.dataInicio, dataFim: dataFimEfetivo })
  const crmMesRaw = useVendasFunil({ dataInicio: mes.dataInicio, dataFim: dataFimEfetivo })
  const leadsMes  = useLeads({ dataInicio: mes.dataInicio, dataFim: dataFimEfetivo })

  const loading = mediaMes.loading || crmMesRaw.loading || leadsMes.loading
  const error   = mediaMes.error ?? crmMesRaw.error ?? leadsMes.error

  const crmMesData = useMemo(() =>
    filterFonte === '__all__' ? crmMesRaw.data : crmMesRaw.data.filter(r => mapFonte(r.fonte) === filterFonte),
    [crmMesRaw.data, filterFonte])

  // ── Computed per brand ─────────────────────────────────────────────────
  const stats = useMemo(() =>
    MARCAS.map(marca => {
      // CUSTO
      const spendTotal  = mediaMes.data.filter(r => r.marca === marca).reduce((s, r) => s + r.spend_brl, 0)
      const leadsM      = deduplicateLeads(leadsMes.data.filter(r => r.marca === marca))
      const mqlCount    = leadsM.filter(isLeadMql).length
      const cpmql       = mqlCount > 0 ? spendTotal / mqlCount : null
      const { meta: custMeta, baseline: custBase } = mes.custo[marca]
      const cSt         = custoStatus(cpmql, custMeta, custBase)
      const atingimentoPct = (cpmql !== null && custBase > custMeta)
        ? Math.min(100, Math.max(0, (custBase - cpmql) / (custBase - custMeta) * 100))
        : 0
      const projMql = diaAtual > 0 ? Math.round((mqlCount / diaAtual) * mes.diasMes) : 0

      // QUALIDADE — taxa de conversão MQL → SQL
      const sqlCount   = crmMesData.filter(r => r.marca === marca && inPeriod(r.data_sql, mes.dataInicio, dataFimEfetivo)).length
      const totalAtivo = crmMesData.filter(r =>
        r.marca === marca && r.status_atual === 'Em andamento'
      ).length
      const taxaSql    = mqlCount > 0 ? (sqlCount / mqlCount) * 100 : null
      const sqlBase    = mes.sqlBaseline[marca]
      const hasQualBase = sqlBase > 0
      const qSt        = qualStatus(taxaSql, sqlBase)
      const qualBarPct = hasQualBase && taxaSql !== null
        ? Math.min(100, (taxaSql / sqlBase) * 100)
        : (taxaSql !== null ? Math.min(100, taxaSql * 2.5) : 0)

      // INVESTIMENTO
      const spendGoogle = mediaMes.data.filter(r => r.marca === marca && r.canal === 'google').reduce((s, r) => s + r.spend_brl, 0)
      const spendMeta   = mediaMes.data.filter(r => r.marca === marca && r.canal === 'meta').reduce((s, r) => s + r.spend_brl, 0)
      const budget      = mes.budget[marca]
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
    [mediaMes.data, crmMesData, leadsMes.data, mes, diaAtual, dataFimEfetivo, pctMes])

  const volumeStats = useMemo(() =>
    mes.volumeMarcas.map(marca => {
      const mqlCount = deduplicateLeads(leadsMes.data.filter(r => r.marca === marca)).filter(isLeadMql).length
      const meta     = mes.volumeMeta[marca]!
      const proj     = diaAtual > 0 ? Math.round((mqlCount / diaAtual) * mes.diasMes) : 0
      const vSt      = volStatus(proj, meta)
      const trend    = mes.leadsTrend[marca] ?? []
      return { marca, mqlCount, meta, proj, vSt, trend }
    }),
    [leadsMes.data, mes, diaAtual])

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
              {mes.label} · Dia {diaAtual}/{mes.diasMes} · {Math.round(pctMes * 100)}% do mês
              {mes.fechado && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>(fechado)</span>}
              {!mes.fechado && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--brand-accent)', fontWeight: 600 }}>· ao vivo (atualiza a cada 60s)</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignSelf: 'center', flexWrap: 'wrap' }}>
            {/* Toggle mês */}
            <div style={{ display: 'flex', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', background: 'var(--ws-surface)', overflow: 'hidden' }}>
              {COPA_MESES_ORDENADOS.map(m => {
                const active = m.key === mesKey
                return (
                  <button
                    key={m.key}
                    onClick={() => setMesKey(m.key)}
                    style={{
                      appearance: 'none',
                      padding: '7px 14px',
                      border: 'none',
                      background: active ? 'var(--brand-accent)' : 'transparent',
                      color: active ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    {m.label.replace(' 2026', '')}
                  </button>
                )
              })}
            </div>
            {/* Filtro fonte */}
            <select
              value={filterFonte}
              onChange={e => setFilterFonte(e.target.value)}
              style={{ appearance: 'none', padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none' }}
            >
              <option value="__all__">Todas as fontes</option>
              {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── 1. CUSTO ────────────────────────────────────────────────────── */}
      <Section
        numero="1"
        titulo="CUSTO — CP-MQL"
        descricao={`Custo por MQL de ${mes.label} ≤ baseline × 0,85 (−15%)`}
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
        descricao="Conversão MQL→SQL no CRM vs. baseline mai/26"
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
                  {b.hasQualBase ? `${b.qualBarPct.toFixed(0)}% da base` : `${b.taxaSql !== null ? b.taxaSql.toFixed(1) : '0.0'}% taxa`}
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
        descricao={mes.volumeMarcas.map(m => `${m} ≥ ${mes.volumeMeta[m]}`).join(' · ') + ` MQLs em ${mes.label}`}
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
                    <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>MQLs {mes.label.toLowerCase()}</div>
                  </div>
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>meta <strong style={{ color: 'var(--ws-text-primary)' }}>{v.meta}</strong></div>
                    <div style={{ fontSize: 12, color: STC[v.vSt], fontWeight: 700 }}>
                      proj. {v.proj} até fim
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
        descricao={`Budget de mídia paga ${mes.label} · ${Math.round(pctMes * 100)}% do mês${mes.budgetSplit ? '' : ' · budget unificado'}`}
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

                {mes.budgetSplit ? (
                  <>
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
                  </>
                ) : (
                  <>
                    {/* Barra única — pace total */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 600 }}>Budget total</span>
                        <span style={{ color: 'var(--ws-text-primary)' }}>
                          {fmtR(b.spendTotal)} <span style={{ color: 'var(--ws-text-secondary)' }}>/ {fmtR(budgetTot)}</span>
                        </span>
                      </div>
                      <MiniBar pct={pctTot} status={b.iSt} goalPct={pctMes * 100} />
                      <div style={{ fontSize: 10, color: STC[b.iSt], fontWeight: 600, marginTop: 2 }}>
                        {pctTot.toFixed(0)}% do budget · linha branca = meta do mês
                      </div>
                    </div>

                    {/* Split informativo (só realizado) */}
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--ws-text-secondary)', fontSize: 10 }}>Google (realizado)</div>
                        <div style={{ color: 'var(--ws-text-primary)', fontWeight: 600 }}>{fmtR(b.spendGoogle)}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--ws-text-secondary)', fontSize: 10 }}>Meta Ads (realizado)</div>
                        <div style={{ color: 'var(--ws-text-primary)', fontWeight: 600 }}>{fmtR(b.spendMeta)}</div>
                      </div>
                    </div>
                  </>
                )}

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
