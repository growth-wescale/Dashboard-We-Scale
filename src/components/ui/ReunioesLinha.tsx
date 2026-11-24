import { Users } from 'lucide-react'
import { nf } from '@/lib/format'
import { mostrarReunioes, type ResumoReunioes } from '@/lib/reunioesLive'

/**
 * "em N reuniões · M de LIVE" — fica colado no Diagnóstico (degrau do funil
 * da Visão Macro, cards da Performance). Some quando não há o que explicar
 * (ver `mostrarReunioes`). O clique não sobe para o card, que também é clicável.
 */
export function ReunioesLinha({ resumo, pronto, onClick }: {
  resumo: ResumoReunioes | null
  pronto: boolean
  onClick: () => void
}) {
  if (!resumo || !mostrarReunioes(resumo, pronto)) return null
  const { total, deLive } = resumo
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      title="Ver as reuniões — cada LIVE conta como uma reunião"
      style={{
        border: 'none', background: 'none', padding: 0, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11.5, fontWeight: 600, color: 'var(--ws-text-secondary)',
        textDecoration: 'underline dotted', textUnderlineOffset: 3,
        fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
      }}>
      <Users size={11} />
      em {nf(total)} {total === 1 ? 'reunião' : 'reuniões'} · {nf(deLive)} de LIVE
    </button>
  )
}
