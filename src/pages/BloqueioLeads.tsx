// Aba Bloqueio de Leads (Vendas): e-mails que não viram negociação nas marcas escolhidas.
// A conversão continua chegando do RD Marketing; a distribuição registra como "Bloqueado" e não
// cria deal, não dispara COF e não conta no rodízio. Quem vê a aba (aba.bloqueio-leads) pode
// bloquear, mudar as marcas e desbloquear; tudo fica no histórico (quem, quando, motivo).
// Spec: docs/superpowers/specs/2026-11-23-bloqueio-de-leads-design.md
import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useAcesso } from '@/contexts/AcessoContext'
import { bannerStyle, cardStyle, inputStyle, primaryButtonStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import { botaoTexto, pill, td, th } from '@/components/distribuicao/ui'
import { EditorBloqueio, type ModoEditor } from '@/components/bloqueio/EditorBloqueio'
import { HistoricoLead } from '@/components/bloqueio/HistoricoLead'
import { ACAO_VISUAL, fmtData, fmtDataHoraAno } from '@/components/bloqueio/visual'
import { useBloqueios } from '@/hooks/useBloqueios'
import { salvarBloqueio, type SalvarBloqueioInput } from '@/hooks/useGravarBloqueio'
import { filtrarBloqueios, resumoLog, textoMarcas, type SituacaoFiltro } from '@/lib/distribuicao/bloqueio'

type Aviso = { tipo: 'sucesso' | 'erro'; texto: string } | null
const PASSO_HISTORICO = 30
const nf = new Intl.NumberFormat('pt-BR')

export function BloqueioLeads() {
  const d = useBloqueios()
  const { pode } = useAcesso()
  const podeEditar = pode('aba.bloqueio-leads')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [editor, setEditor] = useState<{ modo: ModoEditor; email: string } | null>(null)
  const [historico, setHistorico] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<SituacaoFiltro>('bloqueados')
  const [mostrarLog, setMostrarLog] = useState(PASSO_HISTORICO)

  const rotulo = useMemo(() => {
    const m = new Map(d.marcas.map(x => [x.marca, x.rotulo]))
    return (marca: string) => m.get(marca) ?? marca
  }, [d.marcas])
  const todas = useMemo(() => d.marcas.map(m => m.marca), [d.marcas])
  const linhas = useMemo(() => filtrarBloqueios(d.bloqueios, { busca, situacao }), [d.bloqueios, busca, situacao])
  const totalBloqueados = d.bloqueios.filter(b => b.bloqueado).length
  const porEmail = useMemo(() => new Map(d.bloqueios.map(b => [b.email, b])), [d.bloqueios])

  async function salvar(input: SalvarBloqueioInput): Promise<string | null> {
    const r = await salvarBloqueio(input)
    if (!r.ok) {
      // Bloqueio mudou desde que a tela abriu: recarrega a lista e o formulário passa a mostrar o atual.
      if (r.conflito) await d.refetch()
      return r.error ?? 'não foi possível salvar'
    }
    const texto = r.acao === 'desbloqueio' ? `${input.email} desbloqueado.`
      : r.acao === 'alteracao' ? `Marcas de ${input.email} atualizadas: ${textoMarcas(input.marcas, todas, rotulo)}.`
      : `${input.email} bloqueado em ${textoMarcas(input.marcas, todas, rotulo)}.`
    setAviso({ tipo: 'sucesso', texto })
    setEditor(null)
    await d.refetch()
    return null
  }

  const sel = { ...inputStyle, padding: '6px 8px' }

  return (
    <div style={{ padding: '24px var(--page-pad-x, 24px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageTop
        title="Bloqueio de Leads"
        subtitle="E-mails que não viram negociação nas marcas escolhidas. A conversão continua chegando do RD Marketing e fica no registro da distribuição como Bloqueado."
        actions={podeEditar ? <button type="button" style={primaryButtonStyle} onClick={() => setEditor({ modo: 'novo', email: '' })}>Bloquear e-mail</button> : null}
      />

      {aviso && <div style={{ ...bannerStyle(aviso.tipo), cursor: 'pointer' }} onClick={() => setAviso(null)}>{aviso.texto}</div>}
      {d.error && <div style={bannerStyle('erro')}>Erro ao carregar: {d.error}</div>}

      <section style={{ ...cardStyle, padding: '14px 18px' }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ws-text-secondary)', display: 'grid', gap: 4 }}>
          <li>Conversão de e-mail bloqueado numa marca <strong>não cria negociação, não dispara a COF e não conta no rodízio</strong> do SDR. O bloqueio vale só nas marcas escolhidas e só pelo e-mail (outro e-mail da mesma pessoa passa).</li>
          <li>O RD Marketing continua registrando a conversão e mandando e-mails para a pessoa. Para parar os e-mails, desative o lead no RD Marketing.</li>
          <li>Desbloquear (tirar todas as marcas) faz a próxima conversão seguir o fluxo normal. Nada é apagado: bloqueio, troca de marcas e desbloqueio ficam no histórico com quem fez e o motivo.</li>
        </ul>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>E-mails bloqueados <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· {nf.format(totalBloqueados)} {totalBloqueados === 1 ? 'bloqueado agora' : 'bloqueados agora'}</span></h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input aria-label="Buscar" style={{ ...sel, minWidth: 240 }} placeholder="e-mail ou nome" value={busca} onChange={e => setBusca(e.target.value)} />
          <select aria-label="Situação" style={sel} value={situacao} onChange={e => setSituacao(e.target.value as SituacaoFiltro)}>
            <option value="bloqueados">Bloqueados agora</option>
            <option value="desbloqueados">Desbloqueados</option>
            <option value="todos">Todos os e-mails da lista</option>
          </select>
        </div>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
            <thead><tr>
              <th style={th}>Lead</th><th style={th}>Bloqueado em</th><th style={th}>Bloqueado desde</th><th style={th}>Última alteração</th>
              <th style={th} title="Conversões que chegaram depois do bloqueio e não viraram negociação">Tentativas barradas</th>
              <th style={th} title="Negócios com este e-mail no RD CRM, de qualquer época">Negócios no RD</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {linhas.map(b => (
                <tr key={b.email} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>
                    <div>{b.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', overflowWrap: 'anywhere' }}>{b.email}</div>
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>
                    {b.bloqueado
                      ? <span style={pill('var(--status-risco-bg)', 'var(--status-risco)')}>{textoMarcas(b.marcas, todas, rotulo)}</span>
                      : <span style={pill('var(--ws-bg)', 'var(--ws-text-secondary)')}>Desbloqueado</span>}
                  </td>
                  <td style={td}>
                    {b.bloqueado ? (
                      <>
                        <div>{fmtData(b.bloqueado_desde)}</div>
                        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{b.bloqueado_por ?? ''}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>—<div style={{ fontSize: 11 }}>último bloqueio {fmtData(b.bloqueado_desde)}</div></div>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>
                    <div>{fmtDataHoraAno(b.atualizado_em)} <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>· {b.atualizado_por}</span></div>
                    {b.motivo && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }} title={b.motivo}>“{b.motivo.length > 90 ? `${b.motivo.slice(0, 90)}…` : b.motivo}”</div>}
                  </td>
                  <td style={td}>
                    {b.tentativas_bloqueadas}
                    {b.ultima_tentativa_bloqueada && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>última {fmtData(b.ultima_tentativa_bloqueada)}</div>}
                  </td>
                  <td style={td}>{b.negocios_crm}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      <button type="button" style={botaoTexto()} onClick={() => setHistorico(b.email)}>Histórico</button>
                      {podeEditar && <button type="button" style={botaoTexto()} onClick={() => setEditor({ modo: b.bloqueado ? 'editar' : 'novo', email: b.email })}>{b.bloqueado ? 'Editar marcas' : 'Bloquear de novo'}</button>}
                      {podeEditar && b.bloqueado && <button type="button" style={botaoTexto('var(--status-risco)')} onClick={() => setEditor({ modo: 'desbloquear', email: b.email })}>Desbloquear</button>}
                    </span>
                  </td>
                </tr>
              ))}
              {!d.loading && linhas.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, color: 'var(--ws-text-secondary)' }}>
                  {d.bloqueios.length === 0 ? 'Nenhum e-mail bloqueado ainda. Use "Bloquear e-mail" no topo.' : 'Nenhum e-mail com esses filtros.'}
                </td></tr>
              )}
              {d.loading && <tr><td colSpan={7} style={{ ...td, color: 'var(--ws-text-secondary)' }}>Carregando…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Histórico de bloqueios <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· todos os e-mails, mais recente primeiro</span></h2>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead><tr><th style={th}>Quando</th><th style={th}>Quem</th><th style={th}>Lead</th><th style={th}>Ação</th><th style={th}>O que mudou</th><th style={th}>Motivo</th></tr></thead>
            <tbody>
              {d.log.slice(0, mostrarLog).map(l => {
                const av = ACAO_VISUAL[l.acao]
                const nome = porEmail.get(l.email)?.nome
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--ws-border)' }}>
                    <td style={td}>{fmtDataHoraAno(l.em)}</td>
                    <td style={{ ...td, fontSize: 12 }}>{l.autor}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 180 }}>
                      <button type="button" style={{ ...botaoTexto(), padding: 0, textAlign: 'left' }} onClick={() => setHistorico(l.email)}>{nome ?? l.email}</button>
                      {nome && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', overflowWrap: 'anywhere' }}>{l.email}</div>}
                    </td>
                    <td style={td}><span style={pill(av.bg, av.fg)}>{av.label}</span></td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 200, fontSize: 12 }}>{resumoLog(l, rotulo)}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 200, fontSize: 12, color: 'var(--ws-text-secondary)' }}>{l.motivo}</td>
                  </tr>
                )
              })}
              {!d.loading && d.log.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--ws-text-secondary)' }}>Nenhuma ação ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        {d.log.length > mostrarLog && (
          <button type="button" style={{ ...botaoTexto(), marginTop: 8 }} onClick={() => setMostrarLog(n => n + PASSO_HISTORICO)}>
            Mostrar mais ({nf.format(d.log.length - mostrarLog)} restantes)
          </button>
        )}
      </section>

      {editor && (
        <EditorBloqueio
          key={`${editor.modo}-${editor.email}`}
          modo={editor.modo}
          emailInicial={editor.email}
          marcas={d.marcas}
          existentes={d.bloqueios}
          onSalvar={salvar}
          onFechar={() => setEditor(null)}
        />
      )}
      {historico && (
        <HistoricoLead
          email={historico}
          bloqueio={porEmail.get(historico) ?? null}
          todas={todas}
          rotulo={rotulo}
          podeEditar={podeEditar}
          onEditar={() => { const b = porEmail.get(historico); setHistorico(null); setEditor({ modo: b?.bloqueado ? 'editar' : 'novo', email: historico }) }}
          onFechar={() => setHistorico(null)}
        />
      )}
    </div>
  )
}
