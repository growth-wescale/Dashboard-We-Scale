/* Saúde da Marca — real Supabase data + mock generators for Social/Criativos/Públicos */
import { useState, useMemo, Fragment, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from '@/components/ui/StatusPill'
import { MetricCard } from '@/components/ui/MetricCard'
import { PageTop } from '@/components/ui/PageTop'
import { useMarcaSelecionada } from '@/components/AppLayout'
import { useMediaData } from '@/hooks/useMediaData'
import { useVendasFunil } from '@/hooks/useVendasFunil'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { mapFonte, FONTE_CATEGORIAS, inPeriod } from '@/lib/vendasUtils'
import { useMetas } from '@/hooks/useMetas'
import { useLeads } from '@/hooks/useLeads'
import type { MediaDailyRaw, Lead, Meta } from '@/lib/types'
import { SLUG_TO_MARCA, monthLabel, todayLocal, isoDate } from '@/lib/dateUtils'
import { getCreativeAsset } from '@/lib/creativeAssets'
import { MqlDrawer } from '@/components/ui/MqlDrawer'
import { TermosPanel } from '@/components/ui/TermosPanel'
import { SocialPanel } from '@/components/ui/SocialPanel'
import { EmailMarketingPanel } from '@/components/ui/EmailMarketingPanel'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { BubbleMatrix } from '@/components/ui/BubbleMatrix'
import { MetricSeriesChart } from '@/components/ui/MetricSeriesChart'
import { CompareControl } from '@/components/ui/CompareControl'
import { isLeadMql, deduplicateLeads } from '@/lib/leadUtils'
import { previousMonthSameRange, computeDeltaPct, formatCompareLabel, type DateRange } from '@/lib/periodCompare'
import { isMediaLegacy, isMediaOdontoLegacy, isMediaFranquia, isPausedStrategy } from '@/lib/oralUnicMapping'
import { isMediaEventoInpot, isMediaFranquiaInpot, isLeadEventoInpot, isCrmEventoInpot } from '@/lib/inpotMapping'
import { EsteiraOralUnic } from '@/pages/EsteiraOralUnic'

// ── Oral Unic frentes ────────────────────────────────────────────────────────
type OuSubView = 'geral' | 'franquia' | 'legacy' | 'odonto_legacy' | 'esteira'
type InpSubView = 'geral' | 'franquia' | 'evento'
function pausedStrategyLabel(campanha: string | null, conjunto: string | null): string {
  const c = (campanha ?? '').toUpperCase()
  const s = (conjunto ?? '').toUpperCase().trim()
  if (c.includes('COMPRA DIRETA') || c.includes('HOTMART')) return 'Compra Direta (Hotmart)'
  if (c.includes('[LEGACY]') && s.startsWith('ISCA')) return 'Iscas de conteúdo'
  return 'Descontinuada'
}

// ── Brand definitions (static info only) ─────────────────────────────────────
const BRAND_DEFS = [
  { key: 'oral-unic',  label: 'Oral Unic',         accent: '#7F0C72', tipo: 'marca' as const },
  { key: 'inpot',      label: 'Inpot',             accent: '#C6D32D', tipo: 'marca' as const },
  { key: 'eletrovias', label: 'Eletrovias',        accent: '#ED6D3A', tipo: 'marca' as const },
  { key: 'liso-laser', label: 'Lisô Laser',        accent: '#FF6643', tipo: 'marca' as const },
  { key: 'b2case',     label: 'B2Case',            accent: '#0169F2', tipo: 'marca' as const },
  { key: 'viva',       label: 'Viva',              accent: '#FF0069', tipo: 'marca' as const },
  { key: 'fred',       label: 'Frederico Nicolau', accent: '#2A6E3F', tipo: 'ceo' as const },
  { key: 'leo',        label: 'Leonardo Pereira',  accent: '#3B5998', tipo: 'ceo' as const },
]

type BrandData = {
  key: string; label: string; accent: string
  leads: number; mql: number; sql: number; diagnostico: number; sal: number; fech: number
  invest: number; cpmql: number; cpsql: number
  meta: number; status: 'positivo' | 'atencao' | 'risco'
  mqlMetaVal: number; investMetaVal: number; investMetaPct: number
}

// ── Real data builders ────────────────────────────────────────────────────────

function computeFunnelLosses(crm: VwMarketingFunil[], di: string, df: string) {
  const active = crm.filter(r => r.status_atual !== 'Excluído')
  const perdido = {
    mql:         active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_mql, di, df) && !inPeriod(r.data_sql, di, df)).length,
    sql:         active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sql, di, df) && !inPeriod(r.data_diagnostico, di, df)).length,
    diagnostico: active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_diagnostico, di, df) && !inPeriod(r.data_sal, di, df)).length,
    sal:         active.filter(r => r.status_atual === 'Perdido' && inPeriod(r.data_sal, di, df)).length,
  }
  const valorTotal = active.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)
  return { perdido, valorTotal }
}

function computeBrand(
  media: MediaDailyRaw[], leadRows: Lead[], crm: VwMarketingFunil[], metas: Meta[],
  def: typeof BRAND_DEFS[0], di: string, df: string
): BrandData {
  const invest  = media.reduce((s, r) => s + r.spend_brl, 0)
  const uniqueLeads = deduplicateLeads(leadRows)
  const leads   = uniqueLeads.length
  const mql     = uniqueLeads.filter(isLeadMql).length
  const active  = crm.filter(r => r.status_atual !== 'Excluído')
  const sql        = active.filter(r => inPeriod(r.data_sql, di, df)).length
  const diagnostico = active.filter(r => inPeriod(r.data_diagnostico, di, df)).length
  const sal        = active.filter(r => inPeriod(r.data_sal, di, df)).length
  const fech       = active.filter(r => r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).length
  const cpmql   = mql > 0 ? Math.round(invest / mql) : 0
  const cpsql   = sql > 0 ? Math.round(invest / sql) : 0
  const metaRow = metas.find(m => m.metrica === 'mql')
  const mqlMetaVal = metaRow?.valor_meta ?? 0
  const metaPct = mqlMetaVal > 0 ? Math.round((mql / mqlMetaVal) * 100) : 0
  const investMetaRow = metas.find(m => m.metrica === 'investimento')
  const investMetaVal = investMetaRow?.valor_meta ?? 0
  const investMetaPct = investMetaVal > 0 ? Math.round((invest / investMetaVal) * 100) : 0
  const status: BrandData['status'] = metaPct >= 85 ? 'positivo' : metaPct >= 60 ? 'atencao' : 'risco'
  return { key: def.key, label: def.label, accent: def.accent, leads, mql, sql, diagnostico, sal, fech, invest, cpmql, cpsql, meta: metaPct, status, mqlMetaVal, investMetaVal, investMetaPct }
}

interface Ad { id: string; name: string; type?: string; spend: number; impressions: number; clicks: number; ctr: number; mql: number; cpmql: number; hue: number; preview_url?: string }
interface AdSet { id: string; name: string; publico: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; mql: number; sql: number; cpmql: number; freq: number; ads: Ad[] }
interface Campaign { id: string; name: string; status: string; objetivo: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; cpc: number; lpv: number; leads: number; mql: number; sql: number; cpmql: number; cpsql: number; adsets: AdSet[] }

function buildCampaigns(media: MediaDailyRaw[], totalMql: number, totalSql: number, totalLeadsReal: number, marca: string): Campaign[] {
  const totalMediaLeads = media.reduce((s, r) => s + r.leads, 0)
  const totalSpend = media.reduce((s, r) => s + r.spend_brl, 0)
  // Use real leads from leads table; fall back to media leads if table has none
  const totalLeads = totalLeadsReal > 0 ? totalLeadsReal : totalMediaLeads
  const mqlRate = totalLeads > 0 ? totalMql / totalLeads : 0
  const sqlRate = totalLeads > 0 ? totalSql / totalLeads : 0
  // When media_daily_raw.leads = 0 (e.g. WhatsApp/external tracking), distribute by spend
  const useSpendProxy = totalMediaLeads === 0 && totalSpend > 0

  const campMap = new Map<string, MediaDailyRaw[]>()
  for (const row of media) {
    const key = row.campanha ?? '(sem campanha)'
    if (!campMap.has(key)) campMap.set(key, [])
    campMap.get(key)!.push(row)
  }

  const campaigns: Campaign[] = []
  let ci = 0
  for (const [campName, campRows] of campMap) {
    const spend = campRows.reduce((s, r) => s + r.spend_brl, 0)
    const impressions = campRows.reduce((s, r) => s + r.impressoes, 0)
    const clicks = campRows.reduce((s, r) => s + r.cliques_link, 0)
    const lpv = campRows.reduce((s, r) => s + r.lpv, 0)
    const leads = campRows.reduce((s, r) => s + r.leads, 0)
    const mql = useSpendProxy
      ? Math.round((spend / totalSpend) * totalMql)
      : Math.round(leads * mqlRate)
    const sql = useSpendProxy
      ? Math.round((spend / totalSpend) * totalSql)
      : Math.round(leads * sqlRate)
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
    const cpc = clicks > 0 ? spend / clicks : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    const cpmql = mql > 0 ? spend / mql : 0
    const cpsql = sql > 0 ? spend / sql : 0

    const setMap = new Map<string, MediaDailyRaw[]>()
    for (const row of campRows) {
      const key = row.conjunto ?? '(sem conjunto)'
      if (!setMap.has(key)) setMap.set(key, [])
      setMap.get(key)!.push(row)
    }

    const adsets: AdSet[] = []
    let ai = 0
    for (const [setName, setRows] of setMap) {
      const sSpend = setRows.reduce((s, r) => s + r.spend_brl, 0)
      const sImp = setRows.reduce((s, r) => s + r.impressoes, 0)
      const sClk = setRows.reduce((s, r) => s + r.cliques_link, 0)
      const sLeads = setRows.reduce((s, r) => s + r.leads, 0)
      const sMql = useSpendProxy
        ? Math.round((sSpend / totalSpend) * totalMql)
        : Math.round(sLeads * mqlRate)
      const sSql = useSpendProxy
        ? Math.round((sSpend / totalSpend) * totalSql)
        : Math.round(sLeads * sqlRate)
      const sCpm = sImp > 0 ? (sSpend / sImp) * 1000 : 0
      const sCtr = sImp > 0 ? (sClk / sImp) * 100 : 0
      const sCpmql = sMql > 0 ? sSpend / sMql : 0

      const adMap = new Map<string, MediaDailyRaw[]>()
      for (const row of setRows) {
        const key = row.anuncio ?? '(sem anúncio)'
        if (!adMap.has(key)) adMap.set(key, [])
        adMap.get(key)!.push(row)
      }

      const ads: Ad[] = []
      let ki = 0
      for (const [adName, adRows] of adMap) {
        const aSpend = adRows.reduce((s, r) => s + r.spend_brl, 0)
        const aImp = adRows.reduce((s, r) => s + r.impressoes, 0)
        const aClk = adRows.reduce((s, r) => s + r.cliques_link, 0)
        const aLeads = adRows.reduce((s, r) => s + r.leads, 0)
        const aMql = useSpendProxy
          ? Math.round((aSpend / totalSpend) * totalMql)
          : Math.round(aLeads * mqlRate)
        const aCtr = aImp > 0 ? (aClk / aImp) * 100 : 0
        const aCpmql = aMql > 0 ? aSpend / aMql : 0
        const asset = getCreativeAsset(marca, adName)
        ads.push({ id: `c${ci}-a${ai}-k${ki}`, name: adName, type: asset?.type, spend: aSpend, impressions: aImp, clicks: aClk, ctr: +aCtr.toFixed(2), mql: aMql, cpmql: Math.round(aCpmql), hue: (ci * 73 + ai * 37 + ki * 17) % 360, preview_url: asset?.postUrl })
        ki++
      }

      adsets.push({ id: `c${ci}-a${ai}`, name: setName, publico: setName, spend: sSpend, impressions: sImp, clicks: sClk, ctr: +sCtr.toFixed(2), cpm: +sCpm.toFixed(2), mql: sMql, sql: sSql, cpmql: Math.round(sCpmql), freq: 0, ads })
      ai++
    }

    campaigns.push({ id: `c${ci}`, name: campName, status: 'ativa', objetivo: 'Conversão', spend, impressions, clicks, ctr: +ctr.toFixed(2), cpm: +cpm.toFixed(2), cpc: +cpc.toFixed(2), lpv, leads, mql, sql, cpmql: Math.round(cpmql), cpsql: Math.round(cpsql), adsets })
    ci++
  }

  return campaigns.sort((a, b) => b.spend - a.spend)
}

function buildDailySeries(media: MediaDailyRaw[]): { day: string; impressions: number; cpm: number; clicks: number; cpc: number }[] {
  const dayMap = new Map<string, { impressions: number; spend: number; clicks: number }>()
  for (const row of media) {
    if (!dayMap.has(row.dia)) dayMap.set(row.dia, { impressions: 0, spend: 0, clicks: 0 })
    const e = dayMap.get(row.dia)!
    e.impressions += row.impressoes
    e.spend += row.spend_brl
    e.clicks += row.cliques_link
  }
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      impressions: v.impressions,
      cpm: v.impressions > 0 ? +((v.spend / v.impressions) * 1000).toFixed(2) : 0,
      clicks: v.clicks,
      cpc: v.clicks > 0 ? +(v.spend / v.clicks).toFixed(2) : 0,
    }))
}

