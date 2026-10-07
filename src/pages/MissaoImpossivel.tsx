import { useEffect, useMemo, useState } from 'react'
import { Target, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMissaoDados } from '@/hooks/useMissaoDados'
import { useMediaData } from '@/hooks/useMediaData'
import { useLeads } from '@/hooks/useLeads'
import { MESES_MISSAO, METAS_MISSAO, MISSAO, type MetaMissao } from '@/constants/missaoImpossivel'
import { BRAND_ACCENT } from '@/constants/brands'
import { captacaoMissao, funilMissao, rangeAteHoje, rangeValido, receitaMissao, verbaNoPeriodo, type TaxaMissao } from '@/lib/missaoImpossivel'
import { fmtBR, toLocalDate } from '@/lib/dateUtils'
import type { DateRange } from '@/lib/periodo'
import { MetaCopaB2B } from './MetaCopaB2B'
import './missaoImpossivel.css'

const pct = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hojeBrt = () => toLocalDate(new Date().toISOString())!
type Dados = ReturnType<typeof useMissaoDados>

export function MissaoImpossivel() {
  const { pode, carregando } = useAcesso()
  if (carregando) return <p role="status">Verificando acesso…</p>
  if (!pode('aba.okrs')) return <p role="alert">Sem acesso às metas consolidadas.</p>
  return <MissaoConteudo />
}

