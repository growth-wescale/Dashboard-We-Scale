import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { useMarcaSelecionada } from '@/components/AppLayout'
import { useAllBrandsMqlPacing, type PacingData, type DayCount } from '@/hooks/useMqlPacing'
import { SLUG_TO_MARCA } from '@/lib/dateUtils'

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthLabel(today: Date): string {
  return today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

function fmt1(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

// ── Bar chart component ───────────────────────────────────────────────────────
export function PacingChart({ daily, daysInMonth, dailyTarget, necessarioDia }: {
  daily: DayCount[]
  daysInMonth: number
  dailyTarget: number
  necessarioDia: number
}) {
  const W = 760, H = 200
  const padL = 32, padR = 20, padT = 28, padB = 32
  const iw = W - padL - padR, ih = H - padT - padB

  const dayMap = new Map(daily.map(d => [d.day, d.count]))
  const maxCount = Math.max(1, ...daily.map(d => d.count), Math.ceil(necessarioDia) + 1)
  const yMax = Math.ceil(maxCount * 1.2)

  const colW = iw / daysInMonth
  const barW = Math.max(4, colW * 0.6)
  const xs = (day: number) => padL + (day - 0.5) * colW
  const ys = (v: number) => padT + ih - (v / yMax) * ih

  // Y gridlines at nice intervals
  const yStep = yMax <= 4 ? 1 : yMax <= 8 ? 2 : Math.ceil(yMax / 4)
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep)

  // X labels — odd days only
  const xLabels = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => d % 2 === 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={padL} y1={ys(v)} x2={padL + iw} y2={ys(v)}
            stroke="var(--ws-border)" strokeWidth={0.6} strokeDasharray="3 4" />
          <text x={padL - 5} y={ys(v)} textAnchor="end" dominantBaseline="middle"
            fontSize={9} fill="var(--ws-text-secondary)">{v}</text>
        </g>
      ))}

      {/* Linear target line (blue dashed) */}
      <line x1={padL} y1={ys(dailyTarget)} x2={padL + iw} y2={ys(dailyTarget)}
        stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={padL + iw + 4} y={ys(dailyTarget)} dominantBaseline="middle"
        fontSize={9} fill="#3b82f6" fontWeight={600}>
        linear {fmt1(dailyTarget)}/dia
      </text>

      {/* Necessário line (red dashed) */}
      {necessarioDia > 0 && necessarioDia !== dailyTarget && (
        <>
          <line x1={padL} y1={ys(necessarioDia)} x2={padL + iw} y2={ys(necessarioDia)}
            stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 4" />
          <text x={padL + iw + 4} y={ys(necessarioDia)} dominantBaseline="middle"
            fontSize={9} fill="#ef4444" fontWeight={600}>
            necessário {fmt1(necessarioDia)}/dia
          </text>
        </>
      )}

      {/* Bars */}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
        const count = dayMap.get(day) ?? 0
        const x = xs(day)
        const barH = (count / yMax) * ih
        const barY = padT + ih - barH
        const isToday = day === new Date().getDate()
        return (
          <g key={day}>
            {count > 0 && (
              <>
                <rect
                  x={x - barW / 2} y={barY} width={barW} height={Math.max(barH, 1)}
                  fill="var(--brand-accent)" fillOpacity={isToday ? 1 : 0.75}
                  rx={2}
                />
                {barH > 14 ? (
                  <text x={x} y={barY + 10} textAnchor="middle"
                    fontSize={9} fontWeight={700} fill="#fff">{count}</text>
                ) : (
                  <text x={x} y={barY - 4} textAnchor="middle"
                    fontSize={9} fontWeight={700} fill="var(--ws-text-primary)">{count}</text>
                )}
              </>
            )}
          </g>
        )
      })}

      {/* X axis */}
      <line x1={padL} y1={padT + ih} x2={padL + iw} y2={padT + ih}
        stroke="var(--ws-border)" strokeWidth={1} />
      {xLabels.map(day => (
        <text key={day} x={xs(day)} y={padT + ih + 14} textAnchor="middle"
          fontSize={9} fill="var(--ws-text-secondary)">
          {String(day).padStart(2, '0')}
        </text>
      ))}
    </svg>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
