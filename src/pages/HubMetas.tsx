import { useMemo, useState, type CSSProperties } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { buscarEstadoVersao, useMetaMes, type DistribuicaoSemanalItem, type EstadoMesMarca, type VersaoMeta } from '@/hooks/useMetaMes'
import { ativarVersao } from '@/hooks/useSalvarMeta'
import { gerarSemanas, type ConfigEtapa, type DiaSemana, type EtapaMeta, type Semana } from '@/lib/metasEngine'
import { PassoSemanas } from '@/components/metas/PassoSemanas'
import { PassoTaxas } from '@/components/metas/PassoTaxas'
import { PassoFunilMarca } from '@/components/metas/PassoFunilMarca'
import { PassoPessoas } from '@/components/metas/PassoPessoas'
import { PassoDistribuicaoSemanal } from '@/components/metas/PassoDistribuicaoSemanal'
import { PassoRevisarPublicar } from '@/components/metas/PassoRevisarPublicar'
import { bannerStyle, cardStyle, primaryButtonStyle, secondaryButtonStyle, sectionTitleStyle } from '@/components/metas/metasUi'

// 7 entradas, índice 0–6 — Passo 0 escolhe o mês e a versão de partida; Passo
// 1–6 montam a próxima versão. Toda referência a `passo === N` abaixo usa
// esses índices — não renumerar sem atualizar os blocos.
const PASSOS = ['Mês e versões', 'Semanas', 'Taxas', 'Funil por marca', 'Pessoas', 'Distribuição semanal', 'Revisar e publicar'] as const

