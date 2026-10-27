import { BeautyMarketingBlock } from '@/components/marketing/BeautyMarketingPanel'
import { RefreshCw, Target } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMissaoResumo } from '@/hooks/useMissaoResumo'
import { BRAND_ACCENT } from '@/constants/brands'
import { daysInMonth, fmtBR, monthLabelLong, shortMonth } from '@/lib/dateUtils'
import { FRENTES_MISSAO, MESES_MISSAO, MISSAO, captacaoMissao, etapasMissao, funilInversoMissao, metaPeriodoMissao, orcamentoMensalMissao, pacingMissao, pacingTrimestre, projecaoMqlMidia, realizadoMissao, type DadosMissao } from '@/lib/missaoMetas'
import './missaoImpossivel.css'

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const pct = (n: number) => `${numero(n)}%`

export function MissaoImpossivel() {
  const { pode, carregando } = useAcesso()
  if (carregando) return <p role="status">Verificando acesso…</p>
  if (!pode('aba.okrs')) return <p role="alert">Sem acesso às metas consolidadas.</p>
  return <MissaoConteudo />
}

function Progresso({ atual, meta, label, referencia }: { atual: number; meta: number; label: string; referencia?: number }) {
  if (meta <= 0) return null
  const valor = Math.max(0, Math.min(100, atual / meta * 100))
  return <div className="missao-track missao-pacing-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor} aria-valuetext={pct(atual / meta * 100)}><span style={{ width: `${valor}%` }} />{referencia !== undefined && <i style={{ left: `${Math.max(0, Math.min(1, referencia)) * 100}%` }} title={`Referência: ${pct(referencia * 100)}`} aria-hidden="true" />}</div>
}

function Placar({ titulo, meta, inicio, dados }: { titulo: string; meta: number; inicio: string; dados: DadosMissao }) {
  const fim = dados.hoje < MISSAO.fim ? dados.hoje : MISSAO.fim
  const r = realizadoMissao(dados.vendas, inicio, fim)
  return <section className="missao-placar" aria-label={titulo}>
    <div className="missao-kicker"><Target size={15} aria-hidden="true" />{titulo}</div>
    <p className="missao-meta">{money(meta)}</p><p className="missao-muted">Todas as marcas · todas as origens</p>
    <div className="missao-receita"><span>Receita realizada</span><strong>{money(r.receita)}</strong></div>
    {inicio === MISSAO.inicio ? <>
      <div className="missao-pacing-track"><Progresso atual={r.receita} meta={meta} label={`Atingimento: ${titulo}`} /><i style={{ left: `${pacingTrimestre(dados.hoje) * 100}%` }} aria-hidden="true" /></div>
      <p className="missao-footnote">Traço: {pct(pacingTrimestre(dados.hoje) * 100)} esperado pelos dias transcorridos do trimestre.</p>
    </> : <Progresso atual={r.receita} meta={meta} label={`Atingimento: ${titulo}`} referencia={(Date.parse(dados.hoje + 'T00:00:00Z') - Date.parse(inicio + 'T00:00:00Z') + 86400000) / (Date.parse('2027-01-01T00:00:00Z') - Date.parse(inicio + 'T00:00:00Z'))} />}
    <div className="missao-between"><span>{pct(r.receita / meta * 100)} atingidos</span><span>{r.negocios} negócios ganhos</span></div>
    <div className="missao-saldo"><span>{r.receita > meta ? 'Acima da meta' : 'Falta gerar'}</span><strong>{money(Math.abs(meta - r.receita))}</strong></div>
    {r.semValor > 0 && <p className="missao-aviso">{r.semValor} negócio(s) ganho(s) sem valor de contrato. Não acrescentam receita ao total.</p>}
    <p className="missao-footnote">{fim >= inicio ? `${fmtBR(inicio)} a ${fmtBR(fim)}` : 'Período ainda não iniciado'} · pela data da venda</p>
  </section>
}

