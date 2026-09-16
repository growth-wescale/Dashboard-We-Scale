import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { PISTA, CORES } from '@/lib/timeline/layout'
import type { LayoutPista, NoLayout, ToqueLayout } from '@/lib/timeline/layout'
import type { NivelZoom } from '@/lib/timeline/zoom'
import { IconeDe } from './iconesEtapa'

interface Props {
  layout: LayoutPista
  nivel: NivelZoom
  selecionadoId: string | null
  /** Clique num nó/toque/marcador — `null` fecha o cartão. */
  onSelecionar: (id: string | null) => void
  handlers: {
    onWheel: (e: WheelEvent) => void
    onPointerDown: (e: ReactPointerEvent) => void
    onPointerMove: (e: ReactPointerEvent) => void
    onPointerUp: () => void
  }
  arrastando: boolean
  /** Largura medida do container (px); o SVG usa viewBox = largura × altura do layout. */
  largura: number
}

const FONTE = "'Clash Display','Public Sans',ui-sans-serif,system-ui,sans-serif"

function chevronPath(x: number, w: number, primeiro: boolean): string {
  const y = PISTA.Y - PISTA.H / 2, h = PISTA.H, p = 14
  return primeiro
    ? `M ${x} ${y} h ${w} l ${p} ${h / 2} l ${-p} ${h / 2} h ${-w} z`
    : `M ${x} ${y} h ${w} l ${p} ${h / 2} l ${-p} ${h / 2} h ${-w} l ${p} ${-h / 2} z`
}

