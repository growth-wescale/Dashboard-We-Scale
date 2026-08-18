import { useMemo } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { dealKey, STAGE_LABEL, type RepeatedDealGroup } from '@/lib/metrics'
import { nf } from '@/lib/format'
import { rdDealUrl } from '@/lib/rd'
import { BarList, StatusBadge, cell, fmtData, topBreakdown } from './dealDrawerShared'

interface RepeatedDealsDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  groups: RepeatedDealGroup[]
  accent: string
  /** Popup do total: várias etapas na mesma lista, mostra a coluna Etapa e o breakdown "Por Etapa". */
  multiStage?: boolean
}

export function RepeatedDealsDrawer({ open, onClose, title, subtitle, groups, accent, multiStage = false }: RepeatedDealsDrawerProps) {
  const ordenados = useMemo(() => [...groups].sort((a, b) => b.vezes - a.vezes), [groups])

  const porEtapa = useMemo(
    () => multiStage ? topBreakdown(groups, g => STAGE_LABEL[g.stage], () => accent, 12) : [],
    [groups, multiStage, accent],
  )

  const totalRepeticoes = useMemo(() => groups.reduce((s, g) => s + g.vezes, 0), [groups])

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(860px, 96vw)',
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
              {title}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {nf(groups.length)} deal{groups.length !== 1 ? 's' : ''} · {nf(totalRepeticoes)} repetição{totalRepeticoes !== 1 ? 'ões' : ''} · {subtitle}
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

        {multiStage && (
          <div style={{
            padding: '18px 24px', borderBottom: '1px solid var(--ws-border)', flexShrink: 0,
          }}>
            <BarList title="Por Etapa" rows={porEtapa} />
          </div>
        )}

        {/* tabela */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {[
                  'Negociação', ...(multiStage ? ['Etapa'] : []), 'Vezes', 'Marca', 'Status', 'SDR', 'Closer', 'Fonte', 'Última repetição',
                ].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 ? (
                <tr>
                  <td colSpan={multiStage ? 9 : 8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum deal repetido no recorte selecionado.
                  </td>
                </tr>
              ) : ordenados.map((g, i) => (
                <tr key={`${dealKey(g.row)}::${g.stage}::${i}`} style={{
                  background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                  borderBottom: '1px solid var(--ws-border)',
                }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <a href={rdDealUrl(g.row.id_lead)} target="_blank" rel="noreferrer" style={{
                      color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {cell(g.row.nome_negociacao)}
                      <ExternalLink size={11} />
                    </a>
                  </td>
                  {multiStage && (
                    <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[g.stage]}</td>
                  )}
                  <td style={{ padding: '10px 16px', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--status-atencao)' }}>
                    {nf(g.vezes)}
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(g.row.marca)}</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}><StatusBadge status={g.row.status_atual} /></td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(g.row.nome_sdr)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(g.row.nome_closer)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{cell(g.row.fonte_macro)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtData(g.ultimaData)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