function Indicador({ label, atual, meta, referencia }: { label: string; atual: number; meta: number | null; referencia: number }) {
  const format = numero
  return <div className="missao-indicador">
    <div className="missao-indicador-titulo"><span>{label}</span>
      <span className="missao-indicador-valores"><strong>{format(atual)}</strong><span>/ {meta === null ? 'meta pendente' : format(meta)}</span></span>
    </div>
    {meta !== null ? <>
      <Progresso atual={atual} meta={meta} label={label} referencia={referencia} />
      <div className="missao-indicador-legenda"><span>{meta > 0 ? `${pct(atual / meta * 100)} atingidos` : 'Meta 0'}</span><span>{atual > meta ? 'Acima da meta' : 'Falta atingir'}: {format(Math.abs(meta - atual))}</span></div>
    </> : <><div className="missao-track" aria-hidden="true" /><p className="missao-aviso">Meta pendente: falta completar a meta de vendas dos Closers deste mês. Atingimento não calculável.</p></>}
  </div>
}

function Marca({ frente, dados, noTrimestre }: { frente: typeof FRENTES_MISSAO[number]; dados: DadosMissao; noTrimestre: boolean }) {
  const mes = dados.hoje.slice(0, 7) + '-01'
  const referencia = Number(dados.hoje.slice(-2)) / daysInMonth(dados.hoje.slice(0, 7))
  const captacao = captacaoMissao(dados, frente.marca)
  const projecao = projecaoMqlMidia(frente.marca, mes)
  const pacing = pacingMissao(dados.midia, frente.marca, frente.investimento, dados.hoje)
  const etapas = etapasMissao(dados.etapas, frente.marca, mes, dados.hoje)
  const funil = funilInversoMissao(dados.metas, frente.marca, mes)
  return <div className="missao-coluna-marca" style={{ '--missao-marca-accent': BRAND_ACCENT[frente.marca] } as React.CSSProperties}>
    <header className="missao-marca-cabecalho"><h3><span aria-hidden="true" />{frente.marca}</h3><p className="missao-muted">{money(frente.investimento)} de mídia no trimestre</p></header>
    {noTrimestre && <>
      <article className="missao-marca missao-marca-compacta" aria-label={`MQL e CP-MQL · ${frente.marca}`}>
      <h4 className="missao-subtitulo">MQL e CP-MQL · {monthLabelLong(mes)}</h4>
      <Indicador label="MQL" atual={captacao.mql} meta={captacao.metaMql} referencia={referencia} />
      {funil.vendas.valor !== null && <p className="missao-footnote">Meta pelo funil inverso · base: {numero(funil.vendas.valor)} vendas cadastradas no mês.</p>}
      {projecao && <>
        <Indicador label="MQL total vs. meta projetada de mídia paga" atual={captacao.mql} meta={projecao.mql} referencia={referencia} />
        <p className="missao-footnote">Meta da mídia: {money(projecao.orcamento)} de investimento projetado ÷ {money(captacao.metaCpMql)} de CP-MQL projetado. Realizado inclui MQLs de todos os canais.</p>
      </>}
      <div className="missao-indicador"><div className="missao-indicador-titulo"><span>CP-MQL</span><strong>{captacao.cpmql === null ? '—' : money(captacao.cpmql)}</strong></div>
        <p className="missao-footnote">Meta ≤ {money(captacao.metaCpMql)}</p>
        {captacao.cpmql !== null && <><Progresso atual={captacao.metaCpMql} meta={captacao.cpmql > 0 ? captacao.cpmql : captacao.metaCpMql} label={`Eficiência do CP-MQL · ${frente.marca}`} referencia={1} /><p className="missao-footnote">{pct(captacao.cpmql <= captacao.metaCpMql ? 100 : captacao.metaCpMql / captacao.cpmql * 100)} de eficiência em relação à meta · menor custo é melhor. Traço: 100% de eficiência.</p></>}
        <p className="missao-footnote">{captacao.cpmql === null ? 'Sem MQL: custo não calculável.' : `${captacao.cpmql <= captacao.metaCpMql ? 'Dentro' : 'Acima'} da meta · diferença ${money(Math.abs(captacao.cpmql - captacao.metaCpMql))}`}</p>
      </div></article>
      <article className="missao-marca missao-marca-compacta" aria-label={`SQL e SAL · ${frente.marca}`}>
      <h4 className="missao-subtitulo">SQL e SAL · mês vigente</h4>
      <div className="missao-reunioes-compactas">
        <Indicador label="SQL · reuniões agendadas" atual={etapas.sql} meta={funil.sql} referencia={referencia} />
        <Indicador label="SAL" atual={etapas.sal} meta={funil.sal} referencia={referencia} />
      </div>
      {funil.taxas && <p className="missao-footnote">Taxas do print: MQL → SQL {pct(funil.taxas.mqlSql)} · SQL → SAL {pct(funil.taxas.sqlSal)} · SAL → Venda {pct(funil.taxas.salVenda)}.</p>}
      <p className="missao-footnote">SAL é a referência de realizada nesta página. Não altera a etapa Reunião Realizada/Diagnóstico do CRM.</p>
      </article>
    </>}
    {noTrimestre && <article className="missao-marca missao-marca-compacta" aria-label={`Pacing de investimento · ${frente.marca}`}>
      <h4 className="missao-subtitulo">Pacing de investimento · {monthLabelLong(mes)}</h4>
      <div className="missao-indicador-titulo"><span>Investido</span><strong>{money(pacing.gasto)}</strong></div>
      <p className="missao-footnote">Orçamento mensal: {pacing.orcamento === null ? 'Não definido' : money(pacing.orcamento)}</p>
      {pacing.orcamento !== null && <>
        <div className="missao-pacing-track"><Progresso atual={pacing.gasto} meta={pacing.orcamento} label={`Orçamento utilizado · ${frente.marca}`} /><i style={{ left: `${pacing.fracaoMes * 100}%` }} aria-hidden="true" /></div>
        <p className="missao-footnote">{pct(pacing.gasto / pacing.orcamento * 100)} utilizado · {pacing.gasto > pacing.orcamento ? 'Excedente' : 'Saldo'}: {money(Math.abs(pacing.orcamento - pacing.gasto))}</p>
        <p className="missao-footnote">Previsto até hoje: {money(pacing.previsto!)} · Ritmo: {pct(pacing.ritmo! * 100)} do previsto.</p>
      </>}
    </article>}
  </div>
}