export function PistaCanvas({ layout, nivel, selecionadoId, onSelecionar, handlers, arrastando, largura }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // wheel precisa de listener não-passivo (preventDefault no zoom) — o onWheel do React é passivo.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = handlers.onWheel
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [handlers.onWheel])

  const bordaPista = (fileira: NoLayout['fileira']) => fileira === 'cima' ? PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP : PISTA.Y + PISTA.H / 2 + PISTA.BOLINHA_GAP

  return (
    <div
      ref={ref}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerUp}
      onClick={e => { if (e.target === e.currentTarget) onSelecionar(null) }}
      style={{ width: '100%', overflow: 'hidden', cursor: arrastando ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
    >
      <svg viewBox={`0 0 ${Math.max(1, largura)} ${layout.altura}`} width="100%" height={layout.altura} style={{ display: 'block', fontFamily: FONTE }}>
        <defs>
          <filter id="pista-sombra" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#33032D" floodOpacity=".18" />
          </filter>
        </defs>

        {/* chevrons */}
        {layout.chevrons.map((c, i) => (
          <g key={`${c.fase.tipo}-${c.fase.inicio.getTime()}`}>
            <path d={chevronPath(c.x, c.w, i === 0)} fill={c.cor} opacity={c.fase.tipo === 'Reaberto' ? 0.6 : 1}
              strokeDasharray={c.fase.tipo === 'Reaberto' ? '6 4' : undefined} stroke={c.fase.tipo === 'Reaberto' ? '#9CA3AF' : undefined} />
            {c.labelVisivel && (
              <text x={c.x + c.w / 2} y={PISTA.Y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" letterSpacing=".04em">{c.label}</text>
            )}
          </g>
        ))}

        {/* eixo */}
        {layout.eixo.map(t => (
          <text key={`${t.x}-${t.label}`} x={t.x} y={PISTA.EIXO_Y} fontSize={10.5} fill="#B8AEB5" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{t.label}</text>
        ))}

        {/* marcadores (micro) */}
        {layout.marcadores.map(m => (
          <g key={m.id} onClick={e => { e.stopPropagation(); onSelecionar(m.id) }} style={{ cursor: 'pointer' }}>
            <line x1={m.x} y1={PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP - 4} x2={m.x} y2={m.y + 8} stroke="#CAD3E0" strokeWidth={1.5} strokeDasharray="2 4" />
            <circle cx={m.x} cy={PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP} r={4.5} fill="#fff" stroke="#7C6B78" strokeWidth={2} />
            <text x={m.x} y={m.y} fontSize={10} fill="#7C6B78" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{m.label.length > 48 ? m.label.slice(0, 47) + '…' : m.label}</text>
          </g>
        ))}

        {/* fileira de toques (micro) */}
        {nivel === 'micro' && layout.toques.length > 0 && (
          <line x1={PISTA.MARGEM_ESQ} y1={PISTA.TOQUES_Y} x2={layout.larguraConteudo} y2={PISTA.TOQUES_Y} stroke="#E9EDF2" strokeWidth={1.5} />
        )}
        {layout.toques.map(t => <Toque key={t.id} t={t} selecionado={selecionadoId === t.id} onClick={() => onSelecionar(t.id)} />)}

        {/* fios + bolinhas + nós */}
        {layout.nos.map(n => {
          const sel = selecionadoId === n.id
          const yBorda = bordaPista(n.fileira)
          return (
            <g key={n.id} onClick={e => { e.stopPropagation(); onSelecionar(n.id) }} style={{ cursor: 'pointer' }}>
              {!n.terminal && (
                <>
                  <line x1={n.x} y1={n.y + (n.fileira === 'cima' ? n.raio + 2 : -n.raio - 2)} x2={n.xReal} y2={yBorda + (n.fileira === 'cima' ? -6 : 6)} stroke="#CAD3E0" strokeWidth={1.5} strokeDasharray="2 4" />
                  <circle cx={n.xReal} cy={yBorda} r={4.5} fill="#fff" stroke={n.cor} strokeWidth={n.desvio ? 3 : 2} />
                </>
              )}
              <g transform={`translate(${n.x},${n.y})`} filter="url(#pista-sombra)">
                <circle r={n.raio + (sel ? 4 : 0)} fill={n.cor} stroke="#fff" strokeWidth={n.terminal ? 3 : 0} />
                {n.icone === 'em_andamento' && <circle r={n.raio - 6} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />}
                <g transform={`translate(${-11},${-11})`}><IconeDe chave={n.icone} size={22} /></g>
              </g>
              <Rotulo n={n} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Rotulo({ n }: { n: NoLayout }) {
  const corTitulo = n.terminal ? (n.cor === CORES.ganho ? '#B7791F' : n.cor === CORES.perda ? '#B4324B' : '#7C6B78') : n.desvio === 'no_show' ? '#B7791F' : '#33032D'
  if (n.terminal) {
    // texto acima do nó terminal, alinhado à direita
    return (
      <g textAnchor="end">
        <text x={n.x + 32} y={n.y - 58} fontSize={14} fontWeight={700} fill={corTitulo}>{n.titulo}</text>
        <text x={n.x + 32} y={n.y - 42} fontSize={11} fill="#7C6B78" fontFamily="ui-sans-serif, system-ui, sans-serif">{n.detalhe}</text>
      </g>
    )
  }
  return (
    <g>
      <text x={n.x + n.raio + 11} y={n.y - 4} fontSize={14} fontWeight={700} fill={corTitulo}>{n.titulo}</text>
      <text x={n.x + n.raio + 11} y={n.y + 12} fontSize={11} fill="#7C6B78" fontFamily="ui-sans-serif, system-ui, sans-serif">{n.detalhe}</text>
    </g>
  )
}

function Toque({ t, selecionado, onClick }: { t: ToqueLayout; selecionado: boolean; onClick: () => void }) {
  const reuniao = t.momento.tipo === 'reuniao'
  const r = reuniao ? 14 : 11
  const chave = reuniao ? 'reuniao' : t.momento.meta?.kind === 'tarefa' ? t.momento.meta.tipoTarefa : 'outro'
  return (
    <g transform={`translate(${t.x},${t.y})`} onClick={e => { e.stopPropagation(); onClick() }} style={{ cursor: 'pointer' }}>
      <circle r={r + (selecionado ? 3 : 0)} fill={t.vazado ? '#fff' : t.cor} stroke={t.contorno ?? (t.vazado ? t.cor : 'none')} strokeWidth={t.contorno ? 3 : t.vazado ? 2 : 0} opacity={reuniao ? 1 : 0.85} />
      <g transform={`translate(${-(r * 0.55)},${-(r * 0.55)})`}>{t.vazado ? null : <IconeDe chave={chave} size={r * 1.1} />}</g>
      {t.cluster.length > 1 && (
        <>
          <circle cx={r - 2} cy={-r + 2} r={7} fill="#33032D" />
          <text x={r - 2} y={-r + 5} fontSize={8.5} fontWeight={700} fill="#fff" textAnchor="middle">{t.cluster.length}</text>
        </>
      )}
    </g>
  )
}
