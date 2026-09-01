import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useMetasClosers, CLOSERS_ATIVOS } from '@/hooks/useMetasClosers'
import type { CloserMeta } from '@/hooks/useMetasClosers'
import { useMetasSDRs, type SdrMeta } from '@/hooks/useMetasSDRs'
import { useHistoricoAtingimento, MESES_HISTORICO_LABELS } from '@/hooks/useHistoricoAtingimento'
import { useMetasMarca, upsertMetaMarca, MARCAS_FRANQUIA, USE_MOCK, type MetaMarca } from '@/hooks/useMetasMarca'
import { useRealizadoPorMarca } from '@/hooks/useRealizadoPorMarca'
import { money, pct } from '@/lib/format'

const MES_ATIVO = '2026-09-01'
const MES_LABEL = 'Setembro 2026'
const MES_SHORT = 'Setembro 2026'
const MES_INICIO = new Date(2026, 8, 1)   // 1º set 2026
const MES_FIM = new Date(2026, 8, 30)     // 30 set 2026
const DIAS_MES = 30
const POOL_PREMIOS = 12000

const VOLTAS = [
  { num: 1, inicio: 1,  fim: 7,  label: 'Volta 1 · 1–7 set' },
  { num: 2, inicio: 8,  fim: 14, label: 'Volta 2 · 8–14 set' },
  { num: 3, inicio: 15, fim: 21, label: 'Volta 3 · 15–21 set' },
  { num: 4, inicio: 22, fim: 30, label: 'Volta 4 · 22–30 set' },
]

const MARCA_COR: Record<string, string> = {
  'Oral Unic':  '#7F0C72',
  'Inpot':      '#C6D32D',
  'Eletrovias': '#ED6D3A',
  'Lisô Laser': '#FF6643',
  'B2Case':     '#0169F2',
  'Viva':       '#FF0069',
}

function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1_000)     return 'R$ ' + Math.round(n / 1_000).toLocaleString('pt-BR') + 'k'
  return money(n)
}

function diaDoMes(): number {
  const hoje = new Date()
  if (hoje < MES_INICIO) return 0
  if (hoje > MES_FIM) return DIAS_MES
  return hoje.getDate()
}

function voltaAtual(dia: number): number {
  if (dia <= 7) return 1
  if (dia <= 14) return 2
  if (dia <= 21) return 3
  return 4
}

export function CampanhaMetas() {
  const [ciclo, setCiclo] = useState<'semanal' | 'mensal'>('semanal')
  const dia = diaDoMes()
  const [voltaSelecionada, setVoltaSelecionada] = useState<number>(voltaAtual(dia))

  const { closers, loading: loadingClosers, metasCadastradas } = useMetasClosers(MES_ATIVO)
  const { historico, loading: loadingHist } = useHistoricoAtingimento()

  // Ranking ordenado por % atingimento desc, empate por realizado desc
  const ranking = useMemo(
    () => [...closers].sort((a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado),
    [closers],
  )
  const pole = ranking[0] ?? null

  // Totais do time
  const totais = useMemo(() => {
    return closers.reduce(
      (acc, c) => ({
        metaFin: acc.metaFin + c.metaFinanceira,
        metaQtd: acc.metaQtd + c.metaQtdVendas,
        realFin: acc.realFin + c.realizado,
        realQtd: acc.realQtd + c.realizadoQtd,
      }),
      { metaFin: 0, metaQtd: 0, realFin: 0, realQtd: 0 },
    )
  }, [closers])

  const pctTotal = totais.metaFin > 0 ? (totais.realFin / totais.metaFin) * 100 : 0
  const pctEsperado = (dia / DIAS_MES) * 100
  const diasRestantes = Math.max(0, DIAS_MES - dia)
  const volta = voltaAtual(dia)

  return (
    <div style={{ padding: '24px 32px', background: '#faf9f5', minHeight: 'calc(100vh - 56px)' }}>
      <PageTop
        title="Campanha de Metas"
        subtitle={`Plataforma de metas e incentivos · temática do mês: Fórmula 1 · dia ${dia}/${DIAS_MES}`}
        titleAside={
          <span style={{ padding: '4px 12px', borderRadius: 999, background: 'var(--ws-brand)', color: '#fff', fontSize: 13, fontWeight: 500 }}>
            {MES_SHORT}
          </span>
        }
      />

      {!metasCadastradas && !loadingClosers && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', fontSize: 13,
        }}>
          ⚠️ <b>Metas de setembro ainda não cadastradas em DB_Metas_Performance.</b>
          Ranking, cards de piloto e meta do time aparecem zerados até o time cadastrar.
        </div>
      )}

      <HeroBanner volta={volta} diasRestantes={diasRestantes} pole={pole} />

      <CicloVoltas
        ciclo={ciclo}
        setCiclo={setCiclo}
        voltaSelecionada={voltaSelecionada}
        setVoltaSelecionada={setVoltaSelecionada}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 20, marginTop: 20 }}>
        <ClassificacaoCard ranking={ranking} voltaLabel={VOLTAS[voltaSelecionada - 1].label} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <MetaTimeCard
            loading={loadingClosers}
            realFin={totais.realFin}
            metaFin={totais.metaFin}
            realQtd={totais.realQtd}
            metaQtd={totais.metaQtd}
            pctAtingido={pctTotal}
            pctEsperado={pctEsperado}
          />

          <PremiosGrid />

          <PilotosGrid closers={closers} historico={historico} loading={loadingClosers || loadingHist} />
        </div>
      </div>

      <HistoricoTable historico={historico} loading={loadingHist} />

      <SdrsSection />

      <MetasMarcaSection />
    </div>
  )
}

