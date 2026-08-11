import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMediaData } from '@/hooks/useMediaData'
import type { MediaDailyRaw } from '@/lib/types'
import { PageTop } from '@/components/ui/PageTop'
import { Badge } from '@/components/ui/Badge'
import { isMediaLegacy, isMediaOdontoLegacy } from '@/lib/oralUnicMapping'
import { currentMonthRange } from '@/lib/dateUtils'
import { nf as fmt, money, pct as pctBase } from '@/lib/format'

const makeMtd = currentMonthRange
const pct = (n: number) => pctBase(n, 2)

// ── classificação de frente por prefixo no nome da campanha ───────────────────
// Reusa a fonte única em src/lib/oralUnicMapping.ts em vez de reimplementar inline
type Frente = 'ODL' | 'OUF' | 'LEGACY'

function frenteOf(campanha: string | null): Frente {
  if (isMediaLegacy(campanha)) return 'LEGACY'
  if (isMediaOdontoLegacy(campanha)) return 'ODL'
  return 'OUF'
}

const FRENTE_META: Record<Frente, { label: string; description: string; color: string }> = {
  ODL:    { label: 'ODL — Odonto Legacy',      description: 'Venda de consultoria / produto Legacy', color: '#4A9EFF' },
  OUF:    { label: 'OUF — Oral Unic Franquia', description: 'Aquisição de franqueados',             color: '#7C5CFF' },
  LEGACY: { label: 'Comunidade',               description: 'Captação de cadastro e diagnóstico',   color: '#22C6A1' },
}
const FRENTE_ORDER: Frente[] = ['OUF', 'ODL', 'LEGACY']

// ── métricas agregadas ────────────────────────────────────────────────────────
interface Metrics {
  spend: number
  impressoes: number
  cliques: number
  leads: number
  ctr: number
  cpm: number
  cpl: number
}

function aggregate(rows: MediaDailyRaw[]): Metrics {
  const spend = rows.reduce((s, r) => s + (r.spend_brl || 0), 0)
  const impressoes = rows.reduce((s, r) => s + (r.impressoes || 0), 0)
  const cliques = rows.reduce((s, r) => s + (r.cliques_link || 0), 0)
  const leads = rows.reduce((s, r) => s + (r.leads || 0), 0)
  return {
    spend,
    impressoes,
    cliques,
    leads,
    ctr: impressoes > 0 ? (cliques / impressoes) * 100 : 0,
    cpm: impressoes > 0 ? (spend / impressoes) * 1000 : 0,
    cpl: leads > 0 ? spend / leads : 0,
  }
}

// ── árvore ────────────────────────────────────────────────────────────────────
interface AdNode { name: string; metrics: Metrics }
interface AdsetNode { name: string; metrics: Metrics; ads: AdNode[] }
interface CampaignNode { name: string; metrics: Metrics; adsets: AdsetNode[] }
interface PausedCampaign { name: string; metrics: Metrics; ultimoDia: string }
interface FrenteNode { frente: Frente; metrics: Metrics; campaigns: CampaignNode[]; pausedCampaigns: PausedCampaign[] }

/** Ativa = teve spend > 0 em algum dos últimos 3 dias do range. */
function isCampanhaAtiva(rows: MediaDailyRaw[], rangeEnd: string): boolean {
  const end = new Date(rangeEnd + 'T00:00')
  const cutoff = new Date(end)
  cutoff.setDate(end.getDate() - 2) // últimos 3 dias inclusivos
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return rows.some(r => r.dia >= cutoffIso && r.dia <= rangeEnd && (r.spend_brl || 0) > 0)
}

function buildTree(rows: MediaDailyRaw[], rangeEnd: string): { total: Metrics; frentes: FrenteNode[] } {
  const byFrente = new Map<Frente, MediaDailyRaw[]>()
  for (const r of rows) {
    const f = frenteOf(r.campanha)
    if (!byFrente.has(f)) byFrente.set(f, [])
    byFrente.get(f)!.push(r)
  }

  const frentes: FrenteNode[] = FRENTE_ORDER.map(frente => {
    const rowsF = byFrente.get(frente) ?? []
    // group by campanha
    const byCamp = new Map<string, MediaDailyRaw[]>()
    for (const r of rowsF) {
      const k = r.campanha ?? '(sem campanha)'
      if (!byCamp.has(k)) byCamp.set(k, [])
      byCamp.get(k)!.push(r)
    }

    const campaigns: CampaignNode[] = []
    const pausedCampaigns: PausedCampaign[] = []

    for (const [campName, rowsC] of byCamp.entries()) {
      const ativa = isCampanhaAtiva(rowsC, rangeEnd)
      if (!ativa) {
        const ultimoDia = rowsC.reduce((m, r) => r.dia > m ? r.dia : m, '0000-00-00')
        pausedCampaigns.push({ name: campName, metrics: aggregate(rowsC), ultimoDia })
        continue
      }
      // ativa: agrupar conjuntos/anúncios
      const byConj = new Map<string, MediaDailyRaw[]>()
      for (const r of rowsC) {
        const k = r.conjunto ?? '(sem conjunto)'
        if (!byConj.has(k)) byConj.set(k, [])
        byConj.get(k)!.push(r)
      }
      const adsets: AdsetNode[] = [...byConj.entries()].map(([conjName, rowsA]) => {
        const byAd = new Map<string, MediaDailyRaw[]>()
        for (const r of rowsA) {
          const k = r.anuncio ?? '(sem anúncio)'
          if (!byAd.has(k)) byAd.set(k, [])
          byAd.get(k)!.push(r)
        }
        const ads: AdNode[] = [...byAd.entries()]
          .map(([adName, rowsAd]) => ({ name: adName, metrics: aggregate(rowsAd) }))
          .sort((a, b) => b.metrics.spend - a.metrics.spend)
        return { name: conjName, metrics: aggregate(rowsA), ads }
      }).sort((a, b) => b.metrics.spend - a.metrics.spend)
      campaigns.push({ name: campName, metrics: aggregate(rowsC), adsets })
    }

    campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend)
    pausedCampaigns.sort((a, b) => b.metrics.spend - a.metrics.spend)

    return { frente, metrics: aggregate(rowsF), campaigns, pausedCampaigns }
  })

  return { total: aggregate(rows), frentes }
}

