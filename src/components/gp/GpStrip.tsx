import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { useSemanasCampanha } from '@/hooks/useSemanasCampanha'
import { diaDaCampanha, mesAtualCampanha, montarCampanha, voltaDoDia } from '@/constants/metasCampanhaF1'

/**
 * Faixa GP (Modo GP) — banner de corrida presente em TODAS as páginas
 * exceto a própria Campanha de Metas. Portado do handoff (fn GpStrip).
 *
 * **Dados exibidos:**
 * - Volta atual + range (mês corrente da campanha; voltas = semanas da meta)
 * - Líder P1 do ranking (nome + cor + % de meta) — vem de `useMetasClosers`
 * - Dias restantes pra bandeirada (30 · set)
 * - Pool de prêmios (R$ 12.000 hardcoded)
 *
 * **Comportamento:** hover eleva sombra, click no strip inteiro OU no CTA
 * navega pra `/gp-setembro`.
 */

const POOL_PREMIOS = 12000

export function GpStrip() {
  const navigate = useNavigate()
  // Sempre o mês corrente da campanha; as voltas são as semanas da meta do mês.
  const mes = mesAtualCampanha()
  const { semanas } = useSemanasCampanha(mes)
  const campanha = useMemo(() => montarCampanha(mes, semanas), [mes, semanas])
  const { closers } = useMetasClosers(mes)

  const lider = useMemo(() => {
    // Ordena por %atingimento desc, empate por realizado desc, undefined-safe
    const ordenado = [...closers].sort(
      (a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado,
    )
    return ordenado[0] ?? null
  }, [closers])

  const dia = diaDaCampanha(campanha)
  const volta = campanha.voltas[voltaDoDia(campanha, dia) - 1]
  const diasRestantes = Math.max(0, campanha.diasMes - dia)

  const irParaCampanha = () => navigate('/gp-setembro')

  return (
    <div className="gp-strip" onClick={irParaCampanha} title="Abrir Campanha de Metas" role="button">
      <span className="gp-strip__live">
        <i />
        GP We Scale
      </span>
      <span className="gp-strip__chip">🏁 Volta {volta?.num} de {campanha.voltas.length} · {volta?.label.split('·')[1]?.trim()}</span>
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