/* ── Hero F1 ────────────────────────────────────────────────────────────── */

const CHECKERED_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'>" +
  "<rect width='8' height='8' fill='%23ffffff' fill-opacity='0.05'/>" +
  "<rect x='8' y='8' width='8' height='8' fill='%23ffffff' fill-opacity='0.05'/>" +
  "</svg>\")"

function HeroBanner({ volta, diasRestantes, pole }: { volta: number; diasRestantes: number; pole: CloserMeta | null }) {
  return (
    <div style={{
      position: 'relative', background: '#141419', borderRadius: 16, overflow: 'hidden',
      padding: '28px 32px', marginBottom: 20,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: '#E10600' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '55%',
        backgroundImage: CHECKERED_BG,
        maskImage: 'linear-gradient(to right, transparent 0%, black 30%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#E10600', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Fórmula 1 · {MES_LABEL}
        </div>
        <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 500, color: '#fff', lineHeight: 1.05 }}>
          GP We Scale
        </h1>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
          Cada semana é uma volta. Cada venda, uma ultrapassagem.
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <HeroChip dot="#E10600">Volta {volta} de 4</HeroChip>
          <HeroChip>{diasRestantes} dias para a bandeirada</HeroChip>
          <HeroChip>Pool de prêmios · {moneyCompact(POOL_PREMIOS)}</HeroChip>
        </div>
      </div>

      <PolePositionCard pole={pole} />
    </div>
  )
}

function HeroChip({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.85)', fontSize: 13,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
      {children}
    </span>
  )
}