// ── UI pieces ─────────────────────────────────────────────────────────────────
function MetricRow({ m, compact = false }: { m: Metrics; compact?: boolean }) {
  const size = compact ? 11 : 12
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 10 : 14, fontSize: size, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
      <span><b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{money(m.spend)}</b> gasto</span>
      <span><b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.impressoes)}</b> impr.</span>
      <span><b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.cliques)}</b> cliques</span>
      <span>CTR <b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{pct(m.ctr)}</b></span>
      <span>CPM <b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{money(m.cpm)}</b></span>
      {m.leads > 0 && <span><b style={{ color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.leads)}</b> leads · CPL {money(m.cpl)}</span>}
    </div>
  )
}

function AdCard({ ad }: { ad: AdNode }) {
  return (
    <div style={{ background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 8, padding: '10px 14px', marginTop: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ws-text-primary)', wordBreak: 'break-word' }}>{ad.name}</div>
      <MetricRow m={ad.metrics} compact />
    </div>
  )
}

function AdsetCard({ adset }: { adset: AdsetNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 10, padding: 14, marginTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', color: 'var(--ws-text-primary)' }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: 'break-word' }}>{adset.name}</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{adset.ads.length} anúncio{adset.ads.length === 1 ? '' : 's'}</div>
        </div>
      </button>
      <MetricRow m={adset.metrics} compact />
      {open && adset.ads.map((ad, i) => <AdCard key={i} ad={ad} />)}
    </div>
  )
}

function CampaignCard({ campaign, accent }: { campaign: CampaignNode; accent: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--ws-surface)', border: `1px solid color-mix(in srgb, ${accent} 22%, var(--ws-border))`, borderRadius: 12, padding: 16, marginTop: 12, boxShadow: 'var(--shadow-sm)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', color: 'var(--ws-text-primary)' }}
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, wordBreak: 'break-word' }}>{campaign.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
            {campaign.adsets.length} conjunto{campaign.adsets.length === 1 ? '' : 's'} · {campaign.adsets.reduce((s, a) => s + a.ads.length, 0)} anúncios
          </div>
        </div>
      </button>
      <MetricRow m={campaign.metrics} />
      {open && (
        <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid color-mix(in srgb, ${accent} 30%, var(--ws-border))` }}>
          {campaign.adsets.map((adset, i) => <AdsetCard key={i} adset={adset} />)}
        </div>
      )}
    </div>
  )
}

function PausedBox({ paused, accent }: { paused: PausedCampaign[]; accent: string }) {
  if (paused.length === 0) return null
  const total = paused.reduce((acc, p) => ({
    spend: acc.spend + p.metrics.spend,
    impressoes: acc.impressoes + p.metrics.impressoes,
    cliques: acc.cliques + p.metrics.cliques,
    leads: acc.leads + p.metrics.leads,
    ctr: 0, cpm: 0, cpl: 0,
  }), { spend: 0, impressoes: 0, cliques: 0, leads: 0, ctr: 0, cpm: 0, cpl: 0 })
  total.ctr = total.impressoes > 0 ? (total.cliques / total.impressoes) * 100 : 0
  total.cpm = total.impressoes > 0 ? (total.spend / total.impressoes) * 1000 : 0
  total.cpl = total.leads > 0 ? total.spend / total.leads : 0

  return (
    <div style={{ marginTop: 14, background: 'var(--ws-bg)', border: `1px dashed color-mix(in srgb, ${accent} 30%, var(--ws-border))`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-atencao)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase' }}>
          Pausadas ou desativadas
        </span>
        <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginLeft: 'auto' }}>
          {paused.length} camp. · sem delivery nos últimos 3 dias
        </span>
      </div>
      <MetricRow m={total} compact />
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {paused.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 8, fontSize: 12 }}>
            <span style={{ flex: 1, color: 'var(--ws-text-primary)', wordBreak: 'break-word' }}>{p.name}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-primary)', fontWeight: 500 }}>{money(p.metrics.spend)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ws-text-secondary)', minWidth: 70, textAlign: 'right' }}>últ.: {p.ultimoDia.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FrenteColumn({ node }: { node: FrenteNode }) {
  const meta = FRENTE_META[node.frente]
  return (
    <div>
      <div style={{ background: `color-mix(in srgb, ${meta.color} 10%, var(--ws-surface))`, border: `1.5px solid ${meta.color}`, borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: meta.color }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{meta.description}</div>
          </div>
          <Badge tone="neutral">{node.campaigns.length} ativa{node.campaigns.length === 1 ? '' : 's'}</Badge>
        </div>
        <MetricRow m={node.metrics} />
      </div>
      {node.campaigns.length === 0 && node.pausedCampaigns.length === 0 && (
        <div style={{ marginTop: 14, padding: '20px 14px', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 12.5, background: 'var(--ws-surface)', border: '1px dashed var(--ws-border)', borderRadius: 10 }}>
          Sem campanhas no período
        </div>
      )}
      {node.campaigns.map((c, i) => <CampaignCard key={i} campaign={c} accent={meta.color} />)}
      <PausedBox paused={node.pausedCampaigns} accent={meta.color} />
    </div>
  )
}

// ── página ────────────────────────────────────────────────────────────────────
interface EsteiraOralUnicProps {
  /** Embutida numa página host (ex: Saúde da Marca). Oculta PageTop e padding externo. */
  embedded?: boolean
}

export function EsteiraOralUnic({ embedded = false }: EsteiraOralUnicProps = {}) {
  const [range, setRange] = useState(makeMtd)
  const { data: mediaData, loading } = useMediaData({ marca: 'Oral Unic', dataInicio: range.start, dataFim: range.end })

  const tree = useMemo(() => buildTree(mediaData, range.end), [mediaData, range.end])

  const dateControls = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="date"
        value={range.start}
        onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
        style={{ padding: '7px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: 'var(--font-body)', background: 'var(--ws-surface)', color: 'var(--ws-text-primary)' }}
      />
      <span style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>→</span>
      <input
        type="date"
        value={range.end}
        onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
        style={{ padding: '7px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: 'var(--font-body)', background: 'var(--ws-surface)', color: 'var(--ws-text-primary)' }}
      />
    </div>
  )

  return (
    <div style={{ padding: embedded ? 0 : 'var(--container-pad)' }}>
      {!embedded && (
        <PageTop
          title="Esteira Oral Unic"
          subtitle={`Hierarquia de mídia por frente · ${range.start} → ${range.end}`}
          actions={dateControls}
        />
      )}
      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          {dateControls}
        </div>
      )}

      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
        {/* Nível 1: Marca (topo da pirâmide) */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            background: 'var(--brand-dark)',
            color: '#fff',
            borderRadius: 16,
            padding: '18px 32px',
            minWidth: 340,
            maxWidth: 520,
            textAlign: 'center',
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Oral Unic</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Esteira de produtos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', fontSize: 12.5, marginTop: 10, color: 'rgba(255,255,255,0.85)' }}>
              <span><b style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{money(tree.total.spend)}</b> gasto</span>
              <span><b style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(tree.total.impressoes)}</b> impr.</span>
              <span><b style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(tree.total.cliques)}</b> cliques</span>
              <span>CTR <b style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{pct(tree.total.ctr)}</b></span>
              <span>CPM <b style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{money(tree.total.cpm)}</b></span>
            </div>
          </div>
        </div>

        {/* Conectores visuais (linhas de pirâmide) */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: -12, marginTop: -8 }}>
          <svg width="100%" height="24" viewBox="0 0 600 24" preserveAspectRatio="none" style={{ maxWidth: 800, opacity: 0.4 }}>
            <line x1="300" y1="0" x2="100" y2="24" stroke="var(--ws-text-secondary)" strokeWidth="1" />
            <line x1="300" y1="0" x2="300" y2="24" stroke="var(--ws-text-secondary)" strokeWidth="1" />
            <line x1="300" y1="0" x2="500" y2="24" stroke="var(--ws-text-secondary)" strokeWidth="1" />
          </svg>
        </div>

        {/* Nível 2: Frentes (3 colunas) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {tree.frentes.map(f => <FrenteColumn key={f.frente} node={f} />)}
        </div>

        {tree.total.spend === 0 && !loading && (
          <div style={{ textAlign: 'center', marginTop: 40, padding: '40px 20px', background: 'var(--ws-surface)', border: '1px dashed var(--ws-border)', borderRadius: 12, color: 'var(--ws-text-secondary)' }}>
            Sem dados de mídia no período selecionado.
          </div>
        )}
      </div>
    </div>
  )
}