function MetaPeriodo({ dados }: { dados: DadosMissao }) {
  const { mes, linhas, total } = metaPeriodoMissao(dados)
  const razao = (realizado: number, meta: number) => meta > 0 ? pct(realizado / meta * 100) : '—'
  const par = (realizado: number, meta: number, formato: (n: number) => string) => meta > 0 ? `${formato(realizado)} / ${formato(meta)}` : '—'
  return <section className="missao-section" aria-labelledby="missao-meta-periodo">
    <h2 id="missao-meta-periodo">Meta do período</h2>
    <p className="missao-muted">Receita e fechamentos vs. meta cadastrada · {monthLabelLong(mes)} · {linhas.length} marcas do quadro de Vendas.</p>
    <div className="missao-tabela-scroll" tabIndex={0} role="region" aria-label="Meta do período por marca"><table className="missao-tabela-meta">
      <thead><tr><th scope="col">Marca</th><th scope="col">Receita · realizado / meta</th><th scope="col">Atingimento</th><th scope="col">Fechamentos · realizado / meta</th><th scope="col">Atingimento</th></tr></thead>
      <tbody>
        <tr className="missao-meta-total"><th scope="row">Total das marcas</th><td>{par(total.receita, total.metaReceita, money)}{total.metaReceita > 0 && <Progresso atual={total.receita} meta={total.metaReceita} label="Receita total vs. meta cadastrada" />}</td><td>{razao(total.receita, total.metaReceita)}</td><td>{par(total.fechamentos, total.metaFechamentos, numero)}{total.metaFechamentos > 0 && <Progresso atual={total.fechamentos} meta={total.metaFechamentos} label="Fechamentos totais vs. meta cadastrada" />}</td><td>{razao(total.fechamentos, total.metaFechamentos)}</td></tr>
        {linhas.map(linha => <tr key={linha.marca}><th scope="row">{linha.marca}</th><td>{par(linha.receita, linha.metaReceita, money)}</td><td>{razao(linha.receita, linha.metaReceita)}</td><td>{par(linha.fechamentos, linha.metaFechamentos, numero)}</td><td>{razao(linha.fechamentos, linha.metaFechamentos)}</td></tr>)}
      </tbody>
    </table></div>
    <p className="missao-footnote">Metas seguem o quadro de Vendas: soma das parcelas Closer cadastradas; “—” indica meta zero ou ausente. Realizado até {fmtBR(dados.hoje)}, pela data da venda.</p>
  </section>
}