const MESES_LABEL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface Rascunho {
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

function mesAtualKey(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
}

function mesAnteriorKey(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const d = new Date(ano, mes - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtNum(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR')
}

function fmtBRL(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function HubMetas() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualKey())
  const [passo, setPasso] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  const { versoes, versaoAtiva, versaoExibida, estado, loading, error, reload } = useMetaMes(mesReferencia)
  const { estado: estadoAnterior } = useMetaMes(mesAnteriorKey(mesReferencia))

  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  // Versão publicada da qual o rascunho partiu (null = do zero ou do mês anterior).
  const [base, setBase] = useState<VersaoMeta | null>(null)

  function trocarMes(m: string) {
    setMesReferencia(m)
    setRascunho(null)
    setBase(null)
    setAviso(null)
    setPasso(0)
  }

  // Sem rascunho explícito, os passos mostram a versão ativa (ou a última
  // publicada) — e qualquer edição já começa uma versão nova a partir dela.
  const rascunhoAtual = useMemo<Rascunho | null>(() => {
    if (rascunho) return rascunho
    if (estado && estado.status !== 'inexistente') {
      return { diaViradaSemana: estado.diaViradaSemana, semanas: estado.semanas, marcas: estado.marcas, distribuicaoSemanal: estado.distribuicaoSemanal }
    }
    return null
  }, [estado, rascunho])

  const baseAtual = rascunho ? base : versaoExibida
  const proximoNumero = (versoes[versoes.length - 1]?.numero ?? 0) + 1

  function editar(novo: Rascunho) {
    if (!rascunho) setBase(versaoExibida)
    setAviso(null)
    setRascunho(novo)
  }

  function iniciarRascunho(novo: Rascunho, baseVersao: VersaoMeta | null) {
    setBase(baseVersao)
    setRascunho(novo)
    setAviso(null)
    setPasso(1)
  }

  return (
    <div style={{ padding: 'var(--page-pad-top) var(--page-pad-x) 48px', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Metas"
        subtitle="Lançamento mensal de metas — cada publicação vira uma versão; o dashboard usa a versão ativa"
      />

      <div className="rs-scroll-x" style={{ display: 'flex', gap: 0, marginBottom: 28, paddingBottom: 4 }}>
        {PASSOS.map((label, i) => {
          const ativo = i === passo
          const concluido = i < passo
          return (
            <button key={label} onClick={() => setPasso(i)} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0',
            }}>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
                background: ativo || concluido ? 'var(--brand-accent)' : 'var(--ws-surface)',
                color: ativo || concluido ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
                border: '1.5px solid ' + (ativo || concluido ? 'var(--brand-accent)' : 'var(--ws-border-strong)'),
              }}>{i}</span>
              <span style={{
                fontSize: 13, whiteSpace: 'nowrap',
                fontWeight: ativo ? 600 : 400,
                color: ativo ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)',
              }}>{label}</span>
              {i < PASSOS.length - 1 && (
                <span style={{ width: 28, height: 1.5, background: concluido ? 'var(--brand-accent)' : 'var(--ws-border)', margin: '0 4px' }} />
              )}
            </button>
          )
        })}
      </div>

      {error && <div style={{ ...bannerStyle('erro'), marginBottom: 16 }}>Erro ao carregar as metas: {error}</div>}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</div>}

      {!loading && passo > 0 && rascunhoAtual && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16,
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13,
          background: 'var(--ws-surface)', border: '1px dashed var(--ws-border-strong)', color: 'var(--ws-text-primary)',
        }}>
          <b>Montando a V{proximoNumero}</b>
          <span style={{ color: 'var(--ws-text-secondary)' }}>
            {baseAtual ? `a partir da V${baseAtual.numero} (${baseAtual.rotulo})` : 'do zero'}
            {!rascunho && ' — nada muda até você editar e publicar'}
            {' · '}as versões já publicadas nunca são alteradas.
          </span>
        </div>
      )}

      {!loading && passo === 0 && (
        <PassoAbrirMes
          mesReferencia={mesReferencia}
          setMesReferencia={trocarMes}
          versoes={versoes}
          aviso={aviso}
          temRascunho={rascunho != null}
          podeCopiarAnterior={estadoAnterior?.status === 'publicado'}
          onCopiarMesAnterior={() => {
            if (!estadoAnterior || estadoAnterior.status !== 'publicado') return
            iniciarRascunho({
              diaViradaSemana: estadoAnterior.diaViradaSemana,
              // semanas do mês novo são geradas, não copiadas (as datas mudam de mês pra mês)
              semanas: gerarSemanas(mesReferencia, estadoAnterior.diaViradaSemana),
              marcas: estadoAnterior.marcas,
              distribuicaoSemanal: [],
            }, null)
          }}
          onIniciarVazio={() => iniciarRascunho({ diaViradaSemana: 'terca', semanas: gerarSemanas(mesReferencia, 'terca'), marcas: [], distribuicaoSemanal: [] }, null)}
          onContinuarRascunho={() => setPasso(1)}
          onUsarComoBase={async v => {
            const r = await buscarEstadoVersao(v.id)
            if (r.error) return r.error
            iniciarRascunho({
              diaViradaSemana: r.estado.diaViradaSemana, semanas: r.estado.semanas,
              marcas: r.estado.marcas, distribuicaoSemanal: r.estado.distribuicaoSemanal,
            }, v)
            return null
          }}
          onAtivar={async v => {
            const r = await ativarVersao(v.id)
            if (!r.ok) return r.error
            setAviso(`V${v.numero} (${v.rotulo}) ativada — o dashboard já mede o time por ela.`)
            reload()
            return null
          }}
        />
      )}

      {!loading && passo === 1 && rascunhoAtual && (
        <PassoSemanas
          mesReferencia={mesReferencia}
          diaViradaSemana={rascunhoAtual.diaViradaSemana}
          onMudar={(dia, semanas) => editar({ ...rascunhoAtual, diaViradaSemana: dia, semanas })}
        />
      )}

      {!loading && passo === 2 && rascunhoAtual && (
        <PassoTaxas
          marcas={rascunhoAtual.marcas}
          mesAnterior={mesAnteriorKey(mesReferencia)}
          onMudarTaxa={(marca, etapa, taxa, origem) => {
            editar({
              ...rascunhoAtual,
              marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : {
                ...m, etapas: m.etapas.map(e => e.etapa !== etapa ? e : { ...e, taxa, taxaOrigem: origem }),
              }),
            })
          }}
        />
      )}

      {!loading && passo === 3 && rascunhoAtual && (
        <PassoFunilMarca
          marcas={rascunhoAtual.marcas}
          onMudarEtapa={(marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => {
            editar({
              ...rascunhoAtual,
              marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : {
                ...m,
                etapas: m.etapas.some(e => e.etapa === etapa)
                  ? m.etapas.map(e => e.etapa !== etapa ? e : { ...e, ...config })
                  : [...m.etapas, { etapa, modo: 'desligado', ...config } as ConfigEtapa],
              }),
            })
          }}
          onMudarTicket={(marca: string, ticket: number) => {
            editar({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, ticketMedio: ticket }) })
          }}
        />
      )}

      {!loading && passo === 4 && rascunhoAtual && (
        <PassoPessoas
          marcas={rascunhoAtual.marcas}
          onMudarPessoas={(marca, pessoas) => {
            editar({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, pessoas }) })
          }}
        />
      )}

      {!loading && passo === 5 && rascunhoAtual && (
        <PassoDistribuicaoSemanal
          marcas={rascunhoAtual.marcas}
          semanas={rascunhoAtual.semanas}
          distribuicaoSemanal={rascunhoAtual.distribuicaoSemanal}
          onMudarValor={(marca, nomePessoa, semanaNumero, etapa, valor) => {
            const semOEditado = rascunhoAtual.distribuicaoSemanal.filter(d => !(d.marca === marca && d.nomePessoa === nomePessoa && d.semanaNumero === semanaNumero && d.etapa === etapa))
            editar({ ...rascunhoAtual, distribuicaoSemanal: [...semOEditado, { marca, nomePessoa, semanaNumero, etapa, valor }] })
          }}
        />
      )}

      {!loading && passo > 0 && !rascunhoAtual && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Nenhuma versão publicada neste mês ainda. Volte ao passo 0 e comece do zero ou copie do mês anterior.
        </div>
      )}

      {!loading && passo === 6 && rascunhoAtual && (
        <PassoRevisarPublicar
          mesReferencia={mesReferencia}
          diaViradaSemana={rascunhoAtual.diaViradaSemana}
          semanas={rascunhoAtual.semanas}
          marcas={rascunhoAtual.marcas}
          distribuicaoSemanal={rascunhoAtual.distribuicaoSemanal}
          estadoMesAnterior={estadoAnterior}
          proximoNumero={proximoNumero}
          versaoAtiva={versaoAtiva}
          baseNumero={baseAtual?.numero ?? null}
          onPublicado={mensagem => {
            setRascunho(null)
            setBase(null)
            setAviso(mensagem)
            setPasso(0)
            reload()
          }}
        />
      )}
    </div>
  )
}

