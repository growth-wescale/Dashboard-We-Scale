interface Option<V extends string> {
  value: V
  label: string
}

interface Props<V extends string> {
  options: Option<V>[]
  value: V
  onChange: (v: V) => void
  size?: 'sm' | 'md'
}

/**
 * Segmented control estilo iOS. Trilho rebaixado, thumb com accent na label ativa.
 * Porta MetricPicker do handoff V2.
 */
export function SegmentedControl<V extends string>({ options, value, onChange, size = 'sm' }: Props<V>) {
  return (
    <div style={{
      display: 'inline-flex',
      background: 'var(--r-fill, rgba(51,3,45,0.055))',
      borderRadius: 999,
      padding: 3,
      gap: 2,
    }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: size === 'sm' ? 12 : 13,
              padding: size === 'sm' ? '5px 11px' : '6px 13px',
              borderRadius: 999,
              background: on ? 'var(--r-seg-thumb, var(--brand-accent))' : 'transparent',
              color: on ? 'var(--r-seg-thumb-text, var(--brand-accent-contrast))' : 'var(--ws-text-secondary)',
              boxShadow: on ? 'var(--r-control, none)' : 'none',
              transition: 'background 180ms var(--r-ease, ease), color 180ms var(--r-ease, ease)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
