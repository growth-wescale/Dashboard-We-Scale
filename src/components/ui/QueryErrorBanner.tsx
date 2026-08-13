import { AlertCircle } from 'lucide-react'

interface Props {
  /** Erros vindos de hooks (`useMediaData().error`, etc). Nulls e strings vazias são filtrados. */
  errors: Array<string | null | undefined>
  /** Rótulo curto pra identificar (ex.: "Vendas", "Média"). */
  scope?: string
}

/** Banner discreto pra mostrar erros que hoje são silenciados por padrão.
 *  Se todos os erros forem null/vazios, renderiza null (sem espaço reservado).
 */
export function QueryErrorBanner({ errors, scope }: Props) {
  const actives = errors.filter((e): e is string => Boolean(e && e.trim()))
  if (actives.length === 0) return null

  const unique = Array.from(new Set(actives))
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', margin: '0 0 12px',
      borderRadius: 10, fontSize: 13,
      background: 'color-mix(in srgb, var(--status-critico, #dc2626) 8%, var(--ws-surface))',
      border: '1px solid color-mix(in srgb, var(--status-critico, #dc2626) 40%, transparent)',
      color: 'var(--ws-text-primary)',
    }}>
      <AlertCircle size={16} style={{ color: 'var(--status-critico, #dc2626)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          {scope ? `Erro ao carregar ${scope}` : 'Erro ao carregar dados'}
          {unique.length > 1 && ` (${unique.length} problemas)`}
        </div>
        {unique.map((msg, i) => (
          <div key={i} style={{ fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.4 }}>
            {msg.length > 200 ? msg.slice(0, 200) + '…' : msg}
          </div>
        ))}
      </div>
    </div>
  )
}
