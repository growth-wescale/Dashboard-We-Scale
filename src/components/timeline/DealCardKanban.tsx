import { Link } from 'react-router-dom'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { StatusBadge } from '@/components/ui/dealDrawerShared'
import { fmtDiasCurto } from '@/lib/timeline/layout'
import type { CardKanban } from '@/lib/timeline/kanban'

/**
 * Card de uma coluna do Kanban. A coluna tem ~280px, então não cabe a
 * mini-pista de fases do cartão antigo (numa largura dessas ela vira um
 * borrão sem leitura) — fica o essencial: nome, marca, responsável e há
 * quanto tempo o deal está parado, que é o motivo de a coluna existir.
 * O selo de status só aparece em Ganho/Perdido; "Em andamento" é o normal
 * do quadro e repetir isso em cada card só faria ruído.
 */
export function DealCardKanban({ card }: { card: CardKanban }) {
  const { row, dias } = card
  const accent = BRAND_ACCENT[row.marca ?? ''] ?? 'var(--ws-vinho-b)'
  const encerrado = row.status_atual === 'Ganho' || row.status_atual === 'Perdido'
  const responsavel = row.nome_closer
    ? `Closer ${row.nome_closer}`
    : row.nome_sdr ? `SDR ${row.nome_sdr}` : null

  return (
    <Link to={`/linha-do-tempo/${row.id_lead}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderLeft: `3px solid ${accent}`,
          borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
          transition: 'border-color .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ws-border)'; e.currentTarget.style.borderLeftColor = accent }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ws-text-primary)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {row.nome_negociacao ?? row.id_lead}
        </div>
        <div style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: accent, fontWeight: 600 }}>{marcaLabel(row.marca)}</span>
          {encerrado && <StatusBadge status={row.status_atual} />}
        </div>
        {responsavel && (
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {responsavel}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {dias === null ? 'sem data de etapa' : `parado há ${fmtDiasCurto(dias).toLowerCase()}`}
        </div>
      </div>
    </Link>
  )
}
