import { useMemo, useState, type CSSProperties } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useMetaMes, type EstadoMes, type EstadoMesMarca, type DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { ConfigEtapa, DiaSemana, EtapaMeta, Semana } from '@/lib/metasEngine'
import { PassoSemanas } from '@/components/metas/PassoSemanas'
import { PassoTaxas } from '@/components/metas/PassoTaxas'
import { PassoFunilMarca } from '@/components/metas/PassoFunilMarca'
import { PassoPessoas } from '@/components/metas/PassoPessoas'
import { PassoDistribuicaoSemanal } from '@/components/metas/PassoDistribuicaoSemanal'
import { PassoRevisarPublicar } from '@/components/metas/PassoRevisarPublicar'
import { cardStyle, primaryButtonStyle, secondaryButtonStyle } from '@/components/metas/metasUi'

// 7 entradas, índice 0–6 — Passo 0 é a única "fora da contagem" do spec
// (abrir/copiar o mês, não uma etapa de configuração em si); Passo 1–6 são
// os "6 passos" que a §4 do spec conta. Toda referência a `passo === N` nas
// Tasks 11–16 usa esses mesmos índices — não renumerar sem atualizar as 6.
const PASSOS = ['Abrir mês', 'Semanas', 'Taxas', 'Funil por marca', 'Pessoas', 'Distribuição semanal', 'Revisar e publicar'] as const

function mesAtualKey(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
}

function mesAnteriorKey(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const d = new Date(ano, mes - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function HubMetas() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualKey())
  const [passo, setPasso] = useState(0)

  // `reload` é usado pelo Passo 6 "Revisar e publicar" pra recarregar o
  // estado do banco depois de publicar.
  const { estado, loading, reload } = useMetaMes(mesReferencia)
  const { estado: estadoAnterior } = useMetaMes(mesAnteriorKey(mesReferencia))

  const [rascunho, setRascunho] = useState<{
    diaViradaSemana: DiaSemana
    semanas: Semana[]
    marcas: EstadoMesMarca[]
    distribuicaoSemanal: DistribuicaoSemanalItem[]
  } | null>(null)

  // Ao trocar de mês (ou carregar), inicializa o rascunho local a partir do
  // estado do banco (ou vazio, se o mês nunca foi aberto).
  const rascunhoAtual = useMemo(() => {
    if (rascunho) return rascunho
    if (estado && estado.status !== 'inexistente') {
      return { diaViradaSemana: estado.diaViradaSemana, semanas: estado.semanas, marcas: estado.marcas, distribuicaoSemanal: estado.distribuicaoSemanal }
    }
    return null
  }, [estado, rascunho])

  return (
    <div style={{ padding: 'var(--page-pad-top) var(--page-pad-x) 48px', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Metas"
        subtitle="Lançamento mensal de metas — funil configurável por marca, semanas e pessoas"
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

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</div>}

      {!loading && passo === 0 && (
        <PassoAbrirMes
          mesReferencia={mesReferencia}
          setMesReferencia={setMesReferencia}
          estado={estado as EstadoMes | null}
          estadoAnterior={estadoAnterior as EstadoMes | null}
          onCopiarMesAnterior={() => {
            if (!estadoAnterior || estadoAnterior.status === 'inexistente') return
            setRascunho({
              diaViradaSemana: estadoAnterior.diaViradaSemana,
              semanas: [], // semanas do mês novo são geradas no Passo 1, não copiadas (datas mudam de mês pra mês)
              marcas: estadoAnterior.marcas,
              distribuicaoSemanal: [],
            })
          }}
          onIniciarVazio={() => setRascunho({ diaViradaSemana: 'terca', semanas: [], marcas: [], distribuicaoSemanal: [] })}
        />
      )}

      {!loading && passo === 1 && rascunhoAtual && (
        <PassoSemanas
          mesReferencia={mesReferencia}
          diaViradaSemana={rascunhoAtual.diaViradaSemana}
          onMudar={(dia, semanas) => setRascunho({ ...rascunhoAtual, diaViradaSemana: dia, semanas })}
        />
      )}

      {!loading && passo === 2 && rascunhoAtual && (
        <PassoTaxas
          marcas={rascunhoAtual.marcas}
          mesAnterior={mesAnteriorKey(mesReferencia)}
          onMudarTaxa={(marca, etapa, taxa, origem) => {
            setRascunho({
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
            setRascunho({
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
            setRascunho({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, ticketMedio: ticket }) })
          }}
        />
      )}

      {!loading && passo === 4 && rascunhoAtual && (
        <PassoPessoas
          marcas={rascunhoAtual.marcas}
          onMudarPessoas={(marca, pessoas) => {
            setRascunho({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, pessoas }) })
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
            setRascunho({ ...rascunhoAtual, distribuicaoSemanal: [...semOEditado, { marca, nomePessoa, semanaNumero, etapa, valor }] })
          }}
        />
      )}

      {!loading && passo > 0 && !rascunhoAtual && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Volte ao Passo 0 e abra o mês (copiando do anterior ou começando vazio) antes de continuar.
        </div>
      )}

      {!loading && passo === 6 && rascunhoAtual && (
        <PassoRevisarPublicar
          mesReferencia={mesReferencia}
          diaViradaSemana={rascunhoAtual.diaViradaSemana}
          semanas={rascunhoAtual.semanas}
          marcas={rascunhoAtual.marcas}
          distribuicaoSemanal={rascunhoAtual.distribuicaoSemanal}
          estadoMesAnterior={estadoAnterior as EstadoMes | null}
          onPublicado={reload}
        />
      )}
    </div>
  )
}

const MESES_LABEL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function selectStyle(): CSSProperties {
  return {
    padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 14, color: 'var(--ws-text-primary)', background: 'var(--ws-surface)', cursor: 'pointer',
  }
}

function PassoAbrirMes({
  mesReferencia, setMesReferencia, estado, estadoAnterior, onCopiarMesAnterior, onIniciarVazio,
}: {
  mesReferencia: string
  setMesReferencia: (m: string) => void
  estado: EstadoMes | null
  estadoAnterior: EstadoMes | null
  onCopiarMesAnterior: () => void
  onIniciarVazio: () => void
}) {
  const jaAberto = estado != null && estado.status !== 'inexistente'
  const [ano, mes] = mesReferencia.split('-').map(Number) // mes: 1-12
  const anoAtual = new Date().getFullYear()
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]

  return (
    <div style={cardStyle}>
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', display: 'block', marginBottom: 8 }}>Mês de referência</span>
      <div style={{ display: 'flex', gap: 10 }}>
        <select value={mes} onChange={e => setMesReferencia(`${ano}-${String(e.target.value).padStart(2, '0')}-01`)} style={selectStyle()}>
          {MESES_LABEL.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
        </select>
        <select value={ano} onChange={e => setMesReferencia(`${e.target.value}-${String(mes).padStart(2, '0')}-01`)} style={selectStyle()}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {jaAberto ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          Este mês já está {estado!.status === 'publicado' ? 'publicado' : 'em rascunho'}. Avance pelos passos pra editar.
        </p>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {estadoAnterior && estadoAnterior.status !== 'inexistente' && (
            <button onClick={onCopiarMesAnterior} style={primaryButtonStyle}>
              Copiar do mês anterior
            </button>
          )}
          <button onClick={onIniciarVazio} style={secondaryButtonStyle}>
            Começar vazio
          </button>
        </div>
      )}
    </div>
  )
}
