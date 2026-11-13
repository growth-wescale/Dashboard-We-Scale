/**
 * Relatório da marca (Vendas › Relatórios › Abrir): o relatório semanal do
 * Odonto Legacy, com o mesmo visual do HTML que era feito à mão, para qualquer
 * período. O período vai no link (?de=AAAA-MM-DD&ate=AAAA-MM-DD), então dá para
 * abrir dois períodos em guias diferentes.
 *
 * Abre fora do menu (como o Modo TV), numa guia própria. Os números saem de
 * `montarRelatorio` (src/lib/relatorioMarca.ts), sobre as mesmas bases ao vivo
 * da Visão Macro.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { todayLocal } from '@/lib/dateUtils'
import {
  DEPOIS_DO_AGENDAMENTO, ROTULO_ETAPA, atalhosPeriodo, fmtDia, fmtPct, fmtReais, leiturasRelatorio,
  montarRelatorio, normalizarPeriodo, relatorioPorSlug, rotuloPeriodo, situacaoPeriodo, tituloPeriodo,
  type Contagem, type Periodo, type RelatorioDados, type Safra,
} from '@/lib/relatorioMarca'
import type { CategoriaMotivo } from '@/constants/motivosPerda'

const FONTES = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap'

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtDias = (d: number | null) =>
  d === null ? '—' : d >= 10 ? `${Math.round(d)} d` : `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} d`

function fmtConv(c: number | null): { texto: string; sobe: boolean } {
  if (c === null) return { texto: '—', sobe: false }
  const pct = Math.round(c * 100)
  return c > 1 ? { texto: `↑ ${pct}%`, sobe: true } : { texto: `${pct}%`, sobe: false }
}

function agoraLegivel(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${fmtDia(todayLocal())}, ${hh}h${mm}`
}

export function RelatorioMarca() {
  const { slug } = useParams()
  const def = relatorioPorSlug(slug)
  const [params, setParams] = useSearchParams()
  const hoje = todayLocal()
  const periodo = useMemo(
    () => normalizarPeriodo(params.get('de'), params.get('ate'), hoje),
    [params, hoje],
  )

  const { data: rows, loading: carregandoRows, error: erroRows } = useFunilVendas('Inbound')
  const { data: eventos, loading: carregandoEv, error: erroEv } = useFunilEventos({ enabled: true, origem: 'Inbound' })
  const carregando = (carregandoRows && rows.length === 0) || (carregandoEv && eventos.length === 0)

  // O instante da "foto do funil" acompanha a base: recalcula quando ela muda.
  const [foto, setFoto] = useState(agoraLegivel)
  useEffect(() => { setFoto(agoraLegivel()) }, [rows, eventos])

  const dados = useMemo<RelatorioDados | null>(() => {
    if (!def || carregando) return null
    return montarRelatorio({ rows, eventos, marca: def.marca, periodo, agora: Date.now() })
  }, [def, carregando, rows, eventos, periodo])

  useEffect(() => {
    if (!def) return
    document.title = `${def.nome} · ${tituloPeriodo(periodo)}`
  }, [def, periodo])

  useEffect(() => {
    if (document.querySelector(`link[href="${FONTES}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONTES
    document.head.appendChild(link)
  }, [])

  const mudarPeriodo = (p: Periodo) => setParams({ de: p.de, ate: p.ate }, { replace: true })

  if (!def) {
    return (
      <div className="rm"><style>{CSS}</style>
        <div className="wrap"><p>Relatório não encontrado. <Link to="/relatorios">Voltar para Relatórios</Link></p></div>
      </div>
    )
  }

  return (
    <div className="rm">
      <style>{CSS}</style>
      <BarraPeriodo periodo={periodo} hoje={hoje} onChange={mudarPeriodo} />
      <div className="wrap">
        {erroRows || erroEv ? (
          <p className="note">Não foi possível carregar os dados: {erroRows ?? erroEv}. Tente recarregar a página.</p>
        ) : !dados ? (
          <p className="note">Carregando os dados…</p>
        ) : (
          <Relatorio nome={def.nome} dados={dados} hoje={hoje} foto={foto} />
        )}
      </div>
    </div>
  )
}

/* ── Barra de período (não sai na impressão) ─────────────────────────────── */