function buildChannels(
  media: MediaDailyRaw[],
  mqlLeads: Lead[],
  crmData: VwMarketingFunil[]
): { name: string; mql: number; sql: number; cpmql: number; trend: number[] }[] {
  const sqlDeals = crmData.filter(r => r.status_atual !== 'Excluído' && r.data_sql)
  const result: { name: string; mql: number; sql: number; cpmql: number; trend: number[] }[] = []
  for (const canal of ['meta', 'google'] as const) {
    const rows = media.filter(r => r.canal === canal)
    if (rows.length === 0) continue
    const spend = rows.reduce((s, r) => s + r.spend_brl, 0)
    const name = canal === 'meta' ? 'Meta Ads' : 'Google Ads'
    const mql = filterLeadsByChannel(mqlLeads, name).length
    const cpmql = mql > 0 ? Math.round(spend / mql) : 0
    const sql = sqlDeals.filter(r => {
      const s = (r.utm_source ?? '').toLowerCase()
      return (CHANNEL_SOURCES[name] ?? []).some(src => s.includes(src))
    }).length
    result.push({ name, mql, sql, cpmql, trend: [mql, mql, mql, mql, mql, mql] })
  }
  return result
}

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')
const fmtK = (n: number) => n>=1000000 ? (n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'M' : n>=1000 ? (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'K' : Math.round(n).toLocaleString('pt-BR')
const money = (n: number) => 'R$ '+Math.round(n).toLocaleString('pt-BR')
const money2 = (n: number) => 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

function buildAcqFunnel(b: BrandData, media: MediaDailyRaw[]) {
  const impressions = media.reduce((s, r) => s + r.impressoes, 0)
  const clicks      = media.reduce((s, r) => s + r.cliques_link, 0)
  const lpv         = media.reduce((s, r) => s + r.lpv, 0)
  const cpm = impressions > 0 ? (b.invest / impressions) * 1000 : 0
  const cpc = clicks > 0 ? b.invest / clicks : 0
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0

  // Connect Rate = SUM(LPV) ÷ SUM(Outbound Clicks) apenas para campanhas
  // com destino website/LP (identificadas por terem LPV > 0 no período).
  // Campanhas de alcance, awareness, vídeo e engajamento têm lpv=0 e são excluídas.
  const campLpvTotals = new Map<string, number>()
  for (const row of media) {
    const key = row.campanha ?? '(sem campanha)'
    campLpvTotals.set(key, (campLpvTotals.get(key) ?? 0) + row.lpv)
  }
  const eligible      = media.filter(r => (campLpvTotals.get(r.campanha ?? '(sem campanha)') ?? 0) > 0)
  const eligibleLpv   = eligible.reduce((s, r) => s + r.lpv, 0)
  const eligibleClicks = eligible.reduce((s, r) => s + r.cliques_link, 0)
  const connectRate   = eligibleClicks > 0 ? (eligibleLpv / eligibleClicks) * 100 : null

  return {
    stages: [
      { label: 'Impressões', value: impressions },
      { label: 'Cliques',    value: clicks },
      { label: 'LPVs',       value: lpv },
      { label: 'Leads',      value: b.leads },
      { label: 'MQLs',       value: b.mql },
      { label: 'SQLs',       value: b.sql },
    ],
    cards: [
      { label: 'CPM',          value: money2(cpm) },
      { label: 'CPC',          value: money2(cpc) },
      { label: 'CTR',          value: ctr.toFixed(2) + '%' },
      { label: 'Connect Rate', value: connectRate !== null ? connectRate.toFixed(2) + '%' : 'N/A' },
    ],
  }
}

// ── SUI primitives (saude-ui.jsx) ─────────────────────────────────────────────
function SCard({ children, style, pad=20 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return <div style={{ background:'var(--ws-surface)', border:'1px solid var(--ws-border)', borderRadius:16, boxShadow:'var(--shadow-sm)', padding:pad, ...style }}>{children}</div>
}

function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16, flexWrap:'wrap' }}>
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:18, color:'var(--ws-text-primary)', lineHeight:1.2 }}>{title}</div>
        {sub && <div style={{ fontSize:12, color:'var(--ws-text-secondary)', marginTop:3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function KTile({ label, value, delta, invert, style }: { label: string; value: string; delta?: number; invert?: boolean; style?: CSSProperties }) {
  const has = delta !== undefined && delta !== null
  const up = has && delta! >= 0; const good = invert ? !up : up
  return (
    <div style={{ background:'var(--ws-surface)', border:'1px solid var(--ws-border)', borderRadius:14, boxShadow:'var(--shadow-sm)', padding:'14px 16px', ...style }}>
      <div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', fontWeight:500 }}>{label}</div>
      <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:26, color:'var(--ws-text-primary)', marginTop:4, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {has && <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:4, fontSize:12.5, fontWeight:600, color:good?'var(--status-positivo)':'var(--status-risco)' }}><span style={{fontSize:10}}>{up?'▲':'▼'}</span>{Math.abs(delta!)}%</div>}
    </div>
  )
}

function MiniFunnel({ stages }: { stages: { label: string; value: number; perdido?: number; fmt?: (v:number)=>string }[] }) {
  const max = stages[0].value || 1
  const logMax = Math.log(max + 1)
  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      {stages.map((s,i) => {
        const w = logMax > 0 ? Math.max(18, (Math.log(s.value + 1) / logMax) * 100) : 18
        const conv = i>0 ? s.value/stages[i-1].value : 1
        return (
          <div key={s.label}>
            {i>0 && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0 3px 168px', color:'var(--ws-text-secondary)', fontSize:11.5 }}><span style={{opacity:0.6}}>↓</span>{(conv*100).toFixed(1)}%</div>}
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:154, flex:'0 0 auto', fontSize:13, color:'var(--ws-text-secondary)', textAlign:'right' }}>{s.label}</div>
              <div style={{ flex:1, height:34, background:'var(--ws-bg)', borderRadius:8, overflow:'hidden' }}>
                <div style={{ width:w+'%', height:'100%', background:`color-mix(in srgb, var(--brand-accent) ${Math.round(38+62*(s.value/max))}%, var(--brand-dark))`, borderRadius:8, display:'flex', alignItems:'center', paddingLeft:12 }}>
                  <span style={{ color:'#fff', fontWeight:600, fontSize:13, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{s.fmt ? s.fmt(s.value) : fmt(s.value)}</span>
                </div>
              </div>
              {s.perdido != null && s.perdido > 0 && (
                <div style={{ flex:'0 0 auto', fontSize:11.5, color:'var(--status-risco)', opacity:0.8, whiteSpace:'nowrap', minWidth:80 }}>
                  {fmt(s.perdido)} perdidos
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RadarChartSVG({ axes, series, size=340 }: { axes:{key:string;label:string}[]; series:{label:string;color:string;fill?:string;values:Record<string,number>}[]; size?:number }) {
  const cx=size/2, cy=size/2, r=size/2-46; const n=axes.length
  const ang = (i: number) => -Math.PI/2+(i/n)*2*Math.PI
  const pt = (i: number, t: number): [number,number] => [cx+r*t*Math.cos(ang(i)), cy+r*t*Math.sin(ang(i))]
  const ring = (t: number) => axes.map((_,i) => pt(i,t).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} style={{ maxWidth:size, overflow:'visible' }}>
      {[0.25,0.5,0.75,1].map((t) => <polygon key={t} points={ring(t)} fill="none" stroke="var(--ws-border)" strokeWidth="1" />)}
      {axes.map((_,i) => { const [x,y]=pt(i,1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ws-border)" strokeWidth="1" /> })}
      {series.map((s) => {
        const poly = axes.map((a,i) => pt(i,Math.max(0,Math.min(1,(s.values[a.key]||0)/100))).join(',')).join(' ')
        return <g key={s.label}><polygon points={poly} fill={s.fill||'none'} stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
          {axes.map((a,i) => { const [x,y]=pt(i,Math.max(0,Math.min(1,(s.values[a.key]||0)/100))); return <circle key={i} cx={x} cy={y} r="3" fill={s.color} /> })}
        </g>
      })}
      {axes.map((a,i) => {
        const [x,y]=pt(i,1.16)
        return <text key={i} x={x} y={y} textAnchor={Math.abs(x-cx)<6?'middle':x>cx?'start':'end'} dominantBaseline="middle" fontSize="11.5" fontWeight="600" fill="var(--ws-text-secondary)">{a.label}</text>
      })}
    </svg>
  )
}

function Scatter({ points, xLabel, yLabel, selectedId, onSelect }: {
  points:{x:number;y:number;size:number;label:string;id:string}[]
  xLabel:string; yLabel:string
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}) {
  const [hov, setHov] = useState<number|null>(null)
  const W=560, H=300, padL=46, padR=14, padT=14, padB=34; const iw=W-padL-padR, ih=H-padT-padB
  if (!points.length) return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
      <text x={W/2} y={H/2} textAnchor="middle" fontSize="13" fill="var(--ws-text-secondary)">Sem conjuntos com MQL {'>'} 0 no período</text>
    </svg>
  )
  const xs=points.map((p)=>p.x), ys=points.map((p)=>p.y)
  const xMax=Math.max(...xs)*1.1, xMin=Math.min(...xs)*0.85; const yMax=Math.max(...ys)*1.15, yMin=0
  const sMax=Math.max(...points.map((p)=>p.size))
  const X=(v:number)=>padL+((v-xMin)/(xMax-xMin||1))*iw; const Y=(v:number)=>padT+ih-((v-yMin)/(yMax-yMin||1))*ih
  const hasSel = selectedId != null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
      {[0,0.25,0.5,0.75,1].map((g)=><line key={g} x1={padL} x2={W-padR} y1={padT+ih*g} y2={padT+ih*g} stroke="var(--ws-border)" strokeWidth="1" />)}
      {points.map((p,i)=>{
        const isSel = selectedId === p.id
        const isDim = hasSel && !isSel
        return (
          <g key={i} style={{ cursor:'pointer' }}
            onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
            onClick={()=>onSelect?.(isSel ? null : p.id)}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={8+16*(p.size/sMax)}
              fill="var(--brand-accent)" fillOpacity={isDim ? 0.08 : (hov===i||isSel ? 0.55 : 0.28)}
              stroke="var(--brand-accent)" strokeWidth={isSel ? 3 : (hov===i ? 2.5 : 1.5)} strokeOpacity={isDim ? 0.25 : 1} />
            <text x={X(p.x)} y={Y(p.y)-12-16*(p.size/sMax)} textAnchor="middle" fontSize="10.5"
              fill={isDim ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)'} fillOpacity={isDim ? 0.4 : 1}>{p.label}</text>
          </g>
        )
      })}
      {hov !== null && (()=>{
        const p=points[hov]; const px=X(p.x), py=Y(p.y)
        const tw=158, th=72; const tx=px+18>W-tw ? px-tw-10 : px+18; const ty=Math.max(4, py-th/2)
        return (
          <g style={{ pointerEvents:'none' }}>
            <rect x={tx} y={ty} width={tw} height={th} rx="7" fill="var(--ws-surface)" stroke="var(--ws-border-strong)" strokeWidth="0.8" />
            <text x={tx+10} y={ty+17} fontSize="11.5" fontWeight="700" fill="var(--ws-text-primary)">{p.label}</text>
            <text x={tx+10} y={ty+33} fontSize="10.5" fill="var(--ws-text-secondary)">CP-MQL: <tspan fontWeight="600" fill="var(--ws-text-primary)">R$ {Math.round(p.x).toLocaleString('pt-BR')}</tspan></text>
            <text x={tx+10} y={ty+48} fontSize="10.5" fill="var(--ws-text-secondary)">MQL: <tspan fontWeight="600" fill="var(--ws-text-primary)">{p.y}</tspan></text>
            <text x={tx+10} y={ty+63} fontSize="10.5" fill="var(--ws-text-secondary)">Invest.: <tspan fontWeight="600" fill="var(--ws-text-primary)">R$ {Math.round(p.size).toLocaleString('pt-BR')}</tspan></text>
          </g>
        )
      })()}
      <text x={padL} y={H-6} fontSize="11" fill="var(--ws-text-secondary)">{xLabel} →</text>
      <text x={10} y={padT+6} fontSize="11" fill="var(--ws-text-secondary)" transform={`rotate(-90 10 ${padT+6})`}>{yLabel} →</text>
    </svg>
  )
}

function Donut({ slices, size=150 }: { slices:{label:string;value:number;color:string}[]; size?:number }) {
  const total=slices.reduce((a,s)=>a+s.value,0); const r=size/2, ir=r*0.58, cx=r, cy=r; let acc=0
  const arc=(v:number)=>{
    const a0=(acc/total)*2*Math.PI-Math.PI/2; acc+=v; const a1=(acc/total)*2*Math.PI-Math.PI/2; const large=a1-a0>Math.PI?1:0
    const p=(ang:number,rad:number):[number,number]=>[cx+rad*Math.cos(ang), cy+rad*Math.sin(ang)]
    const [x0,y0]=p(a0,r),[x1,y1]=p(a1,r),[x2,y2]=p(a1,ir),[x3,y3]=p(a0,ir)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ir} ${ir} 0 ${large} 0 ${x3} ${y3} Z`
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices.map((s)=><path key={s.label} d={arc(s.value)} fill={s.color} />)}
    </svg>
  )
}


function MetricPicker({ options, value, onChange, size='sm' }: { options:{value:string;label:string}[]; value:string; onChange:(v:string)=>void; size?:'sm'|'md' }) {
  return (
    <div style={{ display:'inline-flex', background:'var(--ws-bg)', borderRadius:999, padding:3, gap:2 }}>
      {options.map((o) => {
        const on=o.value===value
        return <button key={o.value} onClick={()=>onChange(o.value)} style={{ border:'none', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:size==='sm'?12:13, padding:size==='sm'?'5px 11px':'6px 13px', borderRadius:999, background:on?'var(--ws-surface)':'transparent', color:on?'var(--brand-accent)':'var(--ws-text-secondary)', boxShadow:on?'var(--shadow-sm)':'none' }}>{o.label}</button>
      })}
    </div>
  )
}

// ── PeriodPicker ──────────────────────────────────────────────────────────────
// TODAY vira uma função pra evitar congelamento em module scope (bug de virada de dia).
const todayISO = () => todayLocal()

function makeMtd(): { start: string; end: string } {
  const t = todayISO()
  const [y, m] = t.split('-').map(Number)
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: t }
}
function makePrevNthMonth(n: number): { start: string; end: string } {
  const [y, m] = todayISO().split('-').map(Number)
  const total = (y * 12 + m - 1) - n
  const py = Math.floor(total / 12)
  const pm = (total % 12) + 1
  const ms = String(pm).padStart(2, '0')
  const last = new Date(py, pm, 0).getDate()
  return { start: `${py}-${ms}-01`, end: `${py}-${ms}-${String(last).padStart(2, '0')}` }
}
function makeLastN(n: number): { start: string; end: string } {
  const d = new Date(); d.setDate(d.getDate() - (n - 1))
  return { start: isoDate(d), end: todayISO() }
}

const PRESETS = [
  { label: 'MTD',    fn: makeMtd },
  { label: 'Mês -1', fn: () => makePrevNthMonth(1) },
  { label: 'Mês -2', fn: () => makePrevNthMonth(2) },
  { label: 'Mês -3', fn: () => makePrevNthMonth(3) },
  { label: '7d',     fn: () => makeLastN(7) },
  { label: '30d',    fn: () => makeLastN(30) },
  { label: '90d',    fn: () => makeLastN(90) },
] as const

function PeriodPicker({ value, onChange }: { value: { start: string; end: string }; onChange: (r: { start: string; end: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activePreset = PRESETS.find(p => {
    const r = p.fn()
    return r.start === value.start && r.end === value.end
  })
  const label = activePreset?.label ?? 'Personalizado'

  const inputSt: CSSProperties = {
    border: 'none', background: 'transparent',
    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
    color: 'var(--ws-text-primary)', cursor: 'pointer', width: 120,
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)',
          borderRadius: 8, padding: '0 12px', height: 36, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
          color: 'var(--ws-text-primary)', whiteSpace: 'nowrap',
        }}
      >
        <CalendarDays size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
        {label}
        <ChevronDown size={13} style={{ color: 'var(--ws-text-secondary)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
          borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,.3)',
          minWidth: 160, padding: '6px 0', overflow: 'hidden',
        }}>
          {PRESETS.map(p => {
            const r = p.fn()
            const on = value.start === r.start && value.end === r.end
            return (
              <button
                key={p.label}
                onClick={() => { onChange(r); setOpen(false); setCustomOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  border: 'none', background: on ? 'color-mix(in srgb, var(--brand-accent) 12%, transparent)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: on ? 700 : 500,
                  fontSize: 13, padding: '8px 14px',
                  color: on ? 'var(--brand-accent)' : 'var(--ws-text-primary)',
                }}
              >
                {p.label}
              </button>
            )
          })}

          <div style={{ borderTop: '1px solid var(--ws-border)', margin: '4px 0' }} />

          <button
            onClick={() => setCustomOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', border: 'none', background: customOpen ? 'color-mix(in srgb, var(--brand-accent) 8%, transparent)' : 'transparent',
              cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500,
              fontSize: 13, padding: '8px 14px',
              color: !activePreset ? 'var(--brand-accent)' : 'var(--ws-text-primary)',
            }}
          >
            Personalizado
            <ChevronDown size={12} style={{ transform: customOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {customOpen && (
            <div style={{ padding: '6px 14px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={value.start} max={value.end} onChange={e => onChange({ ...value, start: e.target.value })} style={inputSt} />
              <span style={{ color: 'var(--ws-text-secondary)', fontSize: 12 }}>–</span>
              <input type="date" value={value.end} min={value.start} max={todayISO()} onChange={e => onChange({ ...value, end: e.target.value })} style={inputSt} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const SM_TABS = [
  { key:'overview',   label:'Visão Geral' },
  { key:'campanhas',  label:'Campanhas' },
  { key:'conjuntos',  label:'Conjuntos' },
  { key:'anuncios',   label:'Anúncios' },
  { key:'termos',     label:'Termos' },
  { key:'social',     label:'Social Media' },
  { key:'email',      label:'E-mail Marketing' },
  { key:'radar',      label:'Radar' },
]

const CH_COLORS = ['var(--brand-accent)','var(--brand-accent-2)','var(--status-atencao)','color-mix(in srgb, var(--brand-dark) 52%, var(--ws-border-strong))']

function SMTabs({ value, onChange, hide }: { value:string; onChange:(k:string)=>void; hide?: string[] }) {
  const tabs = hide?.length ? SM_TABS.filter(t => !hide.includes(t.key)) : SM_TABS
  return (
    <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--ws-border)', marginBottom:24, overflowX:'auto' }}>
      {tabs.map((t) => {
        const on=t.key===value
        return <button key={t.key} onClick={()=>onChange(t.key)} style={{ border:'none', background:'transparent', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:14, padding:'10px 16px', color:on?'var(--brand-accent)':'var(--ws-text-secondary)', whiteSpace:'nowrap', borderBottom:`2.5px solid ${on?'var(--brand-accent)':'transparent'}`, marginBottom:-1 }}>{t.label}</button>
      })}
    </div>
  )
}

const OU_SUB_TABS: { key: OuSubView; label: string }[] = [
  { key: 'geral',         label: 'Visão Geral' },
  { key: 'franquia',      label: 'Franquia' },
  { key: 'legacy',        label: 'Comunidade' },
  { key: 'odonto_legacy', label: 'Odonto Legacy' },
  { key: 'esteira',       label: 'Esteira' },
]

const INP_SUB_TABS: { key: InpSubView; label: string }[] = [
  { key: 'geral',    label: 'Visão Geral' },
  { key: 'franquia', label: 'Franquia' },
  { key: 'evento',   label: 'Evento' },
]

function OuSubTabs({ value, onChange, accent }: { value: OuSubView; onChange: (k: OuSubView) => void; accent: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: '8px 14px', background: `color-mix(in srgb, ${accent} 7%, var(--ws-surface))`, border: `1px solid color-mix(in srgb, ${accent} 22%, var(--ws-border))`, borderRadius: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: accent, fontWeight: 700, letterSpacing: '0.06em', marginRight: 4, whiteSpace: 'nowrap' }}>FRENTE</span>
      {OU_SUB_TABS.map(t => {
        const on = t.key === value
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{ border: on ? `1px solid ${accent}` : '1px solid transparent', borderRadius: 999, padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, background: on ? accent : 'transparent', color: on ? '#fff' : 'var(--ws-text-secondary)', transition: 'background 0.15s, color 0.15s', whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function InpSubTabs({ value, onChange, accent }: { value: InpSubView; onChange: (k: InpSubView) => void; accent: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: '8px 14px', background: `color-mix(in srgb, ${accent} 7%, var(--ws-surface))`, border: `1px solid color-mix(in srgb, ${accent} 22%, var(--ws-border))`, borderRadius: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: accent, fontWeight: 700, letterSpacing: '0.06em', marginRight: 4, whiteSpace: 'nowrap' }}>FRENTE</span>
      {INP_SUB_TABS.map(t => {
        const on = t.key === value
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{ border: on ? `1px solid ${accent}` : '1px solid transparent', borderRadius: 999, padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, background: on ? accent : 'transparent', color: on ? '#fff' : 'var(--ws-text-secondary)', transition: 'background 0.15s, color 0.15s', whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── SimpleTable ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Col { k: string; h: string; num?: boolean; fmt?: (v: any) => string; render?: (r: any) => ReactNode }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SimpleTable({ columns, rows, keyField }: { columns: Col[]; rows: any[]; keyField: string }) {
  const [sort, setSort] = useState({ k: columns.find(c => c.num)?.k || columns[0].k, dir: -1 })
  const sorted = [...rows].sort((a, b) => {
    const va = a[sort.k], vb = b[sort.k]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir
    return String(va).localeCompare(String(vb)) * sort.dir
  })
  const sortCol = columns.find(c => c.k === sort.k)
  const isNumSorted = !!(sortCol?.num && sorted.length > 0 && typeof sorted[0]?.[sort.k] === 'number')
  const vals = isNumSorted ? sorted.map(r => Number(r[sort.k] ?? 0)) : []
  const vMax = vals.length ? Math.max(...vals) : 1
  const vMin = vals.length ? Math.min(...vals) : 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowHeat = (r: any) => {
    if (!isNumSorted || vMax === vMin) return 0
    const t = (Number(r[sort.k] ?? 0) - vMin) / (vMax - vMin)
    return sort.dir === -1 ? t : 1 - t
  }
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:640 }}>
        <thead>
          <tr style={{ color:'var(--ws-text-secondary)', fontSize:11.5, fontWeight:500, borderBottom:'1px solid var(--ws-border)' }}>
            {columns.map((c)=>(
              <th key={c.k} onClick={()=>setSort((s)=>({k:c.k,dir:s.k===c.k?-s.dir:-1}))} style={{ padding:'10px 12px', textAlign:c.num?'right':'left', fontWeight:500, cursor:'pointer', whiteSpace:'nowrap' }}>
                {c.h}{sort.k===c.k?(sort.dir<0?' ↓':' ↑'):''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r)=>{
            const heat = rowHeat(r)
            const rowBg = isNumSorted ? `color-mix(in srgb, var(--brand-accent) ${Math.round(4 + heat * 22)}%, transparent)` : 'transparent'
            return (
              <tr key={r[keyField]} style={{ borderBottom:'1px solid var(--ws-border)', background:rowBg }}>
                {columns.map((c)=>(
                  <td key={c.k} style={{ padding:'11px 12px', textAlign:c.num?'right':'left', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                    {c.render ? c.render(r) : (c.fmt ? c.fmt(r[c.k]) : r[c.k])}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── SaudeCampanhas ────────────────────────────────────────────────────────────
const CAMP_COLS = [
  { k:'spend',       h:'Investimento',  fmt:money },
  { k:'impressions', h:'Impressões',    fmt:fmtK },
  { k:'clicks',      h:'Cliques',       fmt:fmt },
  { k:'ctr',         h:'CTR',           fmt:(v:number)=>v+'%' },
  { k:'cpm',         h:'CPM',           fmt:money2 },
  { k:'cpc',         h:'CPC',           fmt:money2 },
  { k:'mql',         h:'MQL',           fmt:fmt },
  { k:'cpmql',       h:'CP-MQL',        fmt:money },
  { k:'sql',         h:'SQL',           fmt:fmt },
  { k:'cpsql',       h:'CP-SQL',        fmt:money },
]
const DEFAULT_ON: Record<string,boolean> = { spend:true, impressions:true, clicks:true, ctr:true, mql:true, cpmql:true }

function campBtn(active?: boolean) {
  return { border:'1px solid var(--ws-border-strong)', background:active?'var(--brand-accent)':'var(--ws-surface)', color:active?'var(--brand-accent-contrast)':'var(--ws-text-primary)', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:13, padding:'8px 14px', borderRadius:999, height:38 } as CSSProperties
}

function CampCell({ v }: { v: string }) {
  return <td style={{ padding:'11px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:13, whiteSpace:'nowrap' }}>{v}</td>
}

function ColumnPicker({ on, setOn }: { on:Record<string,boolean>; setOn:(fn:(s:Record<string,boolean>)=>Record<string,boolean>)=>void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setOpen((o)=>!o)} style={campBtn()}>Colunas ▾</button>
      {open && (
        <div style={{ position:'absolute', right:0, top:42, zIndex:20, background:'var(--ws-surface)', border:'1px solid var(--ws-border-strong)', borderRadius:12, boxShadow:'var(--shadow-md)', padding:10, width:190 }}>
          {CAMP_COLS.map((c)=>(
            <label key={c.k} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', fontSize:13, cursor:'pointer', borderRadius:8 }}>
              <input type="checkbox" checked={!!on[c.k]} onChange={()=>setOn((s)=>({...s,[c.k]:!s[c.k]}))} />{c.h}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignTable({ campaigns, on }: { campaigns:Campaign[]; on:Record<string,boolean> }) {
  const [exC, setExC] = useState<Record<string,boolean>>({})
  const [exA, setExA] = useState<Record<string,boolean>>({})
  const [sort, setSort] = useState<{k:string;dir:number}>({ k:'spend', dir:-1 })
  const cols = CAMP_COLS.filter((c)=>on[c.k])
  const val = (row: any, k: string) => { const c=CAMP_COLS.find((x)=>x.k===k)!; return row[k]===undefined||row[k]===null?'—':c.fmt(row[k]) }
  const kCamp = sort.k as keyof Campaign
  const sorted = [...campaigns].sort((a, b) => {
    const va = Number(a[kCamp] ?? 0), vb = Number(b[kCamp] ?? 0)
    return (va - vb) * sort.dir
  })
  const campVals = sorted.map(c => Number(c[kCamp] ?? 0))
  const cMax = campVals.length ? Math.max(...campVals) : 1
  const cMin = campVals.length ? Math.min(...campVals) : 0
  const campHeat = (v: number) => {
    if (cMax === cMin) return 0.5
    const t = (v - cMin) / (cMax - cMin)
    return sort.dir === -1 ? t : 1 - t
  }
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720 }}>
        <thead>
          <tr style={{ color:'var(--ws-text-secondary)', fontSize:11.5, fontWeight:500, borderBottom:'1px solid var(--ws-border)' }}>
            <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:500 }}>Campanha / Conjunto / Anúncio</th>
            {cols.map((c)=><th key={c.k} onClick={()=>setSort(s=>({k:c.k,dir:s.k===c.k?-s.dir:-1}))} style={{ padding:'10px 12px', textAlign:'right', fontWeight:500, whiteSpace:'nowrap', cursor:'pointer' }}>{c.h}{sort.k===c.k?(sort.dir<0?' ↓':' ↑'):''}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((cp)=>{
            const heat = campHeat(Number(cp[kCamp] ?? 0))
            const heatBg = `color-mix(in srgb, var(--brand-accent) ${Math.round(4 + heat * 22)}%, transparent)`
            const openC=exC[cp.id]
            return (
              <Fragment key={cp.id}>
                <tr onClick={()=>setExC((s)=>({...s,[cp.id]:!s[cp.id]}))} style={{ cursor:'pointer', borderBottom:'1px solid var(--ws-border)', background:openC?'color-mix(in srgb, var(--brand-accent) 6%, transparent)':heatBg }}>
                  <td style={{ padding:'11px 12px' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:9 }}>
                      <span style={{ width:16, color:'var(--brand-accent)', fontSize:11 }}>{openC?'▼':'▶'}</span>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:cp.status==='ativa'?'var(--status-positivo)':'var(--ws-border-strong)' }} />
                      <span style={{ fontWeight:600 }}>{cp.name}</span>
                    </span>
                  </td>
                  {cols.map((c)=><CampCell key={c.k} v={val(cp,c.k)} />)}
                </tr>
                {openC && cp.adsets.map((as)=>{
                  const openA=exA[as.id]
                  return (
                    <Fragment key={as.id}>
                      <tr onClick={(e)=>{e.stopPropagation();setExA((s)=>({...s,[as.id]:!s[as.id]}))}} style={{ cursor:'pointer', borderBottom:'1px solid var(--ws-border)', background:'var(--ws-bg)' }}>
                        <td style={{ padding:'9px 12px 9px 34px' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:9 }}>
                            <span style={{ width:14, color:'var(--brand-accent)', fontSize:10 }}>{openA?'▼':'▶'}</span>
                            <span style={{ fontWeight:500 }}>{as.name}</span>
                          </span>
                        </td>
                        {cols.map((c)=><CampCell key={c.k} v={val(as,c.k)} />)}
                      </tr>
                      {openA && as.ads.map((ad)=>(
                        <tr key={ad.id} style={{ borderBottom:'1px solid var(--ws-border)' }}>
                          <td style={{ padding:'8px 12px 8px 60px', color:'var(--ws-text-secondary)' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:9 }}>{ad.preview_url ? <a href={ad.preview_url} target="_blank" rel="noopener noreferrer" style={{ color:'inherit', textDecoration:'none' }} onMouseEnter={e=>(e.currentTarget.style.textDecoration='underline')} onMouseLeave={e=>(e.currentTarget.style.textDecoration='none')}>{ad.name}</a> : ad.name}</span>
                          </td>
                          {cols.map((c)=><CampCell key={c.k} v={val(ad,c.k)} />)}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CampEfficiencyFunnel({ campaigns }: { campaigns: Campaign[] }) {
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0)
  const clicks      = campaigns.reduce((s, c) => s + c.clicks, 0)
  const lpvs        = campaigns.reduce((s, c) => s + c.lpv, 0)
  const leads       = campaigns.reduce((s, c) => s + c.leads, 0)
  const mql         = campaigns.reduce((s, c) => s + c.mql, 0)

  const eligible    = campaigns.filter(c => c.lpv > 0)
  const eligLpv     = eligible.reduce((s, c) => s + c.lpv, 0)
  const eligClicks  = eligible.reduce((s, c) => s + c.clicks, 0)
  const connectRate = eligClicks > 0 ? eligLpv / eligClicks * 100 : null

  const stages = [
    { label: 'Impressões',    value: impressions },
    { label: 'Out. Clicks',   value: clicks },
    { label: 'Landing Pages', value: lpvs },
    { label: 'Leads',         value: leads },
    { label: 'MQL',           value: mql },
  ]
  const rates = [
    { label: 'CTR',          val: impressions > 0 ? (clicks / impressions * 100).toFixed(2) + '%' : '—' },
    { label: 'Connect Rate', val: connectRate !== null ? connectRate.toFixed(2) + '%' : '—' },
    { label: 'Conv. LP',     val: lpvs > 0 ? (leads / lpvs * 100).toFixed(2) + '%' : '—' },
    { label: 'Qualificação', val: leads > 0 ? (mql / leads * 100).toFixed(2) + '%' : '—' },
  ]

  const max = impressions || 1
  const logMax = Math.log(max + 1)
  return (
    <SCard>
      <CardTitle title="Funil de eficiência" sub="campanhas agregadas" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stages.map((s, i) => {
          const w = logMax > 0 ? Math.max(18, (Math.log(s.value + 1) / logMax) * 100) : 18
          const colorPct = Math.round(38 + 62 * (s.value / max))
          return (
            <div key={s.label}>
              {i > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0 3px 162px', color: 'var(--ws-text-secondary)', fontSize: 11.5 }}>
                  <span style={{ opacity: 0.45 }}>↓</span>
                  <span style={{ color: 'var(--brand-accent)', fontWeight: 600 }}>{rates[i - 1].label}</span>
                  <span style={{ opacity: 0.35 }}>·</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rates[i - 1].val}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 148, flex: '0 0 auto', fontSize: 12.5, color: 'var(--ws-text-secondary)', textAlign: 'right' }}>{s.label}</div>
                <div style={{ flex: 1, height: 32, background: 'var(--ws-bg)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ width: w + '%', height: '100%', background: `color-mix(in srgb, var(--brand-accent) ${colorPct}%, var(--brand-dark))`, borderRadius: 7, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(s.value)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SCard>
  )
}

function CampMatrix({ campaigns, selectedId, onSelect }: { campaigns: Campaign[]; selectedId?: string | null; onSelect?: (id: string | null) => void }) {
  const [tip, setTip] = useState<{ c: Campaign; cx: number; cy: number } | null>(null)
  const visible = campaigns.filter(c => c.mql > 0 && c.cpmql > 0)

  if (visible.length === 0) return (
    <SCard>
      <CardTitle title="Matriz de eficiência" sub="CP-MQL × Volume MQL" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem dados suficientes</div>
    </SCard>
  )

  const W = 480, H = 290
  const padL = 44, padR = 20, padT = 28, padB = 38
  const iw = W - padL - padR, ih = H - padT - padB

  const allCpmql = visible.map(c => c.cpmql)
  const allMql   = visible.map(c => c.mql)
  const minCpmql = Math.min(...allCpmql), maxCpmql = Math.max(...allCpmql)
  const maxMql   = Math.max(...allMql)
  const maxSpend = Math.max(...visible.map(c => c.spend))

  const xRange = maxCpmql - minCpmql || 1
  const xPad   = xRange * 0.18
  const xMin   = Math.max(0, minCpmql - xPad), xMax = maxCpmql + xPad
  const yMax   = maxMql * 1.22

  const sortedCp  = [...visible].sort((a, b) => a.cpmql - b.cpmql)
  const sortedMql = [...visible].sort((a, b) => a.mql - b.mql)
  const mid = (arr: Campaign[], key: 'cpmql' | 'mql') => {
    const mid = Math.floor((arr.length - 1) / 2)
    return arr.length % 2 === 0 ? (arr[mid][key] + arr[mid + 1][key]) / 2 : arr[mid][key]
  }
  const divCpmql = mid(sortedCp, 'cpmql')
  const divMql   = mid(sortedMql, 'mql')

  const xs = (v: number) => padL + ((v - xMin) / (xMax - xMin)) * iw
  const ys = (v: number) => padT + ih - (v / yMax) * ih
  const rs = (v: number) => 5 + Math.sqrt(v / maxSpend) * 14

  const xDiv = xs(divCpmql), yDiv = ys(divMql)

  const QUADS = [
    { x: padL, y: padT, w: xDiv - padL, h: yDiv - padT, color: '#16a34a', label: 'Escalar', ax: 'end', ay: 'top' },
    { x: xDiv, y: padT, w: padL + iw - xDiv, h: yDiv - padT, color: '#d97706', label: 'Testar escala', ax: 'start', ay: 'top' },
    { x: padL, y: yDiv, w: xDiv - padL, h: padT + ih - yDiv, color: '#2563eb', label: 'Otimizar', ax: 'end', ay: 'bottom' },
    { x: xDiv, y: yDiv, w: padL + iw - xDiv, h: padT + ih - yDiv, color: '#dc2626', label: 'Cortar/Revisar', ax: 'start', ay: 'bottom' },
  ]

  const fmtTick = (v: number) => v >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${Math.round(v)}`
  const xTicks = [xMin, (xMin + xMax) / 2, xMax]
  const yTicks = [0, Math.round(yMax / 2), Math.round(yMax)]

  return (
    <SCard>
      <CardTitle title="Matriz de eficiência" sub="CP-MQL × MQL · tamanho da bolha = investimento" />
      <div style={{ position: 'relative', overflow: 'visible' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible', display: 'block' }}>
          {/* Quadrant backgrounds + labels */}
          {QUADS.map(q => (
            <g key={q.label}>
              <rect x={q.x} y={q.y} width={Math.max(0, q.w)} height={Math.max(0, q.h)} fill={q.color} fillOpacity={0.07} />
              <text
                x={q.ax === 'end' ? q.x + q.w - 8 : q.x + 8}
                y={q.y + 14}
                fontSize={10} fontWeight={700} fill={q.color} fillOpacity={0.8}
                textAnchor={q.ax === 'end' ? 'end' : 'start'}
              >{q.label}</text>
            </g>
          ))}

          {/* Quadrant dividers */}
          <line x1={xDiv} y1={padT} x2={xDiv} y2={padT + ih} stroke="var(--ws-border-strong)" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={padL} y1={yDiv} x2={padL + iw} y2={yDiv} stroke="var(--ws-border-strong)" strokeWidth={1} strokeDasharray="4 3" />

          {/* Axis lines */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + ih} stroke="var(--ws-border)" strokeWidth={1} />
          <line x1={padL} y1={padT + ih} x2={padL + iw} y2={padT + ih} stroke="var(--ws-border)" strokeWidth={1} />

          {/* Horizontal gridlines */}
          {yTicks.slice(1).map((v, i) => (
            <line key={`hg${i}`} x1={padL} y1={ys(v)} x2={padL + iw} y2={ys(v)} stroke="var(--ws-border)" strokeWidth={0.5} strokeDasharray="2 4" />
          ))}

          {/* X axis ticks */}
          {xTicks.map((v, i) => (
            <g key={i}>
              <line x1={xs(v)} y1={padT + ih} x2={xs(v)} y2={padT + ih + 4} stroke="var(--ws-border)" strokeWidth={1} />
              <text x={xs(v)} y={padT + ih + 14} textAnchor="middle" fontSize={9} fill="var(--ws-text-secondary)">{fmtTick(v)}</text>
            </g>
          ))}

          {/* Y axis ticks */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL - 4} y1={ys(v)} x2={padL} y2={ys(v)} stroke="var(--ws-border)" strokeWidth={1} />
              <text x={padL - 7} y={ys(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--ws-text-secondary)">{v}</text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={padL + iw / 2} y={H - 3} textAnchor="middle" fontSize={9.5} fill="var(--ws-text-secondary)">← menor CP-MQL = mais eficiente →</text>
          <text x={padL - 36} y={padT + ih / 2} textAnchor="middle" fontSize={9.5} fill="var(--ws-text-secondary)" transform={`rotate(-90, ${padL - 36}, ${padT + ih / 2})`}>MQL</text>

          {/* Bubbles */}
          {visible.map(c => {
            const cx = xs(c.cpmql), cy = ys(c.mql), r = rs(c.spend)
            const isHov = tip?.c.id === c.id
            const isSel = selectedId === c.id
            const isDim = selectedId != null && !isSel
            return (
              <circle key={c.id} cx={cx} cy={cy} r={r}
                fill="var(--brand-accent)"
                fillOpacity={isDim ? 0.08 : (isSel || isHov ? 0.9 : 0.55)}
                stroke="var(--brand-accent)"
                strokeWidth={isSel ? 3.5 : (isHov ? 2.5 : 1.5)}
                strokeOpacity={isDim ? 0.2 : 1}
                style={{ cursor: 'pointer', transition: 'fill-opacity .12s, stroke-width .12s' }}
                onMouseEnter={() => setTip({ c, cx, cy })}
                onMouseLeave={() => setTip(null)}
                onClick={() => { setTip(null); onSelect?.(isSel ? null : c.id) }}
              />
            )
          })}

          {/* Native SVG tooltip */}
          {tip && (() => {
            const ttW = 154, ttPad = 9, ttH = 78
            const ttX = Math.min(tip.cx + 14, W - ttW - padR)
            const ttY = Math.max(tip.cy - ttH - 6, padT)
            const nameStr = tip.c.name.length > 26 ? tip.c.name.slice(0, 26) + '…' : tip.c.name
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={8}
                  fill="var(--ws-surface)" stroke="var(--ws-border)" strokeWidth={1}
                  style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.18))' }}
                />
                <text x={ttX + ttPad} y={ttY + 16} fontSize={11} fontWeight={700} fill="var(--ws-text-primary)">{nameStr}</text>
                <text x={ttX + ttPad}       y={ttY + 33} fontSize={10} fill="var(--ws-text-secondary)">CP-MQL</text>
                <text x={ttX + ttW - ttPad} y={ttY + 33} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--ws-text-primary)">{money(tip.c.cpmql)}</text>
                <text x={ttX + ttPad}       y={ttY + 48} fontSize={10} fill="var(--ws-text-secondary)">MQL</text>
                <text x={ttX + ttW - ttPad} y={ttY + 48} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--ws-text-primary)">{tip.c.mql}</text>
                <text x={ttX + ttPad}       y={ttY + 63} fontSize={10} fill="var(--ws-text-secondary)">Invest.</text>
                <text x={ttX + ttW - ttPad} y={ttY + 63} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--ws-text-primary)">{money(tip.c.spend)}</text>
              </g>
            )
          })()}
        </svg>
      </div>
    </SCard>
  )
}

interface WinnerCfg { value: string; label: string; money?: boolean; low?: boolean; pct?: boolean }
const WINNER: WinnerCfg[] = [
  { value:'cpmql', label:'CP-MQL', money:true, low:true },
  { value:'mql',   label:'MQL' },
  { value:'sql',   label:'SQL' },
  { value:'ctr',   label:'CTR',  pct:true },
]

function TopCampaigns({ campaigns }: { campaigns:Campaign[] }) {
  const [metric, setMetric] = useState<string>('mql')
  const cfg = WINNER.find(w => w.value === metric)!
  const key = metric as keyof Campaign
  const sorted = [...campaigns].sort((a, b) => {
    const av = Number(a[key] ?? 0)
    const bv = Number(b[key] ?? 0)
    return cfg.low ? av - bv : bv - av
  }).slice(0, 5)
  const max = Math.max(...sorted.map(c => Number(c[key] ?? 0)))
  const fmtV = (v: number) => cfg.money ? money(v) : cfg.pct ? v + '%' : fmt(v)
  return (
    <SCard>
      <CardTitle title="Top campanhas" sub={`Vencedor por ${cfg.label}${cfg.low ? ' (menor é melhor)' : ''}`} right={<MetricPicker options={WINNER.map(w=>({value:w.value,label:w.label}))} value={metric} onChange={setMetric} />} />
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {sorted.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ width:22, height:22, borderRadius:'50%', flex:'0 0 auto', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, background:i===0?'var(--brand-accent)':'var(--ws-bg)', color:i===0?'var(--brand-accent-contrast)':'var(--ws-text-secondary)' }}>{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.name}</span>
                <span style={{ fontSize:13, fontWeight:700, color:i===0?'var(--brand-accent)':'var(--ws-text-primary)', fontVariantNumeric:'tabular-nums' }}>{fmtV(Number(c[key] ?? 0))}</span>
              </div>
              <div style={{ height:8, borderRadius:999, background:'var(--ws-bg)', overflow:'hidden' }}>
                <div style={{ width:(cfg.low ? (Math.min(...sorted.map(s=>Number(s[key] ?? 0))) / Number(c[key] ?? 0)) * 100 : (Number(c[key] ?? 0) / max) * 100) + '%', height:'100%', background:i===0?'var(--brand-accent)':'color-mix(in srgb, var(--brand-accent) 45%, var(--ws-border-strong))' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SCard>
  )
}

// ── UTM table ─────────────────────────────────────────────────────────────────
const isCode = (v: string) => /^\d+$/.test(v.trim())

function resolveUtmValue(raw: string | null, knownNames: Set<string>): { display: string; isCode: boolean } {
  if (!raw) return { display: '—', isCode: false }
  const lower = raw.toLowerCase()
  if (knownNames.has(lower)) return { display: raw, isCode: false }
  if (isCode(raw)) return { display: raw, isCode: true }
  return { display: raw, isCode: false }
}

type UtmRow = { source: string; medium: string; campaign: string; content: string; campIsCode: boolean; contIsCode: boolean; count: number }

function MqlUtmTable({ leads, campaigns }: { leads: Lead[]; campaigns: Campaign[] }) {
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const knownCamp = useMemo(() => new Set(campaigns.map(c => c.name.toLowerCase())), [campaigns])
  const knownAd   = useMemo(() => new Set(campaigns.flatMap(c => c.adsets.flatMap(a => a.ads.map(ad => ad.name.toLowerCase())))), [campaigns])
  const knownSet  = useMemo(() => new Set(campaigns.flatMap(c => c.adsets.map(a => a.name.toLowerCase()))), [campaigns])
  const knownContent = useMemo(() => new Set([...knownAd, ...knownSet]), [knownAd, knownSet])

  const { withUtm, withoutUtm, rows } = useMemo(() => {
    const withUtm = leads.filter(l => l.utm_source || l.utm_campaign)
    const withoutUtm = leads.filter(l => !l.utm_source && !l.utm_campaign)
    const grouped = new Map<string, UtmRow>()

    for (const l of withUtm) {
      const srcRaw  = l.utm_source ?? ''
      const medRaw  = l.utm_medium ?? ''
      const campRaw = l.utm_campaign ?? ''
      const contRaw = typeof l.dados_extras?.['utm_content'] === 'string' ? (l.dados_extras['utm_content'] as string) : ''
      const key = `${srcRaw}|${medRaw}|${campRaw}|${contRaw}`
      if (grouped.has(key)) {
        grouped.get(key)!.count++
      } else {
        const campRes = resolveUtmValue(campRaw || null, knownCamp)
        const contRes = resolveUtmValue(contRaw || null, knownContent)
        grouped.set(key, {
          source: srcRaw || '—', medium: medRaw || '—',
          campaign: campRes.display, campIsCode: campRes.isCode,
          content:  contRes.display, contIsCode:  contRes.isCode,
          count: 1,
        })
      }
    }
    return { withUtm, withoutUtm, rows: [...grouped.values()] }
  }, [leads, knownCamp, knownContent])

  const sorted = [...rows].sort((a, b) => (b.count - a.count) * sortDir)
  const total  = leads.length
  const pctAtrib = total > 0 ? Math.round(withUtm.length / total * 100) : 0

  const codeBadge = (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '1px 5px', borderRadius: 4,
      background: 'color-mix(in srgb, var(--status-atencao) 15%, transparent)',
      color: 'var(--status-atencao)', marginLeft: 5, verticalAlign: 'middle', flexShrink: 0 }}>ID</span>
  )

  const thStyle: React.CSSProperties = {
    padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap', background: 'var(--ws-bg)',
    position: 'sticky', top: 0, zIndex: 1,
  }
  const tdStyle: React.CSSProperties = { padding: '9px 14px', fontSize: 12.5, verticalAlign: 'middle' }

  return (
    <SCard style={{ marginBottom: 24 }}>
      <CardTitle
        title="UTMs dos MQLs"
        sub="Atribuição dos leads qualificados por parâmetro UTM · utm_content = nome do anúncio ou conjunto conforme configuração"
      />

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Com UTM', value: withUtm.length, color: 'var(--status-positivo)' },
          { label: 'Sem UTM', value: withoutUtm.length, color: 'var(--status-risco)' },
          { label: 'Atribuição', value: `${pctAtrib}%`, color: 'var(--brand-accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 10,
            padding: '10px 18px', minWidth: 90,
          }}>
            <span style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{label}</span>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 160, alignSelf: 'center' }}>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--ws-border)', overflow: 'hidden' }}>
            <div style={{ width: `${pctAtrib}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 999, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            {withUtm.length} de {total} MQLs com rastreamento UTM
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhum MQL com UTM encontrado no período.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--ws-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr>
                <th style={thStyle}>Fonte</th>
                <th style={thStyle}>Meio</th>
                <th style={thStyle}>Campanha</th>
                <th style={thStyle}>Anúncio / Conjunto</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSortDir(d => d === -1 ? 1 : -1)}>
                  MQLs {sortDir === -1 ? '↓' : '↑'}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)', borderBottom: '1px solid var(--ws-border)' }}>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: r.source.toLowerCase().includes('facebook') || r.source.toLowerCase().includes('instagram') || r.source.toLowerCase().includes('meta') ? '#1877F2' : r.source.toLowerCase().includes('google') ? '#34A853' : 'var(--ws-text-secondary)' }} />
                      {r.source}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--ws-text-secondary)' }}>{r.medium}</td>
                  <td style={{ ...tdStyle, maxWidth: 260 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.campIsCode ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }} title={r.campaign}>{r.campaign}</span>
                      {r.campIsCode && codeBadge}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 240 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.contIsCode ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }} title={r.content}>{r.content}</span>
                      {r.contIsCode && codeBadge}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--brand-accent)' }}>{r.count}</td>
                </tr>
              ))}
              {withoutUtm.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--ws-border-strong)' }}>
                  <td colSpan={4} style={{ ...tdStyle, color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>Sem UTM — origem não rastreada</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--status-risco)' }}>{withoutUtm.length}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </SCard>
  )
}

// ── Campanhas ─────────────────────────────────────────────────────────────────
function SaudeCampanhas({ b: _b, campaigns, daily: _daily, dataInicio: _dataInicio, mqlLeads }: { b: BrandData; campaigns: Campaign[]; daily: ReturnType<typeof buildDailySeries>; dataInicio: string; mqlLeads: Lead[] }) {
  const [showPaused, setShowPaused] = useState(false)
  const [tableOpen, setTableOpen] = useState(true)
  const [on, setOn] = useState<Record<string,boolean>>(DEFAULT_ON)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const visible = campaigns.filter((c)=>showPaused||c.status==='ativa')
  const active = campaigns.filter((c)=>c.status==='ativa'); const paused = campaigns.length-active.length
  const tableVisible = selectedCampaignId ? visible.filter(c => c.id === selectedCampaignId) : visible
  const selectedCampaignName = selectedCampaignId ? campaigns.find(c => c.id === selectedCampaignId)?.name : null
  const agg = campaigns.reduce((a,c)=>({spend:a.spend+c.spend,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,mql:a.mql+c.mql,sql:a.sql+c.sql}),{spend:0,impressions:0,clicks:0,mql:0,sql:0})
  const cpm=agg.impressions>0?agg.spend/agg.impressions*1000:0
  const cpc=agg.clicks>0?agg.spend/agg.clicks:0
  const ctr=agg.impressions>0?agg.clicks/agg.impressions*100:0
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16, marginBottom:16 }}>
        <KTile label="Impressões" value={fmtK(agg.impressions)} />
        <KTile label="Cliques no link" value={fmtK(agg.clicks)} />
        <KTile label="Investimento" value={money(agg.spend)} />
        <KTile label="CPM" value={money2(cpm)} invert />
        <KTile label="CPC" value={money2(cpc)} invert />
        <KTile label="CTR" value={ctr.toFixed(2)+'%'} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <CampEfficiencyFunnel campaigns={campaigns} />
        <CampMatrix campaigns={active} selectedId={selectedCampaignId} onSelect={setSelectedCampaignId} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:24, alignItems:'start', marginBottom:24 }}>
        <SCard pad={0}>
          <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:18 }}>Campanhas</div>
              <div style={{ fontSize:12, color:'var(--ws-text-secondary)', marginTop:3 }}>{active.length} ativas · {paused} pausadas · clique para abrir conjuntos e anúncios</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <button onClick={()=>setShowPaused((v)=>!v)} style={campBtn(showPaused)}>{showPaused?'Ocultar pausadas':'Ver pausadas'}</button>
              <ColumnPicker on={on} setOn={setOn} />
              <button onClick={()=>setTableOpen((v)=>!v)} style={campBtn()}>{tableOpen?'Recolher −':'Expandir +'}</button>
            </div>
          </div>
          {tableOpen && (
            <div style={{ padding:'0 8px 12px' }}>
              {selectedCampaignName && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 8px 12px', fontSize:12 }}>
                  <span style={{ background:'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color:'var(--brand-accent)', padding:'3px 10px', borderRadius:999, fontWeight:600 }}>
                    {selectedCampaignName.length > 50 ? selectedCampaignName.slice(0,50)+'…' : selectedCampaignName}
                  </span>
                  <button onClick={()=>setSelectedCampaignId(null)} style={{ border:'1px solid var(--ws-border)', borderRadius:6, background:'transparent', cursor:'pointer', fontSize:11, fontWeight:600, color:'var(--ws-text-secondary)', padding:'2px 8px' }}>Limpar ×</button>
                </div>
              )}
              <CampaignTable campaigns={tableVisible} on={on} />
            </div>
          )}
        </SCard>
        <TopCampaigns campaigns={active} />
      </div>
      <MqlUtmTable leads={mqlLeads} campaigns={campaigns} />
    </div>
  )
}

// ── SaudeConjuntos ────────────────────────────────────────────────────────────
function SaudeConjuntos({ b: _b, campaigns }: { b: BrandData; campaigns: Campaign[] }) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null)
  const sets: any[] = []; campaigns.forEach((cp)=>cp.adsets.forEach((as)=>sets.push({...as,campaign:cp.name})))
  const cols: Col[] = [
    { k:'name', h:'Conjunto' },
    { k:'spend', h:'Investimento', num:true, fmt:money }, { k:'impressions', h:'Impressões', num:true, fmt:fmtK },
    { k:'ctr', h:'CTR', num:true, fmt:(v)=>v+'%' }, { k:'cpm', h:'CPM', num:true, fmt:money2 },
    { k:'mql', h:'MQL', num:true, fmt:fmt }, { k:'sql', h:'SQL', num:true, fmt:fmt },
    { k:'cpmql', h:'CP-MQL', num:true, fmt:money },
  ]
  const scatterPts = sets.filter(s=>s.mql>0).map((s)=>({ x:s.cpmql, y:s.mql, size:s.spend, label:s.name.split(' ')[0], id:s.id }))
  const totSpend=sets.reduce((a,s)=>a+s.spend,0), totMql=sets.reduce((a,s)=>a+s.mql,0)
  const tableRows = selectedSetId ? sets.filter(s => s.id === selectedSetId) : sets
  const selectedSetName = selectedSetId ? sets.find(s => s.id === selectedSetId)?.name : null
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KTile label="Conjuntos ativos" value={fmt(sets.length)} />
        <KTile label="Investimento" value={money(totSpend)} />
        <KTile label="MQLs" value={fmt(totMql)} />
        <KTile label="CP-MQL médio" value={money(totSpend/Math.max(1,totMql))} invert />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:24 }}>
        <SCard>
          <CardTitle title="Comparativo de públicos" sub="Eixo X: CP-MQL · Y: MQL · tamanho: investimento · clique para filtrar" />
          <Scatter points={scatterPts} xLabel="CP-MQL" yLabel="MQL" selectedId={selectedSetId} onSelect={setSelectedSetId} />
        </SCard>
        <SCard pad={0}>
          <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <CardTitle title="Conjuntos de anúncios" sub="Ordene clicando no cabeçalho" />
            {selectedSetName && (
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                <span style={{ background:'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color:'var(--brand-accent)', padding:'3px 10px', borderRadius:999, fontWeight:600 }}>
                  {selectedSetName.length > 50 ? selectedSetName.slice(0,50)+'…' : selectedSetName}
                </span>
                <button onClick={()=>setSelectedSetId(null)} style={{ border:'1px solid var(--ws-border)', borderRadius:6, background:'transparent', cursor:'pointer', fontSize:11, fontWeight:600, color:'var(--ws-text-secondary)', padding:'2px 8px' }}>Limpar ×</button>
              </div>
            )}
          </div>
          <div style={{ padding:'0 8px 12px' }}><SimpleTable columns={cols} rows={tableRows} keyField="id" /></div>
        </SCard>
      </div>
    </div>
  )
}

// ── SaudeAnuncios ─────────────────────────────────────────────────────────────
function SaudeAnuncios({ b: _b, campaigns }: { b: BrandData; campaigns: Campaign[] }) {
  const ads: any[] = []
  campaigns.forEach((cp)=>cp.adsets.forEach((as)=>as.ads.forEach((ad)=>ads.push({...ad,campaign:cp.name,conjunto:as.name}))))
  const cols: Col[] = [
    { k:'name', h:'Anúncio', render:(r)=>(
      <span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
        <span>
          <span style={{ fontWeight:500 }}>{r.preview_url ? <a href={r.preview_url} target="_blank" rel="noopener noreferrer" style={{ color:'inherit', textDecoration:'none' }} onMouseEnter={e=>(e.currentTarget.style.textDecoration='underline')} onMouseLeave={e=>(e.currentTarget.style.textDecoration='none')}>{r.name}</a> : r.name}</span>
          <br /><span style={{ fontSize:11, color:'var(--ws-text-secondary)' }}>{r.conjunto}</span>
        </span>
      </span>
    )},
    { k:'spend', h:'Investimento', num:true, fmt:money }, { k:'impressions', h:'Impressões', num:true, fmt:fmtK },
    { k:'clicks', h:'Cliques', num:true, fmt:fmt }, { k:'ctr', h:'CTR', num:true, fmt:(v)=>v+'%' },
    { k:'mql', h:'MQL', num:true, fmt:fmt }, { k:'cpmql', h:'CP-MQL', num:true, fmt:money },
  ]
  const totSpend=ads.reduce((a,x)=>a+x.spend,0), totMql=ads.reduce((a,x)=>a+x.mql,0)
  const totClicks=ads.reduce((a,x)=>a+x.clicks,0), totImp=ads.reduce((a,x)=>a+x.impressions,0)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KTile label="Anúncios ativos" value={fmt(ads.length)} />
        <KTile label="Investimento" value={money(totSpend)} />
        <KTile label="CTR médio" value={(totImp>0?totClicks/totImp*100:0).toFixed(2)+'%'} />
        <KTile label="CP-MQL médio" value={money(totSpend/Math.max(1,totMql))} invert />
      </div>
      <SCard pad={0}>
        <div style={{ padding:'18px 20px' }}><CardTitle title="Anúncios" sub="Todos os anúncios ativos · ordene pelo cabeçalho" /></div>
        <div style={{ padding:'0 8px 12px' }}><SimpleTable columns={cols} rows={ads} keyField="id" /></div>
      </SCard>
    </div>
  )
}


// ── SaudeRadar ────────────────────────────────────────────────────────────────
const RADAR_AXES = [
  { key:'alcance',     label:'Alcance' },
  { key:'volume',      label:'Volume (MQL)' },
  { key:'qualidade',   label:'Qualidade' },
  { key:'eficiencia',  label:'Eficiência' },
  { key:'engajamento', label:'Engajamento' },
  { key:'fechamento',  label:'Fechamento' },
]

function normScore(v: number, lo: number, hi: number) { return Math.max(0, Math.min(100, ((v-lo)/(hi-lo||1))*100)) }

function baseScores(b: BrandData) {
  return {
    alcance:     normScore(b.invest, 3000, 18000),
    volume:      normScore(b.mql, 0, 130),
    qualidade:   Math.min(100, (b.sql / Math.max(1, b.mql)) * 230),
    eficiencia:  normScore(-b.cpmql, -450, -40),
    engajamento: 45 + (b.mql % 40),
    fechamento:  Math.min(100, b.meta * 0.8),
  }
}

function simulateScores(base: Record<string,number>, lv: {invest:number;criativo:number;publico:number}) {
  const inv=lv.invest, cr=lv.criativo-50, pu=lv.publico-50; const s={...base}
  s.alcance     += inv*0.55 - pu*0.18
  s.volume      += inv*0.45*(1-base.volume/220) + cr*0.12
  s.qualidade   += pu*0.42 + cr*0.22
  s.eficiencia  += cr*0.24 + pu*0.16 - inv*0.22
  s.engajamento += cr*0.5 + pu*0.08
  s.fechamento  += inv*0.12 + pu*0.2 + cr*0.1
  Object.keys(s).forEach((k)=>{ s[k]=Math.max(0,Math.min(100,s[k])) }); return s
}

function RadarSlider({ label, hint, min, max, value, onChange, fmtV }: { label:string; hint:string; min:number; max:number; value:number; onChange:(v:number)=>void; fmtV:(v:number)=>string }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
        <span style={{ fontSize:13, fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--brand-accent)', fontVariantNumeric:'tabular-nums' }}>{fmtV(value)}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e)=>onChange(+e.target.value)} style={{ width:'100%', accentColor:'var(--brand-accent)' }} />
      <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)', marginTop:3 }}>{hint}</div>
    </div>
  )
}

function DeltaRow({ label, base, value, fmtV, invert }: { label:string; base:number; value:number; fmtV:(v:number)=>string; invert?:boolean }) {
  const d=value-base; const up=d>=0; const good=invert?!up:up; const flat=Math.abs(d)<0.01
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderTop:'1px solid var(--ws-border)' }}>
      <span style={{ fontSize:13 }}>{label}</span>
      <span style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmtV(value)}</span>
        <span style={{ fontSize:12, fontWeight:600, minWidth:58, textAlign:'right', color:flat?'var(--ws-text-secondary)':good?'var(--status-positivo)':'var(--status-risco)', fontVariantNumeric:'tabular-nums' }}>
          {flat?'—':(up?'▲ ':'▼ ')+fmtV(Math.abs(d))}
        </span>
      </span>
    </div>
  )
}

function SaudeRadar({ b }: { b: BrandData }) {
  const [lv, setLv] = useState({ invest:0, criativo:50, publico:50 })
  const set=(k: string)=>(v: number)=>setLv((s)=>({...s,[k]:v}))
  const base = baseScores(b); const sim = simulateScores(base, lv)
  const changed = lv.invest!==0 || lv.criativo!==50 || lv.publico!==50
  const series = [
    { label:'Atual', color:'var(--ws-border-strong)', fill:'color-mix(in srgb, var(--ws-text-secondary) 14%, transparent)', values:base },
    ...(changed?[{ label:'Simulado', color:'var(--brand-accent)', fill:'color-mix(in srgb, var(--brand-accent) 20%, transparent)', values:sim }]:[]),
  ]
  const ratio=(k: string)=>{ const b=base as Record<string,number>; const s=sim as Record<string,number>; return b[k]===0?1:s[k]/b[k] }
  const projInvest=Math.round(b.invest*(1+lv.invest/100)); const projMql=Math.round(b.mql*ratio('volume'))
  const projSql=Math.round(b.sql*ratio('volume')*ratio('qualidade')); const projCpmql=Math.round(b.cpmql*(base.eficiencia/(sim.eficiencia||1)))
  const projCpsql=Math.round(b.cpsql*(base.eficiencia/(sim.eficiencia||1))/(ratio('qualidade')||1))
  const sqlGrowth=projSql/b.sql-1; const investGrowth=lv.invest/100; const viable=sqlGrowth>=investGrowth-0.001
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ padding:'10px 14px', borderRadius:12, background:'var(--status-atencao-bg, #fef7e6)', border:'1px solid var(--status-atencao, #F2A93B)', fontSize:12, lineHeight:1.5 }}>
        <b>Modelo em beta — estimativa heurística.</b> Os scores do radar são calculados a partir de faixas de referência (investimento, MQL, SQL) e não refletem dados reais de qualidade de criativo/público. Use como ferramenta de simulação de cenários, não como diagnóstico definitivo.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:24, alignItems:'start' }}>
      <SCard>
        <CardTitle
          title="Radar da marca · Beta"
          sub="Forças, fraquezas e oportunidades — arraste as alavancas para simular"
          right={changed?<button onClick={()=>setLv({invest:0,criativo:50,publico:50})} style={{ border:'1px solid var(--ws-border-strong)', background:'var(--ws-surface)', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--ws-text-secondary)' }}>Redefinir</button>:null}
        />
        <div style={{ display:'flex', justifyContent:'center' }}><RadarChartSVG axes={RADAR_AXES} series={series} size={360} /></div>
        <div style={{ display:'flex', justifyContent:'center', gap:18, marginTop:8, fontSize:12, color:'var(--ws-text-secondary)' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:12, height:3, background:'var(--ws-border-strong)' }} />Atual</span>
          {changed && <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:12, height:3, background:'var(--brand-accent)' }} />Simulado</span>}
        </div>
      </SCard>
      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        <SCard>
          <CardTitle title="Alavancas" sub="Ajuste os cenários e avalie o impacto" />
          <RadarSlider label="Investimento" hint="variação de verba vs. atual" min={-30} max={80} value={lv.invest} onChange={set('invest')} fmtV={(v)=>(v>0?'+':'')+v+'%'} />
          <RadarSlider label="Otimização criativa" hint="qualidade e teste de criativos" min={0} max={100} value={lv.criativo} onChange={set('criativo')} fmtV={(v)=>String(v)} />
          <RadarSlider label="Qualificação de público" hint="segmentação e intenção" min={0} max={100} value={lv.publico} onChange={set('publico')} fmtV={(v)=>String(v)} />
        </SCard>
        <SCard>
          <CardTitle title="Projeção" sub={changed?'Estimativa vs. mês atual':'Mova as alavancas para projetar'} />
          <DeltaRow label="Investimento" base={b.invest} value={projInvest} fmtV={money} />
          <DeltaRow label="MQLs" base={b.mql} value={projMql} fmtV={fmt} />
          <DeltaRow label="SQLs" base={b.sql} value={projSql} fmtV={fmt} />
          <DeltaRow label="CP-MQL" base={b.cpmql} value={projCpmql} fmtV={money} invert />
          <DeltaRow label="CP-SQL" base={b.cpsql} value={projCpsql} fmtV={money} invert />
          {changed && <div style={{ marginTop:14, padding:'12px 14px', borderRadius:12, background:viable?'var(--status-positivo-bg)':'var(--status-atencao-bg)', border:`1px solid ${viable?'var(--status-positivo)':'var(--status-atencao)'}`, fontSize:13 }}>
            <b>{viable?'Cenário viável':'Atenção'}</b> — SQLs {sqlGrowth>=0?'crescem':'caem'} {Math.abs(sqlGrowth*100).toFixed(0)}% {lv.invest!==0?`com ${lv.invest>0?'+':''}${lv.invest}% de verba`:'sem verba adicional'}. {viable?'Retorno acompanha o investimento.':'O ganho de SQL não cobre o aumento de verba — reavalie criativo/público antes de escalar.'}
          </div>}
        </SCard>
      </div>
      </div>
    </div>
  )
}

// ── SMOverview ────────────────────────────────────────────────────────────────
function SMSparkline({ data }: { data:number[] }) {
  const W=120, H=34, max=Math.max(...data), min=Math.min(...data)
  const x=(i:number)=>(i/(data.length-1))*W; const y=(v:number)=>4+(H-8)-((v-min)/(max-min||1))*(H-8)
  const d=data.map((v,i)=>`${i?'L':'M'} ${x(i)} ${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--brand-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length-1)} cy={y(data[data.length-1])} r="3" fill="var(--brand-accent)" />
    </svg>
  )
}

function ChannelRow({ c }: { c:{name:string;mql:number;cpmql:number;trend:number[]} }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.2fr 0.7fr 0.7fr 1fr', gap:12, alignItems:'center', padding:'13px 0', borderTop:'1px solid var(--ws-border)' }}>
      <div style={{ fontWeight:500, fontSize:14 }}>{c.name}</div>
      <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{c.mql} <span style={{ color:'var(--ws-text-secondary)', fontSize:12 }}>MQL</span></div>
      <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>R$ {c.cpmql}</div>
      <div style={{ height:34 }}><SMSparkline data={c.trend} /></div>
    </div>
  )
}

const CHANNEL_SOURCES: Record<string, string[]> = {
  'Meta Ads':   ['facebook', 'instagram', 'meta', 'ig', 'fb'],
  'Google Ads': ['google', 'adwords', 'google-ads'],
}

function filterLeadsByChannel(leads: Lead[], channelName: string): Lead[] {
  const sources = CHANNEL_SOURCES[channelName]
  if (!sources) return leads
  return leads.filter(l => {
    const s = (l.utm_source ?? '').toLowerCase()
    return sources.some(src => s.includes(src))
  })
}

function SharePie({ title, slices, costLabel, onSliceClick }: { title:string; slices:{label:string;value:number;color:string;cost:string}[]; costLabel:string; onSliceClick?: (label: string) => void }) {
  const total=slices.reduce((a,s)=>a+s.value,0)
  return (
    <SCard>
      <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:15, marginBottom:12 }}>{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:18 }}>
        <Donut slices={slices} size={130} />
        <div style={{ flex:1, minWidth:0 }}>
          {slices.map((s)=>(
            <div key={s.label} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8, alignItems:'center', padding:'5px 0', fontSize:12.5, borderTop:'1px solid var(--ws-border)' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:7, minWidth:0 }}>
                <span style={{ width:10, height:10, borderRadius:3, background:s.color, flex:'0 0 auto' }} />
                <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span>
              </span>
              <span
                onClick={onSliceClick ? () => onSliceClick(s.label) : undefined}
                style={{ fontWeight:700, fontVariantNumeric:'tabular-nums', color:'var(--ws-text-primary)', cursor: onSliceClick ? 'pointer' : undefined, textDecoration: onSliceClick ? 'underline dotted' : undefined }}
                title={onSliceClick ? 'Ver leads' : undefined}
              >{fmt(s.value)}</span>
              <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--ws-text-secondary)' }}>{Math.round(s.value/total*100)}%</span>
              <span style={{ color:'var(--ws-text-secondary)', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{costLabel} {s.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </SCard>
  )
}

function ChannelShare({ channels, onMqlClick }: { channels:{name:string;mql:number;sql:number;cpmql:number;trend:number[]}[]; onMqlClick?: (channelName: string) => void }) {
  const mqlSlices=channels.map((c,i)=>({ label:c.name, value:c.mql, color:CH_COLORS[i%CH_COLORS.length], cost:money(c.cpmql) }))
  const sqlSlices=channels.filter(c=>c.sql>0).map((c,i)=>{ const invest=c.mql*c.cpmql; return { label:c.name, value:c.sql, color:CH_COLORS[i%CH_COLORS.length], cost:money(c.sql>0?Math.round(invest/c.sql):0) } })
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop:24 }}>
      <SharePie title="Share de MQL por canal" slices={mqlSlices} costLabel="CP-MQL" onSliceClick={onMqlClick} />
      <SharePie title="Share de SQL por canal" slices={sqlSlices} costLabel="CP-SQL" />
    </div>
  )
}

