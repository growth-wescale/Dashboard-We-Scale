import { useMemo } from 'react'
import { Users, Heart, MessageCircle, Share2, Eye, ExternalLink, Play } from 'lucide-react'
import { useFacebookPages, type FbPageDailyRow, type FbPostRow } from '@/hooks/useFacebookPages'
import { nf, nfK } from '@/lib/format'

interface Props {
  /** Nome da marca no banco (ex.: 'Oral Unic', 'Frederico Nicolau'). */
  marca: string
  dataInicio?: string
  dataFim?: string
}

export function SocialPanel({ marca, dataInicio, dataFim }: Props) {
  const { daily, posts, loading, error } = useFacebookPages({ marca, dataInicio, dataFim })

  const kpis = useMemo(() => computeKpis(daily), [daily])
  const trend = useMemo(() => computeFollowersTrend(daily), [daily])
  const engagementTop = useMemo(
    () => [...posts]
      .sort((a, b) => (b.reactions_count + b.comments_count + b.shares_count) - (a.reactions_count + a.comments_count + a.shares_count))
      .slice(0, 8),
    [posts],
  )
  const postsRecent = useMemo(
    () => [...posts].sort((a, b) => b.created_time.localeCompare(a.created_time)).slice(0, 20),
    [posts],
  )

  if (!loading && daily.length === 0 && posts.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 14, color: 'var(--ws-text-primary)', marginBottom: 6 }}>Sem dados de Facebook no período</div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          {error
            ? `Erro: ${error}`
            : 'Verifique se a página FB da marca está vinculada ao Business Manager (task #16 se aplicável).'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard icon={<Users size={16} />} label="Seguidores atuais" value={kpis.followersAtual != null ? nf(kpis.followersAtual) : '—'}
                 sub={kpis.novosSeguidoresPeriodo != null ? `+${nf(kpis.novosSeguidoresPeriodo)} no período` : undefined} />
        <KpiCard icon={<Heart size={16} />} label="Engajamento (posts)" value={nf(kpis.engagementPeriodo)} sub={`${nf(posts.length)} posts no período`} />
        <KpiCard icon={<Eye size={16} />} label="Visualizações de página" value={nf(kpis.viewsPeriodo)} />
        <KpiCard icon={<Eye size={16} />} label="Views de vídeo" value={nfK(kpis.videoViewsPeriodo)} sub={kpis.videoTimeHoras > 0 ? `${kpis.videoTimeHoras.toFixed(0)}h assistidas` : undefined} />
      </div>

      {/* Trend seguidores */}
      {trend.length > 2 && (
        <Block title="Evolução de seguidores">
          <FollowersLineChart points={trend} />
        </Block>
      )}

      {/* Top posts por engajamento */}
      {engagementTop.length > 0 && (
        <Block title="Top posts do período" subtitle="Ordenado por engajamento total (reactions + comments + shares)">
          <PostsTable rows={engagementTop} />
        </Block>
      )}

      {/* Posts mais recentes */}
      {postsRecent.length > 0 && (
        <Block title="Posts recentes" subtitle={`${postsRecent.length} posts mais recentes no período`}>
          <PostsTable rows={postsRecent} />
        </Block>
      )}
    </div>
  )
}

// ── Computes ───────────────────────────────────────────────────────────────

interface Kpis {
  followersAtual: number | null
  novosSeguidoresPeriodo: number | null
  engagementPeriodo: number
  viewsPeriodo: number
  videoViewsPeriodo: number
  videoTimeHoras: number
}

function computeKpis(daily: FbPageDailyRow[]): Kpis {
  if (!daily.length) return { followersAtual: null, novosSeguidoresPeriodo: null, engagementPeriodo: 0, viewsPeriodo: 0, videoViewsPeriodo: 0, videoTimeHoras: 0 }
  const sorted = [...daily].sort((a, b) => a.dia.localeCompare(b.dia))
  const last = sorted[sorted.length - 1]
  const followersAtual = last?.follows_total ?? last?.fan_count ?? null
  const novos = sorted.reduce((s, r) => s + (r.follows_daily || 0), 0)
  const eng = sorted.reduce((s, r) => s + (r.post_engagements || 0), 0)
  const views = sorted.reduce((s, r) => s + (r.views_total || 0), 0)
  const vviews = sorted.reduce((s, r) => s + (r.video_views || 0), 0)
  const vtimeMs = sorted.reduce((s, r) => s + (r.video_view_time_ms || 0), 0)
  return {
    followersAtual,
    novosSeguidoresPeriodo: novos > 0 ? novos : null,
    engagementPeriodo: eng,
    viewsPeriodo: views,
    videoViewsPeriodo: vviews,
    videoTimeHoras: vtimeMs / 1000 / 3600,
  }
}

function computeFollowersTrend(daily: FbPageDailyRow[]): { dia: string; followers: number }[] {
  return [...daily]
    .filter(r => r.follows_total != null)
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map(r => ({ dia: r.dia, followers: r.follows_total as number }))
}

