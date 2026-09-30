import { useRef, useState } from 'react'
import { Check, GripVertical, Plus, Scale, X } from 'lucide-react'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import {
  ajustarPeso, dividirIgualmente, metasPorPessoa, moverDivisa, normalizarPesos, ROTULO_ETAPA,
  type EtapaMetaConfig, type FunilCalculado, type MarcaConfig, type MetaPessoa,
} from '@/lib/configMetas'
import type { PessoaComFuncao } from '@/lib/metasEngine'
import { CampoNumero } from './CampoNumero'
import { fmtBRL, fmtDec, ghostButtonStyle, pillStyle } from './metasUi'

type Funcao = 'SDR' | 'Closer'

const FUNCOES: { funcao: Funcao; titulo: string; leva: string }[] = [
  { funcao: 'SDR', titulo: 'SDRs', leva: 'levam Ligações, SQL, Diagnóstico e SAL' },
  { funcao: 'Closer', titulo: 'Closers', leva: 'levam Oportunidade, Vendas e faturamento' },
]

/** Cor de cada pessoa na barra e no card (texto branco por cima). */
const CORES = ['#6366F1', '#0EA5E9', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

const ETAPAS_PESSOA: Record<Funcao, EtapaMetaConfig[]> = {
  SDR: ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Ligações'],
  Closer: ['Oportunidade COF', 'Fechamento'],
}

function fmtPeso(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')}%`
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function TimeMarca({ marca, funil, onMudarPessoas }: {
  marca: MarcaConfig
  funil: FunilCalculado
  onMudarPessoas: (pessoas: PessoaComFuncao[]) => void
}) {
  const { data: roster } = useRosterVendas()
  const fotos = new Map(roster.map(r => [r.nome, r.foto]))
  const previa = metasPorPessoa(marca, funil)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {FUNCOES.map(({ funcao, titulo, leva }) => {
        const dessa = marca.pessoas.filter(p => p.funcao === funcao)
        const soma = dessa.reduce((s, p) => s + p.peso, 0)
        const somaOk = dessa.length === 0 || Math.abs(soma - 100) <= 0.01
        const disponiveis = roster.filter(r => (r.cargo === funcao || r.cargo === 'SDR/Closer') && !dessa.some(d => d.nome === r.nome))

        const adicionar = (nome: string) => onMudarPessoas(dividirIgualmente([...marca.pessoas, { nome, funcao, peso: 0 }], funcao))
        const remover = (nome: string) => onMudarPessoas(normalizarPesos(marca.pessoas.filter(p => !(p.nome === nome && p.funcao === funcao)), funcao))
        const mudarPeso = (nome: string, peso: number) => onMudarPessoas(ajustarPeso(marca.pessoas, funcao, nome, peso))
        const mudarPesos = (pesos: number[]) => {
          let i = 0
          onMudarPessoas(marca.pessoas.map(p => (p.funcao === funcao ? { ...p, peso: pesos[i++] } : p)))
        }

        return (
          <div key={funcao} style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', padding: 18, background: 'var(--ws-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{leva}</div>
              </div>
              {dessa.length > 0 && (
                somaOk
                  ? <span style={pillStyle('sucesso')}><Check size={11} /> fecha 100%</span>
                  : <span style={pillStyle('erro')}>soma {fmtPeso(soma)} — precisa ser 100%</span>
              )}
              {!somaOk && (
                <button type="button" onClick={() => onMudarPessoas(normalizarPesos(marca.pessoas, funcao))} style={{ ...ghostButtonStyle, fontSize: 12, color: 'var(--status-risco)' }}>
                  Corrigir para 100%
                </button>
              )}
              {dessa.length > 1 && (
                <button type="button" onClick={() => onMudarPessoas(dividirIgualmente(marca.pessoas, funcao))} style={{ ...ghostButtonStyle, fontSize: 12 }}>
                  <Scale size={13} /> Dividir igualmente
                </button>
              )}
            </div>

            {dessa.length === 0 ? (
              <div style={{
                padding: '18px 16px', borderRadius: 'var(--radius-sm)', border: '1.5px dashed var(--ws-border-strong)',
                fontSize: 13, color: 'var(--ws-text-secondary)', textAlign: 'center',
              }}>
                Ninguém nesta função ainda. Escolha abaixo quem trabalha {marca.marca} como {funcao}.
              </div>
            ) : (
              <>
                <BarraPesos pessoas={dessa} onPesos={mudarPesos} />
                {dessa.length > 1 && (
                  <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '6px 0 0' }}>
                    Arraste as divisórias da barra ou use as setinhas — a soma sempre fecha 100%.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 10, marginTop: 14 }}>
                  {dessa.map((p, i) => (
                    <CartaoPessoa
                      key={p.nome}
                      pessoa={p}
                      cor={CORES[i % CORES.length]}
                      foto={fotos.get(p.nome) ?? null}
                      sozinha={dessa.length === 1}
                      meta={previa.find(x => x.nome === p.nome && x.funcao === funcao)}
                      onPeso={v => mudarPeso(p.nome, v)}
                      onRemover={() => remover(p.nome)}
                    />
                  ))}
                </div>
              </>
            )}

            {disponiveis.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginRight: 2 }}>Adicionar:</span>
                {disponiveis.map(r => (
                  <button
                    key={r.nome}
                    type="button"
                    className="cm-chip"
                    onClick={() => adicionar(r.nome)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12,
                      borderRadius: 'var(--radius-pill)', border: '1px solid var(--ws-border)', background: 'var(--ws-bg)',
                      color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    <Plus size={12} /> {r.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Barra 100% repartida entre as pessoas da função. Cada divisória é um
 * slider: arrastar (mouse ou toque) ou seta ←/→ troca peso só entre os dois
 * vizinhos (`moverDivisa`), então a soma não sai de 100%.
 */
function BarraPesos({ pessoas, onPesos }: { pessoas: PessoaComFuncao[]; onPesos: (pesos: number[]) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const pesos = pessoas.map(p => p.peso)
  const divisas = pesos.slice(0, -1).map((_, i) => pesos.slice(0, i + 1).reduce((a, b) => a + b, 0))

  function posicao(clientX: number): number {
    const r = ref.current?.getBoundingClientRect()
    return r ? ((clientX - r.left) / r.width) * 100 : 0
  }

  return (
    <div ref={ref} style={{ position: 'relative', height: 48, userSelect: 'none', touchAction: 'none' }}>
      <div style={{ display: 'flex', height: '100%', borderRadius: 10, overflow: 'hidden', background: 'var(--ws-bg)' }}>
        {pessoas.map((p, i) => (
          <div key={p.nome} style={{
            width: `${p.peso}%`, background: CORES[i % CORES.length], color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap',
            fontSize: 12, fontWeight: 600, transition: arrastando == null ? 'width .25s ease' : 'none',
          }}>
            {p.peso >= 14 && <span className="cm-barra-nome">{p.nome.split(' ')[0]}</span>}
            {p.peso >= 6 && <span style={{ opacity: 0.9 }}>{fmtPeso(p.peso)}</span>}
          </div>
        ))}
      </div>
      {divisas.map((pos, i) => (
        <div
          key={i}
          role="slider"
          tabIndex={0}
          aria-label={`Divisa entre ${pessoas[i].nome} e ${pessoas[i + 1].nome}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${pessoas[i].nome} ${fmtPeso(pesos[i])}, ${pessoas[i + 1].nome} ${fmtPeso(pesos[i + 1])}`}
          className="cm-divisa"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setArrastando(i) }}
          onPointerMove={e => { if (arrastando === i) onPesos(moverDivisa(pesos, i, posicao(e.clientX))) }}
          onPointerUp={() => setArrastando(null)}
          onPointerCancel={() => setArrastando(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onPesos(moverDivisa(pesos, i, pos - 1)) }
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onPesos(moverDivisa(pesos, i, pos + 1)) }
          }}
          style={{
            position: 'absolute', top: -4, bottom: -4, left: `calc(${pos}% - 12px)`, width: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'col-resize', zIndex: 1,
          }}
        >
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 34, borderRadius: 6,
            background: 'var(--ws-surface)', boxShadow: arrastando === i ? '0 0 0 3px var(--brand-accent)' : 'var(--shadow-md)',
            color: 'var(--ws-text-secondary)', transition: 'box-shadow .15s',
          }}>
            <GripVertical size={14} />
          </span>
        </div>
      ))}
    </div>
  )
}

function CartaoPessoa({ pessoa, cor, foto, sozinha, meta, onPeso, onRemover }: {
  pessoa: PessoaComFuncao
  cor: string
  foto: string | null
  sozinha: boolean
  meta: MetaPessoa | undefined
  onPeso: (peso: number) => void
  onRemover: () => void
}) {
  const [fotoFalhou, setFotoFalhou] = useState(false)
  const etapas = ETAPAS_PESSOA[pessoa.funcao].filter(e => meta?.valores[e] != null)

  return (
    <div style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--ws-border)', padding: 12, background: 'var(--ws-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: cor, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
          boxShadow: `0 0 0 2px var(--ws-surface), 0 0 0 4px ${cor}`,
        }}>
          {foto && !fotoFalhou
            ? <img src={foto} alt="" onError={() => setFotoFalhou(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : iniciais(pessoa.nome)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pessoa.nome}</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{sozinha ? 'única nesta função · 100%' : 'peso'}</div>
        </div>
        {!sozinha && (
          <CampoNumero valor={pessoa.peso} onMudar={v => { if (v != null) onPeso(v) }} casas={2} passo={1} max={100} sufixo="%" largura={60} rotulo={`Peso de ${pessoa.nome}`} />
        )}
        <button type="button" onClick={onRemover} aria-label={`Remover ${pessoa.nome}`} style={{ ...ghostButtonStyle, padding: 4 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {etapas.length === 0 && pessoa.funcao === 'SDR' && (
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>sem metas de SDR nesta marca</span>
        )}
        {etapas.map(e => (
          <span key={e} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--ws-bg)' }}>
            <span style={{ color: 'var(--ws-text-secondary)' }}>{ROTULO_ETAPA[e]}</span> <b>{fmtDec(meta!.valores[e]!)}</b>
          </span>
        ))}
        {meta?.faturamento != null && (
          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--ws-bg)' }}>
            <b>{fmtBRL(meta.faturamento)}</b>
          </span>
        )}
      </div>
    </div>
  )
}