export function KTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 12, boxShadow: 'var(--shadow-sm)', padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ── Pct badge ─────────────────────────────────────────────────────────────────
export function PctBadge({ pct }: { pct: number }) {
  const good = pct >= 95
  const color = good ? 'var(--status-positivo)' : 'var(--status-atencao)'
  const arrow = good ? '↗' : '↘'
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, color,
      display: 'inline-flex', alignItems: 'center', gap: 2,
    }}>
      {arrow} {fmtInt(pct)}% do esperado
    </span>
  )
}

// ── Block 1: selected brand ───────────────────────────────────────────────────
export function PacingCard({ d, onTargetChange, today }: {
  d: PacingData
  onTargetChange: (v: number) => void
  today: Date
}) {
  const monthStr = monthLabel(today)
  const ancoraLow = d.ancora.toLowerCase()

  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 16, boxShadow: 'var(--shadow-sm)', padding: '24px 28px', marginBottom: 32,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Target size={16} color="var(--ws-text-secondary)" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>
              Pacing de MQL — {d.marca}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
            {monthStr} · {d.daysElapsed}/{d.daysInMonth} dias decorridos
            {d.hasBaseline && (
              <> · histórico: <b style={{ color: 'var(--ws-text-primary)' }}>{fmt1(d.mqlPorUnidade)}</b> MQL/{ancoraLow}</>
            )}
          </div>
        </div>

        {/* Meta input (unidades da âncora) + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {d.hasBaseline && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 4 }}>
                Meta de {ancoraLow}/mês
              </div>
              <input
                type="number" min={1} step={1}
                value={d.targetUnits > 0 ? d.targetUnits : ''}
                placeholder="—"
                onChange={e => {
                  const v = parseInt(e.target.value)
                  onTargetChange(isNaN(v) || v < 1 ? 0 : v)
                }}
                style={{
                  width: 72, padding: '6px 10px', borderRadius: 8, textAlign: 'center',
                  border: '1px solid var(--ws-border)', background: 'var(--ws-bg)',
                  color: 'var(--ws-text-primary)', fontFamily: 'var(--font-display)',
                  fontWeight: 700, fontSize: 16, outline: 'none',
                }}
              />
              {d.hasTarget && (
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 4, textAlign: 'center' }}>
                  → {fmtInt(d.monthlyTarget)} MQLs
                </div>
              )}
            </div>
          )}
          {d.hasTarget && <PctBadge pct={d.pctVsExpected} />}
        </div>
      </div>

      {!d.hasBaseline ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ws-text-secondary)', fontSize: 14 }}>
          Sem baseline histórica para {d.marca}.
        </div>
      ) : (
        <>
          {/* KPI tiles — sempre visíveis */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <KTile
              label="MQLs no mês (MTD)"
              value={String(d.mtdMqls)}
              sub={d.hasTarget ? `de ${fmtInt(d.monthlyTarget)} necessários` : `${d.daysElapsed} dias decorridos`}
            />
            <KTile
              label={`Projeção de ${d.ancora}s`}
              value={fmt1(d.projectedAncora)}
              sub={`${fmtInt(d.projected)} MQLs projetados`}
            />
            <KTile
              label="Ritmo atual (MQL/dia)"
              value={fmt1(d.avgPerDay)}
              sub={d.hasTarget ? `meta ${fmt1(d.dailyTarget)}/dia` : `média do período`}
            />
            {d.hasTarget ? (
              <KTile
                label="Necessário/dia restante"
                value={fmt1(d.necessarioDia)}
                sub={`${fmtInt(d.monthlyTarget - d.mtdMqls)} MQL em ${d.daysRemaining}d`}
              />
            ) : (
              <KTile
                label="MQLs projetados no mês"
                value={String(d.projected)}
                sub={`ao ritmo atual de ${fmt1(d.avgPerDay)}/dia`}
              />
            )}
          </div>

          {/* Chart */}
          <div style={{ marginBottom: 16 }}>
            <PacingChart
              daily={d.dailyMqls}
              daysInMonth={d.daysInMonth}
              dailyTarget={d.hasTarget ? d.dailyTarget : 0}
              necessarioDia={d.hasTarget ? d.necessarioDia : 0}
            />
          </div>

          {/* Footer */}
          <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ opacity: 0.6 }}>⊞</span>
            Projeção baseada no ratio histórico: {fmt1(d.mqlPorUnidade)} MQL por {ancoraLow}.
            {d.hasTarget && <> Linha azul = meta linear. Linha vermelha = ritmo necessário para fechar a meta.</>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Block 2: mini-card ────────────────────────────────────────────────────────
export function MiniCard({ d }: { d: PacingData }) {
  const pct = d.pctVsExpected
  const good = pct >= 95
  const color = good ? 'var(--status-positivo)' : 'var(--status-atencao)'
  const arrow = good ? '↗' : '↘'

  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 12, boxShadow: 'var(--shadow-sm)', padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>{d.marca}</span>
        {d.hasTarget && (
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{arrow} {fmtInt(pct)}%</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 4 }}>
            MQL MTD
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
            {d.mtdMqls}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 4 }}>
            {d.hasBaseline ? `Proj. ${d.ancora}` : 'Proj. MQL'}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
            {d.hasBaseline ? fmt1(d.projectedAncora) : d.projected}
          </div>
        </div>
      </div>

      {d.hasBaseline && (
        <div style={{ marginBottom: 10 }}>
          <PacingChart
            daily={d.dailyMqls}
            daysInMonth={d.daysInMonth}
            dailyTarget={d.hasTarget ? d.dailyTarget : 0}
            necessarioDia={d.hasTarget ? d.necessarioDia : 0}
          />
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        {d.hasBaseline ? (
          <>
            {fmt1(d.mqlPorUnidade)} MQL/{d.ancora.toLowerCase()}
            {d.hasTarget && (
              <> · meta: <b style={{ color: 'var(--ws-text-primary)' }}>{d.targetUnits} {d.ancora.toLowerCase()}</b></>
            )}
          </>
        ) : (
          <span style={{ fontStyle: 'italic' }}>Sem baseline histórica</span>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Pacing() {
  const { activeBrand } = useMarcaSelecionada()
  const today = useMemo(() => new Date(), [])

  const { data, loading, error, setTarget } = useAllBrandsMqlPacing()

  const selectedMarca = SLUG_TO_MARCA[activeBrand] ?? 'Oral Unic'
  const selectedData = data.find(d => d.marca === selectedMarca)

  const monthStr = monthLabel(today)

  return (
    <div style={{ padding: 'var(--container-pad)' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, margin: 0, lineHeight: 1.2 }}>
          Pacing de MQL
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          {monthStr} · {today.getDate()}/{new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()} dias
        </p>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', marginBottom: 20, fontSize: 13 }}>
          Erro ao carregar dados: {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ws-text-secondary)', fontSize: 14 }}>
          Carregando dados de pacing…
        </div>
      ) : (
        <>
          {selectedData ? (
            <PacingCard
              d={selectedData}
              onTargetChange={v => setTarget(selectedMarca, v)}
              today={today}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ws-text-secondary)', fontSize: 14, marginBottom: 32 }}>
              Selecione uma marca no menu lateral.
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 4 }}>
              Todas as marcas
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {data.map(d => <MiniCard key={d.marca} d={d} />)}
          </div>
        </>
      )}
    </div>
  )
}
