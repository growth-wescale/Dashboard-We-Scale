import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMetasClosers } from '@/hooks/useMetasClosers'

/**
 * Faixa GP (Modo GP) — banner de corrida presente em TODAS as páginas
 * exceto a própria Campanha de Metas. Portado do handoff (fn GpStrip).
 *
 * **Dados exibidos:**
 * - Volta atual + range (calculado do dia do mês, setembro/2026)
 * - Líder P1 do ranking (nome + cor + % de meta) — vem de `useMetasClosers`
 * - Dias restantes pra bandeirada (30 · set)
 * - Pool de prêmios (R$ 12.000 hardcoded)
 *
 * **Comportamento:** hover eleva sombra, click no strip inteiro OU no CTA
 * navega pra `/gp-setembro`.
 */

const MES_ATIVO = '2026-09-01'
const MES_INICIO = new Date(2026, 8, 1)
const MES_FIM = new Date(2026, 8, 30)
const DIAS_MES = 30
const POOL_PREMIOS = 12000

const VOLTAS = [
  { num: 1, range: '1–7 set',   inicio: 1,  fim: 7 },
  { num: 2, range: '8–14 set',  inicio: 8,  fim: 14 },
  { num: 3, range: '15–21 set', inicio: 15, fim: 21 },
  { num: 4, range: '22–30 set', inicio: 22, fim: 30 },
]

function diaDoMes(): number {
  const hoje = new Date()
  if (hoje < MES_INICIO) return 0
  if (hoje > MES_FIM) return DIAS_MES
  return hoje.getDate()
}

function voltaAtual(dia: number) {
  const v = dia <= 7 ? VOLTAS[0] : dia <= 14 ? VOLTAS[1] : dia <= 21 ? VOLTAS[2] : VOLTAS[3]
  return v
}

export function GpStrip() {
  const navigate = useNavigate()
  const { closers } = useMetasClosers(MES_ATIVO)

  const lider = useMemo(() => {
    // Ordena por %atingimento desc, empate por realizado desc, undefined-safe
    const ordenado = [...closers].sort(
      (a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado,
    )
    return ordenado[0] ?? null
  }, [closers])

  const dia = diaDoMes()
  const volta = voltaAtual(dia)
  const diasRestantes = Math.max(0, DIAS_MES - dia)

  const irParaCampanha = () => navigate('/gp-setembro')

  return (
    <div className="gp-strip" onClick={irParaCampanha} title="Abrir Campanha de Metas" role="button">
      <span className="gp-strip__live">
        <i />
        GP We Scale
      </span>
      <span className="gp-strip__chip">🏁 Volta {volta.num} de 4 · {volta.range}</span>
      <span className="gp-strip__chip">
        {lider ? (
          <>
            <span
              style={{ width: 8, height: 8, borderRadius: 999, background: lider.cor }}
              aria-hidden
            />
            P1 · {lider.nome} · {Math.round(lider.pctAtingimento)}% da meta
          </>
        ) : (
          <>P1 · aguardando dados</>
        )}
      </span>
      <span className="gp-strip__chip">{diasRestantes} dias para a bandeirada</span>
      <span className="gp-strip__chip">
        Pool · R$ {POOL_PREMIOS.toLocaleString('pt-BR')}
      </span>
      <button
        className="gp-strip__cta"
        onClick={(e) => {
          e.stopPropagation()
          irParaCampanha()
        }}
        type="button"
      >
        Ver classificação →
      </button>
    </div>
  )
}
