import { useMemo, useState } from 'react'
import { cardStyle, secondaryButtonStyle } from '@/components/metas/metasUi'
import { desvios, diffRegra, rotuloFonteTime, textoBarreira, type PainelMarca, type RegraRow } from '@/lib/distribuicao/regras'
import { MODO_VISUAL, botaoTexto, fmtDataHora, pill, td, tdNum, th } from './ui'

interface Props {
  regra: RegraRow
  versoes: RegraRow[]
  linhas: PainelMarca[]
  podeEditar: boolean
  onEditar: (regra: RegraRow) => void
}

export function CardMarca({ regra, versoes, linhas, podeEditar, onEditar }: Props) {
  const [historico, setHistorico] = useState(false)
  const modo = MODO_VISUAL[regra.modo]
  const elegiveis = linhas.filter(l => l.nome_sdr && !l.inelegivel_motivo)
  const inelegiveis = linhas.filter(l => l.inelegivel_motivo)
  const cab = linhas[0]
  const lista = useMemo(() => desvios(
    elegiveis.map(l => ({ nome: l.nome_sdr!, peso: Number(l.peso) })),
    Object.fromEntries(elegiveis.map(l => [l.nome_sdr!, l.recebidos])),
  ), [elegiveis])
  const total = elegiveis.reduce((s, l) => s + l.recebidos, 0)
  const ordenadas = [...versoes].sort((a, b) => b.versao - a.versao)

  return (
    <div style={{ ...cardStyle, padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18 }}>{regra.marca}</h3>
          <span style={pill(modo.bg, modo.fg)}>{modo.label}</span>
          <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>v{regra.versao}</span>
        </div>
        {podeEditar && <button type="button" style={{ ...secondaryButtonStyle, padding: '6px 12px' }} onClick={() => onEditar(regra)}>Editar regra</button>}
      </div>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
        <dt style={{ color: 'var(--ws-text-secondary)' }}>Evento</dt><dd style={{ margin: 0 }}><code>{regra.evento_identificador}</code></dd>
        <dt style={{ color: 'var(--ws-text-secondary)' }}>Barreira</dt><dd style={{ margin: 0 }}>{textoBarreira(regra.barreira_campo, regra.barreira_valores_barrados)}</dd>
        <dt style={{ color: 'var(--ws-text-secondary)' }}>Time</dt><dd style={{ margin: 0 }}>{rotuloFonteTime(cab?.fonte_time)}{cab?.reinicio_em ? ` · contador desde ${fmtDataHora(cab.reinicio_em)}` : ''}</dd>
        {regra.marca_rd !== regra.marca && <><dt style={{ color: 'var(--ws-text-secondary)' }}>Marca no RD</dt><dd style={{ margin: 0 }}>{regra.marca_rd}</dd></>}
      </dl>

      {lista.length > 0 ? (
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
            <thead><tr><th style={th}>SDR</th><th style={{ ...th, textAlign: 'right' }}>Peso</th><th style={{ ...th, textAlign: 'right' }}>Recebidos</th><th style={{ ...th, textAlign: 'right' }}>% recebido</th><th style={{ ...th, textAlign: 'right' }}>Desvio</th></tr></thead>
            <tbody>
              {lista.map(l => (
                <tr key={l.nome} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={td}>{l.nome}</td>
                  <td style={tdNum}>{l.peso}%</td>
                  <td style={tdNum}>{l.recebidos}</td>
                  <td style={tdNum}>{total > 0 ? `${l.pctRecebido}%` : '—'}</td>
                  <td style={{ ...tdNum, color: l.desvio < -0.5 ? 'var(--status-risco)' : l.desvio > 0.5 ? 'var(--status-atencao)' : 'var(--ws-text-secondary)' }}>
                    {l.desvio > 0 ? `+${l.desvio}` : l.desvio}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--status-risco)' }}>Nenhum SDR elegível — o deal vai para o responsável padrão.</div>
      )}

      {inelegiveis.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--status-atencao)' }}>
          Fora do rodízio: {inelegiveis.map(l => `${l.nome_sdr} (${l.inelegivel_motivo})`).join(' · ')}
        </div>
      )}

      <div>
        <button type="button" style={botaoTexto('var(--ws-text-secondary)')} onClick={() => setHistorico(h => !h)}>
          {historico ? 'Ocultar histórico' : `Histórico (${ordenadas.length} ${ordenadas.length === 1 ? 'versão' : 'versões'})`}
        </button>
        {historico && (
          <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ordenadas.map((v, i) => {
              const anterior = ordenadas[i + 1]
              const mudancas = anterior ? diffRegra(anterior, v) : []
              return (
                <li key={v.id}>
                  <strong>v{v.versao}</strong> · {fmtDataHora(v.vigente_de)}{v.vigente_ate ? ` → ${fmtDataHora(v.vigente_ate)}` : ' (vigente)'} · {v.criado_por ?? '?'}
                  {v.motivo && <span style={{ color: 'var(--ws-text-secondary)' }}> · {v.motivo}</span>}
                  {anterior && (
                    <div style={{ color: 'var(--ws-text-secondary)' }}>{mudancas.length ? mudancas.join('; ') : 'sem mudança de conteúdo'}</div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
