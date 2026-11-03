import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { rdDealUrl } from '@/lib/rd'
import { marcaLabel } from '@/constants/brands'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import type { TrilhaCorrida } from '@/hooks/useCorridaPerformance'
import type { Lancamento, LinhaTrilha, Trilha } from '@/lib/corridaPerformance'
import type { ForaCorrida } from '@/lib/corridaDados'
import {
  contaTexto,
  diaCurto,
  fatorBonus,
  fatorFonte,
  fatorTicket,
  fatorVelocidade,
  motivoForaCorrida,
  type Fator,
  type PessoaCadastro,
} from '@/lib/corridaExtrato'
import { LinkLinhaDoTempo } from '@/components/ui/dealDrawerShared'

/**
 * Extrato de pontos da Corrida de Performance (Campanha de Metas): cada RR
 * (trilha SDR) ou venda (trilha Closer) que gerou pontos, com o porquê de cada
 * fator e a conta. O total de cada pessoa vem do MESMO cálculo do card
 * (`LinhaTrilha` de `useCorridaPerformance`), na mesma janela da página.
 * No fim, o que ficou de fora e por quê ("Não pontuou").
 */

const ACCENT = '#B91C1C'
const FORA = '__fora__'
type Filtro = 'todas' | typeof FORA | string

export type VisualPiloto = ReadonlyMap<string, { iniciais: string; cor: string }>

interface ExtratoCorridaProps {
  onClose: () => void
  trilhaInicial: Trilha
  /** Abre já filtrado nessa pessoa (clique na linha do card). */
  pessoaInicial?: string | null
  /** 'YYYY-MM-01' da página — usado nos motivos do "não pontuou". */
  mes: string
  /** "Round 2 · 8–14 out" ou "Outubro 2026" — a mesma janela da página. */
  rotuloJanela: string
  sdr: TrilhaCorrida
  closer: TrilhaCorrida
  visualSdr: VisualPiloto
  visualCloser: VisualPiloto
  loading: boolean
}

