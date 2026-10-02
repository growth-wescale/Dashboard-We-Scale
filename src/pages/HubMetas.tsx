import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { marcaLabel } from '@/constants/brands'
import { useAcesso } from '@/contexts/AcessoContext'
import { buscarEstadoVersao, useMetaMes, type VersaoMeta } from '@/hooks/useMetaMes'
import { MQ_COMPACTO, useMediaQuery } from '@/hooks/useMediaQuery'
import { ativarVersao } from '@/hooks/useSalvarMeta'
import {
  marcaEmBranco, mesAnterior, ordenarMarcas, rascunhoDeVersao, rascunhoDoMesAnterior, rascunhoEmBranco,
  resumoRascunho, type MarcaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import { carregarRascunho, descartarRascunho, salvarRascunho } from '@/lib/rascunhoMetas'
import { EditorMarca } from '@/components/metas/EditorMarca'
import { PainelMarcas } from '@/components/metas/PainelMarcas'
import { PassoSemanas } from '@/components/metas/PassoSemanas'
import { PassoRevisarPublicar } from '@/components/metas/PassoRevisarPublicar'
import {
  MESES_LABEL, bannerStyle, cardStyle, fmtBRL, fmtDec, fmtInt, ghostButtonStyle, infoBoxStyle,
  nomeMes, nomeMesMinusculo, pillStyle, primaryButtonStyle, secondaryButtonStyle, smallButtonStyle,
} from '@/components/metas/metasUi'

type Passo = 'marcas' | 'semanas' | 'revisar'
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: 'marcas', rotulo: 'Marcas' },
  { id: 'semanas', rotulo: 'Semanas' },
  { id: 'revisar', rotulo: 'Revisar e publicar' },
]

