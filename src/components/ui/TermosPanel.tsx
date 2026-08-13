import { useMemo } from 'react'
import { TrendingDown } from 'lucide-react'
import { useSearchTerms, type KeywordRow, type SearchTermRow } from '@/hooks/useSearchTerms'
import { money, nf, pct } from '@/lib/format'

interface Props {
  /** Nome da marca no banco (ex.: 'Oral Unic'). Omitir = todas. */
  marca?: string
  dataInicio?: string
  dataFim?: string
  /** Rótulo do período mostrado no topo dos blocos (ex.: "Últimos 30 dias" ou "Ago 2026"). */
  periodoLabel?: string
  /** Mostra o total de rows por bloco na versão compacta (top 10 em vez de top 20). */
  compact?: boolean
  /** Se true, esconde o cabeçalho geral (usado quando o container já mostra título/filtros). */
  hideHeader?: boolean
}

interface SearchTermAgg {
  key: string
  marca: string
  search_term: string
  impressoes: number
  cliques: number
  spend_brl: number
  conversions: number
}

interface KeywordAgg {
  key: string
  marca: string
  keyword_text: string
  match_type: string
  status: string | null
  impressoes: number
  cliques: number
  spend_brl: number
  conversions: number
}

function aggregateSearchTerms(rows: SearchTermRow[]): SearchTermAgg[] {
  const map = new Map<string, SearchTermAgg>()
  for (const r of rows) {
    const key = `${r.marca}::${r.search_term}`
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        key, marca: r.marca, search_term: r.search_term,
        impressoes: r.impressoes, cliques: r.cliques,
        spend_brl: Number(r.spend_brl), conversions: Number(r.conversions),
      })
    } else {
      cur.impressoes += r.impressoes
      cur.cliques += r.cliques
      cur.spend_brl += Number(r.spend_brl)
      cur.conversions += Number(r.conversions)
    }
  }
  return Array.from(map.values())
}

function aggregateKeywords(rows: KeywordRow[]): KeywordAgg[] {
  const map = new Map<string, KeywordAgg>()
  for (const r of rows) {
    const key = `${r.marca}::${r.keyword_text}::${r.match_type}`
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        key, marca: r.marca, keyword_text: r.keyword_text, match_type: r.match_type, status: r.status,
        impressoes: r.impressoes, cliques: r.cliques,
        spend_brl: Number(r.spend_brl), conversions: Number(r.conversions),
      })
    } else {
      cur.impressoes += r.impressoes
      cur.cliques += r.cliques
      cur.spend_brl += Number(r.spend_brl)
      cur.conversions += Number(r.conversions)
    }
  }
  return Array.from(map.values())
}

export function TermosPanel({ marca, dataInicio, dataFim, periodoLabel, compact, hideHeader }: Props) {
  const { keywords, searchTerms, loading, error } = useSearchTerms({
    marca,
    dataInicio,
    dataFim,
  })

  const stAgg = useMemo(() => aggregateSearchTerms(searchTerms), [searchTerms])
  const kwAgg = useMemo(() => aggregateKeywords(keywords), [keywords])

  const kpis = useMemo(() => {
    const totalSpend = stAgg.reduce((s, r) => s + r.spend_brl, 0)
    const totalCliques = stAgg.reduce((s, r) => s + r.cliques, 0)
    const totalConv = stAgg.reduce((s, r) => s + r.conversions, 0)
    const desperdicio = stAgg.filter(r => r.spend_brl > 50 && r.conversions === 0)
    const gastoDesperdicio = desperdicio.reduce((s, r) => s + r.spend_brl, 0)
    return { totalSpend, totalCliques, totalConv, qtdDesperdicio: desperdicio.length, gastoDesperdicio }
  }, [stAgg])

  const N = compact ? 10 : 20
  const topSt = useMemo(() => [...stAgg].sort((a, b) => b.spend_brl - a.spend_brl).slice(0, N), [stAgg, N])
  const topKw = useMemo(() => [...kwAgg].sort((a, b) => b.spend_brl - a.spend_brl).slice(0, N), [kwAgg, N])
  const topDesperdicio = useMemo(
    () => stAgg.filter(r => r.spend_brl > 50 && r.conversions === 0)
      .sort((a, b) => b.spend_brl - a.spend_brl)
      .slice(0, compact ? 8 : 15),
    [stAgg, compact],
  )

  const showMarca = !marca

  return (
    <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
      {!hideHeader && periodoLabel && (
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 12 }}>
          Google Ads · {periodoLabel}
        </div>
      )}

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: '#fee', color: '#900', marginBottom: 16, fontSize: 13 }}>
          Erro ao carregar: {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Gasto no período" value={money(kpis.totalSpend)} />
        <KpiCard label="Cliques" value={nf(kpis.totalCliques)} />
        <KpiCard label="Conversões" value={nf(kpis.totalConv)} />
        <KpiCard label="Termos c/ desperdício" value={`${nf(kpis.qtdDesperdicio)} termos`} sub={money(kpis.gastoDesperdicio)} warning />
      </div>

      {topDesperdicio.length > 0 && (
        <Block
          title="Termos desperdiçando dinheiro"
          subtitle={`Gasto > R$ 50 sem conversão · ${topDesperdicio.length} termos`}
          icon={<TrendingDown size={16} style={{ color: 'var(--status-critico, #dc2626)' }} />}
        >
          <SearchTermTable rows={topDesperdicio} showMarca={showMarca} />
        </Block>
      )}

      <Block title={`Top ${N} search terms por gasto`} subtitle="O que os usuários digitaram">
        <SearchTermTable rows={topSt} showMarca={showMarca} />
      </Block>

      <Block title={`Top ${N} keywords por gasto`} subtitle="O que você comprou como anunciante">
        <KeywordTable rows={topKw} showMarca={showMarca} />
      </Block>

      {!loading && stAgg.length === 0 && kwAgg.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Nenhum termo encontrado no período selecionado.
        </div>
      )}
    </div>
  )
}

