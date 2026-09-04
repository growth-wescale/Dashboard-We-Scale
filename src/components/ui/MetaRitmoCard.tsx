import { SCard } from '@/components/ui/v2'
import { computeRitmo } from '@/lib/metaRitmo'

const OK = '#2ABCB5'
const RUIM = '#E4585B'

export interface MetaRitmoCardProps {
  label: string
  realizado: number
  metaMensal: number
  mesKey: string
  fimJanela: string
  formatter: (n: number) => string
  accent: string
}

export function MetaRitmoCard({ label, realizado, metaMensal, mesKey, fimJanela, formatter, accent }: MetaRitmoCardProps) {
  if (metaMensal <= 0) {
    return (
      <SCard style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 26, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatter(realizado)}
        </div>
      </SCard>
    )
  }

  const r = computeRitmo({ realizado, metaMensal, mesKey, fimJanela })
  const fill = r.noRitmo ? OK : RUIM

  return (
    <SCard style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</div>
        <span style={{
          alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
          background: r.noRitmo ? '#E4F6F5' : '#FCE4E4', color: r.noRitmo ? '#0A7A68' : '#9B2C2C',
        }}>{r.noRitmo ? 'no ritmo' : 'abaixo do ritmo'}</span>
      </div>

      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 26, color: 'var(--ws-text-primary)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {formatter(realizado)}
      </div>

      <div style={{ position: 'relative', height: 16, marginTop: 12, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${r.pctRealizado}%`, background: fill, borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: `calc(${r.pctEsperado}% - 1px)`, top: -2, bottom: -2, width: 2, background: 'var(--ws-text-primary)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>Meta do dia <b style={{ color: 'var(--ws-text-primary)' }}>{formatter(r.metaDia)}</b></span>
        <span>Meta do mês <b style={{ color: 'var(--ws-text-primary)' }}>{formatter(metaMensal)}</b></span>
      </div>

      {r.esperado > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 500, color: r.noRitmo ? '#0A7A68' : '#9B2C2C' }}>
          {r.deltaPct >= 0 ? '+' : ''}{r.deltaPct.toFixed(1)}% vs. esperado até hoje
        </div>
      )}

      <div aria-hidden style={{ height: 2, marginTop: 10, background: `color-mix(in srgb, ${accent} 25%, transparent)`, borderRadius: 2 }} />
    </SCard>
  )
}
