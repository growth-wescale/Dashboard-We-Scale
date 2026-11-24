/**
 * Pop-up "Reuniões": de onde vem o número "em N reuniões · M de LIVE".
 * LIVEs primeiro (cada uma é 1 reunião, com os negócios dela), depois os
 * Diagnósticos de LIVE que não contam neste recorte, depois as R1 individuais.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Video, X } from 'lucide-react'
import type { FunnelRow } from '@/lib/funnelTypes'
import { rdDealUrl } from '@/lib/rd'
import { nf } from '@/lib/format'
import { marcaLabel } from '@/constants/brands'
import type { DiagDeLiveForaDoRecorte, Reuniao, ResumoReunioes } from '@/lib/reunioesLive'
import { LinkLinhaDoTempo, StatusBadge, cell, fmtData } from './dealDrawerShared'

const thStyle = {
  padding: '8px 14px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11,
  color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' as const,
  borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap' as const,
}
const tdStyle = { padding: '8px 14px', whiteSpace: 'nowrap' as const }

/** Data e hora em Brasília ("19/11 20:00"). */
function dataHora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Negociacao({ row, accent }: { row: FunnelRow; accent: string }) {
  return (
    <>
      <a href={rdDealUrl(row.id_lead)} target="_blank" rel="noreferrer" style={{
        color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500,
      }}>
        {cell(row.nome_negociacao)}
        <ExternalLink size={11} />
      </a>
      <LinkLinhaDoTempo idDeal={row.id_lead} cor={accent} />
    </>
  )
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '18px 24px 6px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-primary)' }}>
        {titulo}
      </div>
      {nota && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{nota}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  )
}

function Chip({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'aviso' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      background: tom === 'aviso' ? 'var(--status-atencao-bg, var(--ws-bg))' : 'var(--ws-bg)',
      color: tom === 'aviso' ? 'var(--status-atencao)' : 'var(--ws-text-secondary)',
    }}>{children}</span>
  )
}

