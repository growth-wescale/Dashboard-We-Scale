import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useMetaMes, type EstadoMes, type EstadoMesMarca, type DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { ConfigEtapa, DiaSemana, EtapaMeta, Semana } from '@/lib/metasEngine'
import { PassoSemanas } from '@/components/metas/PassoSemanas'
import { PassoTaxas } from '@/components/metas/PassoTaxas'
import { PassoFunilMarca } from '@/components/metas/PassoFunilMarca'
import { PassoPessoas } from '@/components/metas/PassoPessoas'

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

  // `reload` chega das Tasks 11–16 (ex.: Passo 6 "Revisar e publicar" recarrega
  // o estado do banco após publicar) — não usado ainda neste passo 0.
  const { estado, loading } = useMetaMes(mesReferencia)
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
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Metas"
        subtitle="Lançamento mensal de metas — funil configurável por marca, semanas e pessoas"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PASSOS.map((label, i) => (
          <button key={label} onClick={() => setPasso(i)} style={{
            padding: '6px 14px', borderRadius: 999,
            border: '1px solid ' + (i === passo ? 'var(--ws-brand)' : 'var(--ws-border)'),
            background: i === passo ? 'var(--ws-brand)' : '#fff',
            color: i === passo ? '#fff' : 'var(--ws-text-primary)',
            fontSize: 12, cursor: 'pointer',
          }}>{i}. {label}</button>
        ))}
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

      {!loading && passo > 0 && !rascunhoAtual && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Volte ao Passo 0 e abra o mês (copiando do anterior ou começando vazio) antes de continuar.
        </div>
      )}

      {/* Passos 5–6 chegam nas Tasks 15–16, todos recebendo `rascunhoAtual` e `setRascunho` */}
    </div>
  )
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
  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 240 }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Mês de referência</span>
        <input type="month" value={mesReferencia.slice(0, 7)} onChange={e => setMesReferencia(`${e.target.value}-01`)}
          style={{ padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
      </label>

      {jaAberto ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          Este mês já está {estado!.status === 'publicado' ? 'publicado' : 'em rascunho'}. Avance pelos passos pra editar.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          {estadoAnterior && estadoAnterior.status !== 'inexistente' && (
            <button onClick={onCopiarMesAnterior} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--ws-brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Copiar do mês anterior
            </button>
          )}
          <button onClick={onIniciarVazio} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--ws-border)', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Começar vazio
          </button>
        </div>
      )}
    </div>
  )
}
