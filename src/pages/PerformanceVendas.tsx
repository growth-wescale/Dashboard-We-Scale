import { useEffect, useMemo, useState } from 'react'
import { Download, Filter } from 'lucide-react'
import { usePerformanceEquipe } from '@/hooks/usePerformanceEquipe'
import type { FunilCompatRow } from '@/hooks/usePerformanceEquipe'
import { useMetasPerformance, findMeta, metaTimeSdr, metaTimeCloserFat } from '@/hooks/useMetasPerformance'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { useLeads } from '@/hooks/useLeads'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import { inPeriod } from '@/lib/vendasUtils'
import type { Marca } from '@/lib/types'
import { SCard, KTile } from '@/components/ui/v2'

// ─── Brand config (reusa o padrão do FunilVendas) ──────────────────────────

interface BrandDef { key: string; label: string; marca: Marca | undefined }
const BRANDS: BrandDef[] = [
  { key: 'overview',    label: 'Consolidado · 7 marcas', marca: undefined },
  { key: 'oral-unic',   label: 'Oral Unic',              marca: 'Oral Unic' },
  { key: 'odonto-scale',label: 'Odonto Scale',           marca: 'Odonto Scale' },
  { key: 'inpot',       label: 'Inpot',                  marca: 'Inpot' },
  { key: 'eletrovias',  label: 'Eletrovias',             marca: 'Eletrovias' },
  { key: 'liso-laser',  label: 'Lisô Laser',             marca: 'Lisô Laser' },
  { key: 'b2case',      label: 'B2Case',                 marca: 'B2Case' },
  { key: 'viva',        label: 'Viva',                   marca: 'Viva' },
]

// ─── Colors ──────────────────────────────────────────────────────────────

const SDR_ACCENT    = '#EFA94A' // laranja
const CLOSER_ACCENT = '#2ABCB5' // teal
const GARGALO       = '#E4585B' // vermelho suave

// ─── Formatters ──────────────────────────────────────────────────────────

