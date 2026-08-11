import type { ReactNode, CSSProperties } from 'react'

export interface SidebarSubItem {
  key: string
  label: string
  dot?: string
}

export interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
  badge?: string | number
  subItems?: SidebarSubItem[]
}

interface SidebarProps {
  wordmark?: string
  brandTag?: string | null
  items?: SidebarItem[]
  active?: string | null
  onSelect?: (key: string) => void
  activeSub?: string | null
  onSelectSub?: (key: string) => void
  footer?: ReactNode
  style?: CSSProperties
  open?: boolean
  /**
   * "glass" ativa geometria flutuante da V2: margin 12px, radius 26px, sombra própria.
   * Cores continuam do rail vinho escuro (via --sb-* com fallback V1).
   */
  variant?: 'default' | 'glass'
}

export function Sidebar({
  wordmark = 'We Scale', brandTag, items = [],
  active, onSelect, activeSub, onSelectSub, footer, style, open = true, variant = 'default',
}: SidebarProps) {
  const isGlass = variant === 'glass'
  return (
    <nav
      {...(isGlass ? { 'data-nav': 'glass' } : {})}
      style={{
        width: 'var(--sidebar-w)',
        minWidth: 'var(--sidebar-w)',
        background: 'var(--sb-bg, var(--brand-dark))',
        color: 'var(--sb-text, var(--ws-text-on-dark))',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        position: 'fixed',
        top: 0,
        left: 0,
        height: isGlass ? 'calc(100vh - 24px)' : '100vh',
        overflow: 'hidden',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
        ...style,
      }}>
      {/* diagonal signature texture */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 'var(--sb-texture-opacity, 0.10)',
        background: 'repeating-linear-gradient(-52deg, #fff 0 2px, transparent 2px 26px)',
        maskImage: 'linear-gradient(to bottom, #000 0%, transparent 62%)',
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, transparent 62%)',
      }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Wordmark */}
        <div style={{ padding: '4px 8px 22px' }}>
          <div style={{ fontFamily: 'var(--font-brand, var(--font-display))', fontWeight: 'var(--fw-wordmark, 600)', fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1 }}>
            {wordmark}
          </div>
          {brandTag && (
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 7, color: 'var(--sb-text-muted, var(--ws-text-on-dark-muted))' }}>
              {brandTag}
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
          {items.map(item => {
            const isActive = active === item.key
            const expanded = isActive && item.subItems && item.subItems.length > 0
            return (
              <div key={item.key}>
                <button
                  onClick={() => onSelect?.(item.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    textAlign: 'left', cursor: 'pointer', width: '100%',
                    fontFamily: 'var(--font-body)', fontWeight: isActive ? 'var(--fw-strong, 600)' : 400, fontSize: 14,
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: isActive ? 'var(--sb-item-active-bg, rgba(255,255,255,0.14))' : 'transparent',
                    color: isActive ? 'var(--sb-item-active-text, #fff)' : 'var(--sb-text-muted, var(--ws-text-on-dark-muted))',
                    boxShadow: isActive ? 'var(--sb-item-active-shadow, none)' : 'none',
                    transition: 'background .12s ease, color .12s ease, box-shadow .12s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sb-item-hover-bg, rgba(255,255,255,0.07))' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  {item.icon && <span style={{ display: 'inline-flex', width: 18, height: 18, flex: '0 0 auto' }}>{item.icon}</span>}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {isActive && !item.subItems && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sb-active-dot, var(--brand-accent))' }} />}
                  {item.badge != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--sb-badge-bg, rgba(255,255,255,0.16))' }}>{item.badge}</span>
                  )}
                </button>

                {/* Sub-items */}
                {expanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 6px', paddingLeft: 10, marginLeft: 20, borderLeft: '1px solid var(--sb-rule, rgba(255,255,255,0.16))' }}>
                    {item.subItems!.map(sub => {
                      const subActive = activeSub === sub.key
                      return (
                        <button key={sub.key} onClick={() => onSelectSub?.(sub.key)} style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          textAlign: 'left', cursor: 'pointer', width: '100%',
                          fontFamily: 'var(--font-body)', fontWeight: subActive ? 'var(--fw-strong, 600)' : 400, fontSize: 13,
                          padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: 'none',
                          background: subActive ? 'var(--sb-item-active-bg, rgba(255,255,255,0.12))' : 'transparent',
                          color: subActive ? 'var(--sb-item-active-text, #fff)' : 'var(--sb-text-muted, var(--ws-text-on-dark-muted))',
                          transition: 'background .12s ease',
                        }}
                          onMouseEnter={e => { if (!subActive) e.currentTarget.style.background = 'var(--sb-item-hover-bg, rgba(255,255,255,0.06))' }}
                          onMouseLeave={e => { if (!subActive) e.currentTarget.style.background = 'transparent' }}
                        >
                          {sub.dot && <span style={{ width: 7, height: 7, borderRadius: 2, background: sub.dot, flex: '0 0 auto', opacity: subActive ? 1 : 0.7 }} />}
                          <span style={{ flex: 1 }}>{sub.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {footer && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sb-rule, rgba(255,255,255,0.14))' }}>
            {footer}
          </div>
        )}
      </div>
    </nav>
  )
}
