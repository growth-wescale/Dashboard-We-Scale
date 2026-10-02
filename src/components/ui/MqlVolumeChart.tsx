import { useId, useMemo, useRef, useState, useEffect } from 'react'
import { buildMqlVolume, resolveMqlChartBrands, MQL_CHART_BRANDS, FOLLOW_PAGE, ALL_BRANDS } from '@/lib/mqlVolume'
import { todayLocal } from '@/lib/dateUtils'
import { nf, money, moneyK } from '@/lib/format'
import type { Lead, MediaDailyRaw } from '@/lib/types'

interface Props {
  media: MediaDailyRaw[]
  leads: Lead[]
  range: { start: string; end: string }
  pageBrandKeys: string[]
  allowedBrandKeys: string[] | null
  loading?: boolean
  error?: string | null
}

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`
const fullDate = (date: string) => `${shortDate(date)}/${date.slice(0, 4)}`
const costColor = 'var(--mql-cost-color, #178B83)'

/** Dados de Marketing já carregados pela página; não abre novas consultas. */
export function MqlVolumeChart({ media, leads, range, pageBrandKeys, allowedBrandKeys, loading, error }: Props) {
  const [selection, setSelection] = useState(FOLLOW_PAGE)
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const [width, setWidth] = useState(900)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  const today = todayLocal()
  const allowed = useMemo(() => MQL_CHART_BRANDS.filter(b => allowedBrandKeys === null || allowedBrandKeys.includes(b.key)), [allowedBrandKeys])
  const keys = useMemo(() => resolveMqlChartBrands(selection, pageBrandKeys, allowed.map(b => b.key)), [selection, pageBrandKeys, allowed])
  const data = useMemo(() => buildMqlVolume(media, leads, keys, range, today), [media, leads, keys, range, today])
  const scope = keys.length === 0 ? 'Nenhuma marca disponível'
    : keys.length === 1 ? allowed.find(b => b.key === keys[0])!.label
    : keys.length === allowed.length ? (allowedBrandKeys === null ? 'Todas as marcas' : 'Todas as marcas permitidas')
    : allowed.filter(b => keys.includes(b.key)).map(b => b.label).join(' + ')

  useEffect(() => {
    const element = wrap.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const W = width, H = 320, left = 48, right = 78, top = 30, bottom = 34
  const iw = W - left - right, ih = H - top - bottom
  const count = data.days.length
  const maxMql = Math.max(4, Math.ceil(Math.max(0, ...data.days.map(d => d.mql)) / 4) * 4)
  const maxCost = Math.max(4, Math.ceil(Math.max(0, ...data.days.map(d => d.cpmql ?? 0)) / 4) * 4)
  const x = (i: number) => left + (i + .5) * iw / Math.max(1, count)
  const yMql = (v: number) => top + ih * (1 - v / maxMql)
  const yCost = (v: number) => top + ih * (1 - v / maxCost)
  const barWidth = Math.min(42, iw / Math.max(1, count) * .64)
  const selectedIndex = activeDay === null ? null : Math.min(activeDay, count - 1)
  const selected = selectedIndex !== null ? data.days[selectedIndex] : undefined
  const tickStep = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(iw / 90))))
  const ticks = data.days.map((_, i) => i).filter(i => i % tickStep === 0 && i < count - Math.max(1, tickStep / 2))
  if (count) ticks.push(count - 1)
  let continuous = false
  const path = data.days.map((day, i) => {
    if (day.cpmql === null) { continuous = false; return '' }
    const command = continuous ? 'L' : 'M'
    continuous = true
    return `${command}${x(i)},${yCost(day.cpmql)}`
  }).join(' ')
  const hasData = data.mql > 0 || data.investment > 0

  return <section aria-labelledby={`${id}-title`} aria-busy={loading} style={{
    marginTop: 32, padding: 24, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16 }}>
      <div>
        <h2 id={`${id}-title`} style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21 }}>Volume de MQL e CP-MQL</h2>
        <p style={{ marginTop: 4, color: 'var(--ws-text-secondary)', fontSize: 12 }}>
          {scope} · {count ? `${fullDate(data.days[0].date)} a ${fullDate(data.days[count - 1].date)}` : 'Sem período válido'} · Valores diários
        </p>
      </div>
      <label style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--ws-text-secondary)', maxWidth: '100%' }}>
        Marca no gráfico
        <select value={selection} onChange={e => { setSelection(e.target.value); setActiveDay(null) }}
          style={{ maxWidth: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--ws-border-strong)',
            background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
          <option value={FOLLOW_PAGE}>Acompanhar filtro da página</option>
          <option value={ALL_BRANDS}>{allowedBrandKeys === null ? 'Todas as marcas' : 'Todas as marcas permitidas'}</option>
          {allowed.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </label>
    </div>

    <div ref={wrap} style={{ marginTop: 24 }}>
      {loading ? <p role="status">Carregando MQLs e investimento…</p>
        : error ? <p role="alert">Não foi possível carregar os dados do gráfico. Tente atualizar a página.</p>
        : <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 40px', alignItems: 'end', marginBottom: 18 }}>
            <div><div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>MQLs no período</div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>{nf(data.mql)}</strong></div>
            <div><div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>CP-MQL do período</div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>{data.cpmql === null ? '—' : money(data.cpmql)}</strong></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginLeft: 'auto', fontSize: 12 }}>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 6, borderRadius: 2, background: 'var(--brand-accent)' }} />MQLs por dia</span>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 18, borderTop: `3px solid ${costColor}`, marginRight: 6, verticalAlign: 'middle' }} />CP-MQL por dia</span>
            </div>
          </div>
          {!count || !keys.length ? <p role="status">Nenhum dado disponível para esta seleção.</p>
            : !hasData ? <p role="status" style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Sem MQLs ou investimento no período selecionado.</p>
            : <>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} tabIndex={0} role="img"
                aria-label={`MQLs e CP-MQL por dia: ${scope}. Use as setas esquerda e direita para consultar os dias.`}
                aria-describedby={`${id}-detail`} style={{ display: 'block', cursor: 'crosshair' }}
                onPointerMove={event => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setActiveDay(Math.max(0, Math.min(count - 1, Math.floor(((event.clientX - rect.left) * W / rect.width - left) / iw * count))))
                }}
                onPointerLeave={() => setActiveDay(null)}
                onFocus={() => setActiveDay(i => i ?? 0)}
                onBlur={() => setActiveDay(null)}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  setActiveDay(i => event.key === 'Home' ? 0 : event.key === 'End' ? count - 1
                    : Math.max(0, Math.min(count - 1, (i ?? 0) + (event.key === 'ArrowRight' ? 1 : -1))))
                }}>
                <text x={left} y={14} fontSize={11} fill="var(--ws-text-secondary)">MQLs</text>
                <text x={W - right} y={14} textAnchor="end" fontSize={11} fill={costColor}>CP-MQL (R$)</text>
                {[0, 1, 2, 3, 4].map(tick => <g key={tick}>
                  <line x1={left} x2={W - right} y1={yMql(maxMql * tick / 4)} y2={yMql(maxMql * tick / 4)} stroke="var(--ws-border)" />
                  <text x={left - 10} y={yMql(maxMql * tick / 4) + 4} textAnchor="end" fontSize={11} fill="var(--ws-text-secondary)">{nf(maxMql * tick / 4)}</text>
                  <text x={W - right + 10} y={yMql(maxMql * tick / 4) + 4} fontSize={11} fill="var(--ws-text-secondary)">{moneyK(maxCost * tick / 4)}</text>
                </g>)}
                {selectedIndex !== null && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={top + ih} stroke="var(--ws-text-secondary)" strokeDasharray="3 4" />}
                {data.days.map((day, i) => <rect key={day.date} x={x(i) - barWidth / 2} y={yMql(day.mql)}
                  width={barWidth} height={top + ih - yMql(day.mql)} rx={Math.min(3, barWidth / 4)}
                  fill="var(--brand-accent)" opacity={selectedIndex === null || selectedIndex === i ? .9 : .5} />)}
                <path d={path} fill="none" stroke={costColor} strokeWidth={2.5} strokeLinejoin="round" />
                {data.days.map((day, i) => day.cpmql !== null && <circle key={day.date} cx={x(i)} cy={yCost(day.cpmql)}
                  r={selectedIndex === i ? 5 : count > 90 ? 1.5 : 3} fill={costColor} stroke="var(--ws-surface)" strokeWidth={1.5} />)}
                {ticks.map(i => <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--ws-text-secondary)">{shortDate(data.days[i].date)}</text>)}
              </svg>
              <div id={`${id}-detail`} aria-live="polite" style={{ minHeight: 46, padding: '12px 0', fontSize: 12,
                display: 'flex', flexWrap: 'wrap', gap: '6px 20px', borderTop: '1px solid var(--ws-border)', color: 'var(--ws-text-secondary)' }}>
                {selected ? <>
                  <strong style={{ color: 'var(--ws-text-primary)' }}>{fullDate(selected.date)}</strong>
                  <span>MQLs: <b>{nf(selected.mql)}</b></span>
                  <span>CP-MQL: <b>{selected.cpmql === null ? '— (sem MQL)' : money(selected.cpmql)}</b></span>
                  <span>Investimento: <b>{money(selected.investment)}</b></span>
                </> : 'Passe sobre o gráfico, toque ou use as setas do teclado para consultar cada dia.'}
              </div>
            </>}
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--ws-text-secondary)', lineHeight: 1.6 }}>
            CP-MQL = investimento ÷ MQLs. Dias sem MQL ficam sem ponto na linha; o custo do período usa os totais, não a média dos dias.
            {' '}O seletor deste gráfico não altera os outros indicadores. O filtro de fonte da página atua apenas nos dados comerciais.
          </p>
        </>}
    </div>
  </section>
}