function nf(n: number) { return Math.round(n).toLocaleString('pt-BR') }
function pct(x: number, digits = 1) { return `${x.toFixed(digits)}%` }
function moneyBig(n: number) {
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M'
  if (n >= 1_000)     return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR')
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function currentMonthRange() {
  const t = new Date()
  return { start: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`, end: isoDate(t) }
}
function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}
function daysInMonth(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function dayOfMonth(iso: string) { return Number(iso.slice(-2)) }
function fmtBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Deal helpers ──────────────────────────────────────────────────────────

function activeRows(rows: FunilCompatRow[]) {
  return rows.filter(r => r.status_atual !== 'Excluído')
}

function computeKpis(rows: FunilCompatRow[], di: string, df: string, mqlCount: number) {
  const R = activeRows(rows)
  // MQL vem do banco Marketing (useLeads + isLeadMql), não de data_mql da Expansão
  const mql   = mqlCount
  const tent  = R.filter(r => inPeriod(r.data_tentando_contato, di, df)).length
  const ce    = R.filter(r => inPeriod(r.data_contato_efetivo, di, df)).length
  const sql   = R.filter(r => inPeriod(r.data_agendamento_reuniao_sql, di, df)).length
  const noShow= R.filter(r => inPeriod(r.data_no_show, di, df)).length
  const diag  = R.filter(r => inPeriod(r.data_reuniao_realizada, di, df)).length
  const sal   = R.filter(r => inPeriod(r.data_sal, di, df)).length
  const cof   = R.filter(r => inPeriod(r.data_oportunidade, di, df)).length
  const ganho = R.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df))
  const fech  = ganho.length
  const rev   = ganho.reduce((s, r) => s + (r.valor_contrato ?? 0), 0)
  return { mql, tent, ce, sql, noShow, diag, sal, cof, fech, rev }
}

// ─── Agregação real por SDR/Closer (via nome_sdr / nome_closer) ────────────

import type { MetaAgregada } from '@/hooks/useMetasPerformance'
import type { MembroRoster } from '@/hooks/useRosterVendas'

interface SdrRow   { nome: string; agend: number; reun: number; contEfet: number; meta: number; pctAting: number; ceToAgend: number }
interface CloserRow{ nome: string; reun: number; sal: number; ganhos: number; faturamento: number; meta: number; pctAting: number; winRate: number }

function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function rosterSetForSdr(roster: MembroRoster[]): Set<string> {
  return new Set(
    roster
      .filter(r => r.cargo === 'SDR' || r.cargo === 'SDR/Closer')
      .map(r => normKey(r.nome)),
  )
}

function rosterSetForCloser(roster: MembroRoster[]): Set<string> {
  return new Set(
    roster
      .filter(r => r.cargo === 'Closer' || r.cargo === 'SDR/Closer')
      .map(r => normKey(r.nome)),
  )
}

function buildSdrRows(
  rows: FunilCompatRow[], di: string, df: string,
  metas: MetaAgregada[], roster: MembroRoster[],
): SdrRow[] {
  const valid = rosterSetForSdr(roster)
  const bucket = new Map<string, { agend: number; reun: number; ce: number }>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_sdr?.trim()
    if (!nome) continue
    if (!valid.has(normKey(nome))) continue

    const cur = bucket.get(nome) ?? { agend: 0, reun: 0, ce: 0 }
    if (inPeriod(r.data_agendamento_reuniao_sql, di, df))             cur.agend++
    if (inPeriod(r.data_reuniao_realizada, di, df))     cur.reun++
    if (inPeriod(r.data_contato_efetivo, di, df)) cur.ce++
    bucket.set(nome, cur)
  }

  return Array.from(bucket.entries()).map(([nome, v]) => {
    const meta = findMeta(metas, nome, 'SDR')?.metaSql ?? 0
    const pctAting = meta > 0 ? (v.agend / meta) * 100 : 0
    const ceToAg   = v.ce > 0 ? (v.agend / v.ce) * 100 : 0
    return { nome, agend: v.agend, reun: v.reun, contEfet: v.ce, meta, pctAting, ceToAgend: ceToAg }
  }).sort((a, b) => b.pctAting - a.pctAting)
}

function buildCloserRows(
  rows: FunilCompatRow[], di: string, df: string,
  metas: MetaAgregada[], roster: MembroRoster[],
): CloserRow[] {
  const valid = rosterSetForCloser(roster)
  const bucket = new Map<string, { reun: number; sal: number; ganhos: number; faturamento: number }>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_closer?.trim()
    if (!nome) continue
    if (!valid.has(normKey(nome))) continue

    const cur = bucket.get(nome) ?? { reun: 0, sal: 0, ganhos: 0, faturamento: 0 }
    if (inPeriod(r.data_reuniao_realizada, di, df)) cur.reun++
    if (inPeriod(r.data_sal, di, df))         cur.sal++
    if (r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)) {
      cur.ganhos++
      cur.faturamento += r.valor_contrato ?? 0
    }
    bucket.set(nome, cur)
  }

  return Array.from(bucket.entries()).map(([nome, v]) => {
    const meta = findMeta(metas, nome, 'Closer')?.metaFinanceira ?? 0
    const pctAting = meta > 0 ? (v.faturamento / meta) * 100 : 0
    const winRate  = v.reun > 0 ? (v.ganhos / v.reun) * 100 : 0
    return { nome, reun: v.reun, sal: v.sal, ganhos: v.ganhos, faturamento: v.faturamento, meta, pctAting, winRate }
  }).sort((a, b) => b.pctAting - a.pctAting)
}

// ─── UI blocks ─────────────────────────────────────────────────────────────

function SectionBadge({ n, accent }: { n: number; accent: string }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10, background: accent, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 700, fontSize: 16, flexShrink: 0,
    }}>{n}</div>
  )
}

function Avatar({ nome, accent }: { nome: string; accent: string }) {
  const parts = nome.split(' ')
  const initial = parts.length > 1 ? parts[0][0] + parts[1][0] : nome.slice(0, 1)
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%',
      border: `1px solid ${accent}55`, color: 'var(--ws-text-primary)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
      background: 'var(--ws-surface)',
    }}>{initial}</div>
  )
}

function RankNum({ i, accent }: { i: number; accent: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 15, color: accent, fontVariantNumeric: 'tabular-nums' }}>
      {i + 1}º
    </span>
  )
}

function ConversionBar({ label, pctVal, gargalo }: { label: string; pctVal: number; gargalo?: boolean }) {
  const color = gargalo ? GARGALO : CLOSER_ACCENT
  const w = Math.min(100, Math.max(0, pctVal))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 60px', gap: 16, alignItems: 'center', padding: '10px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{label}</span>
      <div style={{ height: 6, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct(pctVal)}
      </span>
    </div>
  )
}

function GoalTracker({ label, realized, expected, total, formatter, dayText }: {
  label: string
  realized: number
  expected: number
  total: number
  formatter: (n: number) => string
  dayText: string
}) {
  const pctRealized = total > 0 ? Math.min(100, (realized / total) * 100) : 0
  const pctExpected = total > 0 ? Math.min(100, (expected / total) * 100) : 0
  const deltaPct = expected > 0 ? ((realized - expected) / expected) * 100 : 0
  const noRitmo  = deltaPct >= -2
  const fill = noRitmo ? CLOSER_ACCENT : GARGALO

  return (
    <SCard style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{dayText}</div>
        </div>
        <span style={{
          alignSelf: 'flex-start',
          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
          background: noRitmo ? '#E4F6F5' : '#FCE4E4',
          color: noRitmo ? '#0A7A68' : '#9B2C2C',
        }}>{noRitmo ? 'no ritmo' : 'abaixo do ritmo'}</span>
      </div>
      <div style={{ position: 'relative', height: 22, marginTop: 18, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pctRealized}%`, background: fill, borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: `calc(${pctExpected}% - 1px)`, top: -2, bottom: -2, width: 2, background: 'var(--ws-text-primary)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 14, gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Realizado</div>
          <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatter(realized)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Esperado até hoje</div>
          <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatter(expected)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>Meta total</div>
          <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatter(total)}</div>
        </div>
      </div>
      {expected > 0 && (
        <div style={{
          marginTop: 10, fontSize: 12.5, fontWeight: 500,
          color: noRitmo ? '#0A7A68' : '#9B2C2C',
        }}>
          {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs. esperado até hoje
        </div>
      )}
    </SCard>
  )
}

// ─── Tabelas ───────────────────────────────────────────────────────────────

function SdrTable({ rows }: { rows: SdrRow[] }) {
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: SDR_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        PRÉ-VENDAS · EXECUTIVOS DE EXPANSÃO
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 100px 110px 90px 90px 100px', padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>META SAL</span>
          <span style={{ textAlign: 'right' }}>CONT. EFET.</span>
          <span style={{ textAlign: 'right' }}>AGEND.</span>
          <span style={{ textAlign: 'right' }}>REUN.</span>
          <span style={{ textAlign: 'right' }}>CE→AGEND.</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.nome} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 80px 100px 110px 90px 90px 100px',
            padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <RankNum i={i} accent={SDR_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={SDR_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{pct(r.pctAting)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.meta > 0 ? nf(r.meta) : '—'}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{nf(r.contEfet)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.agend)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.reun)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.ceToAgend)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}

