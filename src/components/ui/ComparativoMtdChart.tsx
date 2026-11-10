import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SCard } from '@/components/ui/v2'
import { monthLabel } from '@/lib/dateUtils'
import { mesesDoComparativo, serieMtd, type ContextoMtd, type MetricaMtd } from '@/lib/mtdSeries'

/**
 * "Comparativo Month-to-Date" da aba Performance — mesmo desenho do gráfico da
 * Visão Geral: o mês de referência (linha cheia) contra os 3 anteriores
 * (tracejados), acumulado dia a dia, com seletor de métrica e Linha × Barras.
 *
 * Cores validadas com o validador de paleta (CVD e visão normal). O mês atual
 * usa a cor da seção (SDR laranja / Closer teal, um tom mais escuro para
 * contraste); os anteriores têm cor fixa, igual nas duas abas.
 */

export interface MetricaOpcao {
  key: MetricaMtd
  label: string
  dinheiro?: boolean
  /** 'menor' = cair é bom (No Show): inverte a cor da variação. */
  polaridade?: 'maior' | 'menor'
}

const CORES_ANTERIORES = ['#6250d6', '#e87ba4', '#2a78d6'] // violeta, magenta, azul

interface Props {
  /** Chave da escolha guardada no navegador ('sdr' | 'closer'). */
  papel: string
  metricas: MetricaOpcao[]
  padrao: MetricaMtd
  ctx: ContextoMtd
  mesRef: string
  diaRef: number
  corAtual: string
  /** Escopo: marcas, origem, pessoas… */
  escopo: string
  fmtNum: (n: number) => string
  fmtDinheiro: (n: number) => string
  loading?: boolean
  /** Observação no rodapé do card (ex.: safra ignorada). */
  nota?: string
}

function lerMetrica(papel: string, metricas: MetricaOpcao[], padrao: MetricaMtd): MetricaMtd {
  try {
    const v = localStorage.getItem(`ws-perf-mtd-metrica:${papel}`)
    if (v && metricas.some(m => m.key === v)) return v as MetricaMtd
  } catch { /* sem storage: usa o padrão */ }
  return padrao
}

/** Passo "redondo" do eixo (1·2·5 × 10ⁿ, até 5 faixas) e o topo logo acima do máximo. */
function escala(max: number): { topo: number; passo: number } {
  if (max <= 0) return { topo: 4, passo: 1 }
  const bruto = max / 5
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = Math.max(1, [1, 2, 5, 10].map(f => f * mag).find(p => p >= bruto) ?? 10 * mag)
  return { topo: Math.max(passo, Math.ceil(max / passo) * passo), passo }
}

