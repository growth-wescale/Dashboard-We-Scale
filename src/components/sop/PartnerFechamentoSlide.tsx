import { useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { PARTNER_FECHAMENTO } from '@/constants/partnerFechamento'
import './partnerFechamento.css'

interface Props {
  slideIndex: number
  total: number
  onPrev: () => void
  onNext: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  exportHeight?: number
  onReady?: (error?: string) => void
}

const money = (n: number, digits = 2) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits })
const number = (n: number, digits = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const [before, recent] = PARTNER_FECHAMENTO.periods

function Row({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return <div className="partner-close-row"><span>{label}</span><strong>{a}</strong><strong>{b}</strong></div>
}

function Periods() {
  return <div className="partner-close-periods"><span /><span>{before.label}</span><span>{recent.label}</span></div>
}

export function PartnerFechamentoSlide({ slideIndex, total, onPrev, onNext, isFullscreen, onToggleFullscreen, exportHeight, onReady }: Props) {
  useEffect(() => { onReady?.() }, [onReady])

  return (
    <section className={`partner-close${exportHeight ? ' partner-close-export' : ''}`} style={{ height: exportHeight ?? '100vh' }} aria-label="Fechamento Scale Partner">
      <header className="partner-close-header">
        <div>
          <div className="partner-close-eyebrow">S&OP Marketing · fechamento histórico</div>
          <h1>Scale Partner <span>Comparativo de períodos</span></h1>
          <p>Conta We Scale Holding, sem IDA e LISO Evento. Investimento da conta; leads, MQL e vendas vêm do CRM.</p>
        </div>
        <nav aria-label="Navegação do S&OP">
          <span>{slideIndex + 1}/{total}</span>
          <button onClick={onPrev} aria-label="Slide anterior"><ChevronLeft size={18} /></button>
          <button onClick={onNext} aria-label="Próximo slide"><ChevronRight size={18} /></button>
          <button onClick={onToggleFullscreen} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        </nav>
      </header>

      <div className="partner-close-body">
        <div className="partner-close-headline">
          <h2>Mais MQL com menos verba.<br /><span>Menor conversão em venda.</span></h2>
          <div className="partner-close-legend">
            <span><i />{before.label}</span><span><i />{recent.label}</span>
            <small>Períodos fixos · não acompanham o filtro mensal</small>
          </div>
        </div>

        <div className="partner-close-costs">
          {PARTNER_FECHAMENTO.costs.map(cost => (
            <article className="partner-close-card" key={cost.key}>
              <h3>{cost.label}</h3>
              <div className={cost.improved ? 'partner-close-better' : 'partner-close-worse'}>{cost.change}</div>
              <p>{money(before[cost.key])} → <b>{money(recent[cost.key])}</b></p>
            </article>
          ))}
        </div>

        <div className="partner-close-columns">
          <article className="partner-close-card">
            <h3>Investimento e campanha</h3>
            <Periods />
            <Row label="Investimento" a={money(before.investment)} b={money(recent.investment)} />
            <Row label="Dias com campanha" a={`${before.activeDays} de ${before.calendarDays}`} b={`${recent.activeDays} de ${recent.calendarDays}`} />
            <div className="partner-close-activity">
              {PARTNER_FECHAMENTO.periods.map((p, i) => <div key={p.label} aria-label={`${p.label}: ${p.activeDays} de ${p.calendarDays} dias ativos`}><span style={{ width: `${p.activeDays / p.calendarDays * 100}%`, background: i ? '#7e0e70' : '#64748b' }} /></div>)}
            </div>
            <Row label="Média por dia ativo" a={money(before.dailyInvestment)} b={money(recent.dailyInvestment)} />
            <p className="partner-close-note">Dia ativo: alguma campanha da conta teve gasto.</p>
            <h3 className="partner-close-subtitle">Ritmo em 30 dias corridos</h3>
            <Row label="Investimento" a={money(before.pace.investment, 0)} b={money(recent.pace.investment, 0)} />
            <Row label="Leads" a={number(before.pace.leads)} b={number(recent.pace.leads)} />
            <Row label="MQL" a={number(before.pace.mql)} b={number(recent.pace.mql)} />
            <Row label="Vendas" a={number(before.pace.sales)} b={number(recent.pace.sales)} />
            <p className="partner-close-note">Totais normalizados pela duração de cada período.</p>
          </article>

          <article className="partner-close-card">
            <h3>Funil e conversão</h3>
            <Periods />
            {([{ key: 'leads', label: 'Leads' }, { key: 'mql', label: 'MQL' }, { key: 'sales', label: 'Vendas únicas' }, { key: 'people', label: 'Pessoas no geral' }] as const).map(row => (
              <div key={row.key} className="partner-close-funnel">
                <Row label={row.label} a={before[row.key]} b={recent[row.key]} />
                <div className="partner-close-bars">
                  <span style={{ width: `${before[row.key] / 107 * 100}%` }} />
                  <span style={{ width: `${recent[row.key] / 107 * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="partner-close-note">Mesma escala para os dois períodos.</p>
            <h3 className="partner-close-subtitle">Taxas do funil</h3>
            <Row label="Lead → MQL" a={`${number(before.leadToMql)}%`} b={`${number(recent.leadToMql)}%`} />
            <Row label="MQL → venda" a={`${number(before.mqlToSale)}%`} b={`${number(recent.mqlToSale)}%`} />
            <Row label="Lead → venda" a={`${number(before.leadToSale)}%`} b={`${number(recent.leadToSale)}%`} />
          </article>

          <article className="partner-close-card">
            <h3>Retorno e pessoas</h3>
            <Periods />
            <Row label="Investimento" a={money(before.investment, 0)} b={money(recent.investment, 0)} />
            <Row label="Faturamento" a={money(before.revenue, 0)} b={money(recent.revenue, 0)} />
            <Row label="Ticket médio" a={money(before.ticket)} b={money(recent.ticket)} />
            <Row label="ROAS" a={number(before.roas, 2)} b={number(recent.roas, 2)} />
            <p className="partner-close-note">ROAS: faturamento por real investido.</p>
            <h3 className="partner-close-subtitle">Pessoas no geral</h3>
            <Row label="Pessoas" a={before.people} b={recent.people} />
            <Row label="Faturamento por pessoa" a={money(before.revenuePerPerson)} b={money(recent.revenuePerPerson)} />
            <p className="partner-close-note">Cada venda é um negócio fechado único. Pessoas são todas as que entraram no geral e podem superar o número de vendas. CPV usa vendas; CPP usa pessoas.</p>
          </article>
        </div>

        <aside className="partner-close-caveats">
          <h3>O que olhar com cuidado</h3>
          <div>
            <p><b>Maturação.</b> No fechamento informado, os MQLs de setembro e outubro ainda podiam converter nas semanas seguintes, melhorando o CPV recente.</p>
            <p><b>Google pendente.</b> Incluído em 01/05–12/08; ausente em 15/08–19/10. Sua inclusão eleva os custos e reduz o ROAS recente.</p>
            <p><b>Recorte da conta.</b> O primeiro período inclui testes e carrosséis. Os dias 13 e 14/08 estão fora dos dois períodos.</p>
          </div>
        </aside>
        <footer className="partner-close-footer">Fechamento informado por Gabriel em 27/10/2026 · valores preservados do material recebido · <a href={PARTNER_FECHAMENTO.source} target="_blank" rel="noreferrer">Comparativo Partner</a></footer>
      </div>
    </section>
  )
}
