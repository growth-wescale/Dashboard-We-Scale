import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { StatusBadge } from '@/components/ui/dealDrawerShared'
import { fasesDaLinha } from '@/lib/timeline/fasesDaLinha'
import { CORES, fmtDiasCurto } from '@/lib/timeline/layout'
import { diasEntre } from '@/lib/timeline/tipos'
import type { FunnelRow } from '@/lib/funnelTypes'

/** Cartão da lista: nome, chips e a mini-pista de fases (Macro) só com as datas da linha. */
export function DealCardMacro({ row, agora }: { row: FunnelRow; agora: Date }) {
  const { fases, desfecho, inicio, fim } = useMemo(() => fasesDaLinha(row, agora), [row, agora])
  const total = Math.max(1, diasEntre(inicio, fim))
  const accent = BRAND_ACCENT[row.marca ?? ''] ?? 'var(--ws-vinho-b)'
  const corFim = desfecho.tipo === 'ganho' ? CORES.ganho : desfecho.tipo === 'perda' ? CORES.perda : CORES.hoje
  return (
    <Link to={`/linha-do-tempo/${row.id_lead}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ws-text-primary)' }}>{row.nome_negociacao ?? row.id_lead}</div>
          <StatusBadge status={row.status_atual} />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: accent, fontWeight: 600 }}>{marcaLabel(row.marca)}</span>
          {row.nome_sdr && <span>· SDR {row.nome_sdr}</span>}
          {row.nome_closer && <span>· Closer {row.nome_closer}</span>}
          <span>· {fmtDiasCurto(total).toLowerCase()}</span>
        </div>
        {/* mini-pista */}
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          {fases.map(f => (
            <div
              key={`${f.tipo}-${f.inicio.getTime()}`}
              title={`${f.tipo} · ${fmtDiasCurto(f.duracaoDias)}`}
              style={{ width: `${Math.max(2, (f.duracaoDias / total) * 100)}%`, background: CORES[f.tipo === 'Reaberto' ? 'reaberto' : f.tipo] }}
            />
          ))}
          <div style={{ width: 8, background: corFim, borderRadius: 4 }} />
        </div>
      </div>
    </Link>
  )
}