function CloserTable({ rows }: { rows: CloserRow[] }) {
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: CLOSER_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        VENDAS · CLOSERS
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 120px 130px 80px 70px 90px 90px', padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>META FAT.</span>
          <span style={{ textAlign: 'right' }}>FATURAMENTO</span>
          <span style={{ textAlign: 'right' }}>REUN.</span>
          <span style={{ textAlign: 'right' }}>SAL</span>
          <span style={{ textAlign: 'right' }}>GANHOS</span>
          <span style={{ textAlign: 'right' }}>WIN RATE</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.nome} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 80px 120px 130px 80px 70px 90px 90px',
            padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <RankNum i={i} accent={CLOSER_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={CLOSER_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{pct(r.pctAting)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.meta > 0 ? moneyBig(r.meta) : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{moneyBig(r.faturamento)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{nf(r.reun)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{nf(r.sal)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.ganhos)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.winRate)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}

// ─── Página ────────────────────────────────────────────────────────────────

export function PerformanceVendas() {
  const [brandKey, setBrandKey] = useState<string>('overview')
  const [{ start, end }, setRange] = useState(currentMonthRange())
  const [brandOpen, setBrandOpen] = useState(false)

  const brand = BRANDS.find(b => b.key === brandKey) ?? BRANDS[0]
  const mesKey = start.slice(0, 7)
  const { data: rows } = usePerformanceEquipe({ marca: brand.marca, dataInicio: start, dataFim: end })
  const { data: roster } = useRosterVendas()
  const { data: metas }  = useMetasPerformance({ mesKey, marca: brand.marca })
  // MQL vem SEMPRE do banco Marketing (P1 confirmado)
  const { data: rawLeads } = useLeads({ marca: brand.marca, dataInicio: start, dataFim: end })
  const mqlCount = useMemo(() => deduplicateLeads(rawLeads).filter(isLeadMql).length, [rawLeads])

  useEffect(() => {
    const handler = () => setRange({ ...currentMonthRange() })
    window.addEventListener('dashboard:refresh', handler)
    return () => window.removeEventListener('dashboard:refresh', handler)
  }, [])

  const kpis = useMemo(() => computeKpis(rows, start, end, mqlCount), [rows, start, end, mqlCount])

  // Conversões
  const convTopo = useMemo(() => [
    { label: 'MQL → Tentando contato',                   val: kpis.mql  > 0 ? (kpis.tent / kpis.mql)  * 100 : 0 },
    { label: 'Tentando contato → Contato efetivo',       val: kpis.tent > 0 ? (kpis.ce   / kpis.tent) * 100 : 0 },
    { label: 'Contato efetivo → SQL · Reunião agendada', val: kpis.ce   > 0 ? (kpis.sql  / kpis.ce)   * 100 : 0 },
  ], [kpis])

  const convFundo = useMemo(() => [
    { label: 'SQL · Reunião agendada → Diagnóstico', val: kpis.sql  > 0 ? (kpis.diag  / kpis.sql)  * 100 : 0 },
    { label: 'Diagnóstico → SAL',                    val: kpis.diag > 0 ? (kpis.sal   / kpis.diag) * 100 : 0 },
    { label: 'SAL → Oportunidade · COF',             val: kpis.sal  > 0 ? (kpis.cof   / kpis.sal)  * 100 : 0 },
    { label: 'Oportunidade · COF → Fechamento',      val: kpis.cof  > 0 ? (kpis.fech  / kpis.cof)  * 100 : 0 },
  ], [kpis])

  // Metas do time (somadas das metas individuais reais de DB_Metas_Performance)
  const dim   = daysInMonth(mesKey + '-01')
  const dayN  = Math.min(dim, dayOfMonth(end))
  const metaSql   = useMemo(() => metaTimeSdr(metas),        [metas])
  const metaFat   = useMemo(() => metaTimeCloserFat(metas),  [metas])
  const pctPeriod = dayN / dim

  const sdrRows    = useMemo(() => buildSdrRows(rows, start, end, metas, roster),    [rows, start, end, metas, roster])
  const closerRows = useMemo(() => buildCloserRows(rows, start, end, metas, roster), [rows, start, end, metas, roster])

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 34, lineHeight: 1.1, color: 'var(--ws-text-primary)', margin: 0 }}>Performance Detalhada</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
            {brand.label} · {monthLabel(start)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Brand dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setBrandOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 999,
                border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
                color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLOSER_ACCENT }} />
              {brand.label}
              <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)' }}>▾</span>
            </button>
            {brandOpen && (
              <div style={{
                position: 'absolute', top: '110%', left: 0, zIndex: 20,
                background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
                borderRadius: 12, boxShadow: 'var(--shadow-md)', minWidth: 220, padding: 6,
              }}>
                {BRANDS.map(b => (
                  <button key={b.key}
                    onClick={() => { setBrandKey(b.key); setBrandOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none',
                      background: b.key === brandKey ? 'var(--ws-bg-alt, #F4F4F5)' : 'transparent',
                      cursor: 'pointer', borderRadius: 8, fontSize: 13, color: 'var(--ws-text-primary)',
                    }}
                  >{b.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Range */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 999,
            border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
            color: 'var(--ws-text-primary)', fontSize: 13, boxShadow: 'var(--shadow-sm)',
          }}>
            <Filter size={14} style={{ color: 'var(--ws-text-secondary)' }} />
            <span style={{ color: 'var(--ws-text-secondary)' }}>Mês</span>
            <input type="date" value={start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
              style={{ border: 'none', background: 'transparent', color: 'var(--ws-text-primary)', fontSize: 13 }} />
            <span style={{ color: 'var(--ws-text-secondary)' }}>–</span>
            <input type="date" value={end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
              style={{ border: 'none', background: 'transparent', color: 'var(--ws-text-primary)', fontSize: 13 }} />
          </div>

          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 999,
            border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
            color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
          }}>
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* ── Seção 1 · SDR ─────────────────────────────────────────────────── */}
      <SectionHeader n={1} accent={SDR_ACCENT} title="Executivos de Expansão (SDR)"
        sub="Do MQL à reunião agendada — cadência, contato efetivo e agendamento" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '10px 0 22px' }}>
        <KTile label="MQLs no período"              value={nf(kpis.mql)} />
        <KTile label="Contatos efetivos"            value={nf(kpis.ce)} />
        <KTile label="SQLs (reuniões agendadas)"    value={nf(kpis.sql)} />
        <KTile label="No-show"                      value={nf(kpis.noShow)} />
      </div>

      <SdrTable rows={sdrRows} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <GoalTracker
          label="Meta de SQL do período"
          realized={kpis.sql}
          expected={metaSql * pctPeriod}
          total={metaSql}
          formatter={nf}
          dayText={`Ritmo até o dia ${dayN} de ${dim}`}
        />
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Conversões — topo do funil</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ws-text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: GARGALO, marginRight: 4 }} />Gargalo</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CLOSER_ACCENT, marginRight: 4 }} />Melhor</span>
            </div>
          </div>
          {convTopo.map((c, i) => {
            const worst = Math.min(...convTopo.map(x => x.val))
            return <ConversionBar key={i} label={c.label} pctVal={c.val} gargalo={c.val === worst && convTopo.length > 1} />
          })}
        </SCard>
      </div>

      {/* ── Seção 2 · Closer ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <SectionHeader n={2} accent={CLOSER_ACCENT} title="Closer"
          sub="Da reunião realizada ao fechamento — diagnóstico, SAL, oportunidade e receita" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, margin: '10px 0 22px' }}>
        <KTile label="Reuniões realizadas"  value={nf(kpis.diag)} />
        <KTile label="SAL qualificados"     value={nf(kpis.sal)} />
        <KTile label="Oportunidades (COF)"  value={nf(kpis.cof)} />
        <KTile label="Fechamentos"          value={nf(kpis.fech)} />
        <KTile label="Receita gerada"       value={moneyBig(kpis.rev)} />
      </div>

      <CloserTable rows={closerRows} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <GoalTracker
          label="Meta de faturamento do período"
          realized={kpis.rev}
          expected={metaFat * pctPeriod}
          total={metaFat}
          formatter={moneyBig}
          dayText={`Ritmo até o dia ${dayN} de ${dim}`}
        />
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Conversões — fundo do funil</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ws-text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: GARGALO, marginRight: 4 }} />Gargalo</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CLOSER_ACCENT, marginRight: 4 }} />Melhor</span>
            </div>
          </div>
          {convFundo.map((c, i) => {
            const worst = Math.min(...convFundo.map(x => x.val))
            return <ConversionBar key={i} label={c.label} pctVal={c.val} gargalo={c.val === worst && convFundo.length > 1} />
          })}
        </SCard>
      </div>

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        Período: {fmtBR(start)} – {fmtBR(end)} · Fonte: <code>vw_funil_compat</code> + <code>DB_Metas_Performance</code>
      </div>
    </div>
  )
}

function SectionHeader({ n, accent, title, sub }: { n: number; accent: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <SectionBadge n={n} accent={accent} />
      <div>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)', lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  )
}
