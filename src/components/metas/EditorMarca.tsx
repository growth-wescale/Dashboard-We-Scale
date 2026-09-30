import { useEffect, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { calcularFunil, encaixarFaixas, pendenciasMarca, statusMarca, type MarcaConfig } from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { FunilReverso } from './FunilReverso'
import { TimeMarca } from './TimeMarca'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, fmtBRL, fmtDec, ghostButtonStyle, infoBoxStyle,
  nomeMesMinusculo, pillStyle, primaryButtonStyle, secondaryButtonStyle,
} from './metasUi'
import './metas.css'

export function EditorMarca({ marca, mesReferencia, proximaMarca, onMudar, onVoltar, onProxima, onRemover }: {
  marca: MarcaConfig
  mesReferencia: string
  /** Rótulo da próxima marca da lista, ou null se esta é a última. */
  proximaMarca: string | null
  onMudar: (m: MarcaConfig) => void
  onVoltar: () => void
  onProxima: () => void
  onRemover: () => void
}) {
  // Closer divide vendas inteiras: vendas mudaram → pesos dos Closers reencaixam nas faixas (100 ÷ vendas).
  const mudarVendas = (v: number | null) => onMudar({ ...marca, vendas: v, pessoas: encaixarFaixas(marca.pessoas, 'Closer', v) })

  // Ao abrir a marca, encaixa pesos de Closer que vieram fora das faixas (rascunho antigo, mês anterior).
  useEffect(() => {
    const encaixadas = encaixarFaixas(marca.pessoas, 'Closer', marca.vendas)
    if (encaixadas.some((p, i) => p.peso !== marca.pessoas[i].peso)) onMudar({ ...marca, pessoas: encaixadas })
    // só na abertura da marca (o editor é remontado por marca)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const funil = calcularFunil(marca)
  const pendencias = pendenciasMarca(marca, funil)
  const status = statusMarca(marca, pendencias)
  const ref = marca.referencia
  const nome = marcaLabel(marca.marca)
  const mes = nomeMesMinusculo(mesReferencia)

  let orientacao: string | null = null
  if (marca.vendas == null) {
    orientacao = ref
      ? `Comece informando quantas vendas ${nome} deve fazer em ${mes}. A taxa de franquia, as conversões e o time já vêm de ${ref.rotulo} — o funil se calcula sozinho a partir das vendas.`
      : `${nome} não tem referência anterior. Informe as vendas e a taxa de franquia, depois a conversão de cada etapa e o time.`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={ghostButtonStyle}><ArrowLeft size={14} /> Marcas</button>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: BRAND_ACCENT[marca.marca] ?? 'var(--ws-border-strong)' }} aria-hidden />
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22 }}>{nome}</h2>
        <span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => { if (window.confirm(`Tirar ${nome} da meta de ${mes}? Dá pra adicionar de novo depois, mas a configuração dela será perdida.`)) onRemover() }}
          style={{ ...ghostButtonStyle, fontSize: 12 }}
        >
          <Trash2 size={14} /> Remover do mês
        </button>
      </div>

      {orientacao && <div style={infoBoxStyle}>{orientacao}</div>}

      <Secao numero={1} titulo="Base do mês" descricao="O ponto de partida. Todo o funil é calculado a partir das vendas.">
        <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
          <Bloco rotulo="Vendas previstas">
            <CampoNumero valor={marca.vendas} onMudar={mudarVendas} destaque largura={80} passo={1} sufixo="unid." rotulo="Vendas previstas" autoFocus={marca.vendas == null} />
            {ref?.vendas != null && (
              <Sugestao igual={marca.vendas === ref.vendas} texto={`${ref.rotulo}: ${fmtDec(ref.vendas)}`} onUsar={() => mudarVendas(ref.vendas)} />
            )}
          </Bloco>
          <Bloco rotulo="Taxa de franquia média por unidade">
            <CampoNumero valor={marca.ticketMedio} onMudar={v => onMudar({ ...marca, ticketMedio: v })} destaque largura={110} passo={1000} prefixo="R$" rotulo="Taxa de franquia média" />
            {ref?.ticketMedio != null && (
              <Sugestao igual={marca.ticketMedio === ref.ticketMedio} texto={`${ref.rotulo}: ${fmtBRL(ref.ticketMedio)}`} onUsar={() => onMudar({ ...marca, ticketMedio: ref.ticketMedio })} />
            )}
          </Bloco>
          <Bloco rotulo="Faturamento previsto">
            <div style={{ fontSize: 22, fontWeight: 600, padding: '6px 0' }}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>vendas × taxa de franquia</div>
          </Bloco>
        </div>
      </Secao>

      <Secao
        numero={2}
        titulo="Funil de metas"
        descricao={`Começa nas vendas e volta etapa por etapa: quantas Oportunidades, SAL, Diagnósticos e SQL são necessários pra chegar nelas. Em cada etapa, use a conversão de ${ref?.rotulo ?? 'referência'}, informe uma nova ou digite o número direto.`}
      >
        <FunilReverso marca={marca} funil={funil} onMudar={onMudar} />
      </Secao>

      <Secao numero={3} titulo="Time da marca" descricao="Quem trabalha a marca no mês. A meta de cada pessoa é a meta da marca × o peso dela.">
        <TimeMarca marca={marca} funil={funil} onMudarPessoas={pessoas => onMudar({ ...marca, pessoas })} />
      </Secao>

      {marca.vendas != null && pendencias.length > 0 && (
        <div style={bannerStyle('atencao')}>
          <b>Falta para concluir {nome}:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {pendencias.map(p => <li key={p.texto}>{p.texto}</li>)}
          </ul>
        </div>
      )}
      {status === 'configurada' && <div style={bannerStyle('sucesso')}>{nome} está configurada.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={secondaryButtonStyle}>Voltar para marcas</button>
        <button type="button" onClick={onProxima} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {proximaMarca ? <>Próxima marca: {proximaMarca}</> : <>Concluir e ver todas as marcas</>} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function Secao({ numero, titulo, descricao, children }: { numero: number; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 600,
          background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
        }}>{numero}</span>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{titulo}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ws-text-secondary)' }}>{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Bloco({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</span>
      {children}
    </div>
  )
}

function Sugestao({ igual, texto, onUsar }: { igual: boolean; texto: string; onUsar: () => void }) {
  if (igual) return <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>igual a {texto.split(':')[0]}</span>
  return (
    <button type="button" onClick={onUsar} style={{ ...ghostButtonStyle, padding: 0, fontSize: 11, alignSelf: 'flex-start' }}>
      {texto} · usar
    </button>
  )
}
