import type { CSSProperties } from 'react'

export interface WsBrand { key: string; label: string; accent: string }

export const WS_BRANDS: WsBrand[] = [
  { key: 'overview',   label: 'Visão Geral', accent: '#2ABCB5' },
  { key: 'oral-unic',  label: 'Oral Unic',   accent: '#7F0C72' },
  { key: 'inpot',      label: 'Inpot',       accent: '#C6D32D' },
  { key: 'eletrovias', label: 'Eletrovias',  accent: '#ED6D3A' },
  { key: 'liso-laser', label: 'Lisô Laser',  accent: '#FF6643' },
  { key: 'b2case',     label: 'B2Case',      accent: '#0169F2' },
  { key: 'viva',       label: 'Viva',        accent: '#FF0069' },
]

interface BrandSwitcherProps {
  value?: string
  onChange?: (key: string) => void
  brands?: WsBrand[]
  style?: CSSProperties
}

function readable(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#0B3120' : '#FFFFFF'
}

export function BrandSwitcher({
  value = 'overview',
  onChange = () => {},
  brands = WS_BRANDS,
  style = {},
}: BrandSwitcherProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...style }}>
      {brands.map((b) => {
        const on = b.key === value
        return (
          <button
            key={b.key}
            onClick={() => onChange(b.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
              padding: '8px 14px', borderRadius: 'var(--radius-pill)',
              border: `1.5px solid ${on ? b.accent : 'var(--ws-border-strong)'}`,
              background: on ? b.accent : 'var(--ws-surface)',
              color: on ? readable(b.accent) : 'var(--ws-text-primary)',
              transition: 'all .15s ease',
            }}
          >
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: on ? readable(b.accent) : b.accent,
              flex: '0 0 auto',
            }} />
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