export function ComparativoMtdChart({
  papel, metricas, padrao, ctx, mesRef, diaRef, corAtual, escopo, fmtNum, fmtDinheiro, loading, nota,
}: Props) {
  const [metrica, setMetricaState] = useState<MetricaMtd>(() => lerMetrica(papel, metricas, padrao))
  const [tipo, setTipo] = useState<'linha' | 'barras'>('linha')
  const [hoverDia, setHoverDia] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const medir = () => setW(Math.max(260, el.clientWidth))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Troca de aba (SDR ↔ Closer) remonta o componente; aqui só cobre métrica que sumiu da lista.
  useEffect(() => {
    if (!metricas.some(m => m.key === metrica)) setMetricaState(padrao)
  }, [metricas, metrica, padrao])

  const setMetrica = (m: MetricaMtd) => {
    setMetricaState(m)
    try { localStorage.setItem(`ws-perf-mtd-metrica:${papel}`, m) } catch { /* ignora */ }
  }

  const def = metricas.find(m => m.key === metrica) ?? metricas[0]
  const fmt = def.dinheiro ? fmtDinheiro : fmtNum
  const meses = useMemo(() => mesesDoComparativo(mesRef, diaRef), [mesRef, diaRef])
  const dias = meses[0].dias

  const series = useMemo(() => meses.map((m, i) => ({
    mesKey: m.mesKey,
    label: monthLabel(`${m.mesKey}-01`),
    cor: i === 0 ? corAtual : CORES_ANTERIORES[i - 1],
    atual: i === 0,
    data: serieMtd(def.key, m, ctx),
  })), [meses, def.key, ctx, corAtual])

  // O mês de referência sempre aparece; mês anterior zerado não polui o gráfico.
  const visiveis = series.filter(s => s.atual || (s.data.at(-1) ?? 0) > 0)
  const atual = series[0]
  const anterior = series[1]
  const totAtual = atual.data.at(-1) ?? 0
  const totAnterior = anterior?.data.at(-1) ?? 0
  const delta = totAnterior > 0 ? ((totAtual - totAnterior) / totAnterior) * 100 : null

  const diario = (arr: number[]) => arr.map((v, i) => (i === 0 ? v : v - arr[i - 1]))

  // ── Geometria (pixels reais, sem esticar texto) ──
  const H = 230, padR = 12, padT = 10, padB = 26
  const maxV = tipo === 'linha'
    ? Math.max(0, ...visiveis.flatMap(s => s.data))
    : Math.max(0, ...visiveis.flatMap(s => diario(s.data)))
  const { topo, passo } = escala(maxV)
  const ticksY = Array.from({ length: Math.round(topo / passo) + 1 }, (_, k) => k * passo)
  // Margem esquerda do tamanho do maior rótulo do eixo (R$ 400 mil não cabe em 44px).
  const padL = 14 + Math.max(...ticksY.map(v => fmt(v).length)) * 6.6
  const iw = Math.max(10, W - padL - padR), ih = H - padT - padB
  const xLinha = (i: number) => padL + (dias <= 1 ? iw / 2 : (i / (dias - 1)) * iw)
  const y = (v: number) => padT + ih - (v / topo) * ih
  const grupo = iw / Math.max(1, dias)
  const M = visiveis.length
  const barW = Math.max(1.5, (grupo * 0.78) / M - 1)
  const xGrupo = (d: number) => padL + d * grupo
  const ticksX = [...new Set([1, Math.ceil(dias / 2), dias])]

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (tipo === 'barras') {
      setHoverDia(Math.max(0, Math.min(dias - 1, Math.floor((x - padL) / grupo))))
    } else {
      const frac = Math.max(0, Math.min(1, (x - padL) / iw))
      setHoverDia(Math.round(frac * (dias - 1)))
    }
  }
  const xHover = hoverDia == null ? 0 : tipo === 'barras' ? xGrupo(hoverDia) + grupo / 2 : xLinha(hoverDia)

  const seg = (ativo: boolean): React.CSSProperties => ({
    border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    background: ativo ? corAtual : 'transparent', color: ativo ? '#fff' : 'var(--ws-text-secondary)',
  })

  return (
    <SCard style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 20, color: 'var(--ws-text-primary)', lineHeight: 1.15 }}>
            Comparativo Month-to-Date
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
            Dias 1–{dias} de cada mês · {escopo}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div role="group" aria-label="Tipo de gráfico" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)' }}>
            <button style={seg(tipo === 'linha')} aria-pressed={tipo === 'linha'} onClick={() => setTipo('linha')}>Linha</button>
            <button style={seg(tipo === 'barras')} aria-pressed={tipo === 'barras'} onClick={() => setTipo('barras')}>Barras</button>
          </div>
          <select value={def.key} onChange={e => setMetrica(e.target.value as MetricaMtd)} aria-label="Métrica"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)',
              background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong, var(--ws-border))',
              borderRadius: 999, padding: '7px 14px', cursor: 'pointer',
            }}>
            {metricas.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 32, color: corAtual, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(totAtual)}
        </span>
        {delta != null && anterior && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13, color: (def.polaridade === 'menor' ? delta <= 0 : delta >= 0) ? 'var(--status-positivo)' : 'var(--status-risco)' }}>
            <span style={{ fontSize: 11 }}>{delta >= 0 ? '▲' : '▼'}</span>
            {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400 }}>
              vs. {anterior.label} ({fmt(totAnterior)} até o dia {meses[1].dias})
            </span>
          </span>
        )}
        {delta == null && anterior && (
          <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>sem base em {anterior.label} pra comparar</span>
        )}
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <svg width={W} height={H} style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', touchAction: 'pan-y' }}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverDia(null)}
          role="img" aria-label={`${def.label} acumulado por dia: ${visiveis.map(s => `${s.label} ${fmt(s.data.at(-1) ?? 0)}`).join(', ')}`}>
          {ticksY.map(v => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--ws-border)" strokeWidth={1} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ws-text-secondary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</text>
            </g>
          ))}
          {hoverDia !== null && (
            <line x1={xHover} x2={xHover} y1={padT} y2={padT + ih}
              stroke="var(--ws-text-secondary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          )}
          {tipo === 'linha' ? (
            <>
              {[...visiveis].reverse().map(s => (
                <path key={s.mesKey}
                  d={s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xLinha(i)} ${y(v)}`).join(' ')}
                  fill="none" stroke={s.cor} strokeWidth={s.atual ? 3 : 2}
                  strokeDasharray={s.atual ? undefined : '6 4'} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {visiveis.filter(s => s.atual).map(s => (
                <circle key={s.mesKey} cx={xLinha(s.data.length - 1)} cy={y(s.data.at(-1) ?? 0)} r={5}
                  fill={s.cor} stroke="var(--ws-surface)" strokeWidth={2} />
              ))}
              {hoverDia !== null && visiveis.map(s => s.data[hoverDia] !== undefined && (
                <circle key={`${s.mesKey}-h`} cx={xLinha(hoverDia)} cy={y(s.data[hoverDia])} r={4.5}
                  fill={s.cor} stroke="var(--ws-surface)" strokeWidth={2} />
              ))}
            </>
          ) : (
            Array.from({ length: dias }).map((_, d) => (
              <g key={d}>
                {visiveis.map((s, mi) => {
                  const v = diario(s.data)[d]
                  if (v == null || v <= 0) return null
                  const x = xGrupo(d) + (grupo - (barW + 1) * M) / 2 + mi * (barW + 1)
                  return <rect key={s.mesKey} x={x} y={y(v)} width={barW} height={padT + ih - y(v)} rx={Math.min(2, barW / 2)}
                    fill={s.cor} opacity={hoverDia === null || hoverDia === d ? 1 : 0.45} />
                })}
              </g>
            ))
          )}
          {ticksX.map(d => (
            <text key={d} x={tipo === 'barras' ? xGrupo(d - 1) + grupo / 2 : xLinha(d - 1)} y={H - 6}
              textAnchor={d === 1 && tipo === 'linha' ? 'start' : d === dias && tipo === 'linha' ? 'end' : 'middle'}
              fontSize={11} fill="var(--ws-text-secondary)">dia {d}</text>
          ))}
        </svg>

        {hoverDia !== null && (() => {
          const vira = xHover > W * 0.62
          return (
            <div style={{
              position: 'absolute', top: 4, zIndex: 10, pointerEvents: 'none',
              left: vira ? undefined : xHover + 14, right: vira ? W - xHover + 14 : undefined,
              background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong, var(--ws-border))',
              borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: '8px 12px', fontSize: 12, minWidth: 160,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--ws-text-secondary)', fontSize: 11, marginBottom: 6 }}>
                Dia {hoverDia + 1} · {tipo === 'barras' ? 'no dia' : 'acumulado'}
              </div>
              {visiveis.map(s => {
                const v = tipo === 'barras' ? diario(s.data)[hoverDia] : s.data[hoverDia]
                return (
                  <div key={s.mesKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.cor, flex: '0 0 auto' }} />
                      {s.label}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {v == null ? '—' : fmt(v)}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {visiveis.map(s => (
          <span key={s.mesKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ws-text-primary)' }}>
            <svg width={18} height={6} aria-hidden>
              <line x1={1} x2={17} y1={3} y2={3} stroke={s.cor} strokeWidth={s.atual ? 3 : 2}
                strokeDasharray={s.atual ? undefined : '4 3'} strokeLinecap="round" />
            </svg>
            {s.label}
            <span style={{ fontWeight: 500, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.data.at(-1) ?? 0)}</span>
          </span>
        ))}
      </div>
      {nota && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: -4 }}>{nota}</div>}
    </SCard>
  )
}
