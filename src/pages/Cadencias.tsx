import { useState, useMemo, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, ChevronRight, ListChecks, GitBranch } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { TouchpointDrawer } from '@/components/ui/TouchpointDrawer'
import { useCadencias } from '@/hooks/useCadencias'
import type { Fluxo, Motivo, Touchpoint, StatusExecucao, PrioridadeTp } from '@/lib/types'

// ── Brand definitions ─────────────────────────────────────────────────────────
const BRAND_DEFS = [
  { key: 'oralunic',     label: 'Oral Unic',    dot: '#7F0C72', cssKey: 'oral-unic' },
  { key: 'inpot',        label: 'Inpot',         dot: '#C6D32D', cssKey: 'inpot' },
  { key: 'eletrovias',   label: 'Eletrovias',    dot: '#ED6D3A', cssKey: 'eletrovias' },
  { key: 'liso',         label: 'Lisô Laser',    dot: '#FF6643', cssKey: 'liso-laser' },
  { key: 'b2case',       label: 'B2Case',        dot: '#0169F2', cssKey: 'b2case' },
  { key: 'viva',         label: 'Viva',          dot: '#FF0069', cssKey: 'viva' },
  { key: 'scalepartner', label: 'Scale Partner', dot: '#8A93E0', cssKey: 'oral-unic' },
]

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<StatusExecucao, string> = {
  a_fazer: 'A fazer', copy_escrita: 'Copy', testeira: 'Testeira',
  revisao: 'Revisão', aprovado: 'Aprovado', publicado: 'Publicado',
}
const STATUS_COLOR: Record<StatusExecucao, string> = {
  a_fazer: '#9CA3AF', copy_escrita: '#3B82F6', testeira: '#F59E0B',
  revisao: '#8B5CF6', aprovado: '#10B981', publicado: '#059669',
}
const PRIO_BADGE: Record<PrioridadeTp, { label: string; color: string; bg: string }> = {
  p1_critico:    { label: '🔴 P1', color: '#C0392B', bg: '#FBE7EB' },
  p2_importante: { label: '🟡 P2', color: '#7A4800', bg: '#FDF1DE' },
  p3_base:       { label: '⚪ P3', color: '#7C6B78', bg: '#F1F3F6' },
}
const STATUS_ORDER: StatusExecucao[] = ['a_fazer','copy_escrita','testeira','revisao','aprovado','publicado']

// ── Helpers ───────────────────────────────────────────────────────────────────
function progresso(tps: Touchpoint[]) {
  if (!tps.length) return 0
  return Math.round((tps.filter(t => t.status === 'publicado').length / tps.length) * 100)
}
function countByStatus(tps: Touchpoint[]) {
  const map: Record<string, number> = {}
  for (const tp of tps) map[tp.status] = (map[tp.status] ?? 0) + 1
  return map
}

// ── Small UI pieces ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 12, padding: '14px 18px', minWidth: 110,
    }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: color ?? 'var(--ws-text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, background: 'var(--ws-border)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s' }} />
    </div>
  )
}

function StatusSelect({ value, onChange }: { value: StatusExecucao; onChange: (v: StatusExecucao) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as StatusExecucao)}
      onClick={e => e.stopPropagation()}
      style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
        background: STATUS_COLOR[value] + '22', color: STATUS_COLOR[value],
        border: 'none', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', appearance: 'none',
      }}
    >
      {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  )
}

// ── React Flow node types ─────────────────────────────────────────────────────
function FlowHeaderNode({ data }: NodeProps) {
  const flow = data.flow as Fluxo
  const badge = PRIO_BADGE[flow.prioridade_default]
  return (
    <div style={{
      background: 'var(--ws-vinho-b)', color: '#fff',
      borderRadius: 10, padding: '9px 13px', width: 210,
      boxShadow: '0 2px 10px rgba(51,3,45,0.18)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
        Fluxo
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>
        {flow.titulo}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px',
        background: 'rgba(255,255,255,0.2)', color: '#fff',
      }}>{badge.label}</span>
    </div>
  )
}

