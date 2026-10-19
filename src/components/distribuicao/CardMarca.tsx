import { useMemo, useState } from 'react'
import { cardStyle, secondaryButtonStyle } from '@/components/metas/metasUi'
import { desvios, diffRegra, rotuloFonteTime, textoBarreira, textoTarefa, type PainelMarca, type RegraRow } from '@/lib/distribuicao/regras'
import { MODO_VISUAL, botaoTexto, fmtDataHora, pill } from './ui'

interface Props {
  regra: RegraRow
  versoes: RegraRow[]
  linhas: PainelMarca[]
  podeEditar: boolean
  onEditar: (regra: RegraRow) => void
}

const rotulo = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: 'var(--ws-text-secondary)' }

export function CardMarca({ regra, versoes, linhas, podeEditar, onEditar }: Props) {
  const [historico, setHistorico] = useState(false)
  const modo = MODO_VISUAL[regra.modo]
  const elegiveis = linhas.filter(l => l.nome_sdr && !l.inelegivel_motivo)
  const inelegiveis = linhas.filter(l => l.inelegivel_motivo)
  const cab = linhas[0]
  const lista = useMemo(() => desvios(
    elegiveis.map(l => ({ nome: l.nome_sdr!, peso: Number(l.peso) })),
    Object.fromEntries(elegiveis.map(l => [l.nome_sdr!, l.recebidos])),
  ).sort((a, b) => b.peso - a.peso || a.nome.localeCompare(b.nome)), [elegiveis])
  const total = elegiveis.reduce((s, l) => s + l.recebidos, 0)
  const ordenadas = [...versoes].sort((a, b) => b.versao - a.versao)
  const desde = cab?.reinicio_em ? fmtDataHora(cab.reinicio_em) : null
  const oQueConta = regra.modo === 'ativo' ? 'leads distribuídos' : 'leads que teriam sido distribuídos (teste)'

  return (
    <article style={{ ...cardStyle, padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>{regra.marca}</h3>
            <span style={pill(modo.bg, modo.fg)} title={modo.ajuda}>{modo.label}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            regra v{regra.versao} · {rotuloFonteTime(cab?.fonte_time)}{regra.marca_rd !== regra.marca ? ` · no RD: ${regra.marca_rd}` : ''}
          </span>
        </div>
        {podeEditar && <button type="button" style={{ ...secondaryButtonStyle, padding: '6px 12px', flexShrink: 0 }} onClick={() => onEditar(regra)}>Editar regra</button>}
      </header>

      <section aria-label="Divisão dos leads" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={rotulo}>Divisão dos leads</span>
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            {total} {oQueConta}{desde ? ` desde ${desde}` : ''}
          </span>
        </div>
        {lista.length > 0 ? lista.map(l => {
          const corDesvio = l.desvio < -0.5 ? 'var(--status-risco)' : l.desvio > 0.5 ? 'var(--status-atencao)' : 'var(--ws-text-secondary)'
          return (
            <div key={l.nome} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr auto', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.nome}>{l.nome}</span>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--ws-bg)', overflow: 'hidden' }} title={`peso ${l.peso}% · recebeu ${total > 0 ? l.pctRecebido : 0}%`}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, l.peso)}%`, borderRadius: 5, background: 'var(--brand-accent)', opacity: 0.25 }} />
                {total > 0 && <div style={{ position: 'absolute', top: 2, bottom: 2, left: 0, width: `${Math.min(100, l.pctRecebido)}%`, borderRadius: 4, background: 'var(--brand-accent)' }} />}
              </div>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right', minWidth: 150 }}>
                <strong>{l.peso}%</strong>
                <span style={{ color: 'var(--ws-text-secondary)' }}> · {l.recebidos} {l.recebidos === 1 ? 'lead' : 'leads'}</span>
                {total > 0 && <span style={{ color: corDesvio }}> ({l.desvio > 0 ? `+${l.desvio}` : l.desvio})</span>}
              </span>
            </div>
          )
        }) : (
          <div style={{ fontSize: 12, color: 'var(--status-risco)' }}>Nenhum SDR disponível: os leads vão para o responsável padrão.</div>
        )}
        {lista.length > 1 && (
          <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>
            Barra clara = peso na meta; barra escura = parte dos leads que a pessoa recebeu. Entre parênteses, quantos leads acima (+) ou abaixo (−) do esperado.
          </span>
        )}
        {inelegiveis.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--status-atencao)' }}>
            Fora da divisão agora: {inelegiveis.map(l => `${l.nome_sdr} (${l.inelegivel_motivo})`).join(' · ')}
          </div>
        )}
      </section>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '6px 12px', fontSize: 12, paddingTop: 12, borderTop: '1px solid var(--ws-border)' }}>
        <dt style={rotulo}>Régua de MQL</dt><dd style={{ margin: 0 }}>{textoBarreira(regra.barreira_campo, regra.barreira_valores_barrados)}</dd>
        <dt style={rotulo}>COF</dt><dd style={{ margin: 0 }}>{regra.conversao_cof ? <>conversão <code>{regra.conversao_cof}</code> no RD Marketing</> : 'não envia'}</dd>
        {regra.tarefa && <><dt style={rotulo}>Tarefa</dt><dd style={{ margin: 0 }}>{textoTarefa(regra.tarefa)}</dd></>}
        <dt style={rotulo}>Formulário</dt><dd style={{ margin: 0 }}><code>{regra.evento_identificador}</code></dd>
      </dl>

      <div>
        <button type="button" style={{ ...botaoTexto('var(--ws-text-secondary)'), padding: 0 }} onClick={() => setHistorico(h => !h)} aria-expanded={historico}>
          {historico ? 'Ocultar histórico' : `Histórico da regra (${ordenadas.length} ${ordenadas.length === 1 ? 'versão' : 'versões'})`}
        </button>
        {historico && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordenadas.map((v, i) => {
              const anterior = ordenadas[i + 1]
              const mudancas = anterior ? diffRegra(anterior, v) : []
              return (
                <li key={v.id}>
                  <strong>v{v.versao}</strong> · {fmtDataHora(v.vigente_de)}{v.vigente_ate ? ` → ${fmtDataHora(v.vigente_ate)}` : ' (vigente)'} · {v.criado_por ?? '?'}
                  {v.motivo && <div style={{ color: 'var(--ws-text-secondary)' }}>{v.motivo}</div>}
                  {anterior && <div style={{ color: 'var(--ws-text-secondary)' }}>{mudancas.length ? mudancas.join('; ') : 'sem mudança de conteúdo'}</div>}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </article>
  )
}