function DeltaChip({ delta, label, invert = false }: { delta: number | null; label: string; invert?: boolean }) {
  if (delta == null) return null
  const up = delta >= 0
  const good = invert ? !up : up
  const color = delta === 0 ? 'var(--ws-text-secondary)' : good ? 'var(--status-positivo)' : 'var(--status-risco)'
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, color, marginTop:4 }}>
      <span style={{ fontSize:10 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(delta).toFixed(1)}%
      <span style={{ color:'var(--ws-text-secondary)', fontWeight:400, marginLeft:2 }}>{label}</span>
    </div>
  )
}

interface PausedData { rows: MediaDailyRaw[]; spend: number; impr: number; clicks: number; campanhas: string[] }
function SMOverview({ b, bCompare, compareLabel, compareEnabled, channels, acqFunnel, onMqlClick, mqlLeads, crmData, crmAllData, di, df, mediaData, leadsData, pausedData }: { b: BrandData; bCompare: BrandData | null; compareLabel: string; compareEnabled: boolean; channels: ReturnType<typeof buildChannels>; acqFunnel: ReturnType<typeof buildAcqFunnel>; onMqlClick?: () => void; mqlLeads: Lead[]; crmData: VwMarketingFunil[]; crmAllData: VwMarketingFunil[]; di: string; df: string; mediaData: MediaDailyRaw[]; leadsData: Lead[]; pausedData?: PausedData }) {
  const [channelDrawer, setChannelDrawer] = useState<{ open: boolean; leads: Lead[] }>({ open: false, leads: [] })
  const funnelData=acqFunnel.stages.map((s)=>({ ...s, fmt:fmtK }))
  const losses = useMemo(() => computeFunnelLosses(crmData, di, df), [crmData, di, df])
  const valorTotal = useMemo(() => crmAllData.filter(r => r.status_atual !== 'Excluído' && r.status_atual === 'Ganho' && inPeriod(r.data_venda, di, df)).reduce((s, r) => s + (r.valor_contrato ?? 0), 0), [crmAllData, di, df])

  const dInvest = bCompare ? computeDeltaPct(b.invest, bCompare.invest) : null
  const dLeads  = bCompare ? computeDeltaPct(b.leads,  bCompare.leads)  : null
  const dMql    = bCompare ? computeDeltaPct(b.mql,    bCompare.mql)    : null
  const dSql    = bCompare ? computeDeltaPct(b.sql,    bCompare.sql)    : null
  const curConv  = b.mql > 0 ? (b.sql / b.mql) * 100 : 0
  const prevConv = bCompare && bCompare.mql > 0 ? (bCompare.sql / bCompare.mql) * 100 : 0
  const dConv   = bCompare ? computeDeltaPct(curConv, prevConv) : null
  const deltaLbl = `vs. ${compareLabel}`

  function handleChannelMqlClick(channelName: string) {
    setChannelDrawer({ open: true, leads: filterLeadsByChannel(mqlLeads, channelName) })
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:16, marginBottom:24 }}>
        <div style={{ background:'var(--ws-surface)', border:'1px solid var(--ws-border)', borderRadius:12, boxShadow:'var(--shadow-sm)', padding:'16px 18px' }}>
          <div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', fontWeight:500 }}>Investimento</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:24, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{money(b.invest)}</div>
          {compareEnabled && <DeltaChip delta={dInvest} label={deltaLbl} />}
          {b.investMetaVal > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ws-text-secondary)', marginBottom:4 }}>
                <span>Pacing</span><span style={{ fontWeight:600, color:b.investMetaPct>=85?'var(--status-positivo)':b.investMetaPct>=60?'var(--status-atencao)':'var(--status-risco)' }}>{b.investMetaPct}%</span>
              </div>
              <div style={{ height:4, borderRadius:2, background:'var(--ws-border)' }}>
                <div style={{ width:`${Math.min(100,b.investMetaPct)}%`, height:'100%', borderRadius:2, background:'var(--brand-accent)', transition:'width .4s ease' }} />
              </div>
            </div>
          )}
        </div>
        <MetricCard style={{ '--fs-metric': '26px' } as CSSProperties & Record<'--fs-metric', string>} label="Leads" value={b.leads} delta={compareEnabled ? dLeads : null} deltaLabel={compareEnabled ? deltaLbl : undefined} />
        <div
          onClick={onMqlClick}
          onMouseEnter={onMqlClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-accent)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 1px var(--brand-accent)' } : undefined}
          onMouseLeave={onMqlClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '' } : undefined}
          style={{ background:'var(--ws-surface)', border:'1px solid var(--ws-border)', borderRadius:12, boxShadow:'var(--shadow-sm)', padding:'16px 18px', cursor: onMqlClick ? 'pointer' : undefined, transition:'border-color .15s, box-shadow .15s' }}>
          <div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', fontWeight:500 }}>MQLs</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:26, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{fmt(b.mql)}</div>
          <DeltaChip delta={dMql} label={deltaLbl} />
          <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)', marginTop:4 }}>CP-MQL: <b style={{ color:'var(--ws-text-primary)', fontVariantNumeric:'tabular-nums' }}>{money(b.cpmql)}</b></div>
          {b.mqlMetaVal > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ws-text-secondary)', marginBottom:4 }}>
                <span>Meta: {fmt(b.mqlMetaVal)}</span><span style={{ fontWeight:600, color:b.meta>=85?'var(--status-positivo)':b.meta>=60?'var(--status-atencao)':'var(--status-risco)' }}>{b.meta}%</span>
              </div>
              <div style={{ height:4, borderRadius:2, background:'var(--ws-border)' }}>
                <div style={{ width:`${Math.min(100,b.meta)}%`, height:'100%', borderRadius:2, background:'var(--brand-accent)', transition:'width .4s ease' }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ background:'var(--ws-surface)', border:'1px solid var(--ws-border)', borderRadius:12, boxShadow:'var(--shadow-sm)', padding:'16px 18px' }}>
          <div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', fontWeight:500 }}>SQLs</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:26, marginTop:4, fontVariantNumeric:'tabular-nums' }}>{fmt(b.sql)}</div>
          {compareEnabled && <DeltaChip delta={dSql} label={deltaLbl} />}
          <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)', marginTop:6 }}>CP-SQL: <b style={{ color:'var(--ws-text-primary)', fontVariantNumeric:'tabular-nums' }}>{money(b.cpsql)}</b></div>
          {losses.perdido.sql > 0 && (
            <div style={{ fontSize:11.5, color:'var(--status-risco)', marginTop:4, opacity:0.85 }}>{fmt(losses.perdido.sql)} perdidos</div>
          )}
        </div>
        <MetricCard style={{ '--fs-metric': '26px' } as CSSProperties & Record<'--fs-metric', string>} label="Conv. MQL→SQL" value={b.mql > 0 ? Math.round(b.sql / b.mql * 100) : 0} unit="%" accent={false} delta={compareEnabled ? dConv : null} deltaLabel={compareEnabled ? deltaLbl : undefined} />
      </div>

      {pausedData && pausedData.spend > 0 && (
        <div style={{ marginBottom:24, padding:'14px 18px', background:'color-mix(in srgb, var(--status-atencao) 8%, var(--ws-surface))', border:'1px dashed color-mix(in srgb, var(--status-atencao) 40%, var(--ws-border))', borderRadius:12 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
            <div style={{ fontSize:22 }}>⏸️</div>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:600, color:'var(--ws-text-primary)' }}>
                Estratégias descontinuadas
              </div>
              <div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', marginTop:2 }}>
                Gasto residual de campanhas pausadas no período — não somado nas frentes ativas
              </div>
              <div style={{ marginTop:6, fontSize:12, color:'var(--ws-text-secondary)' }}>
                {pausedData.campanhas.join(' · ')}
              </div>
            </div>
            <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, color:'var(--ws-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Gasto</div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:20, fontVariantNumeric:'tabular-nums', color:'var(--ws-text-primary)' }}>{money(pausedData.spend)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, color:'var(--ws-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Impressões</div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:16, fontVariantNumeric:'tabular-nums', color:'var(--ws-text-secondary)' }}>{fmtK(pausedData.impr)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, color:'var(--ws-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Cliques</div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:16, fontVariantNumeric:'tabular-nums', color:'var(--ws-text-secondary)' }}>{fmt(pausedData.clicks)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:24 }}>
        <SCard>
          <CardTitle title="Funil de aquisição" sub="Do clique em mídia ao lead qualificado" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10, marginBottom:18 }}>
            {acqFunnel.cards.map((c)=>(
              <div key={c.label} style={{ background:'color-mix(in srgb, var(--brand-accent) 8%, var(--ws-surface))', border:'1px solid color-mix(in srgb, var(--brand-accent) 22%, var(--ws-border))', borderRadius:12, padding:'10px 13px' }}>
                <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)' }}>{c.label}</div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:18, marginTop:2 }}>{c.value}</div>
              </div>
            ))}
          </div>
          <MiniFunnel stages={funnelData} />
        </SCard>
        <SCard>
          <CardTitle
            title="Distribuição de leads por etapa e aging"
            sub="Quantidade de oportunidades abertas em cada etapa do funil"
          />
          <BubbleMatrix crmAllData={crmAllData} />
        </SCard>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.25fr 1fr', gap:24, marginBottom:24 }}>
        <SCard>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:14 }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:21, color:'var(--ws-text-primary)' }}>
              Desempenho por canal
            </div>
            <Badge tone="neutral">CP-MQL</Badge>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1.2fr 0.7fr 0.7fr 1fr', gap:12, fontSize:12, color:'var(--ws-text-secondary)', fontWeight:500, paddingBottom:4 }}>
            <div>Canal</div><div style={{ textAlign:'right' }}>Volume</div><div style={{ textAlign:'right' }}>Custo</div><div style={{ textAlign:'right' }}>Tendência</div>
          </div>
          {channels.map((c)=><ChannelRow key={c.name} c={c} />)}
        </SCard>

        <SCard>
          <CardTitle title="Funil da marca" sub="Conversão MQL → SQL → Diagnóstico → SAL" />
          <MiniFunnel stages={[
            { label:'MQL',        value:b.mql, perdido:losses.perdido.mql },
            { label:'SQL',        value:b.sql, perdido:losses.perdido.sql },
            { label:'Diagnóstico',value:b.diagnostico, perdido:losses.perdido.diagnostico },
            { label:'SAL',        value:b.sal, perdido:losses.perdido.sal },
          ]} />
          {valorTotal > 0 && (
            <div style={{ marginTop:14, paddingTop:10, borderTop:'1px solid var(--ws-border)', fontSize:12, color:'var(--ws-text-secondary)' }}>
              Valor total acumulado (incluindo perdidos e fechamentos):{' '}
              <b style={{ color:'var(--ws-text-primary)', fontVariantNumeric:'tabular-nums' }}>{money(valorTotal)}</b>
            </div>
          )}
        </SCard>
      </div>

      <ChannelShare channels={channels} onMqlClick={handleChannelMqlClick} />

      <SCard style={{ marginTop:24 }}>
        <CardTitle
          title="Evolução temporal"
          sub="Compare até 7 métricas de mídia e funil ao longo do tempo"
        />
        <MetricSeriesChart media={mediaData} leads={leadsData} />
      </SCard>

      <MqlDrawer open={channelDrawer.open} onClose={() => setChannelDrawer(d => ({ ...d, open: false }))} leads={channelDrawer.leads} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SaudeDaMarca() {
  const { activeBrand } = useMarcaSelecionada()
  const [view, setView] = useState('overview')
  const [range, setRange] = useState(makeMtd)
  const [filterFonte, setFilterFonte] = useState('__all__')
  const [ouSubView, setOuSubView] = useState<OuSubView>('geral')
  const [inpSubView, setInpSubView] = useState<InpSubView>('geral')

  const isOralUnic = activeBrand === 'oral-unic'
  const isInpot    = activeBrand === 'inpot'

  // Reset sub-view when brand changes
  useEffect(() => { setOuSubView('geral'); setInpSubView('geral') }, [activeBrand])

  const [compareState, setCompareState] = useState<{ enabled: boolean; compareRange: DateRange | null }>({ enabled: false, compareRange: null })
  const effectiveCompareRange = useMemo<DateRange>(
    () => compareState.compareRange ?? previousMonthSameRange(range),
    [compareState.compareRange, range],
  )

  const dataInicio = range.start
  const dataFim    = range.end
  const cmpInicio  = effectiveCompareRange.start
  const cmpFim     = effectiveCompareRange.end
  const mes        = useMemo(() => `${range.start.slice(0, 7)}-01`, [range.start])
  const marca      = SLUG_TO_MARCA[activeBrand]

  const { data: mediaData,   loading: mediaLoading, error: mediaError  } = useMediaData({ marca, dataInicio, dataFim })
  const { data: crmRaw,     loading: crmLoading,   error: crmError    } = useVendasFunil({ marca, dataInicio, dataFim })
  const { data: crmAllRaw }                                              = useVendasFunil({ marca })
  const { data: leadsData,  loading: leadsLoading, error: leadsError  } = useLeads({ marca, dataInicio, dataFim })
  const { data: metasData,  error: metasError }                          = useMetas({ marca, mes })

  // Dados do período de comparação (só para os big numbers da aba "Visão Geral")
  const { data: mediaCompareRaw } = useMediaData({ marca, dataInicio: cmpInicio, dataFim: cmpFim })
  const { data: crmCompareRaw }   = useVendasFunil({ marca, dataInicio: cmpInicio, dataFim: cmpFim })
  const { data: leadsCompareRaw } = useLeads({ marca, dataInicio: cmpInicio, dataFim: cmpFim })

  // Dados adicionais Odonto Scale — usados pela sub-view Odonto Legacy do Oral Unic
  // (leads/CRM continuam sob marca 'Odonto Scale' no banco de vendas; mídia histórica também)
  const { data: osLeadsRaw }        = useLeads({ marca: 'Odonto Scale', dataInicio, dataFim })
  const { data: osLeadsCompareRaw } = useLeads({ marca: 'Odonto Scale', dataInicio: cmpInicio, dataFim: cmpFim })
  const { data: osCrmRaw }          = useVendasFunil({ marca: 'Odonto Scale', dataInicio, dataFim })
  const { data: osCrmAllRaw }       = useVendasFunil({ marca: 'Odonto Scale' })
  const { data: osCrmCompareRaw }   = useVendasFunil({ marca: 'Odonto Scale', dataInicio: cmpInicio, dataFim: cmpFim })
  const { data: osMediaRaw }        = useMediaData({ marca: 'Odonto Scale', dataInicio, dataFim })
  const { data: osMediaCompareRaw } = useMediaData({ marca: 'Odonto Scale', dataInicio: cmpInicio, dataFim: cmpFim })

  const isOdontoLegacy = isOralUnic && ouSubView === 'odonto_legacy'

  const crmData    = useMemo(() => {
    let base = isOdontoLegacy ? osCrmRaw : crmRaw
    if (isInpot && inpSubView === 'evento')   base = base.filter(isCrmEventoInpot)
    if (isInpot && inpSubView === 'franquia') base = base.filter(r => !isCrmEventoInpot(r))
    return filterFonte === '__all__' ? base : base.filter(r => mapFonte(r.fonte) === filterFonte)
  }, [crmRaw, osCrmRaw, isOdontoLegacy, isInpot, inpSubView, filterFonte])
  const crmAllData = useMemo(() => {
    let base = isOdontoLegacy ? osCrmAllRaw : crmAllRaw
    if (isInpot && inpSubView === 'evento')   base = base.filter(isCrmEventoInpot)
    if (isInpot && inpSubView === 'franquia') base = base.filter(r => !isCrmEventoInpot(r))
    return filterFonte === '__all__' ? base : base.filter(r => mapFonte(r.fonte) === filterFonte)
  }, [crmAllRaw, osCrmAllRaw, isOdontoLegacy, isInpot, inpSubView, filterFonte])
  const crmCompare = useMemo(() => {
    let base = isOdontoLegacy ? osCrmCompareRaw : crmCompareRaw
    if (isInpot && inpSubView === 'evento')   base = base.filter(isCrmEventoInpot)
    if (isInpot && inpSubView === 'franquia') base = base.filter(r => !isCrmEventoInpot(r))
    return filterFonte === '__all__' ? base : base.filter(r => mapFonte(r.fonte) === filterFonte)
  }, [crmCompareRaw, osCrmCompareRaw, isOdontoLegacy, isInpot, inpSubView, filterFonte])

  // Filtered data per Oral Unic sub-view
  const activeLeadsData = useMemo(() => {
    if (isInpot && inpSubView === 'evento')   return leadsData.filter(isLeadEventoInpot)
    if (isInpot && inpSubView === 'franquia') return leadsData.filter(l => !isLeadEventoInpot(l))
    if (!isOralUnic || ouSubView === 'geral') return leadsData
    if (ouSubView === 'franquia')      return leadsData.filter(l => l.formulario === 'oralunic_multistep')
    if (ouSubView === 'legacy')        return leadsData.filter(l => l.formulario === 'comunidade_multistep')
    if (ouSubView === 'odonto_legacy') return osLeadsRaw
    return leadsData
  }, [leadsData, osLeadsRaw, isOralUnic, ouSubView, isInpot, inpSubView])


  const activeMediaData = useMemo(() => {
    // Estratégias pausadas (Hotmart, iscas) são sempre excluídas dos totais das frentes
    const active = isOralUnic ? mediaData.filter(r => !isPausedStrategy(r.campanha, r.conjunto)) : mediaData
    if (isInpot && inpSubView === 'evento')   return active.filter(r => isMediaEventoInpot(r.campanha))
    if (isInpot && inpSubView === 'franquia') return active.filter(r => isMediaFranquiaInpot(r.campanha))
    if (!isOralUnic || ouSubView === 'geral') return active
    if (ouSubView === 'franquia')      return active.filter(r => isMediaFranquia(r.campanha))
    if (ouSubView === 'legacy')        return active.filter(r => isMediaLegacy(r.campanha))
    if (ouSubView === 'odonto_legacy') return [...active.filter(r => isMediaOdontoLegacy(r.campanha)), ...osMediaRaw]
    return active
  }, [mediaData, osMediaRaw, isOralUnic, ouSubView, isInpot, inpSubView])

  const compareLeadsData = useMemo(() => {
    if (isInpot && inpSubView === 'evento')   return leadsCompareRaw.filter(isLeadEventoInpot)
    if (isInpot && inpSubView === 'franquia') return leadsCompareRaw.filter(l => !isLeadEventoInpot(l))
    if (!isOralUnic || ouSubView === 'geral') return leadsCompareRaw
    if (ouSubView === 'franquia')      return leadsCompareRaw.filter(l => l.formulario === 'oralunic_multistep')
    if (ouSubView === 'legacy')        return leadsCompareRaw.filter(l => l.formulario === 'comunidade_multistep')
    if (ouSubView === 'odonto_legacy') return osLeadsCompareRaw
    return leadsCompareRaw
  }, [leadsCompareRaw, osLeadsCompareRaw, isOralUnic, ouSubView, isInpot, inpSubView])

  const compareMediaData = useMemo(() => {
    const active = isOralUnic ? mediaCompareRaw.filter(r => !isPausedStrategy(r.campanha, r.conjunto)) : mediaCompareRaw
    if (isInpot && inpSubView === 'evento')   return active.filter(r => isMediaEventoInpot(r.campanha))
    if (isInpot && inpSubView === 'franquia') return active.filter(r => isMediaFranquiaInpot(r.campanha))
    if (!isOralUnic || ouSubView === 'geral') return active
    if (ouSubView === 'franquia')      return active.filter(r => isMediaFranquia(r.campanha))
    if (ouSubView === 'legacy')        return active.filter(r => isMediaLegacy(r.campanha))
    if (ouSubView === 'odonto_legacy') return [...active.filter(r => isMediaOdontoLegacy(r.campanha)), ...osMediaCompareRaw]
    return active
  }, [mediaCompareRaw, osMediaCompareRaw, isOralUnic, ouSubView, isInpot, inpSubView])

  const [mqlDrawerOpen, setMqlDrawerOpen] = useState(false)

  const def = BRAND_DEFS.find(d => d.key === activeBrand) ?? BRAND_DEFS[0]
  const b = computeBrand(activeMediaData, activeLeadsData, crmData, metasData, def, dataInicio, dataFim)
  const bCompare = useMemo(
    () => computeBrand(compareMediaData, compareLeadsData, crmCompare, metasData, def, cmpInicio, cmpFim),
    [compareMediaData, compareLeadsData, crmCompare, metasData, def, cmpInicio, cmpFim],
  )
  const compareLabel = compareState.enabled
    ? formatCompareLabel(effectiveCompareRange)
    : `${formatCompareLabel(effectiveCompareRange)} (mês anterior)`

  const mqlLeads = useMemo(() => deduplicateLeads(activeLeadsData).filter(isLeadMql), [activeLeadsData])
  const campaigns = buildCampaigns(activeMediaData, b.mql, b.sql, b.leads, marca ?? '')
  const daily = buildDailySeries(activeMediaData)
  const channels = buildChannels(activeMediaData, mqlLeads, crmData)
  const acqFunnel = buildAcqFunnel(b, activeMediaData)
  const loading = mediaLoading || crmLoading || leadsLoading

  const periodLabel = useMemo(() => {
    if (range.start.slice(0, 7) === range.end.slice(0, 7)) return monthLabel(range.start)
    return `${range.start} – ${range.end}`
  }, [range])

  // Estratégias pausadas (Compra Direta Hotmart, Iscas de conteúdo) — mostradas separadamente na Visão Geral
  const pausedData = useMemo(() => {
    if (!isOralUnic) return { rows: [] as MediaDailyRaw[], spend: 0, impr: 0, clicks: 0, campanhas: [] as string[] }
    const rows = mediaData.filter(r => isPausedStrategy(r.campanha, r.conjunto))
    const spend = rows.reduce((s, r) => s + (r.spend_brl || 0), 0)
    const impr = rows.reduce((s, r) => s + (r.impressoes || 0), 0)
    const clicks = rows.reduce((s, r) => s + (r.cliques_link || 0), 0)
    const campanhas = [...new Set(rows.map(r => pausedStrategyLabel(r.campanha, r.conjunto)))]
    return { rows, spend, impr, clicks, campanhas }
  }, [mediaData, isOralUnic])

  // Tabs escondidas por contexto:
  // - CEOs (tipo=ceo) só têm Social (o resto não faz sentido — não têm ads/funil/etc)
  // - Comunidade e Odonto Legacy do Oral Unic não têm Social/Radar
  const isCeo = def.tipo === 'ceo'
  const hiddenTabs: string[] = (() => {
    if (isCeo) return ['overview', 'campanhas', 'conjuntos', 'anuncios', 'termos', 'radar', 'email']
    const hidden: string[] = []
    // E-mail Marketing é uma página única por marca — não aparece dentro de sub-views (Oral Unic / Inpot)
    if (isOralUnic && ouSubView !== 'geral') hidden.push('email')
    if (isInpot && inpSubView !== 'geral') hidden.push('email')
    // Oral Unic Comunidade e Odonto Legacy não têm Social/Radar
    if (isOralUnic && (ouSubView === 'legacy' || ouSubView === 'odonto_legacy')) hidden.push('social', 'radar')
    return hidden
  })()
  // Sub-view "special": bypassa as tabs SM_TABS e renderiza um componente próprio (ex.: Esteira)
  const isOuSpecialView = isOralUnic && ouSubView === 'esteira'

  // Auto-reset da tab quando entra em sub-view com tabs restritas e a tab atual foi escondida
  useEffect(() => {
    if (hiddenTabs.includes(view)) {
      const first = SM_TABS.find(t => !hiddenTabs.includes(t.key))
      if (first) setView(first.key)
    }
  }, [hiddenTabs, view])

  const body = (() => {
    if (isOuSpecialView) return <EsteiraOralUnic embedded />
    switch (view) {
      case 'campanhas': return <SaudeCampanhas b={b} campaigns={campaigns} daily={daily} dataInicio={dataInicio} mqlLeads={mqlLeads} />
      case 'conjuntos': return <SaudeConjuntos b={b} campaigns={campaigns} />
      case 'anuncios':  return <SaudeAnuncios  b={b} campaigns={campaigns} />
      case 'termos':    return <TermosPanel    marca={b.label} dataInicio={dataInicio} dataFim={dataFim} />
      case 'social':    return <SocialPanel    marca={b.label} dataInicio={dataInicio} dataFim={dataFim} />
      case 'email':     return <EmailMarketingPanel marca={b.label} dataInicio={dataInicio} dataFim={dataFim} />
      case 'radar':     return <SaudeRadar     b={b} />
      default:          return <SMOverview     b={b} bCompare={bCompare} compareLabel={compareLabel} compareEnabled={compareState.enabled} channels={channels} acqFunnel={acqFunnel} onMqlClick={() => setMqlDrawerOpen(true)} mqlLeads={mqlLeads} crmData={crmData} crmAllData={crmAllData} di={dataInicio} df={dataFim} mediaData={activeMediaData} leadsData={activeLeadsData} pausedData={pausedData} />
    }
  })()

  const ouSubLabel = isOralUnic && ouSubView !== 'geral' ? ` · ${OU_SUB_TABS.find(t => t.key === ouSubView)?.label}` : ''
  const inpSubLabel = isInpot && inpSubView !== 'geral' ? ` · ${INP_SUB_TABS.find(t => t.key === inpSubView)?.label}` : ''

  return (
    <div style={{ padding: 'var(--container-pad)' }}>
      <PageTop
        title={b.label}
        subtitle={`Saúde da marca${ouSubLabel}${inpSubLabel} · ${isOuSpecialView ? OU_SUB_TABS.find(t => t.key === ouSubView)?.label : SM_TABS.find(t => t.key === view)?.label ?? 'Visão Geral'} · ${periodLabel}`}
        badge={<StatusPill status={b.status} value={b.meta + '%'} label="da meta" />}
        actions={
          <>
            <select
              value={filterFonte}
              onChange={e => setFilterFonte(e.target.value)}
              style={{ appearance: 'none', padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none' }}
            >
              <option value="__all__">Todas as fontes</option>
              {FONTE_CATEGORIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <PeriodPicker value={range} onChange={setRange} />
            {view === 'overview' && !isOuSpecialView && (
              <CompareControl
                baseRange={range}
                enabled={compareState.enabled}
                compareRange={compareState.compareRange}
                onChange={setCompareState}
              />
            )}
          </>
        }
      />
      {isOralUnic && <OuSubTabs value={ouSubView} onChange={setOuSubView} accent={def.accent} />}
      {isInpot && <InpSubTabs value={inpSubView} onChange={setInpSubView} accent={def.accent} />}
      {!isOuSpecialView && <SMTabs value={view} onChange={setView} hide={hiddenTabs} />}
      <QueryErrorBanner errors={[mediaError, crmError, leadsError, metasError]} scope="Saúde da Marca" />
      <div style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : undefined, transition: 'opacity 0.2s' }}>
        {body}
      </div>
      <MqlDrawer open={mqlDrawerOpen} onClose={() => setMqlDrawerOpen(false)} leads={mqlLeads} />
    </div>
  )
}
