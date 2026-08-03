import { useState, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'

const STAGE_RANK: Record<string, number> = {
  'Novos Leads': 0,
  'Tentando Contato': 1,
  'Tentando Contato (Cadência)': 1,
  'Interesse Reunião': 2,
  'Conexão': 2,
  'Contato Efetivo': 3,
  'No Show': 4,
  'Reunião Agendada SQL': 5,
  'Diagnóstico': 6,
  'Diagnóstico (1 dia)': 6,
  'Negociação SAL': 7,
  'Negociação SAL (7 dias)': 7,
  'Oportunidade COF': 8,
  'Oportunidade COF (7 dias)': 8,
  'Comitê': 9,
  'Comitê (5 dias)': 9,
  'Pré Contrato': 10,
  'Pré Contrato (5 dias)': 10,
  'Documentação': 11,
}

const SDR_MAX_RANK = 5

const AGING_BUCKETS = [
  { label: '0–7d',   max: 7 },
  { label: '8–14d',  max: 14 },
  { label: '15–30d', max: 30 },
  { label: '31–60d', max: 60 },
  { label: '61–90d', max: 90 },
  { label: '90+d',   max: Infinity },
]

const MIN_R = 6
const MAX_R = 22
const PAD_LEFT   = 155
const PAD_TOP    = 38
const PAD_RIGHT  = 12
const PAD_BOTTOM = 12
const CELL_W     = 66
const CELL_H     = 48

function bucketIdx(days: number): number {
  for (let i = 0; i < AGING_BUCKETS.length - 1; i++) {
    if (days <= AGING_BUCKETS[i].max) return i
  }
  return AGING_BUCKETS.length - 1
}

function med(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function stageDateStr(r: VwMarketingFunil, stage: string): string | null {
  const s = stage.toLowerCase()
  if (s.includes('diagnós'))           return r.data_diagnostico ?? r.data_sql ?? r.data_mql ?? r.data_criacao_negociacao
  if (s.includes('sal') || s.includes('oportunidade') || s.includes('comitê') || s.includes('pré contrato') || s.includes('pre contrato'))
                                        return r.data_sal ?? r.data_sql ?? r.data_mql ?? r.data_criacao_negociacao
  if (s.includes('documentação'))      return r.data_oportunidade ?? r.data_sal ?? r.data_criacao_negociacao
  if (s.includes('reunião'))           return r.data_sql ?? r.data_mql ?? r.data_criacao_negociacao
  if (s.includes('no show'))           return r.data_no_show ?? r.data_sql ?? r.data_mql ?? r.data_criacao_negociacao
  if (s.includes('contato efetivo'))   return r.data_contato_efetivo ?? r.data_mql ?? r.data_criacao_negociacao
  return r.data_tentando_contato ?? r.data_mql ?? r.data_criacao_negociacao
}

interface BubbleData {
  stage: string
  stageIdx: number
  bucketIdx: number
  bucket: string
  count: number
  avgAging: number
  medianAging: number
  pctOfStage: number
  valorTotal: number
}

interface Props {
  crmData: VwMarketingFunil[]
  crmAllData: VwMarketingFunil[]
}

const selectStyle: CSSProperties = {
  background: 'var(--ws-bg)',
  border: '1px solid var(--ws-border)',
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  color: 'var(--ws-text-primary)',
  cursor: 'pointer',
  outline: 'none',
  maxWidth: 200,
}

const fmt   = (n: number) => Math.round(n).toLocaleString('pt-BR')
const money = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')

type FunilTab = 'SDR' | 'Closer'

export function BubbleMatrix({ crmAllData }: Props) {
  const [filterFunil,    setFilterFunil]    = useState<FunilTab>('SDR')
  const [filterFonte,    setFilterFonte]    = useState('__all__')
  const [filterCampanha, setFilterCampanha] = useState('__all__')
  const [hovered, setHovered] = useState<BubbleData | null>(null)
  const [mouse,   setMouse]   = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => new Date(), [])

  const fontes = useMemo(() => {
    const s = new Set<string>()
    for (const r of crmAllData) if (r.fonte_macro) s.add(r.fonte_macro)
    return Array.from(s).sort()
  }, [crmAllData])

  const campanhas = useMemo(() => {
    const s = new Set<string>()
    for (const r of crmAllData) if (r.utm_campaign) s.add(r.utm_campaign)
    return Array.from(s).sort()
  }, [crmAllData])

  const stageList = useMemo(() => {
    const seen = new Set<string>()
    for (const r of crmAllData) {
      if (r.status_atual === 'Em andamento' && r.etapa_funil) seen.add(r.etapa_funil)
    }
    return Array.from(seen)
      .filter(s => {
        const rank = STAGE_RANK[s] ?? 99
        return filterFunil === 'SDR' ? rank <= SDR_MAX_RANK : rank > SDR_MAX_RANK
      })
      .sort((a, b) => {
        const ra = STAGE_RANK[a] ?? 99
        const rb = STAGE_RANK[b] ?? 99
        return ra !== rb ? ra - rb : a.localeCompare(b)
      })
  }, [crmAllData, filterFunil])

  const bubbles = useMemo<BubbleData[]>(() => {
    let rows = crmAllData.filter(r => r.status_atual === 'Em andamento' && r.etapa_funil != null)

    if (filterFonte    !== '__all__') rows = rows.filter(r => r.fonte_macro  === filterFonte)
    if (filterCampanha !== '__all__') rows = rows.filter(r => r.utm_campaign === filterCampanha)

    // only stages in current tab
    const stageSet = new Set(stageList)
    rows = rows.filter(r => stageSet.has(r.etapa_funil!))

    const totalByStage: Record<string, number> = {}
    for (const r of rows) totalByStage[r.etapa_funil!] = (totalByStage[r.etapa_funil!] ?? 0) + 1

    const groups = new Map<string, { stage: string; bidx: number; ages: number[]; valor: number }>()
    for (const r of rows) {
      const stage   = r.etapa_funil!
      const dateStr = stageDateStr(r, stage) ?? r.data_criacao_negociacao
      if (!dateStr) continue
      const days = Math.max(0, Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86_400_000))
      const bidx = bucketIdx(days)
      const key  = `${stage}|${bidx}`
      if (!groups.has(key)) groups.set(key, { stage, bidx, ages: [], valor: 0 })
      const g = groups.get(key)!
      g.ages.push(days)
      g.valor += r.valor_contrato ?? 0
    }

    const result: BubbleData[] = []
    for (const g of groups.values()) {
      const count = g.ages.length
      const avg   = count > 0 ? g.ages.reduce((a, b) => a + b, 0) / count : 0
      result.push({
        stage:       g.stage,
        stageIdx:    stageList.indexOf(g.stage),
        bucketIdx:   g.bidx,
        bucket:      AGING_BUCKETS[g.bidx].label,
        count,
        avgAging:    avg,
        medianAging: med(g.ages),
        pctOfStage:  totalByStage[g.stage] > 0 ? (count / totalByStage[g.stage]) * 100 : 0,
        valorTotal:  g.valor,
      })
    }

    return result
  }, [crmAllData, filterFonte, filterCampanha, today, stageList])

  const svgW = PAD_LEFT + AGING_BUCKETS.length * CELL_W + PAD_RIGHT
  const svgH = PAD_TOP + stageList.length * CELL_H + PAD_BOTTOM

  const maxCount = useMemo(() => Math.max(1, ...bubbles.map(b => b.count)), [bubbles])
  const r  = (count: number) => MIN_R + (MAX_R - MIN_R) * Math.sqrt(count / maxCount)
  const cx = (bi: number)    => PAD_LEFT + bi * CELL_W + CELL_W / 2
  const cy = (si: number)    => PAD_TOP  + si * CELL_H + CELL_H / 2

  const hasData = bubbles.length > 0

  const tabBase: CSSProperties = {
    padding: '3px 14px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid var(--ws-border)',
    cursor: 'pointer',
    transition: 'background .12s, color .12s, border-color .12s',
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseMove={e => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onMouseLeave={() => { setMouse(null); setHovered(null) }}
    >
      {/* Tabs SDR / Closer + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['SDR', 'Closer'] as FunilTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilterFunil(tab)}
            style={{
              ...tabBase,
              background: filterFunil === tab ? 'var(--brand-accent)' : 'var(--ws-surface)',
              color: filterFunil === tab ? '#fff' : 'var(--ws-text-secondary)',
              borderColor: filterFunil === tab ? 'var(--brand-accent)' : 'var(--ws-border)',
            }}
          >
            {tab}
          </button>
        ))}

        {fontes.length > 0 && (
          <select value={filterFonte} onChange={e => setFilterFonte(e.target.value)} style={selectStyle}>
            <option value="__all__">Todas as fontes</option>
            {fontes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {campanhas.length > 0 && (
          <select value={filterCampanha} onChange={e => setFilterCampanha(e.target.value)} style={selectStyle}>
            <option value="__all__">Todas as campanhas</option>
            {campanhas.map(c => (
              <option key={c} value={c}>{c.length > 38 ? c.slice(0, 38) + '…' : c}</option>
            ))}
          </select>
        )}
      </div>

      {!hasData ? (
        <div style={{
          height: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ws-text-secondary)', fontSize: 13,
          border: '1px dashed var(--ws-border)', borderRadius: 10,
        }}>
          Nenhum deal em andamento nesta etapa.
        </div>
      ) : (
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          {/* Cell grid */}
          {stageList.map((_, si) =>
            AGING_BUCKETS.map((_, bi) => (
              <rect
                key={`cell-${si}-${bi}`}
                x={PAD_LEFT + bi * CELL_W}
                y={PAD_TOP  + si * CELL_H}
                width={CELL_W}
                height={CELL_H}
                fill={si % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.04)'}
                stroke="var(--ws-border)"
                strokeWidth={0.5}
              />
            ))
          )}

          {/* Y-axis: stage labels */}
          {stageList.map((stage, si) => (
            <text
              key={`yl-${stage}`}
              x={PAD_LEFT - 10}
              y={cy(si)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fontFamily="var(--font-body)"
              fill="var(--ws-text-primary)"
              fontWeight={500}
            >
              {stage.length > 22 ? stage.slice(0, 21) + '…' : stage}
            </text>
          ))}

          {/* X-axis: aging bucket labels */}
          {AGING_BUCKETS.map((b, bi) => (
            <text
              key={`xl-${bi}`}
              x={cx(bi)}
              y={PAD_TOP - 12}
              textAnchor="middle"
              fontSize={11}
              fontFamily="var(--font-body)"
              fill="var(--ws-text-secondary)"
            >
              {b.label}
            </text>
          ))}

          {/* Bubbles */}
          {bubbles.map((b, i) => {
            const radius = r(b.count)
            return (
              <g key={i}>
                <circle
                  cx={cx(b.bucketIdx)}
                  cy={cy(b.stageIdx)}
                  r={radius}
                  fill="var(--brand-accent)"
                  fillOpacity={0.5}
                  stroke="var(--brand-accent)"
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(b)}
                  onMouseLeave={() => setHovered(null)}
                />
                <text
                  x={cx(b.bucketIdx)}
                  y={cy(b.stageIdx)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={radius > 16 ? 11 : 9}
                  fontFamily="var(--font-body)"
                  fontWeight={600}
                  fill="#fff"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {b.count}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {/* Tooltip */}
      {hovered && mouse && (
        <div style={{
          position: 'absolute',
          left: mouse.x + 18,
          top: Math.max(0, mouse.y - 80),
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-border)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 12.5,
          color: 'var(--ws-text-primary)',
          boxShadow: '0 4px 20px rgba(0,0,0,.35)',
          zIndex: 20,
          minWidth: 210,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 7, fontFamily: 'var(--font-display)', fontSize: 13.5 }}>
            {hovered.stage} · {hovered.bucket}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--ws-text-secondary)' }}>
            <span><b style={{ color: 'var(--ws-text-primary)' }}>{fmt(hovered.count)}</b> deal{hovered.count !== 1 ? 's' : ''} aberto{hovered.count !== 1 ? 's' : ''}</span>
            <span>Aging médio: <b style={{ color: 'var(--ws-text-primary)' }}>{fmt(hovered.avgAging)} dias</b></span>
            <span>Aging mediano: <b style={{ color: 'var(--ws-text-primary)' }}>{fmt(hovered.medianAging)} dias</b></span>
            <span>% da etapa: <b style={{ color: 'var(--ws-text-primary)' }}>{hovered.pctOfStage.toFixed(1)}%</b></span>
            {hovered.valorTotal > 0 && (
              <span>Valor potencial: <b style={{ color: 'var(--ws-text-primary)' }}>{money(hovered.valorTotal)}</b></span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