function TpNode({ data }: NodeProps) {
  const tp = data.tp as Touchpoint
  const color = STATUS_COLOR[tp.status]
  return (
    <div
      onClick={() => (data.onOpen as (tp: Touchpoint) => void)(tp)}
      style={{
        background: 'var(--ws-surface)', border: `1.5px solid ${color}`,
        borderRadius: 10, padding: '8px 12px', width: 210, cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(51,3,45,0.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {tp.dia && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tp.dia}</span>}
        {tp.canal && <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)' }}>· {tp.canal}</span>}
        <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-primary)', lineHeight: 1.3 }}>
        {tp.ttitle ?? '(sem título)'}
      </div>
      {tp.tag && (
        <span style={{ marginTop: 4, display: 'inline-block', fontSize: 10, fontWeight: 600, background: color + '22', color, borderRadius: 4, padding: '1px 5px' }}>
          {tp.tag}
        </span>
      )}
    </div>
  )
}

function MotivoGroupNode({ data }: NodeProps) {
  return (
    <div style={{
      background: 'var(--ws-bg)', border: '1px dashed var(--ws-border-strong)',
      borderRadius: 10, padding: '8px 12px', width: 210,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ws-text-secondary)', letterSpacing: '0.04em' }}>
        {data.label as string}
      </div>
      {data.origem ? <div style={{ fontSize: 10, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{data.origem as string}</div> : null}
    </div>
  )
}

const nodeTypes = { flowHeader: FlowHeaderNode, tp: TpNode, motivo: MotivoGroupNode }

// ── Brand canvas (single React Flow for all flows) ────────────────────────────
const NODE_W = 210, NODE_H = 80, HEADER_H = 60
const GAP_Y = 34, HEADER_GAP = 36, FLOW_GAP = 72, SUB_GAP = 48, MOT_H = 56

function buildBrandGraph(
  fluxos: Fluxo[],
  touchpoints: Touchpoint[],
  motivos: Motivo[],
  onOpen: (tp: Touchpoint) => void,
) {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let currentX = 0
  let prevFlowHeaderId: string | null = null

  const edge = (src: string, tgt: string) => ({
    id: `e-${src}-${tgt}`, source: src, target: tgt,
    style: { stroke: '#CAD3E0', strokeWidth: 1.5 }, type: 'smoothstep' as const,
  })

  const flowEdge = (src: string, tgt: string) => ({
    id: `fe-${src}-${tgt}`, source: src, target: tgt,
    sourceHandle: null, targetHandle: null,
    style: { stroke: '#CAD3E0', strokeWidth: 1.5, strokeDasharray: '5 4' },
    type: 'smoothstep' as const,
  })

  for (const flow of fluxos) {
    const directTps = touchpoints
      .filter(t => t.fluxo_id === flow.id && !t.motivo_id)
      .sort((a, b) => a.ordem - b.ordem)
    const fMotivos = motivos
      .filter(m => m.fluxo_id === flow.id)
      .sort((a, b) => a.ordem - b.ordem)
    const hasMots = fMotivos.length > 0

    // Flow header node
    const hId = `fh-${flow.id}`
    nodes.push({
      id: hId, type: 'flowHeader',
      position: { x: currentX, y: 0 },
      data: { flow }, draggable: false,
    })
    if (prevFlowHeaderId) edges.push(flowEdge(prevFlowHeaderId, hId))
    prevFlowHeaderId = hId

    let prevId = hId
    let nextY = HEADER_H + HEADER_GAP

    // Direct TPs (vertical chain)
    for (const tp of directTps) {
      const id = `tp-${tp.id}`
      nodes.push({ id, type: 'tp', position: { x: currentX, y: nextY }, data: { tp, onOpen }, draggable: false })
      edges.push(edge(prevId, id))
      prevId = id
      nextY += NODE_H + GAP_Y
    }

    // Motivos in 2 sub-columns of 5
    if (hasMots) {
      const leftMots  = fMotivos.filter((_, i) => i < 5)
      const rightMots = fMotivos.filter((_, i) => i >= 5)
      const leftX  = currentX
      const rightX = currentX + NODE_W + SUB_GAP

      const buildMotCol = (mots: Motivo[], colX: number, startY: number) => {
        let y = startY
        for (const mot of mots) {
          const motTps = touchpoints.filter(t => t.motivo_id === mot.id).sort((a, b) => a.ordem - b.ordem)
          const mId = `mot-${mot.id}`
          nodes.push({
            id: mId, type: 'motivo',
            position: { x: colX, y },
            data: { label: mot.titulo ?? 'Motivo', origem: mot.origem }, draggable: false,
          })
          y += MOT_H + GAP_Y
          let prev = mId
          for (const tp of motTps) {
            const tId = `tp-${tp.id}`
            nodes.push({ id: tId, type: 'tp', position: { x: colX, y }, data: { tp, onOpen }, draggable: false })
            edges.push(edge(prev, tId))
            prev = tId
            y += NODE_H + GAP_Y
          }
          y += GAP_Y
        }
      }

      buildMotCol(leftMots,  leftX,  nextY)
      buildMotCol(rightMots, rightX, nextY)

      currentX += NODE_W + SUB_GAP + NODE_W + FLOW_GAP
    } else {
      currentX += NODE_W + FLOW_GAP
    }
  }

  return { nodes, edges }
}

function BrandCanvas({ fluxos, touchpoints, motivos, onOpen }: {
  fluxos: Fluxo[]
  touchpoints: Touchpoint[]
  motivos: Motivo[]
  onOpen: (tp: Touchpoint) => void
}) {
  const { nodes, edges } = useMemo(
    () => buildBrandGraph(fluxos, touchpoints, motivos, onOpen),
    [fluxos, touchpoints, motivos, onOpen],
  )

  return (
    <div style={{
      height: '78vh', width: '100%',
      background: 'var(--ws-bg)', borderRadius: 14,
      border: '1px solid var(--ws-border)', overflow: 'hidden',
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.06 }}
        minZoom={0.05}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="var(--ws-border)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={n => {
            const tp = n.data?.tp as Touchpoint | undefined
            return tp ? STATUS_COLOR[tp.status] : '#CBD5E1'
          }}
          style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  )
}

// ── Touchpoint table ──────────────────────────────────────────────────────────
function TpTable({ tps, onOpen, onStatusChange }: {
  tps: Touchpoint[]
  onOpen: (tp: Touchpoint) => void
  onStatusChange: (tpId: string, s: StatusExecucao) => Promise<void>
}) {
  if (!tps.length) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: 'var(--ws-bg)' }}>
          {['Dia', 'Canal', 'Tag', 'Título', 'Criativo', 'Status'].map(h => (
            <th key={h} style={{
              padding: '7px 12px', textAlign: 'left', fontWeight: 600,
              fontSize: 11, color: 'var(--ws-text-secondary)', letterSpacing: '0.04em',
              textTransform: 'uppercase', borderBottom: '1px solid var(--ws-border)',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tps.map((tp, i) => (
          <tr
            key={tp.id}
            onClick={() => onOpen(tp)}
            style={{
              cursor: 'pointer',
              background: i % 2 === 0 ? 'var(--ws-surface)' : 'var(--ws-bg)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--ws-bg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'var(--ws-surface)' : 'var(--ws-bg)' }}
          >
            <td style={{ padding: '8px 12px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{tp.dia ?? '—'}</td>
            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{tp.canal ?? '—'}</td>
            <td style={{ padding: '8px 12px' }}>
              {tp.tag && (
                <span style={{
                  fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '2px 6px',
                  background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
                }}>{tp.tag}</span>
              )}
            </td>
            <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--ws-text-primary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tp.ttitle ?? '—'}
            </td>
            <td style={{ padding: '8px 12px' }}>
              {tp.criativo_status && (
                <span style={{
                  fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '2px 6px',
                  background: tp.criativo_status === 'ok' ? '#D6F5E8' : '#FDF1DE',
                  color: tp.criativo_status === 'ok' ? '#046638' : '#C07700',
                }}>{tp.criativo_status === 'ok' ? 'OK' : 'A fazer'}</span>
              )}
            </td>
            <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
              <StatusSelect value={tp.status} onChange={s => onStatusChange(tp.id, s)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Fluxo accordion (Tarefas tab only) ───────────────────────────────────────
function FluxoAccordion({ fluxo, tps, motivos, onOpen, onStatusChange }: {
  fluxo: Fluxo
  tps: Touchpoint[]
  motivos: Motivo[]
  onOpen: (tp: Touchpoint) => void
  onStatusChange: (tpId: string, s: StatusExecucao) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const pct = progresso(tps)
  const badge = PRIO_BADGE[fluxo.prioridade_default]
  const brandDef = BRAND_DEFS.find(b => b.key === fluxo.marca)
  const accentColor = brandDef?.dot ?? 'var(--brand-accent)'
  const directTps = tps.filter(t => !t.motivo_id).sort((a, b) => a.ordem - b.ordem)

  return (
    <div style={{ border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: open ? 'var(--ws-bg)' : 'var(--ws-surface)',
          border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
        }}
      >
        {open ? <ChevronDown size={15} color="var(--ws-text-secondary)" /> : <ChevronRight size={15} color="var(--ws-text-secondary)" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)' }}>
              {fluxo.titulo}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, maxWidth: 200 }}><ProgressBar pct={pct} color={accentColor} /></div>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>
              {pct}% publicado · {tps.length} touchpoints
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--ws-border)' }}>
          {directTps.length > 0 && (
            <TpTable tps={directTps} onOpen={onOpen} onStatusChange={onStatusChange} />
          )}
          {motivos.map(mot => {
            const motTps = tps.filter(t => t.motivo_id === mot.id).sort((a, b) => a.ordem - b.ordem)
            return (
              <div key={mot.id}>
                <div style={{
                  padding: '8px 16px', background: 'var(--ws-bg)',
                  borderTop: '1px solid var(--ws-border)',
                  fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <GitBranch size={12} />
                  {mot.titulo}
                  {mot.origem && <span style={{ fontWeight: 400 }}>· {mot.origem}</span>}
                </div>
                <TpTable tps={motTps} onOpen={onOpen} onStatusChange={onStatusChange} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Cadencias() {
  const {
    fluxos, motivos, touchpoints, marcaContexto, pendencias,
    loading, error, updateStatus, updateCopy, fetchHistorico,
  } = useCadencias()

  const [activeBrand, setActiveBrand] = useState(BRAND_DEFS[0].key)
  const [tab, setTab] = useState<'tarefas' | 'fluxo'>('tarefas')
  const [drawerTp, setDrawerTp] = useState<Touchpoint | null>(null)

  const brandDef = BRAND_DEFS.find(b => b.key === activeBrand)!
  const ctx = marcaContexto.find(c => c.marca === activeBrand)

  const brandFluxos = useMemo(
    () => fluxos.filter(f => f.marca === activeBrand).sort((a, b) => a.ordem - b.ordem),
    [fluxos, activeBrand],
  )
  const brandTps = useMemo(
    () => touchpoints.filter(t => brandFluxos.some(f => f.id === t.fluxo_id)),
    [touchpoints, brandFluxos],
  )
  const brandMotivos = useMemo(
    () => motivos.filter(m => brandFluxos.some(f => f.id === m.fluxo_id)),
    [motivos, brandFluxos],
  )
  const byCounts = useMemo(() => countByStatus(brandTps), [brandTps])

  const handleOpen = useCallback((tp: Touchpoint) => setDrawerTp(tp), [])

  const handleStatusChange = useCallback(async (tpId: string, s: StatusExecucao) => {
    await updateStatus(tpId, s)
    if (drawerTp?.id === tpId) setDrawerTp(prev => prev ? { ...prev, status: s } : null)
  }, [updateStatus, drawerTp])

  if (loading) return (
    <div style={{ padding: '48px 32px', color: 'var(--ws-text-secondary)', fontFamily: 'var(--font-body)' }}>
      Carregando cadências…
    </div>
  )
  if (error) return (
    <div style={{ padding: '48px 32px', color: 'var(--status-risco)', fontFamily: 'var(--font-body)' }}>
      Erro: {error}
    </div>
  )

  return (
    <div
      data-brand={brandDef.cssKey}
      style={{ padding: '32px var(--container-pad)', minHeight: '100vh', background: 'var(--ws-bg)' }}
    >
      {/* Pendências globais */}
      {pendencias.length > 0 && (
        <div style={{
          marginBottom: 20, background: '#FDF1DE', border: '1px solid #F2D49A',
          borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7A4800', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Pendências globais
          </span>
          {pendencias.map(p => (
            <span key={p.id} style={{ fontSize: 13, color: '#7A4800' }}>· {p.descricao}</span>
          ))}
        </div>
      )}

      <PageTop title="Cadências" subtitle="Execução de copy e status de publicação por marca" />

      {/* Brand pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {BRAND_DEFS.map(b => {
          const bTps = touchpoints.filter(t => fluxos.find(f => f.id === t.fluxo_id && f.marca === b.key))
          const pct = progresso(bTps)
          const isActive = b.key === activeBrand
          return (
            <button
              key={b.key}
              onClick={() => setActiveBrand(b.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                border: `1px solid ${isActive ? b.dot : 'var(--ws-border)'}`,
                background: isActive ? b.dot + '18' : 'var(--ws-surface)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? b.dot : 'var(--ws-text-primary)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.dot, flexShrink: 0 }} />
              {b.label}
              <span style={{ fontSize: 11, color: isActive ? b.dot : 'var(--ws-text-secondary)' }}>{pct}%</span>
            </button>
          )
        })}
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard label="Total" value={brandTps.length} />
        <KpiCard label="A fazer"      value={byCounts.a_fazer      ?? 0} color="var(--ws-text-secondary)" />
        <KpiCard label="Copy escrita" value={byCounts.copy_escrita ?? 0} color="#3B82F6" />
        <KpiCard label="Testeira"     value={byCounts.testeira     ?? 0} color="#F59E0B" />
        <KpiCard label="Revisão"      value={byCounts.revisao      ?? 0} color="#8B5CF6" />
        <KpiCard label="Aprovado"     value={byCounts.aprovado     ?? 0} color="#10B981" />
        <KpiCard label="Publicado"    value={byCounts.publicado    ?? 0} color="#059669" />
      </div>

      {/* Alerta da marca */}
      {ctx?.alerta && (
        <div style={{
          marginBottom: 20, background: '#FBE7EB', border: '1px solid #E0506B33',
          borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#C0392B',
        }}>
          <span style={{ fontWeight: 600 }}>Atenção: </span>{ctx.alerta}
        </div>
      )}

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 20,
        background: 'var(--ws-surface)', borderRadius: 10, padding: 4,
        border: '1px solid var(--ws-border)', width: 'fit-content',
      }}>
        {([
          ['tarefas', <ListChecks size={14} />, 'Tarefas'],
          ['fluxo',   <GitBranch size={14} />,  'Fluxo'],
        ] as const).map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: tab === key ? 600 : 400,
              background: tab === key ? 'var(--brand-accent)' : 'transparent',
              color: tab === key ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
              transition: 'all 0.15s',
            }}
          >{icon}{label}</button>
        ))}
      </div>

      {/* Content */}
      {tab === 'fluxo' ? (
        <BrandCanvas
          fluxos={brandFluxos}
          touchpoints={brandTps}
          motivos={brandMotivos}
          onOpen={handleOpen}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {brandFluxos.map(fluxo => {
            const fTps = touchpoints.filter(t => t.fluxo_id === fluxo.id)
            const fMotivos = motivos.filter(m => m.fluxo_id === fluxo.id).sort((a, b) => a.ordem - b.ordem)
            return (
              <FluxoAccordion
                key={fluxo.id}
                fluxo={fluxo}
                tps={fTps}
                motivos={fMotivos}
                onOpen={handleOpen}
                onStatusChange={handleStatusChange}
              />
            )
          })}
        </div>
      )}

      <TouchpointDrawer
        tp={drawerTp}
        onClose={() => setDrawerTp(null)}
        onStatusChange={handleStatusChange}
        onCopyChange={updateCopy}
        fetchHistorico={fetchHistorico}
      />
    </div>
  )
}
