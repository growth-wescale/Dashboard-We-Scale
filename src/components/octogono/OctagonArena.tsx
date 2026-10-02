import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { useMetasSDRs } from '@/hooks/useMetasSDRs'
import { useCorridaPerformance } from '@/hooks/useCorridaPerformance'
import { useSemanasCampanha } from '@/hooks/useSemanasCampanha'
import { diaDaCampanha, mesAtualCampanha, montarCampanha, voltaDoDia } from '@/constants/metasCampanhaF1'
import { rankingOctogono, type Competidor } from '@/lib/octogono'

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
      <p>Todos os Closers disputam juntos. Todos os SDRs disputam juntos. Cada pessoa avança pelo atingimento da própria meta.</p>
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

export function OctagonFightCard({ rankings, mes, loading = false, error = null, title = 'Disputa geral do time' }: {
  rankings: OctagonRankings
  mes: string
  loading?: boolean
  error?: string | null
  title?: string
}) {
  const [cargo, setCargo] = useState<Competidor['cargo']>('Closer')
  const competidores = cargo === 'Closer' ? rankings.closers : rankings.sdrs
  const lider = competidores[0]

  return (
    <section className="oct-fights" aria-label={title}>
      <div className="oct-fights__arena">
        <div className="oct-eyebrow">{cargo === 'Closer' ? 'CLOSERS' : 'SDRS'} · TODOS NO OCTÓGONO · {mes}</div>
        {error ? <p className="oct-fights__state" role="alert">Não foi possível carregar a disputa: {error}</p>
          : loading ? <p className="oct-fights__state">Carregando a disputa…</p>
          : competidores.length ? <div className="oct-field">
            {competidores.map((person, index) => <div className="oct-field__row" key={`${person.cargo}-${person.nome}`}>
              <span className={`oct-field__position${index === 0 ? ' is-leader' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
              <div className="oct-field__identity"><b>{person.nome}</b><small>{valor(person, person.realizado)} de {valor(person, person.meta)}</small></div>
              <div className="oct-field__track" aria-label={`${num(person.pct)}% da meta`}><i style={{ width: `${Math.min(100, Math.max(0, person.pct))}%` }} /></div>
              <strong>{num(person.pct)}%</strong>
            </div>)}
            <p className="oct-fights__rule">Ranking pelo percentual da própria meta; realizado desempata. Todos disputam a mesma liderança dentro do cargo.</p>
          </div> : <p className="oct-fights__state">Ainda não há pessoas com metas publicadas neste mês.</p>}
      </div>
      <div className="oct-fights__list">
        <div className="oct-fights__list-head"><h3>{title}</h3><span>{mes}</span></div>
        {(['Closer', 'SDR'] as const).map(tipo => {
          const lista = tipo === 'Closer' ? rankings.closers : rankings.sdrs
          return <button key={tipo} type="button" aria-pressed={cargo === tipo} onClick={() => setCargo(tipo)} className="oct-fights__bout">
            <small>Disputa coletiva · {tipo === 'Closer' ? 'Closers' : 'SDRs'}</small>
            <span><b>{lista.length} {lista.length === 1 ? 'competidor' : 'competidores'}</b><em>{lista[0] ? `Líder · ${lista[0].nome}` : 'Aguardando metas'}</em></span>
          </button>
        })}
        <div className="oct-fights__leader">
          <small>LIDERANÇA ATUAL</small>
          <b>{lider?.nome ?? 'Aguardando metas'}</b>
          {lider && <span>{num(lider.pct)}% da meta</span>}
        </div>
        <p>Closers e SDRs têm rankings separados. Dentro de cada cargo, a disputa envolve todo o grupo.</p>
      </div>
    </section>
  )
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
