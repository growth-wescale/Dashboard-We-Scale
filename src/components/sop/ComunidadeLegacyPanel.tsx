import type { ComunidadeLegacy } from '@/constants/comunidadeLegacy'

const GOLD = '#CC993E'
const GOLD_SOFT = '#efbe5b'
const PURPLE = '#7f0c72'

interface Props {
  data: ComunidadeLegacy
  accent: string
}

export function ComunidadeLegacyPanel({ data, accent }: Props) {
  const c = data
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minHeight: 0,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: '-0.01em' }}>
        Comunidade · Qualidade dos membros
      </div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        background: `linear-gradient(135deg, ${GOLD_SOFT}22, ${PURPLE}14)`,
        border: `1px solid ${GOLD}55`,
      }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: PURPLE, lineHeight: 1 }}>{c.total}</span>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.35 }}>
          membros ativos na comunidade · até {c.ate}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {c.origens.map(o => (
          <div key={o.label} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr auto',
            gap: 10, alignItems: 'center', fontSize: 11.5,
          }}>
            <span style={{ color: 'var(--ws-text-primary)', fontWeight: 500 }}>{o.label}</span>
            <div style={{
              height: 7, background: `${PURPLE}12`, borderRadius: 999, overflow: 'hidden',
            }}>
              <span style={{
                display: 'block', height: '100%',
                width: `${o.pct}%`,
                background: `linear-gradient(90deg, ${PURPLE}, ${GOLD})`,
                borderRadius: 999,
              }} />
            </div>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700,
              color: 'var(--ws-text-primary)', textAlign: 'right', whiteSpace: 'nowrap',
            }}>{o.n} · {o.pct}%</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: PURPLE, marginTop: 4 }}>
        Qualidade · dentista × clínica
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {c.quadrantes.map((q, i) => {
          const cellBg = q.tier === 'ok'
            ? `linear-gradient(135deg, ${GOLD_SOFT}30, transparent)`
            : q.tier === 'mid'
              ? `${PURPLE}08`
              : '#f8fafc'
          const border = q.tier === 'ok' ? `1px solid ${GOLD}66` : '1px solid #e2e8f0'
          const numColor = q.tier === 'ok' ? GOLD : PURPLE
          const [prefix, ...rest] = q.label.split(' ')
          const middleWord = rest[0] // "com" ou "sem"
          const suffix = rest.slice(1).join(' ')
          return (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 8,
              background: cellBg, border,
              opacity: q.tier === 'low' ? 0.85 : 1,
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: numColor, lineHeight: 1 }}>{q.pct}%</div>
              <div style={{ fontSize: 11.5, color: 'var(--ws-text-primary)', marginTop: 4, lineHeight: 1.3 }}>
                {prefix} <b style={{ color: PURPLE }}>{middleWord}</b> {suffix}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ws-text-secondary)', marginTop: 3, lineHeight: 1.35 }}>{q.aprox}</div>
            </div>
          )
        })}
      </div>

      <div style={{
        fontSize: 10.5, color: 'var(--ws-text-secondary)', lineHeight: 1.5,
        padding: '7px 10px', background: 'var(--ws-bg)',
        borderRadius: 6, borderLeft: '3px solid #cbd5e1',
      }}>
        Perfil observado em {c.sampleN} cadastros únicos do sample ({Math.round(c.sampleN / c.total * 100)}% do total). % aplicáveis ao total.
      </div>

      {c.duplicados && (
        <div style={{
          fontSize: 10.5, color: 'var(--ws-text-primary)', lineHeight: 1.5,
          padding: '7px 10px', background: 'rgba(180,83,9,0.08)',
          borderRadius: 6, borderLeft: '3px solid #B45309',
        }}>
          <b style={{ color: '#B45309' }}>Fricção · {c.duplicados.leads} leads se cadastraram &gt;1x</b> — {c.duplicados.pico}. Sinaliza incerteza sobre estado do cadastro no fluxo pós-lead.
        </div>
      )}
    </div>
  )
}