function LiveItem({ r, accent }: { r: Reuniao; accent: string }) {
  const [aberto, setAberto] = useState(false)
  const estimada = r.tipo === 'live-estimada'
  const convidados = r.live?.convidadosExternos ?? null
  const diags = r.negocios.length
  return (
    <div style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', marginBottom: 10, overflow: 'hidden' }}>
      <button type="button" onClick={() => setAberto(a => !a)} style={{
        width: '100%', border: 'none', background: 'var(--ws-surface)', cursor: 'pointer', textAlign: 'left',
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--font-body)',
        color: 'var(--ws-text-primary)',
      }}>
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {estimada ? fmtData(r.data) : dataHora(r.data)}
        </span>
        <span style={{ color: 'var(--ws-text-secondary)' }}>{cell(r.closer)}</span>
        {!estimada && r.live?.titulo && <span style={{ color: 'var(--ws-text-secondary)' }}>· {r.live.titulo}</span>}
        <span style={{ flex: 1 }} />
        {estimada
          ? <Chip tom="aviso">estimada</Chip>
          : convidados != null && <Chip>{nf(convidados)} convidado{convidados !== 1 ? 's' : ''}</Chip>}
        <Chip>{nf(diags)} Diagnóstico{diags !== 1 ? 's' : ''}</Chip>
        {!estimada && convidados != null && convidados > 0 && (
          <Chip>{Math.round((diags / convidados) * 100)}% comparecimento</Chip>
        )}
      </button>
      {aberto && (
        <div style={{ borderTop: '1px solid var(--ws-border)' }}>
          {estimada && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
              Sem gravação encontrada no MeetRox (lead que entrou por link sem convite, ou LIVE gravada sem convidados).
              Agrupado por Closer e dia do Diagnóstico.
            </div>
          )}
          {!estimada && r.live?.url && (
            <div style={{ padding: '10px 14px 0', fontSize: 12 }}>
              <a href={r.live.url} target="_blank" rel="noreferrer" style={{ color: accent, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Video size={13} /> Ver gravação no MeetRox
              </a>
            </div>
          )}
          <div className="rs-scroll-x">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Negociação', 'SDR', 'Status', 'Diagnóstico'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {r.negocios.map(n => (
                  <tr key={`${n.row.id_lead}::${n.row.ciclo}`} style={{ borderBottom: '1px solid var(--ws-border)' }}>
                    <td style={tdStyle}><Negociacao row={n.row} accent={accent} /></td>
                    <td style={tdStyle}>{cell(n.row.nome_sdr)}</td>
                    <td style={tdStyle}><StatusBadge status={n.row.status_atual} /></td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtData(n.dataDiagnostico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function motivoTexto(d: DiagDeLiveForaDoRecorte): string {
  return d.motivo === 'periodo'
    ? `LIVE de ${fmtData(d.dataLive)}, contada no período dela`
    : `LIVE conduzida por ${cell(d.closerLive)}`
}

export function ReunioesDrawer({ open, onClose, resumo, subtitle, accent }: {
  open: boolean
  onClose: () => void
  resumo: ResumoReunioes | null
  subtitle: string
  accent: string
}) {
  if (!open || !resumo) return null
  const lives = resumo.reunioes.filter(r => r.tipo !== 'individual')
  const individuais = resumo.reunioes.filter(r => r.tipo === 'individual')
  const { total, deLive, diagnosticos } = resumo

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />
      <div className="rs-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(900px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="rs-drawer-head" style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>Reuniões</h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {nf(total)} {total === 1 ? 'reunião' : 'reuniões'} ({nf(deLive)} de LIVE) para {nf(diagnosticos)} Diagnóstico{diagnosticos !== 1 ? 's' : ''} · {subtitle}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)',
            padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, paddingBottom: 24 }}>
          {lives.length > 0 && (
            <Secao titulo={`LIVEs · ${nf(lives.length)}`}
              nota="Cada LIVE conta como 1 reunião. Convidados vêm do convite no MeetRox (não é lista de presença); comparecimento = Diagnósticos ÷ convidados, só dos negócios no recorte.">
              {lives.map(r => <LiveItem key={r.chave} r={r} accent={accent} />)}
            </Secao>
          )}

          {resumo.diagsDeLiveForaDoRecorte.length > 0 && (
            <Secao titulo={`Diagnósticos de LIVE que não contam aqui · ${nf(resumo.diagsDeLiveForaDoRecorte.length)}`}
              nota="Estão no número de Diagnósticos, mas a LIVE deles conta em outro período ou para outro Closer.">
              <div className="rs-scroll-x">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Negociação', 'SDR', 'Diagnóstico', 'Por quê'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {resumo.diagsDeLiveForaDoRecorte.map((d, i) => (
                      <tr key={`${d.row.id_lead}::${d.row.ciclo}::${i}`} style={{ borderBottom: '1px solid var(--ws-border)' }}>
                        <td style={tdStyle}><Negociacao row={d.row} accent={accent} /></td>
                        <td style={tdStyle}>{cell(d.row.nome_sdr)}</td>
                        <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtData(d.dataDiagnostico)}</td>
                        <td style={{ ...tdStyle, color: 'var(--ws-text-secondary)' }}>{motivoTexto(d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          )}

          {individuais.length > 0 && (
            <Secao titulo={`R1 individuais · ${nf(individuais.length)}`} nota="Cada Diagnóstico de R1 individual conta como 1 reunião.">
              <div className="rs-scroll-x">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Negociação', 'Marca', 'SDR', 'Closer', 'Status', 'Diagnóstico'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {individuais.map(r => {
                      const n = r.negocios[0]
                      return (
                        <tr key={r.chave} style={{ borderBottom: '1px solid var(--ws-border)' }}>
                          <td style={tdStyle}><Negociacao row={n.row} accent={accent} /></td>
                          <td style={tdStyle}>{cell(marcaLabel(n.row.marca))}</td>
                          <td style={tdStyle}>{cell(n.row.nome_sdr)}</td>
                          <td style={tdStyle}>{cell(n.row.nome_closer)}</td>
                          <td style={tdStyle}><StatusBadge status={n.row.status_atual} /></td>
                          <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtData(n.dataDiagnostico)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Secao>
          )}
        </div>
      </div>
    </>
  )
}
