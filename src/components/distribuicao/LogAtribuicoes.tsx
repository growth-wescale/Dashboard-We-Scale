import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardStyle, inputStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import type { AtribuicaoRow, ResultadoAtribuicao } from '@/lib/distribuicao/regras'
import { TAMANHOS_PAGINA, useLogAtribuicoes, type FiltrosLog } from '@/hooks/useLogAtribuicoes'
import { RESULTADO_AJUDA, RESULTADO_VISUAL, botaoTexto, fmtDataHora, pill, td, th } from './ui'

interface Props {
  marcas: string[]
  sdrs: string[]
  podeEditar: boolean
  reprocessando: number | null
  /** Devolve true quando reprocessou (o log recarrega). */
  onReprocessar: (id: number) => Promise<boolean>
}

const RESULTADOS: ResultadoAtribuicao[] = ['atribuido', 'simulado', 'barrado', 'duplicado', 'fallback', 'erro']
const nf = new Intl.NumberFormat('pt-BR')

function contadoresTexto(c: AtribuicaoRow['contadores']): string {
  if (!c) return '—'
  return Object.entries(c).map(([n, [rec, peso]]) => `${n} ${rec} (${peso}%)`).join(' · ')
}

export function LogAtribuicoes({ marcas, sdrs, podeEditar, reprocessando, onReprocessar }: Props) {
  const [filtros, setFiltros] = useState<FiltrosLog>({ marca: '', resultado: '', sdr: '', busca: '' })
  const [buscaDigitada, setBuscaDigitada] = useState('')
  const [pagina, setPagina] = useState(0)
  const [tamanho, setTamanho] = useState<number>(10)
  const [legenda, setLegenda] = useState(false)
  const log = useLogAtribuicoes(filtros, pagina, tamanho)

  // Busca espera a pessoa parar de digitar (meio segundo) pra não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setFiltros(f => (f.busca === buscaDigitada ? f : { ...f, busca: buscaDigitada })); setPagina(0) }, 500)
    return () => clearTimeout(t)
  }, [buscaDigitada])

  function filtrar(parcial: Partial<FiltrosLog>) { setFiltros(f => ({ ...f, ...parcial })); setPagina(0) }
  const paginas = Math.max(1, Math.ceil(log.total / tamanho))
  const de = log.total === 0 ? 0 : pagina * tamanho + 1
  const ate = Math.min(log.total, (pagina + 1) * tamanho)

  const sel = { ...inputStyle, padding: '6px 8px' }
  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={sectionTitleStyle}>Registro de leads <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· {nf.format(log.total)} {log.total === 1 ? 'conversão' : 'conversões'}</span></h2>
        <button type="button" style={botaoTexto()} onClick={() => setLegenda(l => !l)} aria-expanded={legenda}>
          {legenda ? 'Fechar legenda' : 'O que significa cada resultado?'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        Toda conversão de formulário de chatbot que chega do RD Marketing (webhook) para uma marca configurada, desde 16/10. Conversões de outros formulários e eventos do CRM não entram.
      </p>

      {legenda && (
        <dl style={{ margin: '0 0 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 13, padding: 12, background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)' }}>
          {RESULTADOS.map(r => (
            <div key={r} style={{ display: 'contents' }}>
              <dt><span style={pill(RESULTADO_VISUAL[r].bg, RESULTADO_VISUAL[r].fg)}>{RESULTADO_VISUAL[r].label}</span></dt>
              <dd style={{ margin: 0, color: 'var(--ws-text-secondary)' }}>{RESULTADO_AJUDA[r]}</dd>
            </div>
          ))}
        </dl>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select id="log-marca" aria-label="Marca" style={sel} value={filtros.marca} onChange={e => filtrar({ marca: e.target.value })}><option value="">Todas as marcas</option>{marcas.map(m => <option key={m} value={m}>{m}</option>)}</select>
        <select id="log-resultado" aria-label="Resultado" style={sel} value={filtros.resultado} onChange={e => filtrar({ resultado: e.target.value as ResultadoAtribuicao | '' })}><option value="">Todos os resultados</option>{RESULTADOS.map(r => <option key={r} value={r}>{RESULTADO_VISUAL[r].label}</option>)}</select>
        <select id="log-sdr" aria-label="SDR" style={sel} value={filtros.sdr} onChange={e => filtrar({ sdr: e.target.value })}><option value="">Todos os SDRs</option>{sdrs.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <input id="log-busca" aria-label="Buscar" style={{ ...sel, minWidth: 220 }} placeholder="e-mail, nome ou id do deal" value={buscaDigitada} onChange={e => setBuscaDigitada(e.target.value)} />
      </div>

      {log.error && <div style={{ color: 'var(--status-risco)', fontSize: 13, marginBottom: 8 }}>Erro ao carregar: {log.error}</div>}

      <div className="rs-scroll-x" style={{ opacity: log.loading ? 0.5 : 1, transition: 'opacity .15s' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
          <thead><tr>
            <th style={th}>Recebido</th><th style={th}>Lead</th><th style={th}>Marca</th><th style={th}>Resultado</th><th style={th}>Motivo</th>
            <th style={th}>SDR</th><th style={th}>Contagem na hora</th><th style={th}>Regra</th><th style={th}>Deal</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {log.linhas.map(l => {
              const rv = RESULTADO_VISUAL[l.resultado]
              const pendente = l.resultado === 'erro' || ((l.resultado === 'atribuido' || l.resultado === 'fallback') && !l.id_deal)
              return (
                <tr key={l.id} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={td}>{fmtDataHora(l.recebido_em)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 180 }}><div>{l.lead_nome ?? '—'}</div><div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{l.lead_email}</div></td>
                  <td style={td}>{l.marca}</td>
                  <td style={td}><span style={pill(rv.bg, rv.fg)} title={RESULTADO_AJUDA[l.resultado]}>{rv.label}</span></td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 220, fontSize: 12 }} title={l.erro_rd ?? undefined}>
                    {l.motivo ?? '—'}
                    {l.reconversao && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Já tinha deal aberto{l.reconversao_sdr ? `: foi para ${l.reconversao_sdr}` : ': foi pelo rodízio'}. Anotação no deal.</div>}
                    {l.contato_reaproveitado && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Ligado ao contato que já existia no RD.</div>}
                    {l.erro_rd && <div style={{ color: 'var(--status-risco)', fontSize: 11 }}>{l.erro_rd.slice(0, 140)}</div>}
                    {l.cof_erro && <div style={{ color: 'var(--status-risco)', fontSize: 11 }}>COF não disparou: {l.cof_erro.slice(0, 120)}</div>}
                  </td>
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
                    {podeEditar && pendente && (
                      <button type="button" style={botaoTexto()} disabled={reprocessando === l.id}
                        onClick={async () => { if (await onReprocessar(l.id)) await log.refetch() }}>
                        {reprocessando === l.id ? 'Reprocessando…' : 'Reprocessar'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!log.loading && log.linhas.length === 0 && <tr><td style={{ ...td, color: 'var(--ws-text-secondary)' }} colSpan={10}>Nenhum registro com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        <label htmlFor="log-tamanho" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Linhas por página
          <select id="log-tamanho" style={sel} value={tamanho} onChange={e => { setTamanho(Number(e.target.value)); setPagina(0) }}>
            {TAMANHOS_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{nf.format(de)}–{nf.format(ate)} de {nf.format(log.total)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button type="button" style={botaoTexto()} disabled={pagina === 0} onClick={() => setPagina(0)} aria-label="Primeira página">«</button>
          <button type="button" style={botaoTexto()} disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))}>Anterior</button>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>página {pagina + 1} de {paginas}</span>
          <button type="button" style={botaoTexto()} disabled={pagina + 1 >= paginas} onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))}>Próxima</button>
          <button type="button" style={botaoTexto()} disabled={pagina + 1 >= paginas} onClick={() => setPagina(paginas - 1)} aria-label="Última página">»</button>
        </span>
      </div>
    </section>
  )
}