function PolePositionCard({ pole }: { pole: CloserMeta | null }) {
  return (
    <div style={{
      position: 'relative', zIndex: 1,
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '14px 18px', minWidth: 220,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
        Pole position · mês
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 999,
          background: pole?.cor ?? 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
        }}>
          {pole?.iniciais ?? '—'}
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>{pole?.nome ?? '—'}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
            {pole ? `${pct(pole.pctAtingimento, 0)} da meta · ${money(pole.realizado)}` : 'sem dados'}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Toggle Ciclo + Voltas ──────────────────────────────────────────────── */

function CicloVoltas({
  ciclo, setCiclo, voltaSelecionada, setVoltaSelecionada,
}: {
  ciclo: 'semanal' | 'mensal'
  setCiclo: (c: 'semanal' | 'mensal') => void
  voltaSelecionada: number
  setVoltaSelecionada: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{
        display: 'inline-flex', background: '#fff', border: '1px solid var(--ws-border)',
        borderRadius: 999, padding: 4,
      }}>
        {(['semanal', 'mensal'] as const).map(c => {
          const ativo = ciclo === c
          return (
            <button key={c} onClick={() => setCiclo(c)} style={{
              padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: ativo ? 'var(--ws-brand)' : 'transparent',
              color: ativo ? '#fff' : 'var(--ws-text-primary)',
              fontSize: 13, fontWeight: ativo ? 500 : 400,
            }}>
              Ciclo {c}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {VOLTAS.map(v => {
          const ativo = v.num === voltaSelecionada
          return (
            <button key={v.num} onClick={() => setVoltaSelecionada(v.num)} style={{
              padding: '8px 14px', borderRadius: 999,
              border: '1px solid ' + (ativo ? 'var(--ws-brand)' : 'var(--ws-border)'),
              background: ativo ? 'var(--ws-brand)' : '#fff',
              color: ativo ? '#fff' : 'var(--ws-text-primary)',
              fontSize: 12, fontWeight: ativo ? 500 : 400, cursor: 'pointer',
            }}>
              {v.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Classificação (col esquerda dark) ─────────────────────────────────── */

function ClassificacaoCard({ ranking, voltaLabel }: { ranking: CloserMeta[]; voltaLabel: string }) {
  return (
    <div style={{
      background: '#141419', borderRadius: 16, padding: '20px 0',
      color: '#fff', height: 'fit-content',
    }}>
      <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, background: '#E10600' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Classificação
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{voltaLabel}</span>
      </div>

      {ranking.map((c, i) => {
        const pos = i + 1
        return (
          <div key={c.nome} style={{
            display: 'grid', gridTemplateColumns: '36px 4px 1fr auto',
            gap: 12, padding: '12px 20px', alignItems: 'center',
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>P{pos}</div>
            <div style={{ width: 4, height: 40, background: c.cor, borderRadius: 2 }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.cor, letterSpacing: 0.5 }}>{c.iniciais}</span>
                <span style={{ fontSize: 13, color: '#fff' }}>{c.nome}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{money(c.realizado)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {c.metaFinanceira > 0 ? `${pct(c.pctAtingimento, 0)} da meta` : 'sem meta'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Meta do time ───────────────────────────────────────────────────────── */

interface MetaTimeCardProps {
  loading: boolean
  realFin: number
  metaFin: number
  realQtd: number
  metaQtd: number
  pctAtingido: number
  pctEsperado: number
}

function MetaTimeCard({ loading, realFin, metaFin, realQtd, metaQtd, pctAtingido, pctEsperado }: MetaTimeCardProps) {
  const status: 'abaixo' | 'no' | 'acima' =
    pctAtingido < pctEsperado - 5 ? 'abaixo' : pctAtingido > pctEsperado + 5 ? 'acima' : 'no'
  const statusMap = {
    abaixo: { label: 'abaixo do ritmo', bg: '#FEE2E2', fg: '#B91C1C', dot: '#EF4444' },
    no:     { label: 'no ritmo',        bg: '#DBEAFE', fg: '#1E40AF', dot: '#3B82F6' },
    acima:  { label: 'acima do ritmo',  bg: '#DCFCE7', fg: '#166534', dot: '#22C55E' },
  }[status]
  const pctBar = Math.max(0, Math.min(100, pctAtingido))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
            Meta do time · {MES_LABEL}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Soma das metas individuais dos closers
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
          background: statusMap.bg, color: statusMap.fg, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusMap.dot }} />
          {statusMap.label}
        </span>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500, color: 'var(--ws-brand)', lineHeight: 1 }}>
          {loading ? '—' : money(realFin)}
        </span>
        <span style={{ fontSize: 15, color: 'var(--ws-text-secondary)' }}>
          de {moneyCompact(metaFin)} · {realQtd}/{metaQtd} un · {pct(pctAtingido, 0)}
        </span>
      </div>

      <div style={{ marginTop: 16, height: 8, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pctBar}%`, height: '100%', background: 'var(--ws-brand)', transition: 'width 400ms ease' }} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>ritmo esperado · {pct(pctEsperado, 0)} do mês</span>
        <span>bandeirada · 30 · set</span>
      </div>
    </div>
  )
}

/* ── Prêmios (4 cards, incluindo Troféu Senna) ─────────────────────────── */

const PREMIOS: Array<{ titulo: string; desc: string; premio: string; status: string; cor?: string }> = [
  {
    titulo: 'Pole Position',
    desc: 'Primeiro a cruzar a meta da semana',
    premio: 'R$ 500 + pole no ranking',
    status: 'Volta 1 · em disputa',
  },
  {
    titulo: 'Volta Mais Rápida',
    desc: 'Maior contrato único do mês',
    premio: 'Jantar premium para 2',
    status: 'Em disputa',
  },
  {
    titulo: 'Pit Stop Perfeito',
    desc: '100% dos leads respondidos em menos de 5 min na semana',
    premio: 'Day off na sexta',
    status: 'Em disputa',
  },
  {
    titulo: "Troféu Senna · Mônaco '88",
    desc: 'Volta perfeita: bater a meta nas 4 voltas do mês — como Senna, imbatível em Mônaco',
    premio: 'Troféu Senna + R$ 1.000',
    status: 'Em aberto · 4 pilotos na disputa',
    cor: '#FFD400',
  },
]

function PremiosGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {PREMIOS.map(p => (
        <div key={p.titulo} style={{
          background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12,
          padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, background: p.cor ?? '#E10600' }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{p.titulo}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{p.desc}</div>
          <div style={{ fontSize: 13 }}>🏆 {p.premio}</div>
          <div style={{
            marginTop: 4, padding: '6px 10px', borderRadius: 6,
            background: '#F9FAFB', fontSize: 11, color: 'var(--ws-text-secondary)',
          }}>
            {p.status}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Pilotos grid (4 cards) ─────────────────────────────────────────────── */

function PilotosGrid({
  closers, historico, loading,
}: {
  closers: CloserMeta[]
  historico: ReturnType<typeof useHistoricoAtingimento>['historico']
  loading: boolean
}) {
  const ranking = useMemo(
    () => [...closers].sort((a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado),
    [closers],
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
      {ranking.map((c, i) => {
        const posicao = i + 1
        const hist = historico.find(h => h.nome === c.nome)
        return (
          <PilotoCard key={c.nome} closer={c} posicao={posicao} historico={hist?.meses ?? []} loading={loading} />
        )
      })}
    </div>
  )
}

function PilotoCard({
  closer, posicao, historico, loading,
}: {
  closer: CloserMeta
  posicao: number
  historico: ReturnType<typeof useHistoricoAtingimento>['historico'][number]['meses']
  loading: boolean
}) {
  const status: 'abaixo' | 'no' | 'acima' | 'sem' =
    closer.metaFinanceira === 0 ? 'sem'
    : closer.pctAtingimento < 30 ? 'abaixo'
    : closer.pctAtingimento < 80 ? 'no'
    : 'acima'
  const statusMap = {
    abaixo: { label: 'abaixo do ritmo', color: '#EF4444' },
    no:     { label: 'em ritmo',        color: '#3B82F6' },
    acima:  { label: 'acima do ritmo',  color: '#22C55E' },
    sem:    { label: 'sem meta',        color: '#9CA3AF' },
  }[status]

  const pillBg = status === 'sem' ? '#F3F4F6' : status === 'abaixo' ? '#FEE2E2' : status === 'no' ? '#DBEAFE' : '#DCFCE7'
  const pillFg = status === 'sem' ? '#6B7280' : status === 'abaixo' ? '#B91C1C' : status === 'no' ? '#1E40AF' : '#166534'

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
      <VendedorFoto foto={closer.foto} iniciais={closer.iniciais} cor={closer.cor} nome={closer.nome} escuderia={closer.escuderia} />

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{closer.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
              P{posicao} no ciclo semanal
            </div>
          </div>
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: pillBg, color: pillFg,
            fontSize: 11, fontWeight: 500,
          }}>
            {closer.metaFinanceira > 0 ? pct(closer.pctAtingimento, 0) : '—'}
          </span>
        </div>

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
          <span>
            <span style={{ fontWeight: 500 }}>{loading ? '—' : money(closer.realizado)}</span>
            <span style={{ color: 'var(--ws-text-secondary)' }}> de {moneyCompact(closer.metaFinanceira)} · </span>
            <span style={{ fontWeight: 500 }}>{closer.realizadoQtd}/{closer.metaQtdVendas}</span>
            <span style={{ color: 'var(--ws-text-secondary)' }}> un</span>
          </span>
          <span style={{ fontSize: 11, color: statusMap.color, fontWeight: 500 }}>{statusMap.label}</span>
        </div>

        {/* 6 barras histórico mar-ago */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {historico.length === 6 ? historico.map((h, i) => (
              <div key={i} title={`${h.mes}: ${pct(h.pctAtingimento, 0)}`}>
                <BarraHistorico pct={h.pctAtingimento} temMeta={h.metaFinanceira > 0} />
              </div>
            )) : Array.from({ length: 6 }).map((_, i) => (
              <BarraHistorico key={i} pct={0} temMeta={false} />
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--ws-text-secondary)', letterSpacing: 0.5 }}>
            Histórico de atingimento · mar-ago
          </div>
        </div>
      </div>
    </div>
  )
}

/** Renderiza foto real do vendedor quando `foto` existe; fallback pras iniciais
 *  em círculo colorido sobre fundo carbono + bandeirada. Usado por PilotoCard
 *  (closers) e SdrCard (SDRs). */
function VendedorFoto({
  foto, iniciais, cor, nome, escuderia, altura = 200,
}: {
  foto?: string
  iniciais: string
  cor: string
  nome: string
  escuderia?: string
  altura?: number
}) {
  if (foto) {
    return (
      <div style={{
        position: 'relative',
        height: altura,
        overflow: 'hidden',
        background: '#141419',
      }}>
        <img
          src={foto}
          alt={nome}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 20%',
          }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: cor }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(20,20,25,0.65) 0%, transparent 45%)',
          pointerEvents: 'none',
        }} />
        {escuderia && (
          <div style={{
            position: 'absolute', bottom: 8, left: 14, right: 14,
            fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.75)',
          }}>
            {escuderia}
          </div>
        )}
      </div>
    )
  }

  // Fallback: iniciais coloridas sobre fundo carbono + bandeirada
  return (
    <div style={{
      background: '#141419', height: altura, position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: CHECKERED_BG }} />
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: cor }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: 60, height: 60, borderRadius: 999,
        background: cor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 600, letterSpacing: 1,
        border: '3px solid rgba(255,255,255,0.15)',
      }}>
        {iniciais}
      </div>
      <div style={{
        position: 'absolute', bottom: 8, left: 12, right: 12,
        fontSize: 11, color: 'rgba(255,255,255,0.6)',
      }}>
        Foto · {nome}
      </div>
    </div>
  )
}

function BarraHistorico({ pct: valor, temMeta }: { pct: number; temMeta: boolean }) {
  const cor = !temMeta ? '#D1D5DB' : valor >= 100 ? '#14B8A6' : valor >= 50 ? '#F59E0B' : '#FCA5A5'
  const altura = !temMeta ? 12 : Math.max(12, Math.min(40, valor * 0.4))
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{
        width: '100%', height: altura, background: cor, borderRadius: 4,
        transition: 'height 300ms ease',
      }} />
    </div>
  )
}

/* ── Tabela Histórico de resultados ─────────────────────────────────────── */

function HistoricoTable({
  historico, loading,
}: {
  historico: ReturnType<typeof useHistoricoAtingimento>['historico']
  loading: boolean
}) {
  return (
    <div style={{
      marginTop: 20, background: '#fff', border: '1px solid var(--ws-border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>
          Histórico de resultados
        </h3>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
          Atingimento da meta mensal por pessoa · últimos 6 meses
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--ws-bg)', borderTop: '1px solid var(--ws-border)', borderBottom: '1px solid var(--ws-border)' }}>
              <th style={{ ...thHist, textAlign: 'left' }}>PILOTO</th>
              {MESES_HISTORICO_LABELS.map(m => (
                <th key={m} style={thHist}>{m}</th>
              ))}
              <th style={{ ...thHist, background: '#F3F4F6' }}>MÉDIA</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...tdHist, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</td></tr>
            ) : historico.map(h => {
              const cor = CLOSERS_ATIVOS.find(c => c.nome === h.nome)?.cor ?? '#888'
              return (
                <tr key={h.nome} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={{ ...tdHist, textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: cor }} />
                      {h.nome}
                    </span>
                  </td>
                  {h.meses.map(m => (
                    <td key={m.mes} style={tdHist}>
                      <PctBadge pct={m.pctAtingimento} temMeta={m.metaFinanceira > 0} />
                    </td>
                  ))}
                  <td style={{ ...tdHist, fontWeight: 600, background: '#F9FAFB' }}>
                    {pct(h.media, 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thHist: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'center',
  fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--ws-text-secondary)',
}
const tdHist: React.CSSProperties = { padding: '10px 12px', textAlign: 'center' }

function PctBadge({ pct: valor, temMeta }: { pct: number; temMeta: boolean }) {
  if (!temMeta) {
    return <span style={{ fontSize: 11, color: '#9CA3AF' }}>—</span>
  }
  const tier = valor >= 100 ? 'ok' : valor >= 50 ? 'mid' : 'low'
  const map = {
    ok:  { bg: '#DCFCE7', fg: '#166534' },
    mid: { bg: '#FEF3C7', fg: '#92400E' },
    low: { bg: '#FEE2E2', fg: '#B91C1C' },
  }[tier]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: map.bg, color: map.fg, fontSize: 11, fontWeight: 500,
      minWidth: 46, textAlign: 'center',
    }}>
      {pct(valor, 0)}
    </span>
  )
}

/* ── Grid dos SDRs ──────────────────────────────────────────────────────── */

function SdrsSection() {
  const { sdrs, loading, metasCadastradas } = useMetasSDRs(MES_ATIVO)

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#E10600', letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Grid dos SDRs
          </div>
          <h2 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
            Quem gera o ritmo da corrida
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Meta de SQL, agendamento e reunião realizada por SDR — Setembro/2026
          </div>
        </div>
      </div>

      {!metasCadastradas && !loading && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 8,
          background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', fontSize: 12,
        }}>
          ⚠️ Metas de setembro/2026 dos SDRs ainda não cadastradas em <code>DB_Metas_Performance</code>.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {sdrs.map(sdr => (
          <SdrCard key={sdr.nome} sdr={sdr} loading={loading} />
        ))}
      </div>
    </section>
  )
}

function SdrCard({ sdr, loading }: { sdr: SdrMeta; loading: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
      <VendedorFoto foto={sdr.foto} iniciais={sdr.iniciais} cor={sdr.cor} nome={sdr.nome} escuderia={sdr.escuderia} />

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{sdr.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              SDR
            </div>
          </div>
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: '#F3F4F6', color: '#6B7280',
            fontSize: 10, fontWeight: 500, letterSpacing: '.06em',
          }}>
            AGUARDANDO
          </span>
        </div>

        {/* Métricas SDR */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetricaLinha
            label="SQL"
            realizado={sdr.realizadoSql}
            meta={sdr.metaSql}
            loading={loading}
          />
          <MetricaLinha
            label="Reunião realizada"
            realizado={sdr.realizadoReuniao}
            meta={sdr.metaReuniao}
            loading={loading}
          />
          <MetricaLinha
            label="Agendamento"
            realizado={0}
            meta={sdr.metaAgendamento}
            loading={loading}
            semRealizado
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>
          Realizado em definição com o time — cards ficam prontos assim que fonte for confirmada.
        </div>
      </div>
    </div>
  )
}

function MetricaLinha({
  label, realizado, meta, loading, semRealizado = false,
}: {
  label: string
  realizado: number
  meta: number
  loading: boolean
  semRealizado?: boolean
}) {
  const pctVal = meta > 0 ? (realizado / meta) * 100 : 0
  const barWidth = Math.min(100, Math.max(0, pctVal))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--ws-text-secondary)' }}>{label}</span>
        <span>
          {semRealizado ? (
            <span style={{ color: 'var(--ws-text-secondary)' }}>meta {loading ? '—' : meta}</span>
          ) : (
            <>
              <span style={{ fontWeight: 500 }}>{loading ? '—' : realizado}</span>
              <span style={{ color: 'var(--ws-text-secondary)' }}> / {meta}</span>
            </>
          )}
        </span>
      </div>
      {!semRealizado && (
        <div style={{ height: 4, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${barWidth}%`, height: '100%',
            background: pctVal >= 100 ? '#14B8A6' : pctVal >= 50 ? '#F59E0B' : '#CBD5E1',
            transition: 'width 300ms ease',
          }} />
        </div>
      )}
    </div>
  )
}

/* ── Seção separada: metas por marca (editor) ───────────────────────────── */

function MetasMarcaSection() {
  const [editando, setEditando] = useState<MetaMarca | null>(null)
  const [mesMarcaRef, setMesMarcaRef] = useState<string>('2026-09-01')
  const { metas, loading: loadingMetas, reload } = useMetasMarca(mesMarcaRef)
  const { porMarca: realizadoMap, loading: loadingReal } = useRealizadoPorMarca(mesMarcaRef)
  const loading = loadingMetas || loadingReal

  const linhas = useMemo(() => {
    return MARCAS_FRANQUIA.map(marca => {
      const meta = metas.find(m => m.marca === marca)
      const real = realizadoMap.get(marca)
      const metaQtd = meta?.metaQtd ?? 0
      const metaFat = meta?.metaFaturamento ?? 0
      const realQtd = real?.qtd ?? 0
      const realFat = real?.faturamento ?? 0
      return {
        marca, cor: MARCA_COR[marca] ?? '#888',
        metaQtd, metaFat, realQtd, realFat,
        pctFat: metaFat > 0 ? (realFat / metaFat) * 100 : 0,
        meta,
      }
    })
  }, [metas, realizadoMap])

  const total = useMemo(() => linhas.reduce(
    (acc, l) => ({ metaQtd: acc.metaQtd + l.metaQtd, metaFat: acc.metaFat + l.metaFat, realQtd: acc.realQtd + l.realQtd, realFat: acc.realFat + l.realFat }),
    { metaQtd: 0, metaFat: 0, realQtd: 0, realFat: 0 },
  ), [linhas])

  const MESES = [
    { key: '2026-09-01', label: 'Setembro' },
    { key: '2026-10-01', label: 'Outubro' },
    { key: '2026-11-01', label: 'Novembro' },
    { key: '2026-12-01', label: 'Dezembro' },
  ]

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>
            Metas por marca (franqueadora)
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Base da planilha "Meta - Venda de Franquia". Editar aqui atualiza a fonte oficial da meta por marca.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {MESES.map(m => (
            <button key={m.key} onClick={() => setMesMarcaRef(m.key)} style={{
              padding: '6px 12px', borderRadius: 999,
              border: '1px solid ' + (mesMarcaRef === m.key ? 'var(--ws-brand)' : 'var(--ws-border)'),
              background: mesMarcaRef === m.key ? 'var(--ws-brand)' : '#fff',
              color: mesMarcaRef === m.key ? '#fff' : 'var(--ws-text-primary)',
              fontSize: 12, cursor: 'pointer',
            }}>{m.label}</button>
          ))}
        </div>
      </div>

      {USE_MOCK && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 8,
          background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', fontSize: 12,
        }}>
          ⚠️ Tabela <code>DB_Metas_Marca</code> ainda não existe. Metas em fallback local · edições não persistem.
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)' }}>
                <th style={thMarca}>Marca</th>
                <th style={{ ...thMarca, textAlign: 'right' }}>Meta un</th>
                <th style={{ ...thMarca, textAlign: 'right' }}>Real un</th>
                <th style={{ ...thMarca, textAlign: 'right' }}>Meta R$</th>
                <th style={{ ...thMarca, textAlign: 'right' }}>Real R$</th>
                <th style={{ ...thMarca, textAlign: 'right' }}>% atingido</th>
                <th style={{ ...thMarca, textAlign: 'center' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.marca} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={{ ...tdMarca, borderLeft: `3px solid ${l.cor}`, paddingLeft: 20, fontWeight: 500 }}>{l.marca}</td>
                  <td style={{ ...tdMarca, textAlign: 'right' }}>{l.metaQtd}</td>
                  <td style={{ ...tdMarca, textAlign: 'right' }}>{loading ? '—' : l.realQtd}</td>
                  <td style={{ ...tdMarca, textAlign: 'right' }}>{money(l.metaFat)}</td>
                  <td style={{ ...tdMarca, textAlign: 'right' }}>{loading ? '—' : money(l.realFat)}</td>
                  <td style={{ ...tdMarca, textAlign: 'right' }}><PctBadge pct={l.pctFat} temMeta={l.metaFat > 0} /></td>
                  <td style={{ ...tdMarca, textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        const meta: MetaMarca = l.meta ?? {
                          marca: l.marca, mesReferencia: mesMarcaRef, metaQtd: 0, metaFaturamento: 0, taxaPadrao: null,
                        }
                        setEditando(meta)
                      }}
                      style={{
                        padding: '4px 10px', border: '1px solid var(--ws-border)',
                        background: '#fff', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--ws-bg)', borderTop: '2px solid var(--ws-brand)' }}>
                <td style={{ ...tdMarca, fontWeight: 600 }}>WE SCALE (total)</td>
                <td style={{ ...tdMarca, textAlign: 'right', fontWeight: 600 }}>{total.metaQtd}</td>
                <td style={{ ...tdMarca, textAlign: 'right', fontWeight: 600 }}>{total.realQtd}</td>
                <td style={{ ...tdMarca, textAlign: 'right', fontWeight: 600 }}>{money(total.metaFat)}</td>
                <td style={{ ...tdMarca, textAlign: 'right', fontWeight: 600 }}>{money(total.realFat)}</td>
                <td style={{ ...tdMarca, textAlign: 'right', fontWeight: 600 }}>
                  <PctBadge pct={total.metaFat > 0 ? (total.realFat / total.metaFat) * 100 : 0} temMeta={total.metaFat > 0} />
                </td>
                <td style={tdMarca}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {editando && (
        <MetaEditorModal meta={editando} mesRef={mesMarcaRef} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); reload() }} />
      )}
    </div>
  )
}

const thMarca: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--ws-text-secondary)',
}
const tdMarca: React.CSSProperties = { padding: '12px 16px' }

function MetaEditorModal({
  meta, mesRef, onClose, onSaved,
}: {
  meta: MetaMarca
  mesRef: string
  onClose: () => void
  onSaved: () => void
}) {
  const [qtd, setQtd] = useState<string>(String(meta.metaQtd))
  const [fat, setFat] = useState<string>(String(meta.metaFaturamento))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function salvar() {
    setSaving(true); setMsg(null)
    const result = await upsertMetaMarca({
      marca: meta.marca, mesReferencia: mesRef,
      metaQtd: Number(qtd) || 0, metaFaturamento: Number(fat) || 0,
      taxaPadrao: meta.taxaPadrao,
    })
    setSaving(false)
    if (!result.ok) { setMsg(`Erro: ${result.error}`); return }
    if (result.mocked) { setMsg('⚠️ Modo mock — não persistiu no banco'); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>
          Editar meta — {meta.marca}
        </h3>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Meta de unidades</span>
            <input type="number" min="0" value={qtd} onChange={e => setQtd(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Meta de faturamento (R$)</span>
            <input type="number" min="0" step="100" value={fat} onChange={e => setFat(e.target.value)} style={inputStyle} />
          </label>
        </div>
        {msg && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6,
            background: msg.startsWith('Erro') ? '#FEE2E2' : '#FEF3C7',
            color: msg.startsWith('Erro') ? '#B91C1C' : '#92400E', fontSize: 12,
          }}>{msg}</div>
        )}
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={btnPrimary}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6,
  background: '#fff', fontSize: 14, fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  padding: '8px 16px', border: '1px solid var(--ws-border)', background: 'transparent',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', border: 'none', background: 'var(--ws-brand)',
  color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
}