/** Total da pessoa, igual ao card ("75,3 pts", "1 pt"). */
function pontosCard(n: number): string {
  const v = Math.round(n * 10) / 10
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${v === 1 ? 'pt' : 'pts'}`
}

function volumeTexto(trilha: Trilha, n: number): string {
  if (trilha === 'sdr') return `${n} RR`
  return `${n} ${n === 1 ? 'unidade' : 'unidades'}`
}

const EXPLICACAO: Record<Trilha, string> = {
  sdr: 'Cada linha é uma reunião realizada (RR) de quem tem meta de SDR no mês. '
    + 'Pontos = peso da fonte × bônus do dia × ticket da marca × velocidade (do MQL até o agendamento da reunião no funil do Closer).',
  closer: 'Cada linha é uma venda de quem tem meta de Closer no mês. Cada unidade de franquia vendida conta como uma unidade do placar: '
    + 'a venda de 2 unidades aparece numa linha só, com “× 2 unidades” no fim da conta, e já vale como 2 unidades no dia para o bônus. '
    + 'Pontos = peso da fonte × bônus do dia × ticket da marca × velocidade (da reunião realizada até a venda) × unidades.',
}

export function ExtratoCorridaDrawer({
  onClose, trilhaInicial, pessoaInicial = null, mes, rotuloJanela, sdr, closer, visualSdr, visualCloser, loading,
}: ExtratoCorridaProps) {
  const [trilha, setTrilha] = useState<Trilha>(trilhaInicial)
  const [filtro, setFiltro] = useState<Filtro>(pessoaInicial ?? 'todas')
  const { data: roster } = useRosterVendas()
  const cadastro: PessoaCadastro[] = roster

  const dados = trilha === 'sdr' ? sdr : closer
  const visual = trilha === 'sdr' ? visualSdr : visualCloser
  const linhas = useMemo(
    () => [...dados.linhas].sort((a, b) => b.pontos - a.pontos || b.volume - a.volume),
    [dados.linhas],
  )
  const porPessoa = useMemo(() => {
    const m = new Map<string, Lancamento[]>()
    for (const l of dados.lancamentos) m.set(l.nome, [...(m.get(l.nome) ?? []), l])
    for (const arr of m.values()) arr.sort((a, b) => a.data.localeCompare(b.data))
    return m
  }, [dados.lancamentos])
  const fora = useMemo(() => [...dados.fora].sort((a, b) => a.data.localeCompare(b.data)), [dados.fora])

  const trocarTrilha = (t: Trilha) => {
    setTrilha(t)
    setFiltro('todas')
  }

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onClose])

  const linhasVisiveis = filtro === 'todas' ? linhas : linhas.filter(l => l.nome === filtro)
  const mostraFora = filtro === 'todas' || filtro === FORA

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />
      <div className="rs-drawer" role="dialog" aria-label="Extrato de pontos da Corrida" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(1180px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="rs-drawer-head" style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>
              Extrato de pontos da Corrida
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {rotuloJanela} · de onde vem cada ponto do card
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)',
            padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0,
          }}>
            <X size={20} />
          </button>
        </div>

        <div className="rs-drawer-sec" style={{
          padding: '14px 24px', borderBottom: '1px solid var(--ws-border)', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div role="tablist" style={{ display: 'inline-flex', alignSelf: 'flex-start', border: '1px solid var(--ws-border)', borderRadius: 999, padding: 3, gap: 2 }}>
            {(['sdr', 'closer'] as const).map(t => (
              <button key={t} role="tab" aria-selected={trilha === t} onClick={() => trocarTrilha(t)} style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 16px', fontSize: 13, fontWeight: 600,
                background: trilha === t ? 'var(--ws-text-primary)' : 'transparent',
                color: trilha === t ? '#fff' : 'var(--ws-text-secondary)',
              }}>
                {t === 'sdr' ? 'Trilha SDR' : 'Trilha Closer'}
              </button>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--ws-text-secondary)', maxWidth: 900 }}>
            {EXPLICACAO[trilha]}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="Filtrar por pessoa">
            <Chip ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</Chip>
            {linhas.map(l => (
              <Chip key={l.nome} ativo={filtro === l.nome} onClick={() => setFiltro(l.nome)}>
                {l.nome} · <b>{pontosCard(l.pontos)}</b>
              </Chip>
            ))}
            <Chip ativo={filtro === FORA} onClick={() => setFiltro(FORA)} tom="aviso">
              Não pontuou · <b>{fora.length}</b>
            </Chip>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando…</div>
          ) : (
            <>
              {filtro !== FORA && linhasVisiveis.map(l => (
                <SecaoPessoa
                  key={l.nome}
                  trilha={trilha}
                  linha={l}
                  lancamentos={porPessoa.get(l.nome) ?? []}
                  visual={visual.get(l.nome)}
                />
              ))}
              {filtro !== FORA && linhas.length === 0 && (
                <div style={{ padding: 24, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
                  Ninguém tem meta de {trilha === 'sdr' ? 'SDR' : 'Closer'} neste mês, então não há pontos.
                </div>
              )}
              {mostraFora && <SecaoFora trilha={trilha} fora={fora} mes={mes} cadastro={cadastro} />}
              <p className="rs-drawer-sec" style={{ margin: 0, padding: '14px 24px 24px', fontSize: 11.5, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>
                Cada linha mostra os pontos com até 2 casas. O total de cada pessoa soma os valores exatos e
                arredonda para 1 casa: é o mesmo número do card da trilha.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Chip({ ativo, onClick, children, tom }: { ativo: boolean; onClick: () => void; children: React.ReactNode; tom?: 'aviso' }) {
  const corAtiva = tom === 'aviso' ? '#92400E' : 'var(--ws-text-primary)'
  return (
    <button onClick={onClick} aria-pressed={ativo} style={{
      border: `1px solid ${ativo ? corAtiva : 'var(--ws-border)'}`, borderRadius: 999, cursor: 'pointer',
      padding: '5px 12px', fontSize: 12, whiteSpace: 'nowrap',
      background: ativo ? corAtiva : tom === 'aviso' ? '#FFFBEB' : '#fff',
      color: ativo ? '#fff' : tom === 'aviso' ? '#92400E' : 'var(--ws-text-primary)',
    }}>
      {children}
    </button>
  )
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10.5, whiteSpace: 'nowrap',
  color: 'var(--ws-text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--ws-border)', background: 'var(--ws-bg)',
}
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top', fontSize: 12.5 }

function NegocioCelula({ idLead, negociacao, marca }: { idLead: string; negociacao: string | null; marca: string | null }) {
  return (
    <td style={{ ...td, overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
        <a href={rdDealUrl(idLead)} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 500, textDecoration: 'underline' }}>
          {negociacao?.trim() || 'Negócio sem nome'}
          <ExternalLink size={11} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
        </a>
        <LinkLinhaDoTempo idDeal={idLead} cor={ACCENT} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{marcaLabel(marca) || 'sem marca'}</div>
    </td>
  )
}

function FatorCelula({ fator }: { fator: Fator }) {
  return (
    <td style={td}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: fator.valor === 'sem bônus' ? 'var(--ws-text-secondary)' : ACCENT }}>
        {fator.valor}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 2, lineHeight: 1.35 }}>{fator.motivo}</div>
    </td>
  )
}

function SecaoPessoa({ trilha, linha, lancamentos, visual }: {
  trilha: Trilha
  linha: LinhaTrilha
  lancamentos: Lancamento[]
  visual?: { iniciais: string; cor: string }
}) {
  return (
    <section className="rs-drawer-sec" style={{ padding: '18px 24px', borderBottom: '1px solid var(--ws-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          width: 30, height: 30, borderRadius: 999, background: visual?.cor ?? '#CBD5E1', color: '#fff',
          fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{visual?.iniciais ?? linha.nome.slice(0, 3).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{linha.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            {volumeTexto(trilha, linha.volume)}
            {trilha === 'closer' && lancamentos.length > 0 && ` em ${lancamentos.length} ${lancamentos.length === 1 ? 'venda' : 'vendas'}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ws-text-secondary)' }}>
            Total (igual ao card)
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>{pontosCard(linha.pontos)}</div>
        </div>
      </div>

      {lancamentos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)' }}>
          {trilha === 'sdr' ? 'Nenhuma reunião realizada nesta janela.' : 'Nenhuma venda nesta janela.'}
        </div>
      ) : (
        <div className="rs-scroll-x" style={{ border: '1px solid var(--ws-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', minWidth: 1060, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'var(--font-body)' }}>
            {/* larguras fixas: as tabelas de cada pessoa ficam com as colunas alinhadas */}
            <colgroup>
              <col style={{ width: 64 }} />
              <col style={{ width: 230 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 165 }} />
              <col style={{ width: 200 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Negociação</th>
                <th style={th}>Fonte → peso</th>
                <th style={th}>Bônus do dia</th>
                <th style={th}>Ticket da marca</th>
                <th style={th}>Velocidade</th>
                <th style={th}>Conta</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l, i) => {
                const [contaEsq, contaDir] = contaTexto(l).split(' = ')
                return (
                  <tr key={`${l.idLead}::${l.ciclo}::${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{diaCurto(l.data)}</td>
                    <NegocioCelula idLead={l.idLead} negociacao={l.negociacao} marca={l.marca} />
                    <FatorCelula fator={fatorFonte(l)} />
                    <FatorCelula fator={fatorBonus(l)} />
                    <FatorCelula fator={fatorTicket(l)} />
                    <FatorCelula fator={fatorVelocidade(l)} />
                    <td style={{ ...td, lineHeight: 1.45 }}>
                      <span style={{ color: 'var(--ws-text-secondary)' }}>{contaEsq} = </span>
                      <b style={{ whiteSpace: 'nowrap' }}>{contaDir}</b>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SecaoFora({ trilha, fora, mes, cadastro }: {
  trilha: Trilha
  fora: ForaCorrida[]
  mes: string
  cadastro: readonly PessoaCadastro[]
}) {
  return (
    <section className="rs-drawer-sec" style={{ padding: '18px 24px', borderBottom: '1px solid var(--ws-border)', background: '#FFFBEB' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#92400E' }}>Não pontuou</div>
      <div style={{ fontSize: 12, color: '#92400E', marginTop: 2, marginBottom: 10 }}>
        {trilha === 'sdr'
          ? 'Reuniões realizadas nesta janela que não entraram para ninguém, e o motivo.'
          : 'Vendas desta janela que não entraram para ninguém, e o motivo.'}
      </div>
      {fora.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#92400E' }}>
          {trilha === 'sdr' ? 'Toda reunião realizada desta janela pontuou para alguém.' : 'Toda venda desta janela pontuou para alguém.'}
        </div>
      ) : (
        <div className="rs-scroll-x" style={{ border: '1px solid #FDE68A', borderRadius: 10, background: '#fff' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Negociação</th>
                <th style={th}>{trilha === 'sdr' ? 'SDR no RD' : 'Closer no RD'}</th>
                {trilha === 'closer' && <th style={th}>Unidades</th>}
                <th style={th}>Por que não pontuou</th>
              </tr>
            </thead>
            <tbody>
              {fora.map((f, i) => (
                <tr key={`${f.idLead}::${f.ciclo}::${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{diaCurto(f.data)}</td>
                  <NegocioCelula idLead={f.idLead} negociacao={f.negociacao} marca={f.marca} />
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{f.nome ?? '(vazio)'}</td>
                  {trilha === 'closer' && <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{f.unidades}</td>}
                  <td style={{ ...td, minWidth: 280, lineHeight: 1.45 }}>{motivoForaCorrida(trilha, f.nome, mes, cadastro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
