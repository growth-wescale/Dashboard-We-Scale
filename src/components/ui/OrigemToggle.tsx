/**
 * Toggle Inbound × Prospecção Ativa — o recorte mais externo das abas de
 * Vendas, por isso mora ao lado do título e não na FilterBar.
 *
 * São dois motores comerciais que não se comparam: no Inbound o lead chega e
 * entra no funil SDR / Odonto Scale / Closer; na Prospecção Ativa o SDR sai
 * atrás do lead, em funil próprio. Não existe estado "Todos" — a leitura
 * consolidada misturava os dois e derrubava toda a conversão do Inbound.
 *
 * Os rótulos vão por extenso de propósito: "PA" não é vocabulário do time.
 */

import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { ORIGENS } from '@/lib/funnelTypes'

const HINT: Record<string, string> = {
  'Inbound': 'Negócios que nunca passaram pelo funil de Prospecção Ativa',
  'Prospecção Ativa': 'Negócios que passaram pelo funil de Prospecção Ativa em algum momento',
}

export function OrigemToggle() {
  const { origem, setOrigem } = useSharedFilters()

  return (
    <div
      role="group"
      aria-label="Origem comercial"
      style={{
        display: 'inline-flex', background: 'var(--ws-bg)',
        border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
        padding: 2, gap: 2,
      }}
    >
      {ORIGENS.map(o => {
        const on = o === origem
        return (
          <button
            key={o}
            type="button"
            onClick={() => setOrigem(o)}
            title={HINT[o]}
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
            {o}
          </button>
        )
      })}
    </div>
  )
}
