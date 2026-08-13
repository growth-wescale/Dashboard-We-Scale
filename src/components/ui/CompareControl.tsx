import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GitCompare, X, ChevronDown } from 'lucide-react'
import type { DateRange } from '@/lib/periodCompare'
import { previousMonthSameRange, formatCompareLabel } from '@/lib/periodCompare'
import { todayLocal } from '@/lib/dateUtils'

interface CompareControlProps {
  baseRange: DateRange
  enabled: boolean
  compareRange: DateRange | null
  onChange: (state: { enabled: boolean; compareRange: DateRange | null }) => void
}

export function CompareControl({ baseRange, enabled, compareRange, onChange }: CompareControlProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const effective = compareRange ?? previousMonthSameRange(baseRange)

  function activate() {
    onChange({ enabled: true, compareRange: compareRange ?? previousMonthSameRange(baseRange) })
    setOpen(true)
  }

  function deactivate(e: React.MouseEvent) {
    e.stopPropagation()
    onChange({ enabled: false, compareRange: null })
    setOpen(false)
  }

  function setRange(next: DateRange) {
    onChange({ enabled: true, compareRange: next })
  }

  const inputSt: CSSProperties = {
    border: 'none', background: 'transparent',
    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
    color: 'var(--ws-text-primary)', cursor: 'pointer', width: 120,
  }

  if (!enabled) {
    return (
      <button
        onClick={activate}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)',
          borderRadius: 8, padding: '0 12px', height: 36, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
          color: 'var(--ws-text-primary)', whiteSpace: 'nowrap',
        }}
      >
        <GitCompare size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
        Comparar
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'color-mix(in srgb, var(--brand-accent) 12%, var(--ws-surface))',
          border: '1px solid var(--brand-accent)',
          borderRadius: 8, padding: '0 10px 0 12px', height: 36, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
          color: 'var(--ws-text-primary)', whiteSpace: 'nowrap',
        }}
      >
        <GitCompare size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
        vs. {formatCompareLabel(effective)}
        <ChevronDown size={13} style={{ color: 'var(--ws-text-secondary)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        <span
          onClick={deactivate}
          role="button"
          title="Desativar comparativo"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 4, marginLeft: 4,
            color: 'var(--ws-text-secondary)', cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.background = 'color-mix(in srgb, var(--brand-accent) 18%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.background = 'transparent' }}
        >
          <X size={12} />
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
          borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,.3)',
          minWidth: 240, padding: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Comparar com
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <input
              type="date"
              value={effective.start}
              max={effective.end}
              onChange={e => setRange({ ...effective, start: e.target.value })}
              style={inputSt}
            />
            <span style={{ color: 'var(--ws-text-secondary)', fontSize: 12 }}>–</span>
            <input
              type="date"
              value={effective.end}
              min={effective.start}
              max={todayLocal()}
              onChange={e => setRange({ ...effective, end: e.target.value })}
              style={inputSt}
            />
          </div>
          <button
            onClick={() => setRange(previousMonthSameRange(baseRange))}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              border: '1px solid var(--ws-border)', background: 'transparent',
              borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
              padding: '6px 10px', color: 'var(--ws-text-secondary)',
            }}
          >
            ↺ Mesmo período do mês anterior
          </button>
        </div>
      )}
    </div>
  )
}
