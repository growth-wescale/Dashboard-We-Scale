import { useMemo } from 'react'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'

// Etapas do funil (topo → base). "R1 realizada" = data_diagnostico.
const STAGES = [
  { key: 'venda',        label: 'Vendas',        short: 'Vendas', dateField: 'data_venda' },
  { key: 'oportunidade', label: 'Oportunidades', short: 'Opp',    dateField: 'data_oportunidade' },
  { key: 'sal',          label: 'SAL',           short: 'SAL',    dateField: 'data_sal' },
  { key: 'diagnostico',  label: 'R1 (Diag.)',    short: 'R1',     dateField: 'data_diagnostico' },
  { key: 'sql',          label: 'SQL',           short: 'SQL',    dateField: 'data_sql' },
  { key: 'mql',          label: 'MQL',           short: 'MQL',    dateField: 'data_mql' },
] as const

type StageKey = typeof STAGES[number]['key']

interface StageResult {
  key: StageKey
  label: string
  needed: number | null   // quantos preciso pra bater a meta
  actual: number          // realizado no período
  isTarget: boolean       // linha da meta (topo)
}

interface Props {
  histData: VwMarketingFunil[]      // histórico completo (calcula taxas)
  actualData: VwMarketingFunil[]    // dados do período (calcula realizado)
  meta: number | null               // meta do período (mês ou semana)
  pctPeriod: number                 // 0..1 (para linha de ritmo)
  unit: 'one' | 'target'            // 'one' = mostra o que precisa pra 1 venda
  periodLabel: string               // "semana" ou "mês" (texto no header)
  accent?: string
}

