import { toLocalDate, fmtBR } from '@/lib/dateUtils'
import { nf } from '@/lib/format'

export function fmtData(value: string | null): string {
  const iso = toLocalDate(value)
  return iso ? fmtBR(iso) : '—'
}

export function cell(value: string | null | undefined): string {
  return value?.trim() ? value : '—'
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  'Ganho':          { bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
  'Perdido':        { bg: 'var(--status-risco-bg)',     fg: 'var(--status-risco)' },
  'Em andamento':   { bg: 'var(--ws-bg)',               fg: 'var(--ws-text-secondary)' },
}

export function StatusBadge({ status }: { status: string | null }) {
  const tone = STATUS_TONE[status ?? ''] ?? STATUS_TONE['Em andamento']
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: tone.bg, color: tone.fg, whiteSpace: 'nowrap',
    }}>
      {cell(status)}
    </span>
  )
}

// ─── Mini bar list (Por Marca / Por Responsável / Por Etapa) ───────────────

export interface BarRow { label: string; count: number; color: string }

export function BarList({ title, rows }: { title: string; rows: BarRow[] }) {
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)' }}>Sem dados</div>
        )}
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3, gap: 8 }}>
              <span style={{ color: 'var(--ws-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>
                {r.label}
              </span>
              <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{nf(r.count)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--ws-border)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', background: r.color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Top N por contagem + resto agrupado em "Outros". */
export function topBreakdown<T>(items: T[], pick: (item: T) => string | null, colorOf: (label: string) => string, topN = 6): BarRow[] {
  const cont = new Map<string, number>()
  for (const item of items) {
    const label = pick(item)?.trim() || 'Sem informação'
    cont.set(label, (cont.get(label) ?? 0) + 1)
  }
  const sorted = [...cont.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, topN)
  const restoCount = sorted.slice(topN).reduce((s, [, n]) => s + n, 0)
  const rows: BarRow[] = top.map(([label, count]) => ({ label, count, color: colorOf(label) }))
  if (restoCount > 0) rows.push({ label: 'Outros', count: restoCount, color: 'var(--ws-border-strong)' })
  return rows
}
