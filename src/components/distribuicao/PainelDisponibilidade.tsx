import { useState } from 'react'
import { cardStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import type { DisponibilidadeRow, PainelMarca } from '@/lib/distribuicao/regras'
import type { PessoaRd } from '@/hooks/useDistribuicao'
import type { DisponibilidadeInput } from '@/hooks/useGravarDistribuicao'
import { botaoTexto, fmtDataHora, pill, td, th } from './ui'

interface Props {
  pessoas: PessoaRd[]
  disponibilidade: DisponibilidadeRow[]
  painel: PainelMarca[]
  podeEditar: boolean
  onAlterar: (input: DisponibilidadeInput, marcasAfetadas: string[]) => Promise<void>
}

export function PainelDisponibilidade({ pessoas, disponibilidade, painel, podeEditar, onAlterar }: Props) {
  const [agendando, setAgendando] = useState<string | null>(null)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const sdrs = pessoas.filter(p => p.ativo && (p.cargo === 'SDR' || p.cargo === 'SDR/Closer'))
  const marcasDe = (nome: string) => [...new Set(painel.filter(l => l.nome_sdr === nome).map(l => l.marca))]

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>Disponibilidade dos SDRs</h2>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
        Quem está fora não recebe lead novo; os pesos dos outros são renormalizados e o contador das marcas da pessoa reinicia. A meta não muda.
      </div>
      <div className="rs-scroll-x">
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead><tr><th style={th}>SDR</th><th style={th}>Estado</th><th style={th}>Marcas</th><th style={th}>Ausências agendadas</th><th style={th}></th></tr></thead>
          <tbody>
            {sdrs.map(p => {
              const linhas = disponibilidade.filter(d => d.nome_sdr === p.nome && !d.encerrado_em)
              const foraAgora = linhas.find(d => d.cobre_agora)
              const futuras = linhas.filter(d => d.tipo === 'ausencia' && !d.cobre_agora && new Date(d.inicio).getTime() > Date.now())
              const marcas = marcasDe(p.nome)
              return (
                <tr key={p.nome} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={td}>{p.nome}</td>
                  <td style={td}>
                    {foraAgora
                      ? <span style={pill('var(--status-risco-bg)', 'var(--status-risco)')}>Fora desde {fmtDataHora(foraAgora.inicio)}{foraAgora.fim ? ` até ${fmtDataHora(foraAgora.fim)}` : ''}{foraAgora.motivo ? ` · ${foraAgora.motivo}` : ''}</span>
                      : <span style={pill('var(--status-positivo-bg)', 'var(--status-positivo)')}>Recebendo leads</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', fontSize: 12 }}>{marcas.length ? marcas.join(', ') : <span style={{ color: 'var(--ws-text-secondary)' }}>nenhuma regra</span>}</td>
                  <td style={{ ...td, whiteSpace: 'normal', fontSize: 12 }}>
                    {futuras.length === 0 ? '—' : futuras.map(d => (
                      <div key={d.id}>{fmtDataHora(d.inicio)} → {fmtDataHora(d.fim)}{d.motivo ? ` · ${d.motivo}` : ''}
                        {podeEditar && <button type="button" style={botaoTexto('var(--ws-text-secondary)')} onClick={() => onAlterar({ subacao: 'cancelar', id: d.id }, marcas)}>cancelar</button>}
                      </div>
                    ))}
                  </td>
                  <td style={td}>
                    {podeEditar && (foraAgora
                      ? <button type="button" style={botaoTexto()} onClick={() => onAlterar({ subacao: 'voltou', nome_sdr: p.nome }, marcas)}>Voltou</button>
                      : <>
                          <button type="button" style={botaoTexto('var(--status-risco)')} onClick={() => onAlterar({ subacao: 'fora_agora', nome_sdr: p.nome }, marcas)}>Fora hoje</button>
                          <button type="button" style={botaoTexto('var(--ws-text-secondary)')} onClick={() => { setAgendando(p.nome); setInicio(''); setFim(''); setMotivo('') }}>Agendar ausência</button>
                        </>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {agendando && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: 12, background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)' }}>
          <strong style={{ fontSize: 13 }}>{agendando}</strong>
          <label style={{ fontSize: 11 }}>Início<br /><input type="datetime-local" style={inputStyle} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
          <label style={{ fontSize: 11 }}>Fim<br /><input type="datetime-local" style={inputStyle} value={fim} onChange={e => setFim(e.target.value)} /></label>
          <label style={{ fontSize: 11 }}>Motivo<br /><input style={inputStyle} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="férias" /></label>
          <button type="button" style={{ ...primaryButtonStyle, padding: '7px 14px' }} disabled={!inicio || !fim}
            onClick={async () => { await onAlterar({ subacao: 'agendar', nome_sdr: agendando, inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), motivo }, marcasDe(agendando)); setAgendando(null) }}>Agendar</button>
          <button type="button" style={{ ...secondaryButtonStyle, padding: '7px 14px' }} onClick={() => setAgendando(null)}>Cancelar</button>
        </div>
      )}
    </section>
  )
}
