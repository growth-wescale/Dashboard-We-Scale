/**
 * Toggle Todos · SDR · Closer da Análise de Perda — separa a perda de
 * Pré-vendas (SDR) da de Vendas (Closer) pela etapa em que o negócio foi
 * perdido (`camadaDaPerda`, perdaRows.ts). Mora ao lado do toggle de origem,
 * mesmo visual, porque recorta a página inteira.
 *
 * Estado e memória da escolha: `useCamadaPerda` (hooks/useCamadaPerda.ts).
 */

import { CAMADAS_PERDA } from '@/lib/perdaRows'
import type { CamadaPerda } from '@/lib/perdaRows'

const ROTULO: Record<CamadaPerda, string> = { todos: 'Todos', SDR: 'SDR', Closer: 'Closer' }

const HINT: Record<CamadaPerda, string> = {
  todos: 'Todas as perdas do período',
  SDR: 'Pré-vendas: perdas em etapa do SDR (do MQL até a Reunião Agendada, e No Show)',
  Closer: 'Vendas: perdas do Diagnóstico em diante',
}

export function CamadaPerdaToggle({ value, onChange }: { value: CamadaPerda; onChange: (c: CamadaPerda) => void }) {
  return (
    <div
      role="group"
      aria-label="Camada da perda"
      style={{
        display: 'inline-flex', background: 'var(--ws-bg)',
        border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
        padding: 2, gap: 2,
      }}
    >
      {CAMADAS_PERDA.map(c => {
        const on = c === value
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={HINT[c]}
            aria-pressed={on}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 4, padding: '5px 12px',
              fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: 'var(--font-body)',
              whiteSpace: 'nowrap',
              background: on ? 'var(--ws-surface)' : 'transparent',
              color: on ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)',
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {ROTULO[c]}
          </button>
        )
      })}
    </div>
  )
}