function BarraPeriodo({ periodo, hoje, onChange }: { periodo: Periodo; hoje: string; onChange: (p: Periodo) => void }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem permissão de área de transferência: nada a fazer */ }
  }
  const ativo = (p: Periodo) => p.de === periodo.de && p.ate === periodo.ate
  return (
    <div className="barra">
      <div className="barra-in">
        <label>
          <span>De</span>
          <input type="date" value={periodo.de} max={hoje} onChange={e => e.target.value && onChange({ de: e.target.value, ate: periodo.ate })} />
        </label>
        <label>
          <span>Até</span>
          <input type="date" value={periodo.ate} max={hoje} onChange={e => e.target.value && onChange({ de: periodo.de, ate: e.target.value })} />
        </label>
        <div className="atalhos">
          {atalhosPeriodo(hoje).map(a => (
            <button key={a.rotulo} type="button" className={ativo(a.periodo) ? 'on' : ''} onClick={() => onChange(a.periodo)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="acoes">
          <button type="button" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar link'}</button>
          <button type="button" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>
    </div>
  )
}

/* ── O relatório ─────────────────────────────────────────────────────────── */

function Relatorio({ nome, dados: d, hoje, foto }: { nome: string; dados: RelatorioDados; hoje: string; foto: string }) {
  const situacao = situacaoPeriodo(d.periodo, hoje)
  const leituras = leiturasRelatorio(d)
  const dupMql = d.kpis.mqlComDuplicados - d.kpis.mql
  const comp = rotuloPeriodo(d.comparacao)

  return (
    <>
      <header>
        <span className="eyebrow">Expansão · relatório da marca</span>
        <h1>{nome} · {tituloPeriodo(d.periodo)}</h1>
        <div className="meta">
          <span>Período: {rotuloPeriodo(d.periodo)}{situacao ? ` (${situacao})` : ''}</span>
          <span>Comparação: {comp}</span>
          <span>Foto do funil: {foto}</span>
          <span>Origem: Inbound</span>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi"><b>{fmtInt(d.kpis.abertos)}</b><span>leads em andamento hoje</span></div>
        <div className="kpi"><b>{fmtInt(d.kpis.mql)}</b><span>MQL no período{dupMql > 0 ? ` (${fmtInt(d.kpis.mqlComDuplicados)} com duplicados)` : ''}</span></div>
        <div className="kpi"><b>{fmtInt(d.kpis.sql)}</b><span>SQL (reuniões agendadas)</span></div>
        <div className="kpi"><b>{fmtInt(d.kpis.vendas)}</b><span>{d.kpis.vendas === 1 ? 'venda' : 'vendas'}{d.kpis.vendas > 0 ? ` · ${fmtReais(d.kpis.receita)}` : ''}</span></div>
        <div className="kpi"><b>{fmtInt(d.kpis.perdidos)}</b><span>leads perdidos{d.kpis.perdidosDuplicados > 0 ? ` (${fmtInt(d.kpis.perdidosDuplicados)} duplicados)` : ''}</span></div>
      </div>

      <ul className="reads">
        {leituras.map(l => <li key={l.titulo}><strong>{l.titulo}</strong> {l.texto}</li>)}
      </ul>

      <FunilAtual d={d} />
      <FunilPerformance d={d} comp={comp} />
      <SafraSecao d={d} />
      <OrigemPerdas d={d} comp={comp} />

      <footer>
        <span>Fonte: espelho do RD Station CRM no banco de Expansão (as mesmas bases da Visão Macro), atualizado a cada minuto. A foto do funil é de quando a página carregou os dados.</span>
        <ul>
          <li>Origem Inbound.</li>
          <li>O período de comparação é o mesmo intervalo um mês antes (mês inteiro contra o mês inteiro anterior; mais de 31 dias, contra o mesmo número de dias logo antes).</li>
          <li>"MQL" e o funil de performance não contam os negócios perdidos como Duplicado (o mesmo lead entrando de novo). O dashboard ainda conta esses negócios.</li>
          <li>SQL conta a "Reunião Agendada" do funil do Closer (e a do funil Odonto Legacy, que valeu até 23/10), como no dashboard. Venda só conta com status Ganho no RD.</li>
          <li>Os destaques do topo são montados a partir dos números; leia junto com as tabelas.</li>
        </ul>
      </footer>
    </>
  )
}

function FunilAtual({ d }: { d: RelatorioDados }) {
  const max = Math.max(1, ...d.atual.linhas.map(l => l.deals))
  const maior = d.atual.linhas.reduce((a, b) => (b.deals > a.deals ? b : a), d.atual.linhas[0])
  const fora = d.atual.abertos - d.atual.totalTabela
  return (
    <section>
      <div className="sec-head">
        <span className="eyebrow">1 · Funil atual</span>
        <h2>Onde estão os {fmtInt(d.atual.abertos)} leads em andamento</h2>
        <p className="sub">Etapa em que cada negócio aberto está hoje, sem recorte de data. Mesma leitura do modo Atual da Visão Macro.</p>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Etapa</th><th className="barcell"></th><th>Leads</th><th>Parado na etapa</th><th>Desde o MQL</th></tr></thead>
          <tbody>
            {d.atual.linhas.map(l => {
              const zero = l.deals === 0
              const hot = !zero && l.etapa === maior.etapa
              const ouro = DEPOIS_DO_AGENDAMENTO.has(l.etapa)
              return (
                <tr key={l.etapa} className={zero ? 'zero' : hot ? 'hot' : ''}>
                  <td className="stage">{ROTULO_ETAPA[l.etapa]}</td>
                  <td className="barcell"><Barra pct={(l.deals / max) * 100} hot={hot} ouro={ouro} vazio={zero} /></td>
                  <td className="num">{fmtInt(l.deals)}</td>
                  <td>{zero ? '—' : fmtDias(l.mediaEtapa)}</td>
                  <td>{zero ? '—' : fmtDias(l.mediaAndamento)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td>Total</td><td></td><td className="num">{fmtInt(d.atual.totalTabela)}</td><td></td><td></td></tr></tfoot>
        </table>
      </div>
      <p className="note">
        Barras em dourado são as etapas depois do agendamento.
        {fora > 0 ? ` ${fmtInt(fora)} ${fora === 1 ? 'lead fica' : 'leads ficam'} fora da contagem (No Show ou etapa fora do funil), como no dashboard: por isso a tabela soma ${fmtInt(d.atual.totalTabela)} e o total aberto é ${fmtInt(d.atual.abertos)}.` : ''}
        {' '}Tempos em dias corridos, média por etapa. "Desde o MQL" fica em branco para negócio criado sem MQL.
        {d.atual.tentandoParados21 > 0 ? ` ${fmtInt(d.atual.tentandoParados21)} dos ${fmtInt(d.atual.tentando)} em Tentando contato estão parados lá há mais de 21 dias.` : ''}
      </p>
    </section>
  )
}

function FunilPerformance({ d, comp }: { d: RelatorioDados; comp: string }) {
  const base = Math.max(1, d.performance.linhas[0].atual)
  const dupA = d.performance.mqlComDuplicados.atual - d.performance.linhas[0].atual
  const dupB = d.performance.mqlComDuplicados.anterior - d.performance.linhas[0].anterior
  return (
    <section>
      <div className="sec-head">
        <span className="eyebrow">2 · Funil de performance</span>
        <h2>O que passou por cada etapa de {rotuloPeriodo(d.periodo)}</h2>
        <p className="sub">Leads que passaram pela etapa no período, criados em qualquer data. Deals únicos, igual ao modo Performance da Visão Macro. A última coluna é {comp}.</p>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Etapa</th><th className="barcell"></th><th>Período</th><th>Conv. da etapa anterior</th><th>Anterior</th></tr></thead>
          <tbody>
            {d.performance.linhas.map((l, i) => {
              const zero = l.atual === 0
              const ouro = DEPOIS_DO_AGENDAMENTO.has(l.etapa)
              const hot = l.etapa === 'Reunião Agendada SQL'
              const conv = i === 0 ? { texto: '—', sobe: false } : fmtConv(l.conv)
              return (
                <tr key={l.etapa} className={hot ? 'hot' : zero ? 'zero' : ''}>
                  <td className="stage">{ROTULO_ETAPA[l.etapa]}</td>
                  <td className="barcell"><Barra pct={Math.min(100, (l.atual / base) * 100)} ouro={ouro} vazio={zero} /></td>
                  <td className="num">{fmtInt(l.atual)}</td>
                  <td className={`conv${conv.sobe ? ' up' : ''}`}>{conv.texto}</td>
                  <td className="num">{fmtInt(l.anterior)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Conversão MQL → SQL no período: {fmtPct(d.performance.convMqlSql.atual)} ({comp}: {fmtPct(d.performance.convMqlSql.anterior)}).
        {dupA > 0 || dupB > 0 ? ` No dashboard o MQL aparece como ${fmtInt(d.performance.mqlComDuplicados.atual)} no período e ${fmtInt(d.performance.mqlComDuplicados.anterior)} no anterior; aqui saem os negócios perdidos como Duplicado (${fmtInt(dupA)} e ${fmtInt(dupB)}).` : ''}
        {d.performance.vendasSemMql > 0 ? ` ${fmtInt(d.performance.vendasSemMql)} ${d.performance.vendasSemMql === 1 ? 'venda entrou' : 'vendas entraram'} direto em negociação, sem passar pelo topo do funil.` : ''}
        {' '}O funil não é linear: há leads que pulam etapas, por isso algumas conversões passam de 100%.
      </p>
    </section>
  )
}

function CartaoSafra({ titulo, s }: { titulo: string; s: Safra }) {
  return (
    <div className="card scroll">
      <h3>{titulo}</h3>
      <table>
        <tbody>
          {s.abertos.map((c, i) => (
            <tr key={c.rotulo} className={i === maiorIdx(s.abertos) ? 'hot' : ''}>
              <td className={i === maiorIdx(s.abertos) ? 'stage' : ''}>{c.rotulo}</td><td className="num">{fmtInt(c.n)}</td>
            </tr>
          ))}
          {s.vendidos > 0 && <tr><td>Vendidos</td><td className="num">{fmtInt(s.vendidos)}</td></tr>}
          <tr className={s.totalAbertos === 0 && s.totalPerdidos > 0 ? 'hot' : ''}>
            <td className={s.totalAbertos === 0 && s.totalPerdidos > 0 ? 'stage' : ''}>Perdidos</td>
            <td className="num">{fmtInt(s.totalPerdidos)}</td>
          </tr>
        </tbody>
        <tfoot><tr><td>Em andamento</td><td className="num">{fmtInt(s.totalAbertos)}</td></tr></tfoot>
      </table>
    </div>
  )
}

const maiorIdx = (xs: Contagem[]) => xs.reduce((m, x, i) => (x.n > xs[m].n ? i : m), 0)

function listaPerdidos(s: Safra): string {
  if (s.totalPerdidos === 0) return 'nenhum perdido'
  return s.perdidos.map(p => `${fmtInt(p.n)} em ${p.rotulo}`).join(', ')
}

function SafraSecao({ d }: { d: RelatorioDados }) {
  const a = d.safra.atual, b = d.safra.anterior
  return (
    <section>
      <div className="sec-head">
        <span className="eyebrow">3 · Safra do período</span>
        <h2>Onde estão hoje os MQL de {rotuloPeriodo(d.periodo)}</h2>
        <p className="sub">Leads que viraram MQL no período, na etapa em que estão hoje (sem os duplicados). Mesma leitura do modo Aging da Visão Macro. Ao lado, a safra de {rotuloPeriodo(d.comparacao)} como está hoje.</p>
      </div>
      <div className="split">
        <CartaoSafra titulo={`Período (${fmtInt(a.mql)} MQL)`} s={a} />
        <CartaoSafra titulo={`Anterior (${fmtInt(b.mql)} MQL)`} s={b} />
      </div>
      <p className="note">
        Perdidos da safra do período: {listaPerdidos(a)}. Da safra anterior: {listaPerdidos(b)}.
      </p>
    </section>
  )
}

const CHIP: Record<CategoriaMotivo, { classe: string; texto: string }> = {
  processo: { classe: 'proc', texto: 'processo' },
  mercado: { classe: 'merc', texto: 'mercado' },
  ignorar: { classe: 'ign', texto: 'fora da conta' },
}

function OrigemPerdas({ d, comp }: { d: RelatorioDados; comp: string }) {
  const pa = d.perdas.atual, pb = d.perdas.anterior
  const motivos = d.perdas.motivos
  const etapas = useMemo(() => {
    const m = new Map<string, { atual: number; anterior: number }>()
    for (const c of pa.porEtapa) m.set(c.rotulo, { atual: c.n, anterior: 0 })
    for (const c of pb.porEtapa) m.set(c.rotulo, { atual: m.get(c.rotulo)?.atual ?? 0, anterior: c.n })
    const ordem = [...pa.porEtapa, ...pb.porEtapa].map(c => c.rotulo)
    return [...new Set(ordem)]
      .map(rotulo => ({ rotulo, ...m.get(rotulo)! }))
      .sort((x, y) => ordemEtapaRot(x.rotulo) - ordemEtapaRot(y.rotulo))
  }, [pa.porEtapa, pb.porEtapa])
  const maiorEtapa = etapas.reduce((m, e) => (e.atual > m.atual ? e : m), etapas[0] ?? { rotulo: '', atual: 0, anterior: 0 })
  const totalCanalA = d.canais.reduce((s, c) => s + c.mqlAtual, 0)
  const totalCanalB = d.canais.reduce((s, c) => s + c.mqlAnterior, 0)
  const semDup = pa.total - pa.duplicados

  return (
    <section>
      <div className="sec-head">
        <span className="eyebrow">4 · Origem e perdas</span>
        <h2>De onde vieram os MQL e o que foi perdido</h2>
        <p className="sub">MQL por canal (UTM) e leads marcados como perdidos no RD no período, de qualquer safra. A segunda coluna é {comp}.</p>
      </div>
      <div className="card scroll">
          <h3>MQL por canal</h3>
          <table>
            <thead><tr><th>Canal</th><th>Período</th><th>Anterior</th><th>Perdidos no período</th></tr></thead>
            <tbody>
              {d.canais.map(c => (
                <tr key={c.canal}><td>{c.canal}</td><td className="num">{fmtInt(c.mqlAtual)}</td><td className="num">{fmtInt(c.mqlAnterior)}</td><td className="num">{fmtInt(c.perdidosAtual)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num">{fmtInt(totalCanalA)}</td><td className="num">{fmtInt(totalCanalB)}</td><td className="num">{fmtInt(semDup)}</td></tr></tfoot>
          </table>
      </div>
      <div className="split">
        <div className="card scroll">
          <h3>Perdas por motivo</h3>
          <div className="legend"><span><i style={{ background: 'var(--gold)' }} />Processo (evitável)</span><span><i style={{ background: 'var(--accent)' }} />Mercado / perfil</span></div>
          <table>
            <thead><tr><th>Motivo</th><th>Período</th><th>Anterior</th></tr></thead>
            <tbody>
              {motivos.map(m => (
                <tr key={m.motivo} className={m.motivo === motivos[0]?.motivo && m.atual > 0 ? 'hot' : ''}>
                  <td className={`quebra${m.motivo === motivos[0]?.motivo && m.atual > 0 ? ' stage' : ''}`}>
                    {m.motivo}{m.categoria && <span className={`chip ${CHIP[m.categoria].classe}`}>{CHIP[m.categoria].texto}</span>}
                  </td>
                  <td className="num">{fmtInt(m.atual)}</td><td className="num">{fmtInt(m.anterior)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num">{fmtInt(pa.total)}</td><td className="num">{fmtInt(pb.total)}</td></tr></tfoot>
          </table>
        </div>
        <div className="card scroll">
        <h3>Etapa em que foi perdido</h3>
        <table>
          <thead><tr><th>Etapa</th><th>Período</th><th>Anterior</th></tr></thead>
          <tbody>
            {etapas.map(e => (
              <tr key={e.rotulo} className={e.rotulo === maiorEtapa.rotulo && e.atual > 0 ? 'hot' : ''}>
                <td className={e.rotulo === maiorEtapa.rotulo && e.atual > 0 ? 'stage' : ''}>{e.rotulo}</td>
                <td className="num">{fmtInt(e.atual)}</td><td className="num">{fmtInt(e.anterior)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num">{fmtInt(pa.total)}</td><td className="num">{fmtInt(pb.total)}</td></tr></tfoot>
        </table>
        </div>
      </div>
      <p className="note">
        {pa.total > 0 && pa.diasMedios !== null ? `Em média, o lead foi perdido ${fmtDias(pa.diasMedios).replace(' d', '')} dias corridos depois de virar MQL. ` : ''}
        {pa.fimCadencia > 0 ? `${fmtInt(pa.fimCadencia)} ${pa.fimCadencia === 1 ? 'perda foi' : 'perdas foram'} por fim da cadência sem resposta. ` : 'Nenhuma perda por fim da cadência no período. '}
        {pa.duplicados > 0 ? `${fmtInt(pa.duplicados)} ${pa.duplicados === 1 ? 'perda é' : 'perdas são'} Duplicado (o mesmo lead entrando de novo); a coluna "Perdidos no período" do canal não conta esses. ` : ''}
        A separação processo × mercado segue a mesma regra da aba Análise de Perda.
      </p>
    </section>
  )
}

function ordemEtapaRot(rot: string): number {
  const ordem = ['MQL', 'Tentando contato', 'Contato efetivo', 'Interesse reunião', 'Conexão', 'SQL · reunião agendada', 'No Show', 'Diagnóstico', 'SAL', 'Oportunidade', 'Comitê', 'Pré-contrato', 'Fechamento']
  const i = ordem.indexOf(rot)
  return i < 0 ? 99 : i
}

function Barra({ pct, hot, ouro, vazio }: { pct: number; hot?: boolean; ouro?: boolean; vazio?: boolean }) {
  if (vazio) return <div className="bar empty" />
  return <div className={`bar${hot ? ' hot' : ouro ? ' gold' : ''}`} style={{ width: `${Math.max(pct, 0.6)}%` }} />
}

/* ── Estilo: o mesmo do relatório em HTML, preso dentro de .rm ───────────── */

const CSS = `
.rm {
  --bg: #fbf9fb; --surface: #ffffff; --fg: #22161f; --muted: #6e6069; --line: #e9e1e7;
  --accent: #7f0c72; --accent-soft: #f3e4f0; --gold: #b9852f; --gold-soft: #f7ecd8;
  --bar: #c58bbd; --good: #1f7a4d; --bad: #b3261e;
  --display: "Bricolage Grotesque", "Avenir Next", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  min-height: 100vh; background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body);
}
@media (prefers-color-scheme: dark) {
  .rm {
    --bg: #171115; --surface: #211a1f; --fg: #f2eaf0; --muted: #a8979f; --line: #382c34;
    --accent: #e08bd5; --accent-soft: #3a2236; --gold: #e3b766; --gold-soft: #3a2f1c;
    --bar: #9b5a91; --good: #6fcf9b; --bad: #f08a80; color-scheme: dark;
  }
}
.rm * { box-sizing: border-box; }
.rm .wrap { max-width: 880px; margin: 0 auto; padding: 40px max(16px, env(safe-area-inset-left, 0px)) 56px; display: flex; flex-direction: column; gap: 44px; }
.rm h1, .rm h2 { font-family: var(--display); text-wrap: balance; margin: 0; letter-spacing: -0.01em; color: var(--fg); }
.rm h1 { font-size: clamp(30px, 5vw, 42px); font-weight: 700; line-height: 1.1; }
.rm h2 { font-size: 24px; font-weight: 700; }
.rm p { margin: 0; }
.rm .eyebrow { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.rm .sub { color: var(--muted); max-width: 62ch; }
.rm .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.rm header { display: flex; flex-direction: column; gap: 10px; border-bottom: 2px solid var(--accent); padding-bottom: 22px; }
.rm .meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--muted); }
.rm .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.rm .kpi { background: var(--surface); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rm .kpi b { font-family: var(--display); font-size: 28px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.rm .kpi span { font-size: 12.5px; color: var(--muted); }
@media (max-width: 720px) { .rm .kpis { grid-template-columns: repeat(2, 1fr); } .rm .kpi:last-child { grid-column: span 2; } }
.rm .reads { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.rm .reads li { padding: 12px 16px; background: var(--accent-soft); border-radius: 8px; }
.rm .reads li strong { color: var(--accent); }
.rm section { display: flex; flex-direction: column; gap: 16px; }
.rm .sec-head { display: flex; flex-direction: column; gap: 6px; }
.rm .card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 0; }
.rm .scroll { overflow-x: auto; }
.rm table { width: 100%; border-collapse: collapse; font-size: 14px; }
.rm th { font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; text-align: right; padding: 8px 16px; white-space: nowrap; }
.rm th:first-child, .rm td:first-child { text-align: left; }
.rm td { padding: 8px 16px; border-top: 1px solid var(--line); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rm td.stage { font-weight: 500; }
.rm td.quebra { white-space: normal; }
.rm tr.zero td { color: var(--muted); }
.rm tr.hot td.stage { color: var(--accent); font-weight: 600; }
.rm .barcell { width: 42%; min-width: 160px; text-align: left; }
.rm .bar { height: 12px; border-radius: 3px; background: var(--bar); min-width: 3px; }
.rm .bar.hot { background: var(--accent); }
.rm .bar.gold { background: var(--gold); }
.rm .bar.empty { background: transparent; border: 1px dashed var(--line); width: 3px; }
.rm tfoot td { font-weight: 600; border-top: 2px solid var(--line); }
.rm .conv { font-size: 12.5px; color: var(--muted); }
.rm .up { color: var(--good); }
.rm .note { font-size: 13px; color: var(--muted); }
.rm .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rm .split > * { min-width: 0; }
@media (max-width: 720px) { .rm .split { grid-template-columns: 1fr; } }
.rm .card h3 { font-family: var(--display); font-size: 16px; margin: 6px 16px 4px; font-weight: 700; }
.rm .chip { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; padding: 1px 7px; border-radius: 999px; margin-left: 6px; vertical-align: 1px; }
.rm .chip.proc { background: var(--gold-soft); color: var(--gold); }
.rm .chip.merc { background: var(--accent-soft); color: var(--accent); }
.rm .chip.ign { background: var(--line); color: var(--muted); }
.rm .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); padding: 4px 16px 8px; }
.rm .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.rm footer { border-top: 1px solid var(--line); padding-top: 16px; font-size: 12.5px; color: var(--muted); display: flex; flex-direction: column; gap: 6px; }
.rm footer ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.rm a { color: var(--accent); }

.rm .barra { position: sticky; top: 0; z-index: 5; background: var(--surface); border-bottom: 1px solid var(--line); }
.rm .barra-in { max-width: 880px; margin: 0 auto; padding: 10px max(16px, env(safe-area-inset-left, 0px)); display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; }
.rm .barra label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.rm .barra input { font: 14px var(--body); color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.rm .barra button { font: 500 13px var(--body); color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer; white-space: nowrap; }
.rm .barra button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.rm .atalhos, .rm .acoes { display: flex; flex-wrap: wrap; gap: 6px; }
.rm .acoes { margin-left: auto; }
@media (max-width: 720px) { .rm .barra { position: static; } }
@media print {
  .rm .barra { display: none; }
  .rm { min-height: 0; }
  .rm .wrap { padding-top: 0; }
}
`
