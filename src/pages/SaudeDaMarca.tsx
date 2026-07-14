/* Saúde da Marca — real Supabase data + mock generators for Social/Criativos/Públicos */
import { useState, useMemo, Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Filter } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from '@/components/ui/StatusPill'
import { MetricCard } from '@/components/ui/MetricCard'
import { PageTop } from '@/components/ui/PageTop'
import { useMarcaSelecionada } from '@/components/AppLayout'
import { useMediaData } from '@/hooks/useMediaData'
import { useCrmFunil } from '@/hooks/useCrmFunil'
import { useMetas } from '@/hooks/useMetas'
import { useLeads } from '@/hooks/useLeads'
import type { MediaDailyRaw, CrmFunilRaw, Lead, Meta } from '@/lib/types'
import { SLUG_TO_MARCA, monthLabel } from '@/lib/dateUtils'

// ── Brand definitions (static info only) ─────────────────────────────────────
const BRAND_DEFS = [
  { key: 'oral-unic',  label: 'Oral Unic',  accent: '#7F0C72' },
  { key: 'inpot',      label: 'Inpot',      accent: '#C6D32D' },
  { key: 'eletrovias', label: 'Eletrovias', accent: '#ED6D3A' },
  { key: 'liso-laser', label: 'Lisô Laser', accent: '#FF6643' },
  { key: 'b2case',     label: 'B2Case',     accent: '#0169F2' },
  { key: 'viva',       label: 'Viva',       accent: '#FF0069' },
]

type BrandData = {
  key: string; label: string; accent: string
  leads: number; mql: number; sql: number; sal: number; fech: number
  invest: number; cpmql: number; cpsql: number
  meta: number; status: 'positivo' | 'atencao' | 'risco'
}

// ── Real data builders ────────────────────────────────────────────────────────
const SQL_SET = new Set(['sql', 'sal', 'fechado'])

const isLeadMql = (r: { dados_extras: Record<string, unknown> | null }) => {
  const lt = r.dados_extras?.['lead_type']
  return typeof lt === 'string' && lt.toUpperCase() === 'MQL'
}

