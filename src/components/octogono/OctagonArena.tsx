import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { useMetasSDRs } from '@/hooks/useMetasSDRs'
import { useCorridaPerformance } from '@/hooks/useCorridaPerformance'
import { useSemanasCampanha } from '@/hooks/useSemanasCampanha'
import { diaDaCampanha, mesAtualCampanha, montarCampanha, voltaDoDia } from '@/constants/metasCampanhaF1'
import { duelosOctogono, rankingOctogono, type Competidor } from '@/lib/octogono'

export interface OctagonRankings { closers: Competidor[]; sdrs: Competidor[] }

const num = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const valor = (p: Competidor, n: number) => p.unidade === 'R$'
  ? `R$ ${Math.round(n).toLocaleString('pt-BR')}`
  : `${num(n)} SQL`

export function OctagonStage({ mes, round, rounds, rankings, action }: {
  mes: string
  round: number
  rounds: number
  rankings: OctagonRankings
  action?: ReactNode
}) {
  return (
    <section className="oct-stage" aria-label="Arena da campanha de metas">
      <div className="oct-stage__eyebrow">WE SCALE <span>·</span> CAMPANHA DE METAS <span>·</span> {mes}</div>
      <h2>O OCTÓGONO É DO TIME.</h2>
      <p>Closer enfrenta closer. SDR enfrenta SDR. Cada pessoa compete pelo atingimento da própria meta.</p>
      <div className="oct-stage__leaders">
        {rankings.closers[0] && <span>Cinturão Closer <b>{rankings.closers[0].nome} · {num(rankings.closers[0].pct)}%</b></span>}
        {rankings.sdrs[0] && <span>Cinturão SDR <b>{rankings.sdrs[0].nome} · {num(rankings.sdrs[0].pct)}%</b></span>}
        {action}
      </div>
      <div className="oct-stage__rounds" aria-label={`Round ${round} de ${rounds}`}>
        <small>ROUND {round} / {rounds}</small>
        <div>{Array.from({ length: rounds }, (_, i) => <i key={i} className={i < round ? 'is-on' : ''} />)}</div>
      </div>
    </section>
  )
}

export function OctagonFightCard({ rankings, mes, loading = false, error = null, title = 'Confrontos entre vendedores' }: {
  rankings: OctagonRankings
  mes: string
  loading?: boolean
  error?: string | null
  title?: string
}) {
  const duelos = useMemo(() => duelosOctogono(rankings), [rankings])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = duelos.find(d => d.id === selectedId) ?? duelos[0]

  return (
    <section className="oct-fights" aria-label={title}>
      <div className="oct-fights__arena">
        <div className="oct-eyebrow">{selected ? `${selected.cargo} · ${mes}` : `Campanha de Metas · ${mes}`}</div>
        {error ? <p className="oct-fights__state" role="alert">Não foi possível carregar a disputa: {error}</p>
          : loading ? <p className="oct-fights__state">Carregando a disputa…</p>
          : selected ? <>
            <div className="oct-fights__versus">
              <Competitor person={selected.a} corner="vermelho" />
              <strong>VS</strong>
              <Competitor person={selected.b} corner="azul" />
            </div>
            <div className="oct-fights__score"><b>{num(selected.a.pct)}%</b><span>Meta atingida</span><b>{num(selected.b.pct)}%</b></div>
            <div className="oct-fights__score"><b>{valor(selected.a, selected.a.realizado)}</b><span>Realizado</span><b>{valor(selected.b, selected.b.realizado)}</b></div>
            <div className="oct-fights__score"><b>{valor(selected.a, selected.a.meta)}</b><span>Meta</span><b>{valor(selected.b, selected.b.meta)}</b></div>
            <p className="oct-fights__rule">Liderança pelo percentual da própria meta; realizado desempata.</p>
          </> : <p className="oct-fights__state">Ainda não há duas pessoas do mesmo cargo com metas publicadas neste mês.</p>}
      </div>
      <div className="oct-fights__list">
        <div className="oct-fights__list-head"><h3>{title}</h3><span>{mes}</span></div>
        {duelos.map((d, i) => <button key={d.id} type="button" aria-pressed={selected?.id === d.id}
          onClick={() => setSelectedId(d.id)} className="oct-fights__bout">
          <small>{i === 0 ? 'Evento principal' : 'Duelo'} · {d.cargo === 'Closer' ? 'Closers' : 'SDRs'}</small>
          <span><b>{d.a.nome} × {d.b.nome}</b><em>{num(d.a.pct)}% · {num(d.b.pct)}%</em></span>
        </button>)}
        <p>Sem confronto entre cargos. Se o grupo for ímpar, a pessoa sem par permanece no ranking.</p>
      </div>
    </section>
  )
}

function Competitor({ person, corner }: { person: Competidor; corner: 'vermelho' | 'azul' }) {
  return <div className={`oct-fights__person oct-fights__person--${corner}`}>
    <small>Corner {corner}</small>
    <b>{person.nome}</b>
  </div>
}

/** Só monta consultas de Vendas se a pessoa tiver permissão da Campanha. */
export function OctagonOverview({ enabled }: { enabled: boolean }) {
  const { pode } = useAcesso()
  if (!enabled || !pode('aba.campanha-metas')) return null
  return <OctagonOverviewData />
}

function OctagonOverviewData() {
  const navigate = useNavigate()
  const mes = mesAtualCampanha()
  const { semanas } = useSemanasCampanha(mes)
  const campanha = useMemo(() => montarCampanha(mes, semanas), [mes, semanas])
  const { closers, loading: l1, error: e1 } = useMetasClosers(mes)
  const { sdrs, loading: l2, error: e2 } = useMetasSDRs(mes)
  const pilotos = useMemo(() => ({ closer: closers.map(c => c.nome), sdr: sdrs.map(s => s.nome) }), [closers, sdrs])
  const { sdrRealizado, loading: l3, error: e3 } = useCorridaPerformance(mes, pilotos)
  const rankings = useMemo(() => rankingOctogono(closers, sdrs, sdrRealizado), [closers, sdrs, sdrRealizado])
  const round = voltaDoDia(campanha, diaDaCampanha(campanha))

  return <div className="oct-overview">
    <OctagonStage mes={campanha.rotulo} round={round} rounds={campanha.voltas.length} rankings={rankings}
      action={<button type="button" onClick={() => navigate('/gp-setembro')}>Ver campanha completa →</button>} />
    <OctagonFightCard rankings={rankings} mes={campanha.rotulo} loading={l1 || l2 || l3} error={e1 || e2 || e3} />
    <p className="oct-overview__note">Disputa da campanha de {campanha.rotulo}. Os indicadores de Marketing abaixo mantêm seus próprios filtros e períodos.</p>
  </div>
}