export function InverseFunnel({
  histData, actualData, meta, pctPeriod, unit, periodLabel, accent = '#7F0C72',
}: Props) {
  const effectiveMeta = unit === 'one' ? 1 : meta

  const { rows, histTotals, hasHistorico } = useMemo(() => {
    // Contagens históricas (base pras taxas)
    const hist: Record<StageKey, number> = {} as Record<StageKey, number>
    // Contagens do período (realizado)
    const actual: Record<StageKey, number> = {} as Record<StageKey, number>

    for (const s of STAGES) {
      const field = s.dateField as keyof VwMarketingFunil
      hist[s.key] = histData.filter(d => d[field] != null).length
      actual[s.key] = actualData.filter(d => d[field] != null).length
    }

    const rows: StageResult[] = []
    let currentNeeded: number | null = effectiveMeta

    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i]
      rows.push({
        key: stage.key,
        label: stage.label,
        needed: currentNeeded,
        actual: actual[stage.key],
        isTarget: i === 0,
      })
      if (i < STAGES.length - 1) {
        const upperCount = hist[stage.key]
        const lowerCount = hist[STAGES[i + 1].key]
        const taxa = lowerCount > 0 ? upperCount / lowerCount : 0
        if (currentNeeded === null || taxa === 0) currentNeeded = null
        else currentNeeded = currentNeeded / taxa
      }
    }

    return {
      rows,
      histTotals: hist,
      hasHistorico: hist.venda > 0 || hist.oportunidade > 0,
    }
  }, [histData, actualData, effectiveMeta])

  // Taxas históricas entre stages consecutivos (upper/lower)
  const rates = useMemo(() => {
    const out: (number | null)[] = []
    for (let i = 0; i < STAGES.length - 1; i++) {
      const upper = histTotals[STAGES[i].key]
      const lower = histTotals[STAGES[i + 1].key]
      out.push(lower > 0 ? upper / lower : null)
    }
    return out
  }, [histTotals])

  if (effectiveMeta === null) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
        Sem meta de venda cadastrada
      </div>
    )
  }

  if (!hasHistorico) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 12 }}>
        Sem histórico de conversão suficiente para projetar o funil desta marca
      </div>
    )
  }

  const mqlRow = rows.find(r => r.key === 'mql')
  const mqlPorObjetivo = mqlRow?.needed != null && effectiveMeta > 0 ? mqlRow.needed / effectiveMeta : null
  const isUnit = unit === 'one'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%', fontSize: 12, color: '#334155' }}>
      {/* Header meta */}
      <div style={{
        padding: '8px 10px',
        background: accent,
        color: '#fff',
        borderRadius: 6,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
            {isUnit ? `Unit economics · 1 venda (${periodLabel})` : `Meta de vendas · ${periodLabel}`}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
            {effectiveMeta}
          </span>
        </div>
        <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
          {isUnit
            ? <>Volumes abaixo = <strong>necessário pra fechar 1 venda</strong></>
            : <>Volumes abaixo = <strong>necessário pra bater {effectiveMeta} venda{effectiveMeta === 1 ? '' : 's'}</strong></>
          }
          {mqlPorObjetivo !== null && <> · ~{formatN(mqlPorObjetivo)} MQL por venda</>}
        </div>
      </div>

      {/* Linhas do funil com taxa entre elas */}
      {rows.map((r, idx) => {
        const needed = r.needed
        const noProjection = needed === null || needed === 0
        const progressPct = noProjection ? 0 : Math.min(200, (r.actual / needed) * 100)
        const expectedPct = pctPeriod * 100
        const ratio = noProjection ? 0 : (r.actual / needed) / Math.max(pctPeriod, 0.01)
        const color = isUnit
          ? '#475569'
          : ratio >= 1 ? '#16a34a' : ratio >= 0.7 ? '#eab308' : '#dc2626'
        const rateBelow = idx < STAGES.length - 1 ? rates[idx] : null

        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '68px 1fr 74px',
              gap: 8,
              alignItems: 'center',
              padding: '5px 8px',
              background: r.isTarget ? '#fef3c7' : '#f8fafc',
              border: `1px solid ${r.isTarget ? '#fbbf24' : '#e2e8f0'}`,
              borderRadius: 6,
            }}>
              {/* Nome da etapa */}
              <span style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>
                {r.label}
              </span>

              {/* Barra de progresso */}
              <div style={{ position: 'relative', height: 14, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, progressPct)}%`,
                  background: color,
                  transition: 'width .3s',
                }} />
                {/* Linha do ritmo esperado (só quando não é unit economics) */}
                {!isUnit && !noProjection && expectedPct < 100 && progressPct < 100 && (
                  <div style={{
                    position: 'absolute', left: `${expectedPct}%`, top: -1, bottom: -1,
                    width: 2, background: '#0f172a', opacity: 0.5,
                  }} />
                )}
                {/* Texto sobre a barra */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: progressPct > 50 ? '#fff' : '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.actual} de {noProjection ? '—' : formatN(r.needed!)}
                </div>
              </div>

              {/* % */}
              <span style={{
                textAlign: 'right', fontSize: 10, fontWeight: 700,
                color: noProjection ? '#94a3b8' : color,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {noProjection ? 'sem hist' : `${progressPct.toFixed(0)}%`}
              </span>
            </div>

            {/* Taxa histórica entre este stage e o próximo */}
            {rateBelow !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingLeft: 68 + 8, paddingRight: 8,
                fontSize: 9.5, color: '#64748b',
              }}>
                <div style={{ flex: 0, color: '#cbd5e1', fontSize: 10, lineHeight: 1 }}>▲</div>
                <div style={{
                  flex: 0, padding: '1px 6px', borderRadius: 8,
                  background: '#eef2f7', border: '1px solid #e2e8f0',
                  fontSize: 9.5, fontWeight: 700, color: '#334155',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {(rateBelow * 100).toFixed(1)}%
                </div>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <div style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
                  taxa {STAGES[idx].short} / {STAGES[idx + 1].short}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Legenda enxuta */}
      <div style={{ marginTop: 4, padding: '5px 8px', background: '#f1f5f9', borderRadius: 6, fontSize: 9, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {isUnit ? (
          <span>Valores derivados das taxas históricas de conversão · não segue ritmo de meta</span>
        ) : (
          <>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#16a34a', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} /> no ritmo</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#eab308', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} /> atenção</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#dc2626', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} /> atrasado</span>
            <span>│ ritmo esperado ({(pctPeriod * 100).toFixed(0)}% do {periodLabel})</span>
          </>
        )}
      </div>
    </div>
  )
}

function formatN(n: number): string {
  if (n < 10) return n.toFixed(1)
  if (n < 1000) return Math.round(n).toString()
  return `${(n / 1000).toFixed(1)}k`
}