// ── UI helpers ─────────────────────────────────────────────────────────────

interface KpiCardProps { label: string; value: string; sub?: string; warning?: boolean }
function KpiCard({ label, value, sub, warning }: KpiCardProps) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: 'var(--ws-surface)',
      border: `1px solid ${warning ? 'var(--status-critico, #dc2626)' : 'var(--ws-border)'}`,
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ws-text-secondary)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: warning ? 'var(--status-critico, #dc2626)' : 'var(--ws-text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

interface BlockProps { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }
function Block({ title, subtitle, icon, children }: BlockProps) {
  return (
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}{title}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function SearchTermTable({ rows, showMarca }: { rows: SearchTermAgg[]; showMarca: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thLeft}>Termo pesquisado</th>
            {showMarca && <th style={thLeft}>Marca</th>}
            <th style={thRight}>Impressões</th>
            <th style={thRight}>Cliques</th>
            <th style={thRight}>CTR</th>
            <th style={thRight}>Gasto</th>
            <th style={thRight}>Conv</th>
            <th style={thRight}>CPA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ctr = r.impressoes ? (r.cliques / r.impressoes) * 100 : 0
            const cpa = r.conversions ? r.spend_brl / r.conversions : null
            return (
              <tr key={r.key}>
                <td style={tdLeft} title={r.search_term}>{r.search_term}</td>
                {showMarca && <td style={tdLeft}>{r.marca}</td>}
                <td style={tdRight}>{nf(r.impressoes)}</td>
                <td style={tdRight}>{nf(r.cliques)}</td>
                <td style={tdRight}>{pct(ctr)}</td>
                <td style={tdRight}>{money(r.spend_brl)}</td>
                <td style={{ ...tdRight, color: r.conversions === 0 ? 'var(--status-critico, #dc2626)' : undefined }}>{nf(r.conversions)}</td>
                <td style={tdRight}>{cpa ? money(cpa) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KeywordTable({ rows, showMarca }: { rows: KeywordAgg[]; showMarca: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thLeft}>Keyword</th>
            <th style={thLeft}>Match</th>
            {showMarca && <th style={thLeft}>Marca</th>}
            <th style={thRight}>Impressões</th>
            <th style={thRight}>Cliques</th>
            <th style={thRight}>CTR</th>
            <th style={thRight}>Gasto</th>
            <th style={thRight}>Conv</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ctr = r.impressoes ? (r.cliques / r.impressoes) * 100 : 0
            return (
              <tr key={r.key}>
                <td style={tdLeft} title={r.keyword_text}>{r.keyword_text}</td>
                <td style={tdLeft}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--ws-bg)', color: 'var(--ws-text-secondary)' }}>
                    {r.match_type}
                  </span>
                </td>
                {showMarca && <td style={tdLeft}>{r.marca}</td>}
                <td style={tdRight}>{nf(r.impressoes)}</td>
                <td style={tdRight}>{nf(r.cliques)}</td>
                <td style={tdRight}>{pct(ctr)}</td>
                <td style={tdRight}>{money(r.spend_brl)}</td>
                <td style={tdRight}>{nf(r.conversions)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }
const thLeft: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 500, fontSize: 12, color: 'var(--ws-text-secondary)', borderBottom: '1px solid var(--ws-border)', background: 'var(--ws-bg)' }
const thRight: React.CSSProperties = { ...thLeft, textAlign: 'right' }
const tdLeft: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--ws-border)', color: 'var(--ws-text-primary)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tdRight: React.CSSProperties = { ...tdLeft, textAlign: 'right', maxWidth: 'none' }