/** A partir do dia 20, abre no mês seguinte — é quando a meta do próximo mês é montada. */
function mesPadrao(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() >= 20 ? 1 : 0), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function somarMeses(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(ano, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function HubMetas() {
  const [mes, setMes] = useState(mesPadrao)
  const [rascunho, setRascunho] = useState<RascunhoConfig | null>(() => carregarRascunho(mesPadrao()))
  const [montando, setMontando] = useState(false)
  const [passo, setPasso] = useState<Passo>('marcas')
  const [marcaAberta, setMarcaAberta] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const topoRef = useRef<HTMLDivElement>(null)

  const { versoes, versaoAtiva, loading, error, reload } = useMetaMes(mes)
  const anterior = useMetaMes(mesAnterior(mes))

  useEffect(() => {
    topoRef.current?.scrollIntoView({ block: 'start' })
  }, [passo, marcaAberta, montando])

  const rotuloAnterior = nomeMesMinusculo(mesAnterior(mes))
  const estadoAnterior = anterior.estado?.status === 'publicado' && anterior.estado.marcas.length > 0 ? anterior.estado : null
  const versaoAnterior = anterior.versaoAtiva ?? anterior.versaoExibida
  const proximoNumero = (versoes[versoes.length - 1]?.numero ?? 0) + 1

  function trocarMes(m: string) {
    setMes(m)
    setRascunho(carregarRascunho(m))
    setMontando(false)
    setPasso('marcas')
    setMarcaAberta(null)
    setAviso(null)
  }

  function atualizar(r: RascunhoConfig) {
    const novo = { ...r, atualizadoEm: new Date().toISOString() }
    setRascunho(novo)
    salvarRascunho(novo)
  }

  function iniciar(r: RascunhoConfig) {
    if (rascunho && !window.confirm(`Já existe uma configuração de ${nomeMesMinusculo(mes)} em andamento. Descartar e começar outra?`)) return
    atualizar(r)
    setMontando(true)
    setPasso('marcas')
    setMarcaAberta(null)
    setAviso(null)
  }

  async function iniciarDeVersao(v: VersaoMeta): Promise<string | null> {
    const r = await buscarEstadoVersao(v.id)
    if (r.error) return r.error
    iniciar(rascunhoDeVersao(mes, v, r.estado))
    return null
  }

  function descartar() {
    if (!window.confirm('Descartar a configuração em andamento? O que não foi publicado será perdido.')) return
    descartarRascunho(mes)
    setRascunho(null)
    setMontando(false)
  }

  return (
    <div ref={topoRef} style={{ padding: 'var(--page-pad-top) var(--page-pad-x) 48px', maxWidth: 1200, margin: '0 auto', scrollMarginTop: 80 }}>
      <PageTop
        title="Configuração das Metas"
        subtitle="Monte a meta do mês marca a marca: informe as vendas e o sistema calcula o funil e a meta de cada pessoa"
      />

      {montando && rascunho ? (
        <Montagem
          rascunho={rascunho}
          passo={passo}
          setPasso={p => { setPasso(p); setMarcaAberta(null) }}
          marcaAberta={marcaAberta}
          setMarcaAberta={setMarcaAberta}
          atualizar={atualizar}
          proximoNumero={proximoNumero}
          versaoAtiva={versaoAtiva}
          totaisMesAnterior={versaoAnterior ? { rotulo: rotuloAnterior, vendas: versaoAnterior.totalVendas, faturamento: versaoAnterior.totalFaturamento } : null}
          onSair={() => { setMontando(false); setMarcaAberta(null) }}
          onPublicado={msg => {
            descartarRascunho(mes)
            setRascunho(null)
            setMontando(false)
            setAviso(msg)
            reload()
          }}
        />
      ) : (
        <Inicio
          mes={mes}
          trocarMes={trocarMes}
          versoes={versoes}
          loading={loading}
          error={error}
          aviso={aviso}
          rascunho={rascunho}
          rotuloAnterior={rotuloAnterior}
          marcasAnteriores={estadoAnterior?.marcas.length ?? 0}
          onContinuar={() => setMontando(true)}
          onDescartar={descartar}
          onDoMesAnterior={() => { if (estadoAnterior) iniciar(rascunhoDoMesAnterior(mes, estadoAnterior, rotuloAnterior)) }}
          onEmBranco={() => iniciar(rascunhoEmBranco(mes, []))}
          onRevisao={iniciarDeVersao}
          onAtivar={async v => {
            const r = await ativarVersao(v.id)
            if (!r.ok) return r.error
            setAviso(`V${v.numero} (${v.rotulo}) ativada — o dashboard já mede o time por ela.`)
            reload()
            return null
          }}
        />
      )}
    </div>
  )
}

// ── Tela inicial ─────────────────────────────────────────────────────────

function Inicio({
  mes, trocarMes, versoes, loading, error, aviso, rascunho, rotuloAnterior, marcasAnteriores,
  onContinuar, onDescartar, onDoMesAnterior, onEmBranco, onRevisao, onAtivar,
}: {
  mes: string
  trocarMes: (m: string) => void
  versoes: VersaoMeta[]
  loading: boolean
  error: string | null
  aviso: string | null
  rascunho: RascunhoConfig | null
  rotuloAnterior: string
  marcasAnteriores: number
  onContinuar: () => void
  onDescartar: () => void
  onDoMesAnterior: () => void
  onEmBranco: () => void
  onRevisao: (v: VersaoMeta) => Promise<string | null>
  onAtivar: (v: VersaoMeta) => Promise<string | null>
}) {
  const [ocupadoId, setOcupadoId] = useState<number | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const nome = nomeMes(mes)
  const mesCurto = nomeMesMinusculo(mes)

  async function executar(v: VersaoMeta, fn: (v: VersaoMeta) => Promise<string | null>) {
    setOcupadoId(v.id)
    setErroAcao(null)
    const e = await fn(v)
    setOcupadoId(null)
    if (e) setErroAcao(e)
  }

  const resumo = rascunho ? resumoRascunho(rascunho) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SeletorMes mes={mes} onMudar={trocarMes} />

      {error && <div style={bannerStyle('erro')}>Não deu pra carregar as metas: {error}</div>}
      {aviso && <div style={bannerStyle('sucesso')}>{aviso}</div>}
      {erroAcao && <div style={bannerStyle('erro')}>{erroAcao}</div>}

      {rascunho && resumo && (
        <div style={{ ...cardStyle, borderColor: 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Configuração de {mesCurto} em andamento</div>
            <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
              {resumo.prontas} de {resumo.total} marcas prontas · {fmtInt(resumo.vendas)} vendas · {fmtBRL(resumo.faturamento)} · salva neste navegador em {fmtDataHora(rascunho.atualizadoEm)}
            </div>
          </div>
          <button type="button" onClick={onDescartar} style={secondaryButtonStyle}>Descartar</button>
          <button type="button" onClick={onContinuar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Continuar <ArrowRight size={14} />
          </button>
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</div>}

      {!loading && versoes.length === 0 && !rascunho && (
        <div style={{ ...cardStyle, padding: 'var(--sp-8)' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24 }}>{nome} ainda não tem meta</h2>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'var(--ws-text-secondary)', maxWidth: 680, lineHeight: 1.6 }}>
            {marcasAnteriores > 0
              ? `Comece a partir de ${rotuloAnterior}: as ${marcasAnteriores} marcas, a taxa de franquia, as conversões de cada etapa e o time já vêm preenchidos. Você informa as vendas de cada marca e ajusta só o que mudou.`
              : `Não há meta publicada em ${rotuloAnterior} pra aproveitar. Comece em branco: você escolhe as marcas e informa vendas, conversões e time de cada uma.`}
          </p>
          <div className="rs-grid rs-cols-3" style={{ gap: 12, marginBottom: 24 }}>
            {[
              ['1', 'Marcas', 'Em cada marca, informe as vendas e a taxa de franquia. O funil (SQL → Vendas) se calcula pelas conversões.'],
              ['2', 'Semanas', 'Opcional: distribua a meta de cada pessoa pelas semanas do mês.'],
              ['3', 'Revisar e publicar', 'Confira os números por marca e por pessoa e publique. O dashboard passa a usar a nova meta.'],
            ].map(([n, t, d]) => (
              <div key={n} style={{ background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n} · {t}</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {marcasAnteriores > 0 ? (
              <>
                <button type="button" onClick={onDoMesAnterior} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Configurar metas de {mesCurto} <ArrowRight size={14} />
                </button>
                <button type="button" onClick={onEmBranco} style={ghostButtonStyle}>Começar em branco</button>
              </>
            ) : (
              <button type="button" onClick={onEmBranco} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Começar em branco <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && versoes.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Versões de {nome}</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ws-text-secondary)', maxWidth: 720, lineHeight: 1.5 }}>
            Cada publicação vira uma versão congelada. O dashboard mede o time pela versão <b>ativa</b> — dá pra trocar a qualquer momento, inclusive voltar pra uma anterior.
            Pra mudar a meta, crie uma revisão a partir de uma versão.
          </p>
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
                onRevisao={() => void executar(v, onRevisao)}
              />
            ))}
          </div>
          <button type="button" onClick={onEmBranco} style={{ ...ghostButtonStyle, marginTop: 12, textDecoration: 'underline' }}>
            Começar uma versão em branco
          </button>
        </div>
      )}
    </div>
  )
}

function SeletorMes({ mes, onMudar }: { mes: string; onMudar: (m: string) => void }) {
  const [ano, m] = mes.split('-').map(Number)
  const anoAtual = new Date().getFullYear()
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]
  const select: CSSProperties = {
    padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 14, color: 'var(--ws-text-primary)', background: 'var(--ws-surface)', cursor: 'pointer',
  }
  return (
    <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginRight: 4 }}>Mês da meta</span>
      <button type="button" onClick={() => onMudar(somarMeses(mes, -1))} aria-label="Mês anterior" style={{ ...ghostButtonStyle, padding: 6 }}><ChevronLeft size={16} /></button>
      <select value={m} onChange={e => onMudar(`${ano}-${String(e.target.value).padStart(2, '0')}-01`)} style={select} aria-label="Mês">
        {MESES_LABEL.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
      </select>
      <select value={ano} onChange={e => onMudar(`${e.target.value}-${String(m).padStart(2, '0')}-01`)} style={select} aria-label="Ano">
        {anos.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <button type="button" onClick={() => onMudar(somarMeses(mes, 1))} aria-label="Próximo mês" style={{ ...ghostButtonStyle, padding: 6 }}><ChevronRight size={16} /></button>
    </div>
  )
}

function LinhaVersao({ versao: v, ocupado, onAtivar, onRevisao }: {
  versao: VersaoMeta
  ocupado: boolean
  onAtivar: () => void
  onRevisao: () => void
}) {
  const podeAtivar = useAcesso().pode('acao.metas-publicar')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 'var(--radius-sm)',
      border: '1px solid ' + (v.ativa ? 'var(--brand-accent)' : 'var(--ws-border)'),
      background: v.ativa ? 'color-mix(in srgb, var(--brand-accent) 6%, var(--ws-surface))' : 'var(--ws-surface)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
        fontSize: 13, fontWeight: 700,
        background: v.ativa ? 'var(--brand-accent)' : 'var(--ws-bg)',
        color: v.ativa ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
        border: v.ativa ? 'none' : '1px solid var(--ws-border)',
      }}>V{v.numero}</span>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{v.rotulo}</span>
          {v.ativa && <span style={pillStyle('sucesso')}><Check size={11} /> Ativa no dashboard</span>}
          {v.origem === 'importado' && <span style={pillStyle('neutro')}>importada da planilha</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
          Publicada em {fmtData(v.publicadoEm)}{v.publicadoPor ? ` · ${v.publicadoPor}` : ''}
          {v.ativa && v.ativadaEm && ` · ativada em ${fmtData(v.ativadaEm)}`}
        </div>
        {v.motivo && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>{v.motivo}</div>}
      </div>
      <div style={{ fontSize: 13, textAlign: 'right', minWidth: 130 }}>
        <div style={{ fontWeight: 600 }}>{fmtDec(v.totalVendas)} vendas</div>
        <div style={{ color: 'var(--ws-text-secondary)' }}>{fmtBRL(v.totalFaturamento)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!v.ativa && podeAtivar && <button type="button" disabled={ocupado} onClick={onAtivar} style={smallButtonStyle}>{ocupado ? 'Aguarde…' : 'Ativar'}</button>}
        <button type="button" disabled={ocupado} onClick={onRevisao} style={smallButtonStyle}>{ocupado ? 'Aguarde…' : 'Criar revisão a partir desta'}</button>
      </div>
    </div>
  )
}

// ── Montagem ─────────────────────────────────────────────────────────────

function Montagem({
  rascunho, passo, setPasso, marcaAberta, setMarcaAberta, atualizar, proximoNumero, versaoAtiva,
  totaisMesAnterior, onSair, onPublicado,
}: {
  rascunho: RascunhoConfig
  passo: Passo
  setPasso: (p: Passo) => void
  marcaAberta: string | null
  setMarcaAberta: (m: string | null) => void
  atualizar: (r: RascunhoConfig) => void
  proximoNumero: number
  versaoAtiva: VersaoMeta | null
  totaisMesAnterior: { rotulo: string; vendas: number; faturamento: number } | null
  onSair: () => void
  onPublicado: (msg: string) => void
}) {
  const compacto = useMediaQuery(MQ_COMPACTO)
  const resumo = resumoRascunho(rascunho)
  const origem = rascunho.origem
  const deOnde = origem.tipo === 'mes_anterior'
    ? `a partir de ${origem.rotulo}`
    : origem.tipo === 'versao' ? `a partir da V${origem.numero} (${origem.rotulo})` : 'em branco'

  const indice = marcaAberta ? rascunho.marcas.findIndex(m => m.marca === marcaAberta) : -1
  const marca = indice >= 0 ? rascunho.marcas[indice] : null
  const proxima = indice >= 0 && indice < rascunho.marcas.length - 1 ? rascunho.marcas[indice + 1] : null

  const mudarMarca = (m: MarcaConfig) => atualizar({ ...rascunho, marcas: rascunho.marcas.map(x => (x.marca === m.marca ? m : x)) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        ...cardStyle, padding: '14px 18px', zIndex: 20,
        // Fixo só no desktop: no celular o cabeçalho (com os 3 passos quebrando linha) cobriria um terço da tela.
        position: compacto ? 'static' : 'sticky', top: 0,
        display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nomeMes(rascunho.mesReferencia)} · montando a V{proximoNumero}</div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{deOnde} · salva neste navegador a cada alteração</div>
        </div>
        <nav aria-label="Passos" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {PASSOS.map((p, i) => {
            const ativo = p.id === passo
            const detalhe = p.id === 'marcas' ? `${resumo.prontas}/${resumo.total}` : p.id === 'semanas' ? 'opcional' : null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPasso(p.id)}
                aria-current={ativo ? 'step' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: '1px solid ' + (ativo ? 'var(--brand-accent)' : 'transparent'),
                  background: ativo ? 'color-mix(in srgb, var(--brand-accent) 8%, var(--ws-surface))' : 'none',
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ws-text-primary)', fontWeight: ativo ? 600 : 400,
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                  background: ativo ? 'var(--brand-accent)' : 'var(--ws-bg)', color: ativo ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
                }}>{i + 1}</span>
                {p.rotulo}
                {detalhe && <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontWeight: 400 }}>{detalhe}</span>}
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={onSair} style={ghostButtonStyle}><LogOut size={14} /> Sair</button>
      </div>

      {passo === 'marcas' && marca && (
        <EditorMarca
          key={marca.marca}
          marca={marca}
          mesReferencia={rascunho.mesReferencia}
          proximaMarca={proxima ? marcaLabel(proxima.marca) : null}
          onMudar={mudarMarca}
          onVoltar={() => setMarcaAberta(null)}
          onProxima={() => setMarcaAberta(proxima ? proxima.marca : null)}
          onRemover={() => {
            atualizar({
              ...rascunho,
              marcas: rascunho.marcas.filter(x => x.marca !== marca.marca),
              vendasPorSemana: rascunho.vendasPorSemana.filter(v => v.marca !== marca.marca),
            })
            setMarcaAberta(null)
          }}
        />
      )}

      {passo === 'marcas' && !marca && (
        <PainelMarcas
          rascunho={rascunho}
          onAbrirMarca={setMarcaAberta}
          onAdicionarMarcas={nomes => atualizar({ ...rascunho, marcas: ordenarMarcas([...rascunho.marcas, ...nomes.map(marcaEmBranco)]) })}
          onAvancar={() => setPasso('semanas')}
        />
      )}

      {passo === 'semanas' && (
        <PassoSemanas rascunho={rascunho} onMudar={atualizar} onVoltar={() => setPasso('marcas')} onAvancar={() => setPasso('revisar')} />
      )}

      {passo === 'revisar' && (
        <PassoRevisarPublicar
          rascunho={rascunho}
          proximoNumero={proximoNumero}
          versaoAtiva={versaoAtiva}
          totaisMesAnterior={totaisMesAnterior}
          onAbrirMarca={m => { setPasso('marcas'); setMarcaAberta(m) }}
          onPublicado={onPublicado}
        />
      )}

      {passo === 'marcas' && !marca && rascunho.marcas.length > 0 && resumo.prontas === resumo.total && (
        <div style={infoBoxStyle}>Tudo pronto nas marcas. A distribuição semanal é opcional — dá pra ir direto pra Revisar e publicar.</div>
      )}
    </div>
  )
}
