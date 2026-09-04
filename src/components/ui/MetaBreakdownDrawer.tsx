/**
 * Popup de desdobramento de uma meta por pessoa — abre ao clicar num
 * MetaRitmoCard com meta cadastrada. Duas variantes:
 *  - 'daily': métricas com leitura diária (SQL, RR, SAL, COF) — barra de
 *    ritmo, "esperado até hoje" e um anel com o resultado de hoje.
 *  - 'monthly': métricas só com meta do mês (Receita, Fechamentos) —
 *    Realizado / Meta do mês / % apenas, sem ritmo nem "hoje".
 */

import { X } from 'lucide-react'
import { SCard } from '@/components/ui/v2'
import { pct } from '@/lib/format'
import type { PersonMetaRow, PersonSimplesRow } from '@/lib/metaBreakdown'

const OK = '#2ABCB5'
const RUIM = '#E4585B'

function fmt1(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function RingHoje({ realizado, meta, accent }: { realizado: number; meta: number; accent: string }) {
  const size = 60, raio = 24, largura = 6
  const circ = 2 * Math.PI * raio
  const fracao = meta > 0 ? Math.min(1, realizado / meta) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={raio} fill="none" stroke="var(--ws-border)" strokeWidth={largura} />
        <circle cx={size / 2} cy={size / 2} r={raio} fill="none" stroke={accent} strokeWidth={largura}
          strokeDasharray={`${circ * fracao} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div>
        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Hoje</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmt1(realizado)} / {fmt1(meta)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{meta > 0 ? `${Math.round(fracao * 100)}%` : '—'}</div>
      </div>
    </div>
  )
}

function LinhaDiaria({ row, accent, formatter }: { row: PersonMetaRow; accent: string; formatter: (n: number) => string }) {
  const { ritmo } = row
  return (
    <SCard style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
          background: ritmo.noRitmo ? '#E4F6F5' : '#FCE4E4', color: ritmo.noRitmo ? '#0A7A68' : '#9B2C2C',
        }}>{ritmo.noRitmo ? 'no ritmo' : 'abaixo do ritmo'}</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ws-text-primary)' }}>{row.nome}</span>
      </div>

      <div style={{ position: 'relative', height: 14, marginTop: 12, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${ritmo.pctRealizado}%`, background: ritmo.noRitmo ? OK : RUIM, borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: `calc(${ritmo.pctEsperado}% - 1px)`, top: -2, bottom: -2, width: 2, background: 'var(--ws-text-primary)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 12, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>Realizado<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(row.realizado)}</b></span>
        <span style={{ textAlign: 'center' }}>Esperado até hoje<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(ritmo.esperado)}</b></span>
        <span style={{ textAlign: 'right' }}>Meta total<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(row.metaMensal)}</b></span>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 500 }}>
        <div style={{ color: ritmo.noRitmo ? '#0A7A68' : '#9B2C2C' }}>
          {pct(ritmo.pctDoEsperado)} do esperado até hoje
        </div>
        <div style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginTop: 2 }}>
          {pct(ritmo.pctRealizado)} da meta total
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ws-border)' }}>
        <RingHoje realizado={row.hoje.realizado} meta={row.hoje.meta} accent={accent} />
      </div>
    </SCard>
  )
}

function LinhaSimples({ row, accent, formatter }: { row: PersonSimplesRow; accent: string; formatter: (n: number) => string }) {
  return (
    <SCard style={{ padding: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 10 }}>{row.nome}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>Realizado<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(row.realizado)}</b></span>
        <span style={{ textAlign: 'center' }}>Meta do mês<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(row.metaMensal)}</b></span>
        <span style={{ textAlign: 'right' }}>%<br /><b style={{ color: accent, fontSize: 15 }}>{row.pct.toFixed(1)}%</b></span>
      </div>
    </SCard>
  )
}

type MetaBreakdownDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  accent: string
  formatter: (n: number) => string
} & (
  | { variant: 'daily'; rows: PersonMetaRow[] }
  | { variant: 'monthly'; rows: PersonSimplesRow[] }
)

export function MetaBreakdownDrawer(props: MetaBreakdownDrawerProps) {
  const { open, onClose, title, subtitle, accent, formatter } = props
  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18 }}>{title}</h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {props.rows.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
              Ninguém com meta cadastrada nesse recorte.
            </div>
          )}
          {props.variant === 'daily'
            ? props.rows.map(r => <LinhaDiaria key={r.nome} row={r} accent={accent} formatter={formatter} />)
            : props.rows.map(r => <LinhaSimples key={r.nome} row={r} accent={accent} formatter={formatter} />)}
        </div>
      </div>
    </>
  )
}
