import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { fmtBR } from '@/lib/dateUtils'

function fmtDia(dia: string | null | undefined): string {
  if (!dia) return '—'
  // dia vem como 'YYYY-MM-DD' (col do banco); se vier ISO completo, trunca
  const iso = dia.slice(0, 10)
  return fmtBR(iso)
}

const CAPITAL_LABELS: Record<string, string> = {
  acima_200k:  'Acima de R$200k',
  '100k_200k': 'R$100k – R$200k',
  '50k_100k':  'R$50k – R$100k',
  ate_50k:     'Até R$50k',
}

function capitalLabel(value: unknown): string {
  if (typeof value !== 'string') return '—'
  return CAPITAL_LABELS[value] ?? value
}

function cell(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function adName(lead: Lead): string {
  const content = lead.dados_extras?.['utm_content']
  if (typeof content === 'string' && content !== '') return content
  return '—'
}

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--ws-border)', borderRadius: 8,
  background: 'var(--ws-bg)', color: 'var(--ws-text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
  padding: '6px 10px', cursor: 'pointer', minWidth: 0, flex: 1,
}

interface MqlDrawerProps {
  open: boolean
  onClose: () => void
  leads: Lead[]
}

export function MqlDrawer({ open, onClose, leads }: MqlDrawerProps) {
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterAd, setFilterAd] = useState('')

  const campaigns = useMemo(() => {
    const vals = new Set(leads.map(l => l.utm_campaign ?? '').filter(Boolean))
    return Array.from(vals).sort()
  }, [leads])

  const ads = useMemo(() => {
    const vals = new Set(
      leads
        .map(l => {
          const c = l.dados_extras?.['utm_content']
          return typeof c === 'string' ? c : ''
        })
        .filter(Boolean)
    )
    return Array.from(vals).sort()
  }, [leads])

  const filtered = useMemo(() => leads.filter(l => {
    if (filterCampaign && l.utm_campaign !== filterCampaign) return false
    if (filterAd) {
      const c = l.dados_extras?.['utm_content']
      if (typeof c !== 'string' || c !== filterAd) return false
    }
    return true
  }), [leads, filterCampaign, filterAd])

  if (!open) return null

  const hasFilters = filterCampaign || filterAd

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(920px, 94vw)',
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
              Lista de MQLs
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {filtered.length} de {leads.length} lead{leads.length !== 1 ? 's' : ''} qualificados no período
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

        {/* filters */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>Filtrar por</span>
          <select
            value={filterCampaign}
            onChange={e => { setFilterCampaign(e.target.value); setFilterAd('') }}
            style={selectStyle}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterAd}
            onChange={e => setFilterAd(e.target.value)}
            style={selectStyle}
          >
            <option value="">Todos os anúncios</option>
            {ads
              .filter(a => {
                if (!filterCampaign) return true
                return leads.some(l => l.utm_campaign === filterCampaign && l.dados_extras?.['utm_content'] === a)
              })
              .map(a => <option key={a} value={a}>{a.length > 60 ? a.slice(0, 60) + '…' : a}</option>)
            }
          </select>
          {hasFilters && (
            <button
              onClick={() => { setFilterCampaign(''); setFilterAd('') }}
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

        {/* table */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Data', 'Nome', 'E-mail', 'Marca', 'Capital', 'Campanha', 'Anúncio'].map(h => (
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
                  <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum MQL encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : filtered.map((lead, i) => (
                <tr key={lead.id} style={{
                  background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                  borderBottom: '1px solid var(--ws-border)',
                }}>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDia(lead.dia)}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--ws-text-primary)', whiteSpace: 'nowrap' }}>
                    {cell(lead.nome)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)' }}>
                    {cell(lead.email)}
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)',
                      color: 'var(--brand-accent)',
                    }}>
                      {cell(lead.marca)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--ws-text-primary)' }}>
                    {capitalLabel(lead.dados_extras?.['capital'])}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={cell(lead.utm_campaign)}>
                    {cell(lead.utm_campaign)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={adName(lead)}>
                    {adName(lead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
