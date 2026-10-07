import { RefreshCw, Target } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMissaoResumo } from '@/hooks/useMissaoResumo'
import { BRAND_ACCENT } from '@/constants/brands'
import { fmtBR, monthLabelLong, shortMonth } from '@/lib/dateUtils'
import { FRENTES_MISSAO, MESES_MISSAO, MISSAO, captacaoMissao, etapasMissao, metaCadastrada, pacingMissao, realizadoMissao, type DadosMissao } from '@/lib/missaoMetas'
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

function Progresso({ atual, meta, label }: { atual: number; meta: number; label: string }) {
  if (meta <= 0) return null
  const valor = Math.max(0, Math.min(100, atual / meta * 100))
  return <div className="missao-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor} aria-valuetext={pct(atual / meta * 100)}><span style={{ width: `${valor}%` }} /></div>
}

function Placar({ titulo, meta, inicio, dados }: { titulo: string; meta: number; inicio: string; dados: DadosMissao }) {
  const fim = dados.hoje < MISSAO.fim ? dados.hoje : MISSAO.fim
  const r = realizadoMissao(dados.vendas, inicio, fim)
  return <section className="missao-placar" aria-label={titulo}>
    <div className="missao-kicker"><Target size={15} aria-hidden="true" />{titulo}</div>
    <p className="missao-meta">{money(meta)}</p><p className="missao-muted">Todas as marcas · todas as origens</p>
    <div className="missao-receita"><span>Receita realizada</span><strong>{money(r.receita)}</strong></div>
    <Progresso atual={r.receita} meta={meta} label={`Atingimento: ${titulo}`} />
    <div className="missao-between"><span>{pct(r.receita / meta * 100)} atingidos</span><span>{r.negocios} negócios ganhos</span></div>
    <div className="missao-saldo"><span>{r.receita > meta ? 'Acima da meta' : 'Falta gerar'}</span><strong>{money(Math.abs(meta - r.receita))}</strong></div>
    {r.semValor > 0 && <p className="missao-aviso">{r.semValor} negócio(s) ganho(s) sem valor de contrato. Não acrescentam receita ao total.</p>}
    <p className="missao-footnote">{fim >= inicio ? `${fmtBR(inicio)} a ${fmtBR(fim)}` : 'Período ainda não iniciado'} · pela data da venda</p>
  </section>
}

function Indicador({ label, atual, meta, moeda = false }: { label: string; atual: number; meta: ReturnType<typeof metaCadastrada>; moeda?: boolean }) {
  const format = moeda ? money : numero
  return <div className="missao-indicador">
    <div className="missao-indicador-titulo"><span>{label}</span>
      <span className="missao-indicador-valores"><strong>{format(atual)}</strong><span>/ {meta.valor === null ? 'meta pendente' : format(meta.valor)}</span></span>
    </div>
    {meta.valor !== null ? <>
      <Progresso atual={atual} meta={meta.valor} label={label} />
      <div className="missao-indicador-legenda"><span>{meta.valor > 0 ? `${pct(atual / meta.valor * 100)} atingidos` : 'Meta 0'}</span><span>{atual > meta.valor ? 'Acima da meta' : 'Falta atingir'}: {format(Math.abs(meta.valor - atual))}</span></div>
    </> : <p className="missao-aviso">Cadastrado até agora: {format(meta.parcial)}. Falta completar: {meta.faltantes.map(shortMonth).join(', ')}. Total e atingimento pendentes.</p>}
  </div>
}

