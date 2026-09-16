import { ExternalLink } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { rdDealUrl } from '@/lib/rd'
import { money, nf } from '@/lib/format'
import { StatusBadge } from '@/components/ui/dealDrawerShared'
import type { DealCabecalho, Timeline } from '@/lib/timeline/tipos'

const Chip = ({ children, cor }: { children: React.ReactNode; cor?: string }) => (
  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1px solid ${cor ?? 'var(--ws-border)'}`, color: cor ?? 'var(--ws-text-secondary)', background: 'var(--ws-surface)', fontWeight: cor ? 600 : 400 }}>{children}</span>
)
const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div style={{ minWidth: 92 }}>
    <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)' }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
)

export function DealHeader({ cabecalho, timeline }: { cabecalho: DealCabecalho; timeline: Timeline }) {
  const r = cabecalho.row
  const accent = BRAND_ACCENT[r.marca ?? ''] ?? 'var(--ws-vinho-b)'
  const t = timeline.totais
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, color: 'var(--ws-text-primary)', lineHeight: 1.1 }}>{r.nome_negociacao ?? r.id_lead}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <Chip cor={accent}>{marcaLabel(r.marca)}</Chip>
            <Chip>{r.origem_comercial ?? 'Inbound'}</Chip>
            {r.fonte_macro && <Chip>{r.fonte_macro}</Chip>}
            <StatusBadge status={r.status_atual} />
            {r.nome_sdr && <Chip>SDR · {r.nome_sdr}</Chip>}
            {r.nome_closer && <Chip>Closer · {r.nome_closer}</Chip>}
            {cabecalho.ciclos.length > 1 && <Chip>{cabecalho.ciclos.length} ciclos</Chip>}
            <a href={rdDealUrl(r.id_lead)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ws-vinho-b)', fontWeight: 600 }}>Abrir no RD <ExternalLink size={11} /></a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Kpi label="Dias no funil" value={nf(Math.round(t.diasNoFunil))} />
          <Kpi label="Toques" value={nf(t.toques)} />
          <Kpi label="Atrasados" value={nf(t.atrasados)} />
          <Kpi label="Reuniões" value={nf(t.reunioes)} />
          <Kpi label="No-shows" value={nf(t.noShows)} />
          <Kpi label="Taxa de franquia" value={r.valor_produto != null ? money(r.valor_produto) : '—'} />
          <Kpi label="Unidades" value={nf(r.quantidade_unidades ?? 0)} />
        </div>
      </div>
    </div>
  )
}
