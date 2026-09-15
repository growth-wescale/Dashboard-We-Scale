/**
 * Popup dos cards da aba Performance (SQL, Diagnóstico, SAL, COF, Fechamentos,
 * Receita…). Abre em QUALQUER período e tem um toggle no topo:
 *
 *  - **Por pessoa** — meta × realizado por SDR/Closer. Três variantes:
 *    - 'daily': 1 mês selecionado, métricas com leitura diária (SQL, RR, SAL,
 *      COF) — barra de ritmo, "esperado até hoje" e anel com o resultado de hoje.
 *    - 'monthly': 1 mês selecionado, métricas só com meta do mês (Receita,
 *      Fechamentos) — Realizado / Meta do mês / %.
 *    - 'periodo': qualquer outro recorte (Dia, trimestre, vários meses) —
 *      realizado por pessoa, com meta proporcional quando dá pra calcular.
 *  - **Deals** — a lista de negócios por trás do número do card
 *    (`StageDealsPanel`, a mesma tabela do clique no funil).
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { SCard } from '@/components/ui/v2'
import { pct, nfCeil } from '@/lib/format'
import type { StageDeal, StageKey } from '@/lib/metrics'
import type { PersonMetaRow, PersonSimplesRow, PersonPeriodoRow } from '@/lib/metaBreakdown'
import { StageDealsPanel } from './StageDealsDrawer'
import { useStageDealsFilters } from './useStageDealsFilters'

const OK = '#2ABCB5'
const RUIM = '#E4585B'

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
          {nfCeil(realizado)} / {nfCeil(meta)}
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

function LinhaPeriodo({ row, accent, formatter }: { row: PersonPeriodoRow; accent: string; formatter: (n: number) => string }) {
  const temMeta = row.pct != null
  const bateu = temMeta && row.pct! >= 100
  return (
    <SCard style={{ padding: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 10 }}>{row.nome}</div>
      {temMeta && (
        <div style={{ position: 'relative', height: 10, marginBottom: 12, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, row.pct!)}%`, background: bateu ? OK : RUIM, borderRadius: 999 }} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>Realizado<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{formatter(row.realizado)}</b></span>
        <span style={{ textAlign: 'center' }}>Meta do período<br /><b style={{ color: 'var(--ws-text-primary)', fontSize: 15 }}>{temMeta ? formatter(row.meta) : '—'}</b></span>
        <span style={{ textAlign: 'right' }}>%<br /><b style={{ color: temMeta ? accent : 'var(--ws-text-secondary)', fontSize: 15 }}>{temMeta ? `${row.pct!.toFixed(1)}%` : '—'}</b></span>
      </div>
    </SCard>
  )
}

export type PessoasBreakdown =
  | { variant: 'daily'; rows: PersonMetaRow[] }
  | { variant: 'monthly'; rows: PersonSimplesRow[] }
  | { variant: 'periodo'; rows: PersonPeriodoRow[] }

type Visao = 'pessoas' | 'deals'

interface MetaBreakdownDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  accent: string
  formatter: (n: number) => string
  /** 'SDR' ou 'Closer' — rótulo do toggle e do gráfico de responsável. */
  papel: 'SDR' | 'Closer'
  pessoas: PessoasBreakdown
  /** Rodapé explicando de onde vem (ou por que não há) a meta. */
  nota?: string
  deals: StageDeal[]
  stage: StageKey
}

export function MetaBreakdownDrawer({
  open, onClose, title, subtitle, accent, formatter, papel, pessoas, nota, deals, stage,
}: MetaBreakdownDrawerProps) {
  const [visao, setVisao] = useState<Visao>('pessoas')
  const f = useStageDealsFilters(deals)

  if (!open) return null

  const vazio = pessoas.variant === 'periodo'
    ? `Nenhum ${papel} com atividade nesse recorte.`
    : 'Ninguém com meta cadastrada nesse recorte.'

  const tabs: { key: Visao; label: string }[] = [
    { key: 'pessoas', label: `Por ${papel}` },
    { key: 'deals', label: `Deals (${deals.length})` },
  ]

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div className="rs-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        // A tabela de deals precisa de largura; o desdobramento por pessoa não.
        width: visao === 'deals' ? 'min(980px, 96vw)' : 'min(520px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'width .2s',
      }}>
        <div className="rs-drawer-head" style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18 }}>{title}</h2>
              <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
                {visao === 'deals' && `${f.filtered.length} de ${deals.length} deal${deals.length !== 1 ? 's' : ''} · `}{subtitle}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}>
              <X size={20} />
            </button>
          </div>

          <div role="tablist" style={{
            display: 'inline-flex', alignSelf: 'flex-start', padding: 3, gap: 2,
            border: '1px solid var(--ws-border)', borderRadius: 10, background: 'var(--ws-bg)',
          }}>
            {tabs.map(t => {
              const ativo = t.key === visao
              return (
                <button key={t.key} role="tab" aria-selected={ativo} onClick={() => setVisao(t.key)} style={{
                  border: 'none', borderRadius: 8, cursor: 'pointer', padding: '6px 14px',
                  fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                  background: ativo ? 'var(--ws-surface)' : 'transparent',
                  color: ativo ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)',
                  boxShadow: ativo ? 'var(--shadow-sm)' : 'none',
                }}>{t.label}</button>
              )
            })}
          </div>
        </div>

        {visao === 'deals' ? (
          <StageDealsPanel deals={deals} stage={stage} accent={accent} f={f}
            ownerRole={papel === 'Closer' ? 'closer' : 'sdr'} />
        ) : (
          <div style={{ overflow: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pessoas.rows.length === 0 && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
                {vazio}
              </div>
            )}
            {pessoas.variant === 'daily' && pessoas.rows.map(r => <LinhaDiaria key={r.nome} row={r} accent={accent} formatter={formatter} />)}
            {pessoas.variant === 'monthly' && pessoas.rows.map(r => <LinhaSimples key={r.nome} row={r} accent={accent} formatter={formatter} />)}
            {pessoas.variant === 'periodo' && pessoas.rows.map(r => <LinhaPeriodo key={r.nome} row={r} accent={accent} formatter={formatter} />)}
            {nota && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ws-text-secondary)', lineHeight: 1.45 }}>{nota}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
