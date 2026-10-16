import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardStyle, inputStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import type { AtribuicaoRow, ResultadoAtribuicao } from '@/lib/distribuicao/regras'
import { RESULTADO_VISUAL, botaoTexto, fmtDataHora, pill, td, th } from './ui'

interface Props {
  linhas: AtribuicaoRow[]
  podeEditar: boolean
  reprocessando: number | null
  onReprocessar: (id: number) => void
}

const RESULTADOS: ResultadoAtribuicao[] = ['atribuido', 'simulado', 'barrado', 'duplicado', 'fallback', 'erro']

function contadoresTexto(c: AtribuicaoRow['contadores']): string {
  if (!c) return '—'
  return Object.entries(c).map(([n, [rec, peso]]) => `${n} ${rec} (${peso}%)`).join(' · ')
}

export function LogAtribuicoes({ linhas, podeEditar, reprocessando, onReprocessar }: Props) {
  const [marca, setMarca] = useState('')
  const [resultado, setResultado] = useState('')
  const [sdr, setSdr] = useState('')
  const [busca, setBusca] = useState('')

  const marcas = useMemo(() => [...new Set(linhas.map(l => l.marca))].sort(), [linhas])
  const sdrs = useMemo(() => [...new Set(linhas.map(l => l.nome_sdr).filter(Boolean) as string[])].sort(), [linhas])
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter(l =>
      (!marca || l.marca === marca) && (!resultado || l.resultado === resultado) && (!sdr || l.nome_sdr === sdr)
      && (!q || (l.lead_email ?? '').toLowerCase().includes(q) || (l.lead_nome ?? '').toLowerCase().includes(q) || (l.id_deal ?? '').includes(q)),
    )
  }, [linhas, marca, resultado, sdr, busca])

  const sel = { ...inputStyle, padding: '6px 8px' }
  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>Log de atribuições <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· {filtradas.length} de {linhas.length} (últimas {linhas.length})</span></h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select style={sel} value={marca} onChange={e => setMarca(e.target.value)}><option value="">Todas as marcas</option>{marcas.map(m => <option key={m} value={m}>{m}</option>)}</select>
        <select style={sel} value={resultado} onChange={e => setResultado(e.target.value)}><option value="">Todos os resultados</option>{RESULTADOS.map(r => <option key={r} value={r}>{RESULTADO_VISUAL[r].label}</option>)}</select>
        <select style={sel} value={sdr} onChange={e => setSdr(e.target.value)}><option value="">Todos os SDRs</option>{sdrs.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <input style={{ ...sel, minWidth: 200 }} placeholder="e-mail, nome ou id do deal" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      <div className="rs-scroll-x">
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
          <thead><tr>
            <th style={th}>Recebido</th><th style={th}>Lead</th><th style={th}>Marca</th><th style={th}>Resultado</th><th style={th}>Motivo</th>
            <th style={th}>SDR</th><th style={th}>Contadores na hora</th><th style={th}>Regra</th><th style={th}>Deal</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {filtradas.map(l => {
              const rv = RESULTADO_VISUAL[l.resultado]
              return (
                <tr key={l.id} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={td}>{fmtDataHora(l.recebido_em)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 180 }}><div>{l.lead_nome ?? '—'}</div><div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{l.lead_email}</div></td>
                  <td style={td}>{l.marca}</td>
                  <td style={td}><span style={pill(rv.bg, rv.fg)}>{rv.label}</span></td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 220, fontSize: 12 }} title={l.erro_rd ?? undefined}>{l.motivo ?? '—'}{l.erro_rd && <div style={{ color: 'var(--status-risco)', fontSize: 11 }}>{l.erro_rd.slice(0, 140)}</div>}</td>
                  <td style={td}>{l.nome_sdr ?? (l.resultado === 'fallback' ? 'responsável padrão' : '—')}</td>
                  <td style={{ ...td, whiteSpace: 'normal', fontSize: 11, color: 'var(--ws-text-secondary)', minWidth: 200 }}>{contadoresTexto(l.contadores)}</td>
                  <td style={td}>#{l.regra_id}</td>
                  <td style={td}>
                    {l.id_deal ? (
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        <a href={`https://crm.rdstation.com/app/deals/${l.id_deal}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-accent)' }}>RD</a>
                        <Link to={`/linha-do-tempo/${l.id_deal}`} style={{ color: 'var(--brand-accent)' }}>Linha do Tempo</Link>
                      </span>
                    ) : '—'}
                  </td>
                  <td style={td}>
                    {podeEditar && l.resultado === 'erro' && (
                      <button type="button" style={botaoTexto()} disabled={reprocessando === l.id} onClick={() => onReprocessar(l.id)}>
                        {reprocessando === l.id ? 'Reprocessando…' : 'Reprocessar'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtradas.length === 0 && <tr><td style={{ ...td, color: 'var(--ws-text-secondary)' }} colSpan={10}>Nenhum registro com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