function Marca({ frente, dados, noTrimestre }: { frente: typeof FRENTES_MISSAO[number]; dados: DadosMissao; noTrimestre: boolean }) {
  const mes = dados.hoje.slice(0, 7) + '-01'
  const captacao = captacaoMissao(dados, frente.marca)
  const pacing = pacingMissao(dados.midia, frente.marca, frente.investimento, dados.hoje)
  const etapas = etapasMissao(dados.etapas, frente.marca, mes, dados.hoje)
  const meta = (campo: Parameters<typeof metaCadastrada>[3], meses: readonly string[]) => metaCadastrada(dados.metas, frente.marca, meses, campo)
  return <div className="missao-coluna-marca" style={{ '--missao-marca-accent': BRAND_ACCENT[frente.marca] } as React.CSSProperties}>
    <header className="missao-marca-cabecalho"><h3><span aria-hidden="true" />{frente.marca}</h3><p className="missao-muted">{money(frente.investimento)} de mídia no trimestre</p></header>
    {noTrimestre && <>
      <article className="missao-marca missao-marca-compacta" aria-label={`MQL e CP-MQL · ${frente.marca}`}>
      <h4 className="missao-subtitulo">MQL e CP-MQL · {monthLabelLong(mes)}</h4>
      <Indicador label="MQL" atual={captacao.mql} meta={{ valor: captacao.metaMql, parcial: 0, faltantes: [mes] }} />
      <div className="missao-indicador"><div className="missao-indicador-titulo"><span>CP-MQL</span><strong>{captacao.cpmql === null ? '—' : money(captacao.cpmql)}</strong></div>
        <p className="missao-footnote">Meta ≤ {money(captacao.metaCpMql)}</p>
        {captacao.cpmql !== null && <><Progresso atual={captacao.metaCpMql} meta={captacao.cpmql > 0 ? captacao.cpmql : captacao.metaCpMql} label={`Eficiência do CP-MQL · ${frente.marca}`} /><p className="missao-footnote">{pct(captacao.cpmql <= captacao.metaCpMql ? 100 : captacao.metaCpMql / captacao.cpmql * 100)} de eficiência em relação à meta · menor custo é melhor.</p></>}
        <p className="missao-footnote">{captacao.cpmql === null ? 'Sem MQL: custo não calculável.' : `${captacao.cpmql <= captacao.metaCpMql ? 'Dentro' : 'Acima'} da meta · diferença ${money(Math.abs(captacao.cpmql - captacao.metaCpMql))}`}</p>
      </div></article>
      <article className="missao-marca missao-marca-compacta" aria-label={`SQL e SAL · ${frente.marca}`}>
      <h4 className="missao-subtitulo">SQL e SAL · mês vigente</h4>
      <div className="missao-reunioes-compactas">
        <Indicador label="SQL · reuniões agendadas" atual={etapas.sql} meta={meta('meta_sql', [mes])} />
        <Indicador label="SAL" atual={etapas.sal} meta={meta('meta_volume_sal', [mes])} />
      </div>
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

function Plano() {
  return <section className="missao-section" aria-labelledby="missao-plano">
    <h2 id="missao-plano">Plano de investimento</h2>
    <p className="missao-muted">R$ 238.000 nas três prioritárias. O rateio 40% / 40% / 20% é só da mídia, não da receita.</p>
    <div className="missao-tabela-scroll" tabIndex={0} role="region" aria-label="Orçamento por marca e mês"><table>
      <thead><tr><th scope="col">Marca</th>{MESES_MISSAO.map((mes, i) => <th scope="col" key={mes}>{shortMonth(mes)} · {[40, 40, 20][i]}%</th>)}<th scope="col">Trimestre</th></tr></thead>
      <tbody>{FRENTES_MISSAO.map(f => <tr key={f.marca}><th scope="row">{f.marca}</th>{[0.4, 0.4, 0.2].map((peso, i) => <td key={i}>{money(f.investimento * peso)}</td>)}<td>{money(f.investimento)}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total prioritárias</th>{[0.4, 0.4, 0.2].map((peso, i) => <td key={i}>{money(238_000 * peso)}</td>)}<td>{money(238_000)}</td></tr></tfoot>
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
    <Plano />
    <details className="missao-metodologia"><summary>Fontes e critérios dos indicadores</summary>
      <p>Metas já cadastradas em Configuração das Metas: unidades e faturamento somam as parcelas dos Closers; SQL e SAL, as dos SDRs. O planejamento do funil, inclusive o funil inverso quando configurado, é respeitado. Esta página não recalcula nem altera essas metas. Meses sem cadastro ficam pendentes, sem projetar outubro nos meses seguintes.</p>
      <p>MQL usa leads do mês da base Marketing, com a classificação e deduplicação dos KPIs do dashboard. Meta de volume vem do cadastro mensal de Marketing; sem cadastro único válido fica pendente. CP-MQL é investimento dividido pelos MQLs; sem MQL não é calculável. Metas de custo aprovadas para a missão: Inpot R$ 220, Eletrovias R$ 37 e Lisô Laser R$ 300. Consultas adicionais são sequenciais, limitadas e exclusivas desta página.</p>
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
    {dados.loading && <p role="status">Carregando somente os recortes necessários. Nenhum total parcial será exibido.</p>}
    {dados.error && <p role="alert" className="missao-erro">{dados.error}</p>}
    {!dados.loading && !dados.error && dados.data && <>
      <p className="missao-footnote">Última leitura: {new Date(dados.data.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília · atualização manual.</p>
      <MissaoPainel dados={dados.data} />
    </>}
  </div>
}