function Plano() {
  return <section className="missao-section" aria-labelledby="missao-plano">
    <h2 id="missao-plano">Plano de investimento</h2>
    <p className="missao-muted">R$ 238.000 nas três prioritárias. Inpot e Lisô Laser mantêm 40% / 40% / 20% da mídia; Eletrovias: R$ 28.000 / R$ 28.000 / R$ 20.000. Não há rateio da receita.</p>
    <div className="missao-tabela-scroll" tabIndex={0} role="region" aria-label="Orçamento por marca e mês"><table>
      <thead><tr><th scope="col">Marca</th>{MESES_MISSAO.map(mes => <th scope="col" key={mes}>{shortMonth(mes)}</th>)}<th scope="col">Trimestre</th></tr></thead>
      <tbody>{FRENTES_MISSAO.map(f => <tr key={f.marca}><th scope="row">{f.marca}</th>{MESES_MISSAO.map((_, i) => <td key={i}>{money(orcamentoMensalMissao(f.marca, f.investimento, i) ?? 0)}</td>)}<td>{money(f.investimento)}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total prioritárias</th>{MESES_MISSAO.map((_, i) => <td key={i}>{money(FRENTES_MISSAO.reduce((s, f) => s + (orcamentoMensalMissao(f.marca, f.investimento, i) ?? 0), 0))}</td>)}<td>{money(238_000)}</td></tr></tfoot>
    </table></div>
    <div className="missao-secundarias"><p><strong>Viva</strong>R$ 4.000 / mês · R$ 12.000 adicionais no trimestre.</p><p><strong>Oral Unic</strong>Orçamento mínimo a definir, adicional.</p><p><strong>B2Case</strong>Sem novo investimento de mídia. Histórico e receita preservados.</p></div>
  </section>
}

export function MissaoPainel({ dados }: { dados: DadosMissao }) {
  const noTrimestre = dados.hoje >= MISSAO.inicio && dados.hoje <= MISSAO.fim
  return <>
    <div className="missao-placares"><Placar titulo="Meta anual · 2026" meta={MISSAO.anual} inicio="2026-01-01" dados={dados} /><Placar titulo="Missão · outubro a dezembro" meta={MISSAO.trimestre} inicio={MISSAO.inicio} dados={dados} /></div>
    <p className="missao-footnote">Metas fixas e independentes: o saldo anual usa a receita do ano; o saldo da missão usa somente outubro a dezembro. As metas cadastradas por marca não substituem esses dois valores.</p>
    <section className="missao-section" aria-labelledby="missao-frentes"><h2 id="missao-frentes">As três frentes prioritárias</h2><p className="missao-muted">MQL, CP-MQL, SQL, SAL e investimento · mês vigente.</p>
      {!noTrimestre && <p role="status" className="missao-aviso">O mês vigente está fora de outubro–dezembro de 2026. Os blocos mensais e o pacing da missão não se aplicam.</p>}
      <div className="missao-marcas">{FRENTES_MISSAO.map(frente => <Marca key={frente.marca} frente={frente} dados={dados} noTrimestre={noTrimestre} />)}</div>
    </section>
    {noTrimestre && <MetaPeriodo dados={dados} />}
    <Plano />
    <details className="missao-metodologia"><summary>Fontes e critérios dos indicadores</summary>
      <p>Metas mensais de MQL, SQL e SAL calculadas apenas nesta página pelo funil inverso, a partir da soma das metas de vendas cadastradas para os Closers da marca no mês. SAL = vendas ÷ taxa SAL → Venda; SQL = SAL ÷ taxa SQL → SAL; MQL = SQL ÷ taxa MQL → SQL. Cada etapa é arredondada para cima antes da anterior. Não descontamos as vendas realizadas da meta mensal. Cadastro ausente ou incompleto mantém os três alvos pendentes; zero explícito é respeitado, sem repetir outubro nos meses seguintes.</p>
      <p>Taxas entre etapas do print, aprovadas em 20/10: Inpot 23% / 39% / 20%; Eletrovias 10% / 36% / 28%; Lisô Laser 15% / 30% / 28%, respectivamente MQL → SQL / SQL → SAL / SAL → Venda. São referências de planejamento, não conversões observadas no CRM. A âncora direta MQL → Venda e as antigas metas fixas MQL não entram no cálculo. As configurações comerciais e as metas das outras páginas não são alteradas.</p>
      <p>MQL realizado usa leads do mês da base Marketing, com a classificação e deduplicação dos KPIs do dashboard. Na linha “MQL total vs. meta projetada de mídia paga”, o numerador é o mesmo MQL realizado, de todos os canais; o denominador é o investimento mensal projetado dividido pelo CP-MQL meta, arredondado ao inteiro mais próximo. Esta página não identifica MQLs realizados exclusivamente por mídia paga. CP-MQL realizado é investimento dividido pelos MQLs; sem MQL não é calculável. Metas de custo preservadas: Inpot R$ 220, Eletrovias R$ 37 e Lisô Laser R$ 300. Consultas continuam sequenciais, limitadas e exclusivas desta página, sem novas leituras para a projeção.</p>
      <p>Receita considera apenas negócios Ganhos, pela data da venda em Brasília. Soma o valor de cada contrato uma vez por ciclo, sem multiplicar por unidades. Unidades seguem o dashboard de Vendas: quantidade informada ou uma unidade quando não preenchida/válida.</p>
      <p>SQL e SAL contam negócios únicos por ciclo que têm a data consolidada da respectiva etapa no mês vigente, até hoje. SQL é reunião agendada. SAL é usada como referência de realizada apenas nesta tela; não substitui Diagnóstico. Não contamos reentradas nem somamos eventos de handoff SDR–Closer. Negócios criados antes do mês também entram se avançaram ou venderam nele.</p>
      <p>CRM: Supabase de Expansão. Investimento: Supabase de Marketing. Leitura sequencial e limitada, sem histórico completo de eventos e sem atualização automática. O cache dura 15 minutos; Atualizar permite nova leitura com intervalo mínimo de um minuto. Falhas e limites não viram zero.</p>
    </details>
  </>
}

function MissaoConteudo() {
  const dados = useMissaoResumo()
  return <div className="missao-page">
    <header className="missao-header"><div><p className="missao-kicker">Metas · reta final de 2026</p><h1>Missão Impossível</h1><p>Uma meta de receita. Todas as marcas na conquista.</p></div>
      <button type="button" disabled={dados.loading || dados.bloqueado} onClick={dados.atualizar}><RefreshCw size={15} aria-hidden="true" />{dados.loading ? 'Carregando…' : dados.bloqueado ? 'Aguarde para atualizar' : 'Atualizar'}</button>
    </header>
    {dados.data && <BeautyMarketingBlock start={dados.data.hoje.slice(0, 7) + '-01'} end={dados.data.hoje} />}
    {dados.loading && <p role="status">Carregando somente os recortes necessários. Nenhum total parcial será exibido.</p>}
    {dados.error && <p role="alert" className="missao-erro">{dados.error}</p>}
    {!dados.loading && !dados.error && dados.data && <>
      <p className="missao-footnote">Última leitura: {new Date(dados.data.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília · atualização manual.</p>
      <MissaoPainel dados={dados.data} />
    </>}
  </div>
}