function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter(r => {
    const key = (r.email && r.email !== '') ? r.email : (r.telefone && r.telefone !== '') ? r.telefone : null
    if (key === null) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupCrm(crm: CrmFunilRaw[]): CrmFunilRaw[] {
  const latest = new Map<string, CrmFunilRaw>()
  for (const r of crm) {
    if (!r.deal_id) continue
    const ex = latest.get(r.deal_id)
    if (!ex || r.atualizado_em > ex.atualizado_em) latest.set(r.deal_id, r)
  }
  return Array.from(latest.values())
}

function computeBrand(
  media: MediaDailyRaw[], leadRows: Lead[], crm: CrmFunilRaw[], metas: Meta[],
  def: typeof BRAND_DEFS[0]
): BrandData {
  const invest  = media.reduce((s, r) => s + r.spend_brl, 0)
  const uniqueLeads = deduplicateLeads(leadRows)
  const leads   = uniqueLeads.length
  const mql     = uniqueLeads.filter(isLeadMql).length
  const deduped = dedupCrm(crm)
  const sql     = deduped.filter(r => r.etapa_categoria && SQL_SET.has(r.etapa_categoria)).length
  const sal     = deduped.filter(r => r.etapa_categoria === 'sal' || r.etapa_categoria === 'fechado').length
  const fech    = deduped.filter(r => r.etapa_categoria === 'fechado').length
  const cpmql   = mql > 0 ? Math.round(invest / mql) : 0
  const cpsql   = sql > 0 ? Math.round(invest / sql) : 0
  const metaRow = metas.find(m => m.metrica === 'mql')
  const metaVal = metaRow?.valor_meta ?? 0
  const metaPct = metaVal > 0 ? Math.round((mql / metaVal) * 100) : 0
  const status: BrandData['status'] = metaPct >= 85 ? 'positivo' : metaPct >= 60 ? 'atencao' : 'risco'
  return { key: def.key, label: def.label, accent: def.accent, leads, mql, sql, sal, fech, invest, cpmql, cpsql, meta: metaPct, status }
}

interface Ad { id: string; name: string; spend: number; impressions: number; clicks: number; ctr: number; mql: number; cpmql: number; hue: number }
interface AdSet { id: string; name: string; publico: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; mql: number; sql: number; cpmql: number; freq: number; ads: Ad[] }
interface Campaign { id: string; name: string; status: string; objetivo: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; cpc: number; leads: number; mql: number; sql: number; cpmql: number; cpsql: number; adsets: AdSet[] }

function buildCampaigns(media: MediaDailyRaw[], totalMql: number, totalSql: number): Campaign[] {
  const totalLeads = media.reduce((s, r) => s + r.leads, 0)
  const mqlRate = totalLeads > 0 ? totalMql / totalLeads : 0
  const sqlRate = totalLeads > 0 ? totalSql / totalLeads : 0

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
    const leads = campRows.reduce((s, r) => s + r.leads, 0)
    const mql = Math.round(leads * mqlRate)
    const sql = Math.round(leads * sqlRate)
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
      const sMql = Math.round(sLeads * mqlRate)
      const sSql = Math.round(sLeads * sqlRate)
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
        const aMql = Math.round(aLeads * mqlRate)
        const aCtr = aImp > 0 ? (aClk / aImp) * 100 : 0
        const aCpmql = aMql > 0 ? aSpend / aMql : 0
        ads.push({ id: `c${ci}-a${ai}-k${ki}`, name: adName, spend: aSpend, impressions: aImp, clicks: aClk, ctr: +aCtr.toFixed(2), mql: aMql, cpmql: Math.round(aCpmql), hue: (ci * 73 + ai * 37 + ki * 17) % 360 })
        ki++
      }

      adsets.push({ id: `c${ci}-a${ai}`, name: setName, publico: setName, spend: sSpend, impressions: sImp, clicks: sClk, ctr: +sCtr.toFixed(2), cpm: +sCpm.toFixed(2), mql: sMql, sql: sSql, cpmql: Math.round(sCpmql), freq: 0, ads })
      ai++
    }

    campaigns.push({ id: `c${ci}`, name: campName, status: 'ativa', objetivo: 'Conversão', spend, impressions, clicks, ctr: +ctr.toFixed(2), cpm: +cpm.toFixed(2), cpc: +cpc.toFixed(2), leads, mql, sql, cpmql: Math.round(cpmql), cpsql: Math.round(cpsql), adsets })
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

function buildChannels(media: MediaDailyRaw[], totalMql: number, totalLeads: number): { name: string; mql: number; cpmql: number; trend: number[] }[] {
  const mqlRate = totalLeads > 0 ? totalMql / totalLeads : 0
  const result: { name: string; mql: number; cpmql: number; trend: number[] }[] = []
  for (const canal of ['meta', 'google'] as const) {
    const rows = media.filter(r => r.canal === canal)
    if (rows.length === 0) continue
    const spend = rows.reduce((s, r) => s + r.spend_brl, 0)
    const leads = rows.reduce((s, r) => s + r.leads, 0)
    const mql = Math.round(leads * mqlRate)
    const cpmql = mql > 0 ? Math.round(spend / mql) : 0
    const name = canal === 'meta' ? 'Meta Ads' : 'Google Ads'
    result.push({ name, mql, cpmql, trend: [mql, mql, mql, mql, mql, mql] })
  }
  return result
}

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')
const fmtK = (n: number) => n>=1000000 ? (n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'M' : n>=1000 ? (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'K' : Math.round(n).toLocaleString('pt-BR')
const money = (n: number) => 'R$ '+Math.round(n).toLocaleString('pt-BR')
const money2 = (n: number) => 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

function buildAcqFunnel(b: BrandData, media: MediaDailyRaw[]) {
  const impressions = media.reduce((s, r) => s + r.impressoes, 0)
  const clicks = media.reduce((s, r) => s + r.cliques_link, 0)
  const lpv = media.reduce((s, r) => s + r.lpv, 0)
  const cpm = impressions > 0 ? (b.invest / impressions) * 1000 : 0
  const cpc = clicks > 0 ? b.invest / clicks : 0
  const cpLead = b.leads > 0 ? b.invest / b.leads : 0
  const cpSql = b.sql > 0 ? b.invest / b.sql : 0
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
      { label: 'Investimento',   value: money(b.invest) },
      { label: 'CPM',            value: money2(cpm) },
      { label: 'CPC',            value: money2(cpc) },
      { label: 'Custo por lead', value: money2(cpLead) },
      { label: 'CP-MQL',         value: money(b.cpmql) },
      { label: 'CP-SQL',         value: money(cpSql) },
    ],
  }
}

// ── Mock generators (still used for Públicos, Criativos, Social) ──────────────
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
function hash(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

function jit(r: () => number, base: number, spread: number) { return base * (1 + (r() - 0.5) * spread) }

const AUDIENCES = ['Lookalike 1%', 'Interesses — Saúde', 'Remarketing 30d', 'Aberto BR', 'Interesses — Estética', 'Retargeting site', 'Lookalike 3%', 'Base CRM', 'Interesses — Odonto']
const CREATIVE_NAMES = ['Depoimento cliente', 'Antes e depois', 'Oferta relâmpago', 'Tour da clínica', 'Reels dança', 'Dúvidas frequentes', 'Bastidores', 'Promo carrossel', 'UGC influencer', 'Institucional 15s', 'Story enquete', 'Demonstração produto']
const VIDEO_CAPTIONS = ['Antes e depois 😮', 'Tour pela clínica 🏥', 'Depoimento real 💬', 'Trend do momento 🔥', 'Tira-dúvidas ✨', 'Bastidores do time 🎬', 'Oferta da semana 🏷️', 'Passo a passo 📋', 'Reels do dia 💃', 'Resultado 30 dias 📈']

function mkPublics(b: BrandData) {
  const r = rng(hash(b.key+'pub'))
  return AUDIENCES.slice(0,7).map((name) => {
    const spend = Math.round(jit(r,b.invest/8,0.7)); const impressions = Math.round(jit(r,90000,0.6))
    const ctr = +jit(r,1.5,0.7).toFixed(2); const clicks = Math.round(impressions*ctr/100); const mql = Math.round(clicks*jit(r,0.03,0.6))
    return { name, spend, impressions, ctr, cpm: +jit(r,17,0.5).toFixed(2), clicks, mql, cpmql: Math.round(spend/Math.max(1,mql)), freq: +jit(r,2.6,0.6).toFixed(1) }
  })
}

function mkCreatives(b: BrandData) {
  const r = rng(hash(b.key+'cre'))
  return CREATIVE_NAMES.map((name, i) => {
    const type = r() > 0.35 ? 'video' : 'imagem'
    const impressions = Math.round(jit(r,60000,0.8)); const views = type==='video' ? Math.round(impressions*jit(r,0.6,0.4)) : 0
    const thruplay = type==='video' ? Math.round(views*jit(r,0.28,0.4)) : 0; const v50 = type==='video' ? +jit(r,42,0.4).toFixed(1) : 0
    const ctr = +jit(r,1.5,0.7).toFixed(2); const clicks = Math.round(impressions*ctr/100); const mql = Math.round(clicks*jit(r,0.03,0.6))
    const spend = Math.round(jit(r,b.invest/12,0.7)); const fem = Math.round(jit(r,58,0.25))
    return { id: b.key+'-cr'+i, name, type, hue: Math.floor(r()*360), impressions, views, thruplay, v50, ctr, clicks, mql, spend, cpmql: Math.round(spend/Math.max(1,mql)), likes: Math.round(views*jit(r,0.04,0.5))+Math.round(jit(r,120,0.6)), shares: Math.round(jit(r,40,0.8)), comments: Math.round(jit(r,55,0.8)), engaj: +jit(r,6.2,0.5).toFixed(1), genero: { fem, masc: 100-fem } }
  }).sort((a,c) => c.mql - a.mql)
}

function mkSocial(b: BrandData) {
  const r = rng(hash(b.key+'soc'))
  const views = Math.round(jit(r,42000,0.5)); const likes = Math.round(views*jit(r,0.17,0.3))
  const comments = Math.round(views*jit(r,0.022,0.4)); const shares = Math.round(views*jit(r,0.009,0.4))
  const videos = 60 + Math.floor(r()*30)
  const timeline = Array.from({length:34},()=>({ shares: Math.round(jit(r,380,0.5)), profile: Math.round(jit(r,48,0.6)) }))
  const active = [1.95,1.55,1.53,1.42,1.85,1.05,1.25].map((v) => Math.round(v*jit(r,1000000,0.1)))
  const best = VIDEO_CAPTIONS.map((cap,i) => ({ caption: cap, create: `${10-i>0?(26-i):(10)}/0${6+(i%2)}/2026, ${(2+i)%24}:${10+i}:32`, duration: +jit(r,12,0.6).toFixed(2), views: Math.round(jit(r,1700,0.4)), likes: Math.round(jit(r,145,0.4)), shares: Math.round(jit(r,10,0.8)), comments: Math.round(jit(r,18,0.8)), hue: Math.floor(r()*360) })).sort((a,c) => c.views-a.views)
  return { videos, totalDuration: '34:39', comments, uniqueView: Math.round(views*0.49), totalTimeWatched: '1 M', views, likes, sharesN: shares, likesRate: +(likes/views*100).toFixed(2), commentsRate: +(comments/views*100).toFixed(2), sharesRate: +(shares/views*100).toFixed(2), timeline, active, best }
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

function MiniFunnel({ stages }: { stages: { label: string; value: number; fmt?: (v:number)=>string }[] }) {
  const max = stages[0].value
  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      {stages.map((s,i) => {
        const w = Math.max(9, Math.sqrt(s.value/max)*100)
        const conv = i>0 ? s.value/stages[i-1].value : 1
        return (
          <div key={s.label}>
            {i>0 && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0 3px 168px', color:'var(--ws-text-secondary)', fontSize:11.5 }}><span style={{opacity:0.6}}>↓</span>{(conv*100).toFixed(1)}%</div>}
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:154, flex:'0 0 auto', fontSize:13, color:'var(--ws-text-secondary)', textAlign:'right' }}>{s.label}</div>
              <div style={{ flex:1, height:34, background:'var(--ws-bg)', borderRadius:8, overflow:'hidden' }}>
                <div style={{ width:w+'%', height:'100%', background:`color-mix(in srgb, var(--brand-accent) ${Math.round(40+60*(s.value/max))}%, var(--brand-dark))`, borderRadius:8, display:'flex', alignItems:'center', paddingLeft:12 }}>
                  <span style={{ color:'#fff', fontWeight:600, fontSize:13, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{s.fmt ? s.fmt(s.value) : fmt(s.value)}</span>
                </div>
              </div>
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

function DualLine({ data, aKey, bKey, aLabel, bLabel, aColor, bColor, aFmt: _aFmt=fmtK, bFmt: _bFmt=fmtK, xLabels }: { data:Record<string,number>[]; aKey:string; bKey:string; aLabel:string; bLabel:string; aColor:string; bColor:string; aFmt?:(v:number)=>string; bFmt?:(v:number)=>string; xLabels?:string[] }) {
  const W=560, H=230, padL=8, padR=8, padT=16, padB=26; const iw=W-padL-padR, ih=H-padT-padB
  const av=data.map((d)=>d[aKey]), bv=data.map((d)=>d[bKey])
  const aMax=Math.max(...av)*1.1, aMin=Math.min(...av)*0.9; const bMax=Math.max(...bv)*1.1, bMin=Math.min(...bv)*0.9
  const x=(i:number)=>padL+(i/(data.length-1))*iw; const yA=(v:number)=>padT+ih-((v-aMin)/(aMax-aMin||1))*ih; const yB=(v:number)=>padT+ih-((v-bMin)/(bMax-bMin||1))*ih
  const path=(vals:number[],y:(v:number)=>number)=>vals.map((v,i)=>`${i?'L':'M'} ${x(i)} ${y(v)}`).join(' ')
  return (
    <div>
      <div style={{ display:'flex', gap:18, marginBottom:8, fontSize:12, color:'var(--ws-text-secondary)' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:3, background:aColor, borderRadius:2 }} />{aLabel}</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:3, background:bColor, borderRadius:2 }} />{bLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
        {[0,0.25,0.5,0.75,1].map((g)=><line key={g} x1={padL} x2={W-padR} y1={padT+ih*g} y2={padT+ih*g} stroke="var(--ws-border)" strokeWidth="1" />)}
        <path d={path(av,yA)} fill="none" stroke={aColor} strokeWidth="2.4" strokeLinejoin="round" />
        <path d={path(bv,yB)} fill="none" stroke={bColor} strokeWidth="2.4" strokeLinejoin="round" />
        {xLabels && xLabels.map((l,i)=>l&&<text key={i} x={x(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill="var(--ws-text-secondary)" fontFamily="var(--font-body)">{l}</text>)}
      </svg>
    </div>
  )
}

function Gauge({ value, max=8, warn=4, label: _label }: { value:number; max?:number; warn?:number; label?:string }) {
  const W=220, H=130, cx=W/2, cy=H-12, r=92
  const a=(t:number)=>Math.PI-t*Math.PI
  const pt=(t:number,rad=r):[number,number]=>[cx+rad*Math.cos(a(t)), cy-rad*Math.sin(a(t))]
  const t=Math.min(1,value/max)
  const arc=(t0:number,t1:number,rad:number,w:number,color:string)=>{
    const [x0,y0]=pt(t0,rad),[x1,y1]=pt(t1,rad)
    return <path d={`M ${x0} ${y0} A ${rad} ${rad} 0 ${t1-t0>0.5?1:0} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="butt" />
  }
  const [nx,ny]=pt(warn/max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth:260 }}>
      {arc(0,1,r,22,'var(--ws-border)')}
      {arc(0,t,r,22,'var(--brand-accent)')}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--status-atencao)" strokeWidth="3" />
      <text x={pt(0,r+14)[0]} y={cy+6} textAnchor="middle" fontSize="11" fill="var(--ws-text-secondary)">0</text>
      <text x={cx} y={18} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ws-text-primary)">{value.toFixed(2)}</text>
      <text x={pt(1,r+10)[0]} y={cy+6} textAnchor="middle" fontSize="11" fill="var(--ws-text-secondary)">{max}</text>
    </svg>
  )
}

function Scatter({ points, xLabel, yLabel }: { points:{x:number;y:number;size:number;label:string}[]; xLabel:string; yLabel:string }) {
  const W=560, H=300, padL=46, padR=14, padT=14, padB=34; const iw=W-padL-padR, ih=H-padT-padB
  const xs=points.map((p)=>p.x), ys=points.map((p)=>p.y)
  const xMax=Math.max(...xs)*1.1, xMin=Math.min(...xs)*0.85; const yMax=Math.max(...ys)*1.15, yMin=0
  const sMax=Math.max(...points.map((p)=>p.size))
  const X=(v:number)=>padL+((v-xMin)/(xMax-xMin||1))*iw; const Y=(v:number)=>padT+ih-((v-yMin)/(yMax-yMin||1))*ih
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
      {[0,0.25,0.5,0.75,1].map((g)=><line key={g} x1={padL} x2={W-padR} y1={padT+ih*g} y2={padT+ih*g} stroke="var(--ws-border)" strokeWidth="1" />)}
      {points.map((p,i)=>(
        <g key={i}>
          <circle cx={X(p.x)} cy={Y(p.y)} r={8+16*(p.size/sMax)} fill="var(--brand-accent)" fillOpacity="0.28" stroke="var(--brand-accent)" strokeWidth="1.5" />
          <text x={X(p.x)} y={Y(p.y)-12-16*(p.size/sMax)} textAnchor="middle" fontSize="10.5" fill="var(--ws-text-secondary)">{p.label}</text>
        </g>
      ))}
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

function Thumb({ hue, w=46, h=46, radius=8 }: { hue:number; w?:number; h?:number; radius?:number }) {
  return <div style={{ width:w, height:h, borderRadius:radius, flex:'0 0 auto', overflow:'hidden', background:`repeating-linear-gradient(135deg, hsl(${hue} 42% 74%) 0 6px, hsl(${hue} 42% 68%) 6px 12px)` }} />
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
const TODAY = new Date().toISOString().slice(0, 10)

function makeMtd(): { start: string; end: string } {
  const [y, m] = TODAY.split('-').map(Number)
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: TODAY }
}
function makePrevMonth(): { start: string; end: string } {
  const [y, m] = TODAY.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  const ms = String(pm).padStart(2, '0')
  const last = new Date(py, pm, 0).getDate()
  return { start: `${py}-${ms}-01`, end: `${py}-${ms}-${String(last).padStart(2, '0')}` }
}
function makeLastN(n: number): { start: string; end: string } {
  const d = new Date(); d.setDate(d.getDate() - (n - 1))
  return { start: d.toISOString().slice(0, 10), end: TODAY }
}

const PRESETS = [
  { label: 'MTD',       fn: makeMtd },
  { label: 'Mês ant.',  fn: makePrevMonth },
  { label: '7d',        fn: () => makeLastN(7) },
  { label: '30d',       fn: () => makeLastN(30) },
] as const

function PeriodPicker({ value, onChange }: { value: { start: string; end: string }; onChange: (r: { start: string; end: string }) => void }) {
  const inputSt: CSSProperties = { border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer' }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'inline-flex', background: 'var(--ws-bg)', borderRadius: 999, padding: 3, gap: 2 }}>
        {PRESETS.map(p => {
          const range = p.fn()
          const on = value.start === range.start && value.end === range.end
          return (
            <button key={p.label} onClick={() => onChange(range)}
              style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, padding: '5px 10px', borderRadius: 999, background: on ? 'var(--ws-surface)' : 'transparent', color: on ? 'var(--brand-accent)' : 'var(--ws-text-secondary)', boxShadow: on ? 'var(--shadow-sm)' : 'none', whiteSpace: 'nowrap' }}>
              {p.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ws-surface)', border: '1px solid var(--ws-border-strong)', borderRadius: 999, padding: '0 14px', height: 38 }}>
        <span style={{ display: 'inline-flex', color: 'var(--ws-text-secondary)' }}><Filter size={14} /></span>
        <input type="date" value={value.start} max={value.end} onChange={e => onChange({ ...value, start: e.target.value })} style={inputSt} />
        <span style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>–</span>
        <input type="date" value={value.end} min={value.start} max={TODAY} onChange={e => onChange({ ...value, end: e.target.value })} style={inputSt} />
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const SM_TABS = [
  { key:'overview',   label:'Visão Geral' },
  { key:'campanhas',  label:'Campanhas' },
  { key:'conjuntos',  label:'Conjuntos' },
  { key:'anuncios',   label:'Anúncios' },
  { key:'publicos',   label:'Públicos' },
  { key:'criativos',  label:'Criativos' },
  { key:'social',     label:'Social Media' },
  { key:'radar',      label:'Radar' },
]

const CH_COLORS = ['var(--brand-accent)','var(--brand-accent-2)','var(--status-atencao)','color-mix(in srgb, var(--brand-dark) 52%, var(--ws-border-strong))']

function SMTabs({ value, onChange }: { value:string; onChange:(k:string)=>void }) {
  return (
    <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--ws-border)', marginBottom:24, overflowX:'auto' }}>
      {SM_TABS.map((t) => {
        const on=t.key===value
        return <button key={t.key} onClick={()=>onChange(t.key)} style={{ border:'none', background:'transparent', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:14, padding:'10px 16px', color:on?'var(--brand-accent)':'var(--ws-text-secondary)', whiteSpace:'nowrap', borderBottom:`2.5px solid ${on?'var(--brand-accent)':'transparent'}`, marginBottom:-1 }}>{t.label}</button>
      })}
    </div>
  )
}

// ── SimpleTable ───────────────────────────────────────────────────────────────
interface Col { k: string; h: string; num?: boolean; fmt?: (v: any) => string; render?: (r: any) => ReactNode }

function SimpleTable({ columns, rows, keyField }: { columns:Col[]; rows:any[]; keyField:string }) {
  const [sort, setSort] = useState({ k: columns.find((c)=>c.num)?.k || columns[0].k, dir:-1 })
  const sorted = [...rows].sort((a,b) => {
    const va=a[sort.k], vb=b[sort.k]
    if (typeof va==='number') return (va-vb)*sort.dir
    return String(va).localeCompare(String(vb))*sort.dir
  })
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
          {sorted.map((r)=>(
            <tr key={r[keyField]} style={{ borderBottom:'1px solid var(--ws-border)' }}>
              {columns.map((c)=>(
                <td key={c.k} style={{ padding:'11px 12px', textAlign:c.num?'right':'left', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                  {c.render ? c.render(r) : (c.fmt ? c.fmt(r[c.k]) : r[c.k])}
                </td>
              ))}
            </tr>
          ))}
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
  const cols = CAMP_COLS.filter((c)=>on[c.k])
  const val = (row: any, k: string) => { const c=CAMP_COLS.find((x)=>x.k===k)!; return row[k]===undefined||row[k]===null?'—':c.fmt(row[k]) }
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720 }}>
        <thead>
          <tr style={{ color:'var(--ws-text-secondary)', fontSize:11.5, fontWeight:500, borderBottom:'1px solid var(--ws-border)' }}>
            <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:500 }}>Campanha / Conjunto / Anúncio</th>
            {cols.map((c)=><th key={c.k} style={{ padding:'10px 12px', textAlign:'right', fontWeight:500, whiteSpace:'nowrap' }}>{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((cp)=>{
            const openC=exC[cp.id]
            return (
              <Fragment key={cp.id}>
                <tr onClick={()=>setExC((s)=>({...s,[cp.id]:!s[cp.id]}))} style={{ cursor:'pointer', borderBottom:'1px solid var(--ws-border)', background:openC?'color-mix(in srgb, var(--brand-accent) 6%, transparent)':'transparent' }}>
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
                            <span style={{ display:'inline-flex', alignItems:'center', gap:9 }}><Thumb hue={ad.hue} w={26} h={26} radius={5} />{ad.name}</span>
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

const WINNER = [
  { value:'cpmql', label:'CP-MQL', money:true, low:true },
  { value:'mql',   label:'MQL' },
  { value:'sql',   label:'SQL' },
  { value:'ctr',   label:'CTR',  pct:true },
] as const

function TopCampaigns({ campaigns }: { campaigns:Campaign[] }) {
  const [metric, setMetric] = useState<string>('mql')
  const cfg = WINNER.find((w)=>w.value===metric)!
  const sorted = [...campaigns].sort((a,b)=>(cfg as any).low?a[metric as keyof Campaign] as any-( b[metric as keyof Campaign] as any):( b[metric as keyof Campaign] as any)-(a[metric as keyof Campaign] as any)).slice(0,5)
  const max = Math.max(...sorted.map((c)=>c[metric as keyof Campaign] as number))
  const fmtV = (v: number) => (cfg as any).money ? money(v) : (cfg as any).pct ? v+'%' : fmt(v)
  return (
    <SCard>
      <CardTitle title="Top campanhas" sub={`Vencedor por ${cfg.label}${(cfg as any).low?' (menor é melhor)':''}`} right={<MetricPicker options={WINNER.map(w=>({value:w.value,label:w.label}))} value={metric} onChange={setMetric} />} />
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {sorted.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ width:22, height:22, borderRadius:'50%', flex:'0 0 auto', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, background:i===0?'var(--brand-accent)':'var(--ws-bg)', color:i===0?'var(--brand-accent-contrast)':'var(--ws-text-secondary)' }}>{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.name}</span>
                <span style={{ fontSize:13, fontWeight:700, color:i===0?'var(--brand-accent)':'var(--ws-text-primary)', fontVariantNumeric:'tabular-nums' }}>{fmtV(c[metric as keyof Campaign] as number)}</span>
              </div>
              <div style={{ height:8, borderRadius:999, background:'var(--ws-bg)', overflow:'hidden' }}>
                <div style={{ width:((cfg as any).low?(Math.min(...sorted.map(s=>s[metric as keyof Campaign] as number))/(c[metric as keyof Campaign] as number))*100:(c[metric as keyof Campaign] as number)/max*100)+'%', height:'100%', background:i===0?'var(--brand-accent)':'color-mix(in srgb, var(--brand-accent) 45%, var(--ws-border-strong))' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SCard>
  )
}

function SaudeCampanhas({ b: _b, campaigns, daily, dataInicio: _dataInicio }: { b: BrandData; campaigns: Campaign[]; daily: ReturnType<typeof buildDailySeries>; dataInicio: string }) {
  const [showPaused, setShowPaused] = useState(false)
  const [tableOpen, setTableOpen] = useState(true)
  const [on, setOn] = useState<Record<string,boolean>>(DEFAULT_ON)
  const visible = campaigns.filter((c)=>showPaused||c.status==='ativa')
  const active = campaigns.filter((c)=>c.status==='ativa'); const paused = campaigns.length-active.length
  const agg = campaigns.reduce((a,c)=>({spend:a.spend+c.spend,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,mql:a.mql+c.mql,sql:a.sql+c.sql}),{spend:0,impressions:0,clicks:0,mql:0,sql:0})
  const cpm=agg.impressions>0?agg.spend/agg.impressions*1000:0
  const cpc=agg.clicks>0?agg.spend/agg.clicks:0
  const ctr=agg.impressions>0?agg.clicks/agg.impressions*100:0
  const uniqueClicks=Math.round(agg.clicks*0.94), dailyReach=Math.round(agg.impressions/30/2.3), freq=2.06
  const xLabels = daily.map((d) => { const day = parseInt(d.day.slice(8)); return day % 7 === 1 ? String(day) : '' })
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:16, marginBottom:16 }}>
        <KTile label="Impressões" value={fmtK(agg.impressions)} />
        <KTile label="Cliques no link" value={fmtK(agg.clicks)} />
        <KTile label="Cliques únicos" value={fmtK(uniqueClicks)} />
        <KTile label="Alcance diário méd." value={fmtK(dailyReach)} />
        <SCard pad={16} style={{ gridRow:'span 2' }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Frequência</div>
          <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)', marginBottom:4 }}>otimize acima de 4</div>
          <Gauge value={freq} max={8} warn={4} />
        </SCard>
        <KTile label="Investimento" value={money(agg.spend)} />
        <KTile label="CPM" value={money2(cpm)} invert />
        <KTile label="CPC" value={money2(cpc)} invert />
        <KTile label="CTR" value={ctr.toFixed(2)+'%'} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <SCard><CardTitle title="Impressões & CPM" /><DualLine data={daily as unknown as Record<string,number>[]} aKey="impressions" bKey="cpm" aLabel="Impressões" bLabel="CPM" aColor="var(--brand-accent)" bColor="#B5495B" bFmt={money} xLabels={xLabels} /></SCard>
        <SCard><CardTitle title="Cliques & CPC" /><DualLine data={daily as unknown as Record<string,number>[]} aKey="clicks" bKey="cpc" aLabel="Cliques" bLabel="CPC" aColor="var(--status-atencao)" bColor="var(--ws-vinho-b)" aFmt={fmt} bFmt={money} xLabels={xLabels} /></SCard>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:24, alignItems:'start' }}>
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
          {tableOpen && <div style={{ padding:'0 8px 12px' }}><CampaignTable campaigns={visible} on={on} /></div>}
        </SCard>
        <TopCampaigns campaigns={active} />
      </div>
    </div>
  )
}

// ── SaudeConjuntos / SaudePublicos ────────────────────────────────────────────
function SaudeConjuntos({ b: _b, campaigns, publics }: { b: BrandData; campaigns: Campaign[]; publics: ReturnType<typeof mkPublics> }) {
  const sets: any[] = []; campaigns.forEach((cp)=>cp.adsets.forEach((as)=>sets.push({...as,campaign:cp.name})))
  const cols: Col[] = [
    { k:'name', h:'Conjunto' }, { k:'publico', h:'Público' },
    { k:'spend', h:'Investimento', num:true, fmt:money }, { k:'impressions', h:'Impressões', num:true, fmt:fmtK },
    { k:'ctr', h:'CTR', num:true, fmt:(v)=>v+'%' }, { k:'cpm', h:'CPM', num:true, fmt:money2 },
    { k:'freq', h:'Freq.', num:true, fmt:(v)=>v.toFixed(1) }, { k:'mql', h:'MQL', num:true, fmt:fmt },
    { k:'cpmql', h:'CP-MQL', num:true, fmt:money },
  ]
  const scatterPts = publics.map((p)=>({ x:p.cpmql, y:p.mql, size:p.spend, label:p.name.split(' ')[0] }))
  const totSpend=sets.reduce((a,s)=>a+s.spend,0), totMql=sets.reduce((a,s)=>a+s.mql,0)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KTile label="Conjuntos ativos" value={fmt(sets.length)} />
        <KTile label="Investimento" value={money(totSpend)} />
        <KTile label="MQLs" value={fmt(totMql)} />
        <KTile label="CP-MQL médio" value={money(totSpend/Math.max(1,totMql))} invert />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:24, alignItems:'start' }}>
        <SCard pad={0}>
          <div style={{ padding:'18px 20px' }}><CardTitle title="Conjuntos de anúncios" sub="Ordene clicando no cabeçalho" /></div>
          <div style={{ padding:'0 8px 12px' }}><SimpleTable columns={cols} rows={sets} keyField="id" /></div>
        </SCard>
        <SCard>
          <CardTitle title="Comparativo de públicos" sub="Eixo X: CP-MQL · Y: MQL · tamanho: investimento" />
          <Scatter points={scatterPts} xLabel="CP-MQL" yLabel="MQL" />
        </SCard>
      </div>
    </div>
  )
}

function SaudePublicos({ publics }: { publics: ReturnType<typeof mkPublics> }) {
  const cols: Col[] = [
    { k:'name', h:'Público' }, { k:'spend', h:'Investimento', num:true, fmt:money },
    { k:'impressions', h:'Impressões', num:true, fmt:fmtK }, { k:'clicks', h:'Cliques', num:true, fmt:fmt },
    { k:'ctr', h:'CTR', num:true, fmt:(v)=>v+'%' }, { k:'cpm', h:'CPM', num:true, fmt:money2 },
    { k:'freq', h:'Freq.', num:true, fmt:(v)=>v.toFixed(1) }, { k:'mql', h:'MQL', num:true, fmt:fmt },
    { k:'cpmql', h:'CP-MQL', num:true, fmt:money },
  ]
  const scatterPts = publics.map((p)=>({ x:p.cpmql, y:p.mql, size:p.spend, label:p.name.split(' ')[0] }))
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:24 }}>
        <SCard>
          <CardTitle title="Comparativo de públicos" sub="Eixo X: CP-MQL · Y: MQL · tamanho da bolha: investimento" />
          <Scatter points={scatterPts} xLabel="CP-MQL" yLabel="MQL" />
        </SCard>
        <SCard pad={0}>
          <div style={{ padding:'18px 20px' }}><CardTitle title="Públicos" sub="Ordene clicando no cabeçalho" /></div>
          <div style={{ padding:'0 8px 12px' }}><SimpleTable columns={cols} rows={publics} keyField="name" /></div>
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
        <Thumb hue={r.hue} w={34} h={34} radius={6} />
        <span><span style={{ fontWeight:500 }}>{r.name}</span><br /><span style={{ fontSize:11, color:'var(--ws-text-secondary)' }}>{r.conjunto}</span></span>
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

// ── SaudeCriativos ────────────────────────────────────────────────────────────
const CMP_METRICS = [
  { k:'ctr', h:'CTR', fmt:(v:number)=>v+'%' },
  { k:'v50', h:'V50%', fmt:(v:number)=>v+'%' },
  { k:'thruplay', h:'ThruPlay', fmt:fmtK },
  { k:'engaj', h:'Engaj.', fmt:(v:number)=>v+'%' },
  { k:'mql', h:'MQL', fmt:fmt },
  { k:'cpmql', h:'CP-MQL', fmt:money, low:true },
] as const

function CompareHeatmap({ items }: { items:any[] }) {
  const norm: Record<string,((v:number)=>number)> = {}
  CMP_METRICS.forEach((m)=>{
    const vals=items.map((it)=>it[m.k]); const lo=Math.min(...vals), hi=Math.max(...vals)
    norm[m.k]=(v)=>{ const t=hi===lo?0.5:(v-lo)/(hi-lo); return (m as any).low?1-t:t }
  })
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:3, fontSize:13, minWidth:560 }}>
        <thead><tr style={{ color:'var(--ws-text-secondary)', fontSize:11.5 }}>
          <th style={{ textAlign:'left', padding:'4px 8px' }}>Criativo</th>
          {CMP_METRICS.map((m)=><th key={m.k} style={{ padding:'4px 8px', textAlign:'center', fontWeight:500 }}>{m.h}</th>)}
        </tr></thead>
        <tbody>
          {items.map((it)=>(
            <tr key={it.id}>
              <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}><Thumb hue={it.hue} w={26} h={26} radius={5} />{it.name}</span>
              </td>
              {CMP_METRICS.map((m)=>{
                const t=norm[m.k](it[m.k]); const bg=`color-mix(in srgb, ${t>0.5?'var(--status-positivo)':'var(--status-risco)'} ${Math.round(Math.abs(t-0.5)*2*70+12)}%, transparent)`
                return <td key={m.k} style={{ padding:'10px 8px', textAlign:'center', fontVariantNumeric:'tabular-nums', fontWeight:600, borderRadius:6, background:bg }}>{m.fmt(it[m.k])}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopCreatives({ list }: { list:any[] }) {
  const top = [...list].sort((a,b)=>b.mql-a.mql).slice(0,3)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
      {top.map((c,i)=>(
        <SCard key={c.id} pad={0} style={{ overflow:'hidden' }}>
          <div style={{ display:'flex', gap:12, padding:14 }}>
            <div style={{ position:'relative' }}>
              <Thumb hue={c.hue} w={62} h={62} radius={10} />
              <span style={{ position:'absolute', top:-6, left:-6, width:22, height:22, borderRadius:'50%', background:'var(--brand-accent)', color:'var(--brand-accent-contrast)', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{i+1}</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize:11.5, color:'var(--ws-text-secondary)', textTransform:'capitalize' }}>{c.type}</div>
              <div style={{ display:'flex', gap:14, marginTop:8 }}>
                <div><div style={{ fontSize:11, color:'var(--ws-text-secondary)' }}>MQL</div><div style={{ fontWeight:700, color:'var(--brand-accent)' }}>{c.mql}</div></div>
                <div><div style={{ fontSize:11, color:'var(--ws-text-secondary)' }}>CTR</div><div style={{ fontWeight:700 }}>{c.ctr}%</div></div>
                <div><div style={{ fontSize:11, color:'var(--ws-text-secondary)' }}>Engaj.</div><div style={{ fontWeight:700 }}>{c.engaj}%</div></div>
              </div>
            </div>
          </div>
        </SCard>
      ))}
    </div>
  )
}

function BestCreatives({ list, compareMode, selected, toggle }: { list:any[]; compareMode:boolean; selected:string[]; toggle:(id:string)=>void }) {
  const HOT='#F2385A', COOL='#3EB5C9'
  const videos=list.filter((c)=>c.type==='video'); const maxV=Math.max(...videos.map((c)=>c.views)), maxL=Math.max(...videos.map((c)=>c.likes))
  const heatBg=(t:number,hue:string)=>`color-mix(in srgb, ${hue} ${Math.round(20+t*80)}%, transparent)`
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720 }}>
        <thead><tr style={{ color:'var(--ws-text-secondary)', fontSize:11.5, fontWeight:500, borderBottom:'1px solid var(--ws-border)' }}>
          {compareMode && <th style={{ width:34 }}></th>}
          <th style={{ textAlign:'left', padding:'10px 12px', fontWeight:500 }}>Preview</th>
          <th style={{ textAlign:'left', padding:'10px 12px', fontWeight:500 }}>Criativo</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>ThruPlay</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>V50%</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>Views</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>Likes</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>Coment.</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:500 }}>Shares</th>
        </tr></thead>
        <tbody>
          {videos.map((c)=>{
            const sel=selected.includes(c.id)
            return (
              <tr key={c.id} onClick={()=>compareMode&&toggle(c.id)} style={{ borderBottom:'1px solid var(--ws-border)', cursor:compareMode?'pointer':'default', background:sel?'color-mix(in srgb, var(--brand-accent) 8%, transparent)':'transparent' }}>
                {compareMode && <td style={{ textAlign:'center' }}><input type="checkbox" readOnly checked={sel} /></td>}
                <td style={{ padding:'8px 12px' }}><Thumb hue={c.hue} w={40} h={40} radius={6} /></td>
                <td style={{ padding:'8px 12px', fontWeight:500 }}>{c.name}</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtK(c.thruplay)}</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{c.v50}%</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600, background:heatBg(c.views/maxV,HOT), color:'#fff' }}>{fmt(c.views)}</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600, background:heatBg(c.likes/maxL,COOL), color:'#083b42' }}>{fmt(c.likes)}</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{c.comments}</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{c.shares}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SaudeCriativos({ creatives }: { creatives: ReturnType<typeof mkCreatives> }) {
  const list = creatives
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const toggle=(id:string)=>setSelected((s)=>s.includes(id)?s.filter((x)=>x!==id):(s.length<6?[...s,id]:s))
  const videos=list.filter((c)=>c.type==='video')
  const thruTot=videos.reduce((a,c)=>a+c.thruplay,0); const v50Avg=(videos.reduce((a,c)=>a+c.v50,0)/videos.length).toFixed(1)
  const viewsTot=videos.reduce((a,c)=>a+c.views,0); const engAvg=(list.reduce((a,c)=>a+c.engaj,0)/list.length).toFixed(1)
  const fem=Math.round(list.reduce((a,c)=>a+c.genero.fem,0)/list.length)
  const genderSlices=[{ label:'Feminino', value:fem, color:'var(--brand-accent)' },{ label:'Masculino', value:100-fem, color:'color-mix(in srgb, var(--brand-dark) 60%, var(--ws-border-strong))' }]
  const selItems=list.filter((c)=>selected.includes(c.id))
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr) 1.1fr', gap:16, marginBottom:24 }}>
        <KTile label="ThruPlay" value={fmtK(thruTot)} />
        <KTile label="V50% médio" value={v50Avg+'%'} />
        <KTile label="Views" value={fmtK(viewsTot)} />
        <KTile label="Engajamento médio" value={engAvg+'%'} />
        <SCard pad={16} style={{ display:'flex', alignItems:'center', gap:14 }}>
          <Donut slices={genderSlices} size={92} />
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, marginBottom:6 }}>Audiência por gênero</div>
            {genderSlices.map((s)=>(
              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, marginTop:3 }}>
                <span style={{ width:10, height:10, borderRadius:3, background:s.color }} />{s.label} <b style={{ marginLeft:'auto' }}>{s.value}%</b>
              </div>
            ))}
          </div>
        </SCard>
      </div>
      <div style={{ marginBottom:12, fontFamily:'var(--font-display)', fontWeight:500, fontSize:18 }}>Top 3 criativos</div>
      <div style={{ marginBottom:24 }}><TopCreatives list={list} /></div>
      <SCard pad={0}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:18 }}>{compareMode?'Comparar criativos':'Melhores criativos'}</div>
            <div style={{ fontSize:12, color:'var(--ws-text-secondary)', marginTop:3 }}>{compareMode?`Selecione até 6 criativos (${selected.length} selecionados)`:'Engajamento e vídeo · heatmap de views e likes'}</div>
          </div>
          <button onClick={()=>{setCompareMode((v)=>!v);setSelected([])}} style={{ border:'1px solid var(--ws-border-strong)', background:compareMode?'var(--brand-accent)':'var(--ws-surface)', color:compareMode?'var(--brand-accent-contrast)':'var(--ws-text-primary)', cursor:'pointer', fontWeight:600, fontSize:13, padding:'8px 16px', borderRadius:999 }}>
            {compareMode?'Sair da comparação':'Comparar criativos'}
          </button>
        </div>
        {compareMode && selItems.length>=2 && <div style={{ padding:'0 20px 18px' }}><div style={{ fontSize:12.5, color:'var(--ws-text-secondary)', margin:'4px 0 12px' }}>Mapa de calor — verde melhor, vermelho pior (CP-MQL invertido)</div><CompareHeatmap items={selItems} /></div>}
        {compareMode && selItems.length<2 && <div style={{ padding:'4px 20px 16px', fontSize:13, color:'var(--ws-text-secondary)' }}>Selecione ao menos 2 criativos na lista abaixo para gerar o mapa de calor.</div>}
        <div style={{ padding:'0 8px 12px' }}><BestCreatives list={list} compareMode={compareMode} selected={selected} toggle={toggle} /></div>
      </SCard>
    </div>
  )
}

// ── SaudeSocial ───────────────────────────────────────────────────────────────
const PINK='#FE2C55', CYAN='#25F4EE', PANEL='#141414', CARD_DARK='#1E1E1E', LINE_DARK='#2A2A2A'

function SocialRing({ label, value, rate, big }: { label:string; value:number; rate?:string; big?:boolean }) {
  const s=big?128:108
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div style={{ width:s, height:s, borderRadius:'50%', border:`${big?20:16}px solid ${CYAN}`, borderRightColor:PINK, borderBottomColor:PINK, transform:'rotate(-30deg)', boxShadow:`5px 0 0 -3px ${PINK}` }} />
      <div style={{ textAlign:'center', color:'#fff' }}>
        <div style={{ fontSize:13, opacity:0.85 }}>{label}</div>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:24 }}>{fmt(value)}</div>
        {rate && <div style={{ fontSize:11.5, opacity:0.7 }}>{rate}</div>}
      </div>
    </div>
  )
}

function PinkCard({ title, value, wide }: { title:string; value:string|number; wide?:boolean }) {
  return <div style={{ background:PINK, borderRadius:12, padding:'12px 16px', color:'#fff', boxShadow:`0 0 0 3px #000, 0 0 0 4px ${CYAN}`, flex:wide?'1 1 100%':'1 1 45%' }}><div style={{ fontSize:12.5, opacity:0.9, textAlign:'center' }}>{title}</div><div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:24, textAlign:'center' }}>{value}</div></div>
}

function SocialTimelineChart({ data }: { data:{shares:number;profile:number}[] }) {
  const W=560, H=220, padL=30, padR=10, padT=14, padB=30; const iw=W-padL-padR, ih=H-padT-padB
  const a=data.map((d)=>d.shares), b=data.map((d)=>d.profile)
  const aMax=Math.max(...a)*1.1, bMax=Math.max(...b)*1.1
  const x=(i:number)=>padL+(i/(data.length-1))*iw; const yA=(v:number)=>padT+ih-(v/aMax)*ih; const yB=(v:number)=>padT+ih-(v/bMax)*ih
  const path=(v:number[],y:(n:number)=>number)=>v.map((n,i)=>`${i?'L':'M'} ${x(i)} ${y(n)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
      {[0,0.5,1].map((g)=><line key={g} x1={padL} x2={W-padR} y1={padT+ih*g} y2={padT+ih*g} stroke={LINE_DARK} strokeWidth="1" />)}
      <path d={path(a,yA)} fill="none" stroke={CYAN} strokeWidth="2.2" />
      <path d={path(b,yB)} fill="none" stroke={PINK} strokeWidth="2.2" />
      {[0,Math.floor(data.length/2),data.length-1].map((i)=><text key={i} x={x(i)} y={H-8} textAnchor="middle" fontSize="10" fill="#888">{`${8+i}/06`}</text>)}
    </svg>
  )
}

function ActiveDays({ data }: { data:number[] }) {
  const W=520, H=220, padL=8, padR=8, padT=14, padB=40; const iw=W-padL-padR, ih=H-padT-padB
  const labels=['dom','seg','ter','qua','qui','sex','sáb']; const max=Math.max(...data)*1.12; const bw=(iw/data.length)*0.6
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow:'visible' }}>
      {[0.5,1].map((g)=><line key={g} x1={padL} x2={W-padR} y1={padT+ih*(1-g)} y2={padT+ih*(1-g)} stroke={LINE_DARK} strokeWidth="1" />)}
      {data.map((v,i)=>{const cx=padL+(i+0.5)*(iw/data.length); const h=(v/max)*ih; return <g key={i}><rect x={cx-bw/2} y={padT+ih-h} width={bw} height={h} rx="3" fill={CYAN} /><text x={cx} y={H-20} textAnchor="middle" fontSize="10.5" fill="#aaa">{labels[i]}</text></g>})}
    </svg>
  )
}

function DarkPanel({ title, sub, children }: { title?:string; sub?:string; children:ReactNode }) {
  return (
    <div style={{ background:PANEL, border:`1px solid ${LINE_DARK}`, borderRadius:14, padding:20 }}>
      {title && <div style={{ color:'#fff', fontFamily:'var(--font-display)', fontWeight:600, fontSize:16 }}>{title}</div>}
      {sub && <div style={{ color:'#888', fontSize:12, marginTop:2, marginBottom:10 }}>{sub}</div>}
      {!sub && title && <div style={{ height:12 }} />}
      {children}
    </div>
  )
}

function BestVideos({ list }: { list:any[] }) {
  const maxV=Math.max(...list.map((c)=>c.views)), maxL=Math.max(...list.map((c)=>c.likes))
  const heat=(t:number,c:string)=>`color-mix(in srgb, ${c} ${Math.round(25+t*75)}%, ${CARD_DARK})`
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720, color:'#e8e8e8' }}>
        <thead><tr style={{ color:'#bbb', fontSize:12, borderBottom:`1px solid ${LINE_DARK}` }}>
          <th style={{ textAlign:'left', padding:'10px 12px', fontWeight:600 }}>Preview</th>
          <th style={{ textAlign:'left', padding:'10px 12px', fontWeight:600 }}>Legenda</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:600 }}>Duração</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:600 }}>Views ▾</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:600 }}>Likes</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:600 }}>Shares</th>
          <th style={{ textAlign:'right', padding:'10px 12px', fontWeight:600 }}>Coment.</th>
        </tr></thead>
        <tbody>
          {list.slice(0,6).map((v,i)=>(
            <tr key={i} style={{ borderBottom:`1px solid ${LINE_DARK}` }}>
              <td style={{ padding:'8px 12px' }}><Thumb hue={v.hue} w={44} h={44} radius={6} /></td>
              <td style={{ padding:'8px 12px' }}>{v.caption}<br /><span style={{ fontSize:11, color:'#888' }}>{v.create}</span></td>
              <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{v.duration.toFixed(2)}</td>
              <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, background:heat(v.views/maxV,PINK), color:'#fff' }}>{fmt(v.views)}</td>
              <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, background:heat(v.likes/maxL,CYAN), color:'#06343a' }}>{fmt(v.likes)}</td>
              <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{v.shares}</td>
              <td style={{ padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{v.comments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SaudeSocial({ social }: { social: ReturnType<typeof mkSocial> }) {
  const s = social
  return (
    <div style={{ background:'#000', borderRadius:18, padding:20, display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20, alignItems:'center' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
          <PinkCard wide title="Duração total de vídeos" value={s.totalDuration} />
          <PinkCard title="Vídeos" value={s.videos} />
          <PinkCard title="Comentários" value={fmt(s.comments)} />
          <PinkCard title="Views únicos" value={fmtK(s.uniqueView)} />
          <PinkCard title="Tempo assistido" value={s.totalTimeWatched} />
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-around', gap:6, flexWrap:'wrap' }}>
          <SocialRing big label="Views" value={s.views} />
          <span style={{ color:CYAN, fontSize:20 }}>→</span>
          <SocialRing label="Likes" value={s.likes} rate={`Taxa ${s.likesRate.toString().replace('.',',')}%`} />
          <span style={{ color:CYAN, fontSize:20 }}>→</span>
          <SocialRing label="Comentários" value={s.comments} rate={`Taxa ${s.commentsRate.toString().replace('.',',')}%`} />
          <span style={{ color:CYAN, fontSize:20 }}>→</span>
          <SocialRing label="Shares" value={s.sharesN} rate={`Taxa ${s.sharesRate.toString().replace('.',',')}%`} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
        <DarkPanel title="Timeline insights">
          <div style={{ display:'flex', gap:16, fontSize:12, color:'#bbb', marginBottom:6 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:3, background:CYAN }} />Total shares</span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:3, background:PINK }} />Profile views</span>
          </div>
          <SocialTimelineChart data={s.timeline} />
        </DarkPanel>
        <DarkPanel title="Dias mais ativos" sub="dias da semana com mais views">
          <ActiveDays data={s.active} />
        </DarkPanel>
      </div>
      <DarkPanel title="🔥 Melhores vídeos"><BestVideos list={s.best} /></DarkPanel>
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
    <div style={{ display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:24, alignItems:'start' }}>
      <SCard>
        <CardTitle title="Radar da marca" sub="Forças, fraquezas e oportunidades — arraste as alavancas para simular"
          right={changed?<button onClick={()=>setLv({invest:0,criativo:50,publico:50})} style={{ border:'1px solid var(--ws-border-strong)', background:'var(--ws-surface)', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--ws-text-secondary)' }}>Redefinir</button>:null} />
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

function SharePie({ title, slices, costLabel }: { title:string; slices:{label:string;value:number;color:string;cost:string}[]; costLabel:string }) {
  const total=slices.reduce((a,s)=>a+s.value,0)
  return (
    <SCard>
      <div style={{ fontFamily:'var(--font-display)', fontWeight:500, fontSize:15, marginBottom:12 }}>{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:18 }}>
        <Donut slices={slices} size={130} />
        <div style={{ flex:1, minWidth:0 }}>
          {slices.map((s)=>(
            <div key={s.label} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center', padding:'4px 0', fontSize:12.5 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:7, minWidth:0 }}>
                <span style={{ width:10, height:10, borderRadius:3, background:s.color, flex:'0 0 auto' }} />
                <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span>
              </span>
              <span style={{ fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{Math.round(s.value/total*100)}%</span>
              <span style={{ color:'var(--ws-text-secondary)', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{costLabel} {s.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </SCard>
  )
}

function ChannelShare({ channels }: { channels:{name:string;mql:number;cpmql:number;trend:number[]}[] }) {
  const mqlSlices=channels.map((c,i)=>({ label:c.name, value:c.mql, color:CH_COLORS[i%CH_COLORS.length], cost:money(c.cpmql) }))
  const sqlSlices=channels.map((c,i)=>{ const sql=Math.max(1,Math.round(c.mql*0.38)); const invest=c.mql*c.cpmql; return { label:c.name, value:sql, color:CH_COLORS[i%CH_COLORS.length], cost:money(Math.round(invest/sql)) } })
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop:24 }}>
      <SharePie title="Share de MQL por canal" slices={mqlSlices} costLabel="CP-MQL" />
      <SharePie title="Share de SQL por canal" slices={sqlSlices} costLabel="CP-SQL" />
    </div>
  )
}

function SMOverview({ b, channels, acqFunnel }: { b: BrandData; channels: ReturnType<typeof buildChannels>; acqFunnel: ReturnType<typeof buildAcqFunnel> }) {
  const [showShare, setShowShare] = useState(false)

  const funnelData=acqFunnel.stages.map((s)=>({ ...s, fmt:fmtK }))

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:16, marginBottom:24 }}>
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="Investimento" value={money(b.invest)} />
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="MQLs" value={b.mql} />
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="SQLs" value={b.sql} />
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="CP-MQL" value={money(b.cpmql)} />
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="CP-SQL" value={money(b.cpsql)} />
        <MetricCard style={{ '--fs-metric':'26px' } as any} label="Atingimento" value={b.meta} unit="%" accent={false} />
      </div>

      <SCard style={{ marginBottom:24 }}>
        <CardTitle title="Funil de aquisição" sub="Do investimento em mídia ao cliente" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:12, marginBottom:22 }}>
          {acqFunnel.cards.map((c)=>(
            <div key={c.label} style={{ background:'color-mix(in srgb, var(--brand-accent) 8%, var(--ws-surface))', border:'1px solid color-mix(in srgb, var(--brand-accent) 22%, var(--ws-border))', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:12, color:'var(--ws-text-secondary)' }}>{c.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:20, marginTop:2 }}>{c.value}</div>
            </div>
          ))}
        </div>
        <MiniFunnel stages={funnelData} />
      </SCard>

      <div style={{ display:'grid', gridTemplateColumns:'1.25fr 1fr', gap:24 }}>
        <SCard>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:14 }}>
            <button onClick={()=>setShowShare((v)=>!v)} style={{ display:'inline-flex', alignItems:'center', gap:8, border:'none', background:'transparent', cursor:'pointer', padding:0, fontFamily:'var(--font-display)', fontWeight:500, fontSize:21, color:'var(--ws-text-primary)' }}>
              Desempenho por canal
              <span style={{ fontSize:12, color:'var(--brand-accent)', fontFamily:'var(--font-body)', fontWeight:600 }}>{showShare?'▲ share':'▼ share'}</span>
            </button>
            <Badge tone="neutral">CP-MQL</Badge>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1.2fr 0.7fr 0.7fr 1fr', gap:12, fontSize:12, color:'var(--ws-text-secondary)', fontWeight:500, paddingBottom:4 }}>
            <div>Canal</div><div style={{ textAlign:'right' }}>Volume</div><div style={{ textAlign:'right' }}>Custo</div><div style={{ textAlign:'right' }}>Tendência</div>
          </div>
          {channels.map((c)=><ChannelRow key={c.name} c={c} />)}
        </SCard>

        <SCard>
          <CardTitle title="Funil da marca" sub="Conversão MQL → SQL → SAL → Fechamento" />
          <MiniFunnel stages={[
            { label:'MQL',   value:b.mql },
            { label:'SQL',   value:b.sql },
            { label:'SAL',   value:b.sal },
            { label:'Fech.', value:b.fech },
          ]} />
        </SCard>
      </div>

      {showShare && <ChannelShare channels={channels} />}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SaudeDaMarca() {
  const { activeBrand } = useMarcaSelecionada()
  const [view, setView] = useState('overview')
  const [range, setRange] = useState(makeMtd)

  const dataInicio = range.start
  const dataFim    = range.end
  const mes        = useMemo(() => `${range.start.slice(0, 7)}-01`, [range.start])
  const marca      = SLUG_TO_MARCA[activeBrand]

  const { data: mediaData,  loading: mediaLoading  } = useMediaData({ marca, dataInicio, dataFim })
  const { data: crmData,   loading: crmLoading   } = useCrmFunil({ marca, dataInicio, dataFim: dataFim + 'T23:59:59' })
  const { data: leadsData, loading: leadsLoading } = useLeads({ marca, dataInicio, dataFim })
  const { data: metasData } = useMetas({ marca, mes })

  const def = BRAND_DEFS.find(d => d.key === activeBrand) ?? BRAND_DEFS[0]
  const b = computeBrand(mediaData, leadsData, crmData, metasData, def)
  const totalMediaLeads = mediaData.reduce((s, r) => s + r.leads, 0)
  const campaigns = buildCampaigns(mediaData, b.mql, b.sql)
  const daily = buildDailySeries(mediaData)
  const channels = buildChannels(mediaData, b.mql, totalMediaLeads)
  const acqFunnel = buildAcqFunnel(b, mediaData)
  const publics = mkPublics(b)
  const creatives = mkCreatives(b)
  const social = mkSocial(b)

  const loading = mediaLoading || crmLoading || leadsLoading

  const periodLabel = useMemo(() => {
    if (range.start.slice(0, 7) === range.end.slice(0, 7)) return monthLabel(range.start)
    return `${range.start} – ${range.end}`
  }, [range])

  const body = loading
    ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando dados...</div>
    : (() => {
        switch (view) {
          case 'campanhas': return <SaudeCampanhas b={b} campaigns={campaigns} daily={daily} dataInicio={dataInicio} />
          case 'conjuntos': return <SaudeConjuntos b={b} campaigns={campaigns} publics={publics} />
          case 'anuncios':  return <SaudeAnuncios  b={b} campaigns={campaigns} />
          case 'publicos':  return <SaudePublicos  publics={publics} />
          case 'criativos': return <SaudeCriativos creatives={creatives} />
          case 'social':    return <SaudeSocial    social={social} />
          case 'radar':     return <SaudeRadar     b={b} />
          default:          return <SMOverview     b={b} channels={channels} acqFunnel={acqFunnel} />
        }
      })()

  return (
    <div style={{ padding: 'var(--container-pad)' }}>
      <PageTop
        title={b.label}
        subtitle={`Saúde da marca · ${SM_TABS.find(t => t.key === view)!.label} · ${periodLabel}`}
        badge={<StatusPill status={b.status} value={b.meta + '%'} label="da meta" />}
        actions={<PeriodPicker value={range} onChange={setRange} />}
      />
      <SMTabs value={view} onChange={setView} />
      {body}
    </div>
  )
}
