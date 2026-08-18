import { useMemo, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { stageOwnerRole, type StageDeal, type StageKey } from '@/lib/metrics'
import { rdDealUrl } from '@/lib/rd'
import { BRAND_ACCENT } from '@/constants/brands'
import { BarList, StatusBadge, cell, fmtData, topBreakdown } from './dealDrawerShared'

// ─── Filtros ────────────────────────────────────────────────────────────────

interface FilterState {
  marca: string
  funil: string
  fonte: string
  sdr: string
  closer: string
}

const EMPTY_FILTERS: FilterState = { marca: '', funil: '', fonte: '', sdr: '', closer: '' }

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--ws-border)', borderRadius: 8,
  background: 'var(--ws-bg)', color: 'var(--ws-text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
  padding: '6px 10px', cursor: 'pointer', minWidth: 0, flex: '1 1 140px',
}

// ─── StageDealsDrawer ───────────────────────────────────────────────────────

interface StageDealsDrawerProps {
  open: boolean
  onClose: () => void
  stage: StageKey | null
  stageLabel: string
  subtitle: string
  deals: StageDeal[]
  accent: string
}

export function StageDealsDrawer({ open, onClose, stage, stageLabel, subtitle, deals, accent }: StageDealsDrawerProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  const options = useMemo(() => ({
    marca: [...new Set(deals.map(d => d.row.marca?.trim()).filter((v): v is string => !!v))].sort(),
    funil: [...new Set(deals.map(d => d.row.nome_funil?.trim()).filter((v): v is string => !!v))].sort(),
    fonte: [...new Set(deals.map(d => d.row.fonte_macro?.trim()).filter((v): v is string => !!v))].sort(),
    sdr: [...new Set(deals.map(d => d.row.nome_sdr?.trim()).filter((v): v is string => !!v))].sort(),
    closer: [...new Set(deals.map(d => d.row.nome_closer?.trim()).filter((v): v is string => !!v))].sort(),
  }), [deals])

  const filtered = useMemo(() => deals.filter(({ row: r }) => {
    if (filters.marca && r.marca !== filters.marca) return false
    if (filters.funil && r.nome_funil !== filters.funil) return false
    if (filters.fonte && r.fonte_macro !== filters.fonte) return false
    if (filters.sdr && r.nome_sdr !== filters.sdr) return false
    if (filters.closer && r.nome_closer !== filters.closer) return false
    return true
  }), [deals, filters])

  const hasFilters = Object.values(filters).some(Boolean)

  const porMarca = useMemo(
    () => topBreakdown(deals, d => d.row.marca, m => BRAND_ACCENT[m] ?? 'var(--ws-border-strong)'),
    [deals],
  )
  // Diagnóstico em diante é do Closer; antes disso, do SDR — nome_closer já vem
  // preenchido bem antes da etapa dele, e mostrar Closer numa etapa de SDR confunde.
  const ownerRole = stage ? stageOwnerRole(stage) : 'sdr'
  const ownerLabel = ownerRole === 'closer' ? 'Closer' : 'SDR'
  const porResponsavel = useMemo(
    () => topBreakdown(deals, d => (ownerRole === 'closer' ? d.row.nome_closer : d.row.nome_sdr), () => accent),
    [deals, accent, ownerRole],
  )

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(980px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>
              {stageLabel}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {filtered.length} de {deals.length} deal{deals.length !== 1 ? 's' : ''} · {subtitle}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        {/* mini gráficos */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', gap: 32, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <BarList title="Por Marca" rows={porMarca} />
          <BarList title={`Por ${ownerLabel}`} rows={porResponsavel} />
        </div>

        {/* filtros */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>Filtrar por</span>
          <select value={filters.marca} onChange={e => setFilters(f => ({ ...f, marca: e.target.value }))} style={selectStyle}>
            <option value="">Todas as marcas</option>
            {options.marca.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.funil} onChange={e => setFilters(f => ({ ...f, funil: e.target.value }))} style={selectStyle}>
            <option value="">Todos os funis</option>
            {options.funil.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.fonte} onChange={e => setFilters(f => ({ ...f, fonte: e.target.value }))} style={selectStyle}>
            <option value="">Todas as fontes</option>
            {options.fonte.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.sdr} onChange={e => setFilters(f => ({ ...f, sdr: e.target.value }))} style={selectStyle}>
            <option value="">Todos os SDRs</option>
            {options.sdr.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.closer} onChange={e => setFilters(f => ({ ...f, closer: e.target.value }))} style={selectStyle}>
            <option value="">Todos os Closers</option>
            {options.closer.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              style={{
                border: '1px solid var(--ws-border)', borderRadius: 6, background: 'transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)',
                padding: '5px 10px', whiteSpace: 'nowrap',
              }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* tabela */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Negociação', 'Funil', 'Marca', 'Status', 'SDR', 'Closer', 'Fonte', 'Data na etapa'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum deal encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : filtered.map(({ row: r, dataEtapa }, i) => (
                <tr key={`${r.id_lead}::${r.ciclo}::${i}`} style={{
                  background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                  borderBottom: '1px solid var(--ws-border)',
                }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <a href={rdDealUrl(r.id_lead)} target="_blank" rel="noreferrer" style={{
                      color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {cell(r.nome_negociacao)}
                      <ExternalLink size={11} />
                    </a>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(r.nome_funil)}</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(r.marca)}</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}><StatusBadge status={r.status_atual} /></td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(r.nome_sdr)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(r.nome_closer)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(r.fonte_macro)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtData(dataEtapa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
