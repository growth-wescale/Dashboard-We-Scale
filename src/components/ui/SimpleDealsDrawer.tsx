/**
 * Pop-up leve pros quadrantes de KPI (Receita, Fechamentos, Vendas por Fonte)
 * — só a lista de deals que compõem o número, sem filtros nem quebras. Os
 * pop-ups do funil (StageDealsDrawer) têm mais contexto porque respondem
 * "quem está nessa etapa"; aqui a pergunta é só "quais deals são esses".
 */

import { ExternalLink, X } from 'lucide-react'
import type { FunnelRow } from '@/lib/funnelTypes'
import { rdDealUrl } from '@/lib/rd'
import { money } from '@/lib/format'
import { cell, fmtData } from './dealDrawerShared'

interface SimpleDealsDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  deals: FunnelRow[]
  accent: string
  /** Destaca a coluna Fonte (usado pelo pop-up de Vendas por Fonte). */
  destacarFonte?: boolean
}

export function SimpleDealsDrawer({ open, onClose, title, subtitle, deals, accent, destacarFonte }: SimpleDealsDrawerProps) {
  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(680px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>
              {title}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {deals.length} deal{deals.length !== 1 ? 's' : ''} · {subtitle}
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

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Negociação', 'Marca', 'Fonte', 'Valor', 'Data'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum deal no recorte selecionado.
                  </td>
                </tr>
              ) : deals.map((r, i) => (
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
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(r.marca)}</td>
                  <td style={{
                    padding: '10px 16px', whiteSpace: 'nowrap',
                    fontWeight: destacarFonte ? 600 : 400,
                    color: destacarFonte ? accent : 'var(--ws-text-secondary)',
                  }}>{cell(r.fonte_macro)}</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.valor_contrato ? money(r.valor_contrato) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtData(r.data_venda)}
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