function Estado({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p role="alert" className="missao-aviso">Não foi possível carregar esta base. Use Atualizar para tentar novamente.</p>
  if (loading) return <p role="status" className="missao-muted">Carregando dados…</p>
  return null
}

function Placar({ titulo, meta, range, dados }: { titulo: string; meta: number; range: DateRange | null; dados: Dados['deals'] }) {
  const realizado = useMemo(() => receitaMissao(dados.data, range), [dados.data, range])
  const atingimento = realizado.receita / meta * 100
  return <section className="missao-placar" aria-label={titulo} aria-busy={dados.loading}>
    <div className="missao-kicker"><Target size={15} aria-hidden="true" />{titulo}</div>
    <p className="missao-meta">{money(meta)}</p>
    <p className="missao-muted">Todas as marcas · todas as origens</p>
    <Estado loading={dados.loading} error={dados.error} />
    {!dados.loading && !dados.error && <>
      <div className="missao-receita"><span>Receita realizada</span><strong>{money(realizado.receita)}</strong></div>
      <div className="missao-track" role="progressbar" aria-label={`Atingimento: ${titulo}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, atingimento))} aria-valuetext={pct(atingimento)}>
        <span style={{ width: `${Math.max(0, Math.min(100, atingimento))}%` }} />
      </div>
      <div className="missao-between"><strong>{pct(atingimento)} atingidos</strong><span>{realizado.negocios} negócios ganhos</span></div>
      <div className="missao-saldo"><span>{realizado.receita > meta ? 'Acima da meta' : 'Falta gerar'}</span><strong>{money(Math.abs(meta - realizado.receita))}</strong></div>
      {realizado.semValor > 0 && <p className="missao-aviso">{realizado.semValor} negócio(s) ganho(s) sem valor de contrato. Não acrescentam receita ao total.</p>}
      <p className="missao-footnote">{range ? `${fmtBR(range.start)} a ${fmtBR(range.end)}` : 'Período ainda não iniciado'} · pela data da venda</p>
    </>}
  </section>
}

function SeletorPeriodo({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [draft, setDraft] = useState(value)
  const presets = [
    ...MESES_MISSAO.map(m => ({ label: `${m.label} 2026`, range: { start: m.inicio, end: m.fim } })),
    { label: 'Trimestre · out–dez', range: { start: MISSAO.inicio, end: MISSAO.fim } },
    { label: 'Ano · 2026', range: { start: '2026-01-01', end: '2026-12-31' } },
  ]
  function escolher(r: DateRange) { setDraft(r); onChange(r) }
  const valido = rangeValido(draft) && draft.start >= '2026-01-01' && draft.end <= '2026-12-31'
  return <div className="missao-filtros">
    <label>Período de análise
      <select value={String(presets.findIndex(p => p.range.start === value.start && p.range.end === value.end))}
        onChange={e => { const p = presets[Number(e.target.value)]; if (p) escolher(p.range) }}>
        {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        <option value="-1" disabled>Personalizado</option>
      </select>
    </label>
    <label>De<input type="date" min="2026-01-01" max="2026-12-31" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label>
    <label>Até<input type="date" min="2026-01-01" max="2026-12-31" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label>
    <button type="button" disabled={!valido} onClick={() => onChange(draft)}>Aplicar período</button>
    {!valido && <span role="alert">Escolha um intervalo válido de 2026.</span>}
  </div>
}

function Taxa({ titulo, taxa, meta }: { titulo: string; taxa: TaxaMissao; meta: number }) {
  const atingiu = taxa.valor !== null && taxa.valor >= meta
  return <div className="missao-taxa">
    <div className="missao-between"><span>{titulo}</span><strong className={taxa.valor === null ? '' : atingiu ? 'missao-positivo' : 'missao-atencao'}>{taxa.valor === null ? '—' : pct(taxa.valor)}</strong></div>
    <div className="missao-between missao-muted"><span>{taxa.num} ÷ {taxa.den} · mesmos negócios</span><span>Meta {pct(meta)}</span></div>
    {taxa.valor !== null && <p className="missao-footnote">{taxa.valor === meta ? 'Na meta' : `${Math.abs(taxa.valor - meta).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p. ${atingiu ? 'acima' : 'abaixo'} da meta`}</p>}
  </div>
}

function MarcaMissao({ meta, dados, periodo, efetivo, criacao }: {
  meta: MetaMissao; dados: Dados; periodo: DateRange; efetivo: DateRange | null; criacao: DateRange | null
}) {
  const media = useMediaData({ marca: meta.marca, dataInicio: efetivo?.start, dataFim: efetivo?.end, enabled: !!efetivo })
  const leads = useLeads({ marca: meta.marca, dataInicio: efetivo?.start, dataFim: efetivo?.end, enabled: !!efetivo })
  const cap = useMemo(() => captacaoMissao(leads.data, media.data, meta.marca, efetivo), [leads.data, media.data, meta.marca, efetivo])
  const funil = useMemo(() => funilMissao(dados.deals.data, dados.events.data, meta.marca, efetivo, criacao),
    [dados.deals.data, dados.events.data, meta.marca, efetivo, criacao])
  const verba = verbaNoPeriodo(meta.investimento, periodo)
  const marketingLoading = media.loading || leads.loading
  const marketingError = media.error ?? leads.error
  const crmLoading = dados.deals.loading || dados.events.loading
  const crmError = dados.deals.error ?? dados.events.error
  return <article className="missao-marca" style={{ borderTopColor: BRAND_ACCENT[meta.marca] }}>
    <div className="missao-between"><h3>{meta.marca}</h3><ArrowUpRight size={20} aria-hidden="true" /></div>
    <p className="missao-muted">Prioridade de investimento · {money(meta.investimento)} no trimestre</p>
    <div className="missao-subtitulo">Captação · base Marketing</div>
    <Estado loading={marketingLoading} error={marketingError} />
    {!marketingLoading && !marketingError && <>
      <div className="missao-between"><span>Investido no período</span><strong>{efetivo ? money(cap.investimento) : '—'}</strong></div>
      <p className="missao-footnote">{verba === null ? 'Sem orçamento definido fora de out–dez.' : `Orçamento do recorte: ${money(verba)}`}</p>
      {verba !== null && verba > 0 && efetivo && <p className="missao-footnote">{pct(cap.investimento / verba * 100)} da verba utilizada · {cap.investimento > verba ? 'excedente' : 'saldo'} {money(Math.abs(verba - cap.investimento))}</p>}
      <div className="missao-custo"><span>CP-MQL</span><strong>{cap.cpmql === null ? '—' : money(cap.cpmql)}</strong></div>
      <div className="missao-between missao-muted"><span>{cap.mql} MQLs de Marketing</span><span>Meta ≤ {money(meta.cpmql)}</span></div>
      {cap.cpmql !== null && <p className={cap.cpmql <= meta.cpmql ? 'missao-positivo' : 'missao-atencao'}>
        {cap.cpmql <= meta.cpmql ? 'Dentro da meta' : 'Acima da meta'} · diferença de {money(Math.abs(cap.cpmql - meta.cpmql))}
      </p>}
    </>}
    <div className="missao-subtitulo">Conversões · base CRM · todas as origens</div>
    <Estado loading={crmLoading} error={crmError} />
    {!crmLoading && !crmError && <>
      {!efetivo ? <p role="status">Período ainda não iniciado.</p> : <>
        <div className="missao-volumes">
          <span><strong>{funil.mql}</strong>MQL / entrada*</span><span><strong>{funil.sql}</strong>SQL</span>
          <span><strong>{funil.sal}</strong>SAL</span><span><strong>{funil.vendas}</strong>Vendas</span>
        </div>
        <Taxa titulo="MQL → SQL" taxa={funil.mqlSql} meta={meta.mqlSql} />
        <Taxa titulo="SQL → venda" taxa={funil.sqlVenda} meta={meta.sqlVenda} />
        <Taxa titulo="SAL → venda" taxa={funil.salVenda} meta={meta.salVenda} />
        <div className="missao-between missao-receita-marca"><span>Receita no recorte</span><strong>{money(funil.receita.receita)}</strong></div>
        {criacao && funil.semDataCriacao > 0 && <p className="missao-aviso">{funil.semDataCriacao} ciclo(s) da marca sem data original de criação ficam fora deste filtro.</p>}
      </>}
    </>}
  </article>
}

function MissaoConteudo() {
  const [hoje, setHoje] = useState(hojeBrt)
  const [periodo, setPeriodo] = useState<DateRange>(() => {
    const mes = MESES_MISSAO.find(m => hoje >= m.inicio && hoje <= m.fim) ?? MESES_MISSAO[0]
    return { start: mes.inicio, end: mes.fim }
  })
  const [filtrarCriacao, setFiltrarCriacao] = useState(false)
  const [criacao, setCriacao] = useState<DateRange>(periodo)
  const [historico, setHistorico] = useState(false)
  const dados = useMissaoDados(true)
  useEffect(() => { const timer = setInterval(() => setHoje(hojeBrt()), 60_000); return () => clearInterval(timer) }, [])
  const anual = useMemo(() => rangeAteHoje({ start: '2026-01-01', end: '2026-12-31' }, hoje), [hoje])
  const trimestre = useMemo(() => rangeAteHoje({ start: MISSAO.inicio, end: MISSAO.fim }, hoje), [hoje])
  const efetivo = useMemo(() => rangeAteHoje(periodo, hoje), [periodo, hoje])
  const criacaoValida = !filtrarCriacao || rangeValido(criacao)
  return <div className="missao-page">
    <header className="missao-header">
      <div><p className="missao-kicker">Metas · reta final de 2026</p><h1>Missão Impossível</h1>
        <p>Uma meta de receita. Todas as marcas na conquista.</p></div>
      <button type="button" onClick={() => { setHoje(hojeBrt()); window.dispatchEvent(new Event('dashboard:refresh')) }}><RefreshCw size={15} aria-hidden="true" />Atualizar</button>
    </header>
    <div className="missao-placares">
      <Placar titulo="Meta anual · 2026" meta={MISSAO.receitaAnual} range={anual} dados={dados.deals} />
      <Placar titulo="Missão · outubro a dezembro" meta={MISSAO.receitaTrimestre} range={trimestre} dados={dados.deals} />
    </div>
    <p className="missao-footnote">Os placares acima são consolidados e independem dos filtros abaixo. Receita de contratos ganhos; sem multiplicação por unidades. Atualização automática a cada 5 minutos.</p>

    <section className="missao-analise" aria-labelledby="missao-analise-titulo">
      <h2 id="missao-analise-titulo">As três frentes prioritárias</h2>
      <p className="missao-muted">Investimento, custo e evolução comercial de Inpot, Eletrovias e Lisô Laser.</p>
      <SeletorPeriodo value={periodo} onChange={setPeriodo} />
      <div className="missao-criacao">
        <label className="missao-check"><input type="checkbox" checked={filtrarCriacao} onChange={e => { setFiltrarCriacao(e.target.checked); if (e.target.checked) setCriacao(periodo) }} />Restringir o CRM aos negócios criados em um período</label>
        {filtrarCriacao && <div className="missao-filtros">
          <label>Criação original · de<input type="date" value={criacao.start} onChange={e => setCriacao({ ...criacao, start: e.target.value })} /></label>
          <label>Criação original · até<input type="date" value={criacao.end} onChange={e => setCriacao({ ...criacao, end: e.target.value })} /></label>
          {!criacaoValida && <span role="alert">Escolha um intervalo de criação válido.</span>}
        </div>}
        <p className="missao-footnote">{filtrarCriacao ? 'O mesmo filtro de criação vale para todos os volumes, taxas e receita do CRM abaixo.' : 'Inclui negócios antigos que avançaram ou fecharam no período analisado.'} Captação e CP-MQL continuam pela data do lead de Marketing, sem vínculo presumido entre as bases.</p>
      </div>
      <p className="missao-footnote">{efetivo ? `Resultados de ${fmtBR(efetivo.start)} a ${fmtBR(efetivo.end)}.` : 'Período futuro: ainda sem resultados.'} Orçamento de mídia considera o intervalo escolhido inteiro; datas parciais usam proporção dos dias do mês.</p>
      {criacaoValida && <div className="missao-marcas">{METAS_MISSAO.map(meta => <MarcaMissao key={meta.marca} meta={meta} dados={dados} periodo={periodo} efetivo={efetivo} criacao={filtrarCriacao ? criacao : null} />)}</div>}
      <details className="missao-metodologia"><summary>Como as taxas são calculadas</summary>
        <p>Em cada taxa, o denominador são os negócios que passaram pela etapa inicial no período; o numerador conta quais desses mesmos negócios também chegaram à etapa seguinte no período. Exemplo: 10 dos 100 MQLs chegaram a SQL = 10%. Uma venda sem passagem por SQL não entra na taxa SQL → venda, mas continua entrando na receita.</p>
        <p>O filtro opcional usa a data original de criação do negócio no CRM, não a data de reciclagem ou entrada em MQL. Negócios sem essa data ficam fora quando o filtro está ligado. As etapas e os ganhos respeitam o período de análise, mesmo com a criação filtrada.</p>
        <p>Cada ciclo do negócio conta uma vez no intervalo. Eventos repetidos e passagens de SQL duplicadas no handoff SDR → Closer não acrescentam pessoas. Não se calcula média de percentuais mensais.</p>
        <p>* MQL / entrada é a etapa inicial do CRM; no motor Outbound ela representa Lead, não uma nova classificação de MQL de Marketing. CP-MQL usa os MQLs classificados e deduplicados na base Marketing, como nas demais telas. Não somamos os volumes das duas bases.</p>
      </details>
    </section>

    <section className="missao-orcamento" aria-labelledby="missao-orcamento-titulo">
      <h2 id="missao-orcamento-titulo">Plano de investimento</h2>
      <p className="missao-muted">R$ 238.000 nas três prioritárias. O rateio 40% / 40% / 20% é só da mídia, não da receita.</p>
      <div className="missao-tabela-scroll" tabIndex={0} role="region" aria-label="Orçamento por marca e mês">
        <table><thead><tr><th scope="col">Marca</th>{MESES_MISSAO.map(m => <th scope="col" key={m.label}>{m.label} · {pct(m.peso * 100)}</th>)}<th scope="col">Trimestre</th></tr></thead>
          <tbody>{METAS_MISSAO.map(m => <tr key={m.marca}><th scope="row">{m.marca}</th>{MESES_MISSAO.map(mes => <td key={mes.label}>{money(m.investimento * mes.peso)}</td>)}<td>{money(m.investimento)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Total prioritárias</th>{MESES_MISSAO.map(m => <td key={m.label}>{money(METAS_MISSAO.reduce((s, b) => s + b.investimento, 0) * m.peso)}</td>)}<td>{money(METAS_MISSAO.reduce((s, b) => s + b.investimento, 0))}</td></tr></tfoot>
        </table>
      </div>
      <div className="missao-secundarias"><p><strong>Viva</strong>R$ 4.000 / mês · R$ 12.000 no trimestre, adicionais.</p><p><strong>Oral Unic</strong>Orçamento mínimo a definir, adicional.</p><p><strong>B2Case</strong>Sem novo investimento de mídia. Histórico e receita preservados.</p></div>
    </section>
    <button type="button" aria-expanded={historico} onClick={() => setHistorico(!historico)}>{historico ? 'Ocultar' : 'Consultar'} acompanhamento anterior · jul–set/2026</button>
    {historico && <div className="missao-historico"><p>Referências anteriores à Missão Impossível. Não são as metas atuais de outubro–dezembro.</p><MetaCopaB2B /></div>}
  </div>
}
