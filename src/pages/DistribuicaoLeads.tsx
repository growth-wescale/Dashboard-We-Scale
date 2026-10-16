// Aba Distribuição de Leads (Vendas): painel por marca, log de atribuições, disponibilidade
// dos SDRs e saúde do fluxo. Só Administrador vê e edita (aba.distribuicao / acao.distribuicao-editar).
// Spec: docs/superpowers/specs/2026-10-16-distribuicao-leads-sdr-design.md
import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useAcesso } from '@/contexts/AcessoContext'
import { bannerStyle, cardStyle, primaryButtonStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import { useDistribuicao } from '@/hooks/useDistribuicao'
import { alterarDisponibilidade, publicarRegra, reprocessar, type DisponibilidadeInput, type RegraInput } from '@/hooks/useGravarDistribuicao'
import type { RegraRow } from '@/lib/distribuicao/regras'
import { CardMarca } from '@/components/distribuicao/CardMarca'
import { EditorRegra } from '@/components/distribuicao/EditorRegra'
import { LogAtribuicoes } from '@/components/distribuicao/LogAtribuicoes'
import { PainelDisponibilidade } from '@/components/distribuicao/PainelDisponibilidade'
import { MODO_VISUAL, fmtRelativo, pill, td, th } from '@/components/distribuicao/ui'

type Aviso = { tipo: 'sucesso' | 'erro'; texto: string } | null

export function DistribuicaoLeads() {
  const d = useDistribuicao()
  const { pode } = useAcesso()
  const podeEditar = pode('acao.distribuicao-editar')
  const [editando, setEditando] = useState<RegraRow | null | 'nova'>(null)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [reprocessando, setReprocessando] = useState<number | null>(null)

  const vigentes = useMemo(() => d.regras.filter(r => !r.vigente_ate && !r.marca.startsWith('Teste')).sort((a, b) => a.marca.localeCompare(b.marca)), [d.regras])
  const porMarca = useMemo(() => {
    const m = new Map<string, typeof d.painel>()
    for (const l of d.painel) m.set(l.marca, [...(m.get(l.marca) ?? []), l])
    return m
  }, [d.painel])
  const saudeVisivel = d.saude.filter(s => !s.marca.startsWith('Teste'))

  async function salvarRegra(regra: RegraInput, motivo: string): Promise<string | null> {
    const r = await publicarRegra(regra, motivo)
    if (!r.ok) return r.error ?? 'não foi possível publicar'
    setAviso({ tipo: 'sucesso', texto: `Regra da ${regra.marca} publicada como v${r.versao}.` })
    await d.refetch()
    return null
  }

  async function alterarDisp(input: DisponibilidadeInput, marcas: string[]) {
    const nome = 'nome_sdr' in input ? input.nome_sdr : ''
    const acao = input.subacao === 'fora_agora' ? `marcar ${nome} como fora` : input.subacao === 'voltou' ? `marcar a volta de ${nome}` : input.subacao === 'agendar' ? `agendar a ausência de ${nome}` : 'cancelar esta ausência'
    const marcasTxt = marcas.length ? ` Isso reinicia o contador de: ${marcas.join(', ')}.` : ''
    if (!window.confirm(`Confirma ${acao}?${marcasTxt}`)) return
    const r = await alterarDisponibilidade(input)
    setAviso(r.ok ? { tipo: 'sucesso', texto: 'Disponibilidade atualizada.' } : { tipo: 'erro', texto: r.error ?? 'falhou' })
    await d.refetch()
  }

  async function reprocessarRegistro(id: number) {
    setReprocessando(id)
    const r = await reprocessar(id)
    setReprocessando(null)
    setAviso(r.ok ? { tipo: 'sucesso', texto: `Registro #${id} reprocessado: deal ${r.idDeal}.` } : { tipo: 'erro', texto: `Registro #${id}: ${r.error}` })
    await d.refetch()
  }

  return (
    <div style={{ padding: '24px var(--page-pad-x, 24px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageTop
        title="Distribuição de Leads"
        subtitle="Quem recebe cada lead novo, pelo peso da meta do mês. Barreira de MQL versionada, disponibilidade e registro de toda conversão."
        actions={podeEditar ? <button type="button" style={primaryButtonStyle} onClick={() => setEditando('nova')}>Nova marca</button> : null}
      />

      {aviso && <div style={bannerStyle(aviso.tipo)} onClick={() => setAviso(null)}>{aviso.texto}</div>}
      {d.error && <div style={bannerStyle('erro')}>Erro ao carregar: {d.error}</div>}
      {d.loading && <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>Carregando…</div>}

      {!d.loading && (
        <>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Saúde</h2>
            <div className="rs-scroll-x">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                <thead><tr><th style={th}>Marca</th><th style={th}>Modo</th><th style={th}>Último lead recebido</th><th style={th}>Erros pendentes</th><th style={th}>Deals no RD sem registro (24 h)</th></tr></thead>
                <tbody>
                  {saudeVisivel.map(s => {
                    const mv = MODO_VISUAL[s.modo]
                    return (
                      <tr key={s.marca} style={{ borderTop: '1px solid var(--ws-border)' }}>
                        <td style={td}>{s.marca}</td>
                        <td style={td}><span style={pill(mv.bg, mv.fg)}>{mv.label}</span></td>
                        <td style={td}>{fmtRelativo(s.ultimo_recebido_em)}</td>
                        <td style={{ ...td, color: s.erros_pendentes > 0 ? 'var(--status-risco)' : undefined }}>{s.erros_pendentes}</td>
                        <td style={td}>{s.modo === 'ativo' ? (s.deals_rd_sem_registro_24h ?? 0) + (s.deals_rd_sem_registro_24h ? ' (podem ser manuais; confira se a automação do RD ainda cria deal)' : '') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ ...sectionTitleStyle, fontSize: 16 }}>Marcas</h2>
            <div className="rs-grid rs-cols-2" style={{ gap: 16 }}>
              {vigentes.map(r => (
                <CardMarca key={r.id} regra={r} versoes={d.regras.filter(v => v.marca === r.marca)} linhas={porMarca.get(r.marca) ?? []} podeEditar={podeEditar} onEditar={setEditando} />
              ))}
              {vigentes.length === 0 && <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>Nenhuma marca configurada.</div>}
            </div>
          </section>

          <PainelDisponibilidade pessoas={d.pessoas} disponibilidade={d.disponibilidade} painel={d.painel} podeEditar={podeEditar} onAlterar={alterarDisp} />

          <LogAtribuicoes linhas={d.atribuicoes} podeEditar={podeEditar} reprocessando={reprocessando} onReprocessar={reprocessarRegistro} />
        </>
      )}

      {editando && (
        <EditorRegra
          regra={editando === 'nova' ? null : editando}
          camposVistos={d.camposVistos}
          pessoas={d.pessoas}
          fonteTime={editando === 'nova' ? null : (porMarca.get(editando.marca)?.[0]?.fonte_time ?? null)}
          onSalvar={salvarRegra}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