// ── UI ─────────────────────────────────────────────────────────────────────

interface KpiCardProps { icon: React.ReactNode; label: string; value: string; sub?: string }
function KpiCard({ icon, label, value, sub }: KpiCardProps) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

interface BlockProps { title: string; subtitle?: string; children: React.ReactNode }
function Block({ title, subtitle, children }: BlockProps) {
  return (
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function FollowersLineChart({ points }: { points: { dia: string; followers: number }[] }) {
  const W = 720, H = 180, padL = 40, padR = 12, padT = 14, padB = 26
  const iw = W - padL - padR, ih = H - padT - padB
  const values = points.map(p => p.followers)
  const min = Math.min(...values), max = Math.max(...values)
  const range = Math.max(1, max - min)
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * iw
  const y = (v: number) => padT + ih - ((v - min) / range) * ih
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.followers).toFixed(1)}`).join(' ')
  const firstLabel = points[0]?.dia.slice(5)
  const midLabel = points[Math.floor(points.length / 2)]?.dia.slice(5)
  const lastLabel = points[points.length - 1]?.dia.slice(5)
  return (
    <div style={{ padding: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
        {[0, 0.5, 1].map(g => <line key={g} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g} stroke="var(--ws-border)" strokeWidth="1" />)}
        <path d={path} fill="none" stroke="var(--brand-accent)" strokeWidth="2" />
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="10" fill="var(--ws-text-secondary)">{nf(max)}</text>
        <text x={padL - 6} y={padT + ih} textAnchor="end" fontSize="10" fill="var(--ws-text-secondary)">{nf(min)}</text>
        {firstLabel && <text x={padL} y={H - 8} textAnchor="start" fontSize="10" fill="var(--ws-text-secondary)">{firstLabel}</text>}
        {midLabel && <text x={padL + iw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ws-text-secondary)">{midLabel}</text>}
        {lastLabel && <text x={W - padR} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ws-text-secondary)">{lastLabel}</text>}
      </svg>
    </div>
  )
}

function PostThumb({ url, mediaType }: { url: string | null; mediaType: string | null }) {
  const isVideo = mediaType?.startsWith('video') || mediaType === 'video_inline'
  if (!url) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ws-text-secondary)', fontSize: 10 }}>
        —
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', width: 44, height: 44 }}>
      <img
        src={url}
        alt=""
        loading="lazy"
        style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', display: 'block', background: 'var(--ws-bg)' }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
      />
      {isVideo && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 6, pointerEvents: 'none' }}>
          <Play size={14} fill="#fff" color="#fff" />
        </div>
      )}
    </div>
  )
}

function PostsTable({ rows }: { rows: FbPostRow[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thLeft, width: 60 }}></th>
            <th style={thLeft}>Data</th>
            <th style={thLeft}>Post</th>
            <th style={thRight}><Heart size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Reações</th>
            <th style={thRight}><MessageCircle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Coment.</th>
            <th style={thRight}><Share2 size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Compart.</th>
            <th style={thRight}>Total</th>
            <th style={{ ...thRight, width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const total = r.reactions_count + r.comments_count + r.shares_count
            const msg = (r.message || '[sem texto]').replace(/\s+/g, ' ').slice(0, 90)
            return (
              <tr key={r.post_id}>
                <td style={{ ...tdLeft, padding: '6px 12px' }}>
                  {r.permalink_url ? (
                    <a href={r.permalink_url} target="_blank" rel="noopener noreferrer" title="Abrir no Facebook" style={{ display: 'block' }}>
                      <PostThumb url={r.capa_url} mediaType={r.media_type} />
                    </a>
                  ) : (
                    <PostThumb url={r.capa_url} mediaType={r.media_type} />
                  )}
                </td>
                <td style={tdLeft}>{r.created_time.slice(0, 10)}</td>
                <td style={tdLeftWide} title={r.message || undefined}>{msg}</td>
                <td style={tdRight}>{nf(r.reactions_count)}</td>
                <td style={tdRight}>{nf(r.comments_count)}</td>
                <td style={tdRight}>{nf(r.shares_count)}</td>
                <td style={{ ...tdRight, fontWeight: 600 }}>{nf(total)}</td>
                <td style={tdRight}>
                  {r.permalink_url && (
                    <a href={r.permalink_url} target="_blank" rel="noopener noreferrer" title="Abrir no Facebook" style={{ color: 'var(--ws-text-secondary)' }}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </td>
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
const tdLeft: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--ws-border)', color: 'var(--ws-text-primary)', whiteSpace: 'nowrap' }
const tdLeftWide: React.CSSProperties = { ...tdLeft, maxWidth: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const tdRight: React.CSSProperties = { ...tdLeft, textAlign: 'right' }
const emptyStyle: React.CSSProperties = { padding: '48px 24px', textAlign: 'center', background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12 }