function selectStyle(): CSSProperties {
  return {
    padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 14, color: 'var(--ws-text-primary)', background: 'var(--ws-surface)', cursor: 'pointer',
  }
}

const botaoPequeno: CSSProperties = { ...secondaryButtonStyle, padding: '7px 12px', fontSize: 13 }

function PassoAbrirMes({
  mesReferencia, setMesReferencia, versoes, aviso, temRascunho, podeCopiarAnterior,
  onCopiarMesAnterior, onIniciarVazio, onContinuarRascunho, onUsarComoBase, onAtivar,
}: {
  mesReferencia: string
  setMesReferencia: (m: string) => void
  versoes: VersaoMeta[]
  aviso: string | null
  temRascunho: boolean
  podeCopiarAnterior: boolean
  onCopiarMesAnterior: () => void
  onIniciarVazio: () => void
  onContinuarRascunho: () => void
  onUsarComoBase: (v: VersaoMeta) => Promise<string | null>
  onAtivar: (v: VersaoMeta) => Promise<string | null>
}) {
  const [ano, mes] = mesReferencia.split('-').map(Number) // mes: 1-12
  const anoAtual = new Date().getFullYear()
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]
  const [ocupadoId, setOcupadoId] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function executar(v: VersaoMeta, fn: (v: VersaoMeta) => Promise<string | null>) {
    setOcupadoId(v.id)
    setErro(null)
    const e = await fn(v)
    setOcupadoId(null)
    if (e) setErro(e)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', display: 'block', marginBottom: 8 }}>Mês de referência</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={mes} onChange={e => setMesReferencia(`${ano}-${String(e.target.value).padStart(2, '0')}-01`)} style={selectStyle()}>
            {MESES_LABEL.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
          </select>
          <select value={ano} onChange={e => setMesReferencia(`${e.target.value}-${String(mes).padStart(2, '0')}-01`)} style={selectStyle()}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Versões de {MESES_LABEL[mes - 1]} {ano}</h3>
        <p style={{ fontSize: 13, color: 'var(--ws-text-secondary)', margin: '0 0 16px', maxWidth: 720 }}>
          Cada publicação vira uma versão nova e congelada — o lançamento original nunca é alterado.
          O dashboard inteiro mede o time pela versão <b>ativa</b>, e dá pra trocar a qualquer momento,
          inclusive voltar pra uma versão anterior.
        </p>

        {aviso && <div style={{ ...bannerStyle('sucesso'), marginBottom: 12 }}>{aviso}</div>}
        {erro && <div style={{ ...bannerStyle('erro'), marginBottom: 12 }}>{erro}</div>}
        {temRascunho && (
          <div style={{ ...bannerStyle('atencao'), marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            Você tem uma versão em montagem ainda não publicada.
            <button onClick={onContinuarRascunho} style={botaoPequeno}>Continuar montando</button>
          </div>
        )}

        {versoes.length === 0 ? (
          <>
            <p style={{ fontSize: 13, margin: '0 0 16px' }}>Nenhuma meta publicada para este mês ainda.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {podeCopiarAnterior && (
                <button onClick={onCopiarMesAnterior} style={primaryButtonStyle}>Copiar do mês anterior</button>
              )}
              <button onClick={onIniciarVazio} style={podeCopiarAnterior ? secondaryButtonStyle : primaryButtonStyle}>Começar do zero</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...versoes].reverse().map(v => (
              <LinhaVersao
                key={v.id}
                versao={v}
                ocupado={ocupadoId === v.id}
                onAtivar={() => {
                  if (window.confirm(`Ativar a V${v.numero} (${v.rotulo})?\n\nO dashboard inteiro (Visão Macro, Performance, Campanha de Metas) passa a medir o time por ela.`)) {
                    void executar(v, onAtivar)
                  }
                }}
                onUsarComoBase={() => void executar(v, onUsarComoBase)}
              />
            ))}
            <div>
              <button onClick={onIniciarVazio} style={{ border: 'none', background: 'none', padding: '6px 0', fontSize: 13, color: 'var(--ws-text-secondary)', textDecoration: 'underline', cursor: 'pointer' }}>
                Começar uma versão do zero
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LinhaVersao({ versao: v, ocupado, onAtivar, onUsarComoBase }: {
  versao: VersaoMeta
  ocupado: boolean
  onAtivar: () => void
  onUsarComoBase: () => void
}) {
  const pill = (bg: string, fg: string): CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: bg, color: fg, whiteSpace: 'nowrap',
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 16px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid ' + (v.ativa ? 'var(--brand-accent)' : 'var(--ws-border)'),
      background: v.ativa ? 'color-mix(in srgb, var(--brand-accent) 6%, var(--ws-surface))' : 'var(--ws-surface)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: 38, height: 38, borderRadius: '50%', fontSize: 13, fontWeight: 700,
        background: v.ativa ? 'var(--brand-accent)' : 'var(--ws-bg)',
        color: v.ativa ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
        border: v.ativa ? 'none' : '1px solid var(--ws-border)',
      }}>V{v.numero}</span>

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{v.rotulo}</span>
          {v.ativa && <span style={pill('var(--status-positivo-bg)', 'var(--status-positivo)')}>Ativa no dashboard</span>}
          {v.origem === 'importado' && <span style={pill('var(--ws-bg)', 'var(--ws-text-secondary)')}>importada</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
          Publicada em {fmtData(v.publicadoEm)}{v.publicadoPor ? ` · ${v.publicadoPor}` : ''}
          {v.ativa && v.ativadaEm && ` · ativada em ${fmtData(v.ativadaEm)}`}
        </div>
        {v.motivo && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>{v.motivo}</div>}
      </div>

      <div style={{ fontSize: 13, textAlign: 'right', minWidth: 130 }}>
        <div style={{ fontWeight: 600 }}>{fmtNum(v.totalVendas)} vendas</div>
        <div style={{ color: 'var(--ws-text-secondary)' }}>{fmtBRL(v.totalFaturamento)}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!v.ativa && (
          <button disabled={ocupado} onClick={onAtivar} style={botaoPequeno}>{ocupado ? 'Aguarde…' : 'Ativar'}</button>
        )}
        <button disabled={ocupado} onClick={onUsarComoBase} style={botaoPequeno}>Nova versão a partir desta</button>
      </div>
    </div>
  )
}
