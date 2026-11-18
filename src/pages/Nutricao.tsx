import { useEffect, useMemo, useState } from 'react'
import { Mail, CheckCheck, MousePointerClick, Eye, RefreshCw } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { supabase } from '@/lib/supabase'
import { nutricaoPrevia, filtrarNutricao, periodoNutricaoValido, somaNutricao, type DadosNutricao, type MedicaoNutricao, type MetricaNutricao } from '@/lib/nutricao'
import './Nutricao.css'

const numero = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR')
const dia = (v: string) => v.split('-').reverse().join('/')
const horario = (v: string) => new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const columns: [MetricaNutricao, string][] = [['delivered', 'Entregues'], ['unique_opens', 'Aberturas'], ['unique_clicks', 'Cliques']]

function Evolucao({ rows }: { rows: MedicaoNutricao[] }) {
  const days = [...new Set(rows.map(r => r.dia))].sort()
  const values = days.map(d => ({ dia: d, valor: somaNutricao(rows.filter(r => r.dia === d), 'delivered') }))
  const max = Math.max(1, ...values.map(v => v.valor ?? 0))
  return <section className="nut-section"><h2>Entregas por dia</h2>
    {!values.length ? <p>Sem medição no período selecionado.</p> : <div className="nut-daily" role="list" aria-label="Entregas por dia">
      {values.map(v => <div className="nut-day" role="listitem" key={v.dia}>
        <span>{dia(v.dia)}</span><div className="nut-track"><div style={{ width: `${100 * (v.valor ?? 0) / max}%` }} /></div><b>{numero(v.valor)}</b>
      </div>)}
    </div>}
    <small>Somente dias com medições. Datas conforme o relatório da fonte, em UTC.</small>
  </section>
}

function Resumo({ dados }: { dados: DadosNutricao }) {
  const [inicio, setInicio] = useState(dados.fim.slice(0, 7) + '-01'), [fim, setFim] = useState(dados.fim)
  const [marca, setMarca] = useState(''), [fluxo, setFluxo] = useState(''), [semMedicao, mostrarSemMedicao] = useState(false)
  const marcas = useMemo(() => [...new Set(dados.fluxos.map(f => f.marca))].sort(), [dados])
  const opcoes = dados.fluxos.filter(f => !marca || f.marca === marca)
  const { fluxos, rows } = useMemo(() => filtrarNutricao(dados, inicio, fim, marca, fluxo), [dados, inicio, fim, marca, fluxo])
  const valido = periodoNutricaoValido(dados, inicio, fim)
  const medidos = new Set(rows.map(r => r.fluxo)).size
  const groups = fluxos.map(f => ({ ...f, rows: rows.filter(r => r.fluxo === f.id) }))
    .sort((a, b) => Number(b.rows.length > 0) - Number(a.rows.length > 0) || a.marca.localeCompare(b.marca) || a.nome.localeCompare(b.nome))
  return <>
    <div className="nut-filters">
      <label>Marca<select aria-label="Marca" value={marca} onChange={e => { setMarca(e.target.value); setFluxo('') }}><option value="">Todas as marcas</option>{marcas.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Fluxo<select aria-label="Fluxo" value={fluxo} onChange={e => setFluxo(e.target.value)}><option value="">Todos os fluxos de nutrição</option>{opcoes.map(f => <option value={f.id} key={f.id}>{f.nome.replace('[NUT26] ', '')}{f.status !== 'ATIVO' ? ' · Reserva' : ''}</option>)}</select></label>
      <label>De<input type="date" min={dados.inicio} max={dados.fim} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
      <label>Até<input type="date" min={dados.inicio} max={dados.fim} value={fim} onChange={e => setFim(e.target.value)} /></label>
      <button onClick={() => { setInicio(dados.fim.slice(0, 7) + '-01'); setFim(dados.fim) }}>Último mês disponível</button>
    </div>
    {!valido ? <p role="alert" className="nut-notice">Escolha um período com cobertura entre {dia(dados.inicio)} e {dia(dados.fim)}. Períodos sem coleta não exibem totais.</p> : <>
      <div className="nut-kpis">{[
        { title: 'E-mails processados', field: 'processed' as const, icon: Mail },
        { title: 'E-mails entregues', field: 'delivered' as const, icon: CheckCheck },
        { title: 'Aberturas', field: 'unique_opens' as const, icon: Eye },
        { title: 'Cliques', field: 'unique_clicks' as const, icon: MousePointerClick },
      ].map(k => <article key={k.field}><k.icon size={20} /><h2>{k.title}</h2><strong>{numero(somaNutricao(rows, k.field))}</strong></article>)}</div>
      <p className="nut-caption">{medidos} de {fluxos.length} fluxos com medição no período. Aberturas e cliques somam contagens únicas por e-mail e dia; a mesma pessoa pode aparecer em mais de um e-mail ou dia.</p>
      <Evolucao rows={rows} />
      <section className="nut-section"><h2>Resultado por marca</h2><div className="nut-scroll"><table aria-label="Resultado por marca">
        <thead><tr><th>Marca</th><th>Fluxos com medição</th>{columns.map(([k, t]) => <th key={k}>{t}</th>)}</tr></thead>
        <tbody>{marcas.filter(m => fluxos.some(f => f.marca === m)).map(m => {
          const ids = new Set(fluxos.filter(f => f.marca === m).map(f => f.id)), items = rows.filter(r => ids.has(r.fluxo))
          return <tr key={m}><th scope="row">{m}</th><td>{new Set(items.map(r => r.fluxo)).size} / {ids.size}</td>{columns.map(([k]) => <td key={k}>{numero(somaNutricao(items, k))}</td>)}</tr>
        })}</tbody>
      </table></div></section>
      <section className="nut-section"><h2>Fluxos de nutrição</h2><p>Abra um fluxo para conferir os e-mails e suas medições. Status do inventário verificado em {horario(dados.inventarioEm)}; rastreios de clique são separados desta lista.</p>
        {!medidos && <p>Sem medição para os fluxos selecionados.</p>}
        {fluxos.length > medidos && <label className="nut-toggle"><input type="checkbox" checked={semMedicao} onChange={e => mostrarSemMedicao(e.target.checked)} /> Mostrar também os {fluxos.length - medidos} fluxos sem medição</label>}
        {groups.filter(f => semMedicao || f.rows.length || fluxo === f.id).map(f => <details className="nut-flow" key={f.id}><summary><span><strong>{f.nome.replace('[NUT26] ', '')}</strong><small>{f.marca} · {f.status === 'ATIVO' ? 'Ativo no inventário' : 'Reserva inativa'}</small></span>
          {f.rows.length ? columns.map(([k, t]) => <span className="nut-metric" key={k}><small>{t}</small><b>{numero(somaNutricao(f.rows, k))}</b></span>) : <span className="nut-empty">Sem medição no período</span>}
        </summary><p>{f.modelos.filter(Boolean).length} modelos de e-mail no inventário.</p>
          {f.rows.length > 0 && <div className="nut-scroll"><table aria-label={`E-mails de ${f.nome}`}><thead><tr><th>Dia (UTC)</th><th>E-mail</th><th>Processados</th>{columns.map(([k, t]) => <th key={k}>{t}</th>)}<th>Soft bounce</th><th>Hard bounce</th><th>Descartados</th><th>Descadastros</th><th>Spam</th></tr></thead>
            <tbody>{f.rows.map(r => <tr key={`${r.dia}:${r.acao}`}><td>{dia(r.dia)}</td><td>{r.email.replace('[NUT26] ', '')}</td>{(['processed', ...columns.map(([k]) => k), 'soft_bounces', 'hard_bounces', 'dropped', 'unsubscribed', 'spam_reports'] as MetricaNutricao[]).map(k => <td key={k}>{numero(r[k])}</td>)}</tr>)}</tbody>
          </table></div>}
        </details>)}
      </section>
      <p className="nut-caption">O traço indica ausência de medição. Processados não significa entregues. Entradas no fluxo, fila de espera, conclusões e conversões comerciais ainda não fazem parte desta leitura.</p>
    </>}
  </>
}

export function Nutricao() {
  const acesso = useAcesso(), autorizado = nutricaoPrevia && acesso.ativo && acesso.registrado && acesso.acessoTotal && !acesso.erro
  const [dados, setDados] = useState<DadosNutricao | null>(null), [erro, setErro] = useState(false), [tentativa, tentar] = useState(0)
  useEffect(() => {
    setDados(null); setErro(false)
    if (!autorizado) return
    const control = new AbortController()
    ;(async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('session')
      const res = await fetch('/api/previa-nutricao/v1/resumo', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}', signal: control.signal })
      if (!res.ok) throw new Error('source')
      const value: DadosNutricao = await res.json()
      if (value.versao !== 1 || !Array.isArray(value.fluxos) || !Array.isArray(value.medicoes) || !Array.isArray(value.dias)) throw new Error('contract')
      if (!control.signal.aborted) setDados(value)
    })().catch(() => { if (!control.signal.aborted) setErro(true) })
    return () => control.abort()
  }, [autorizado, tentativa])
  if (!autorizado) return <div className="nut-page"><p>Esta prévia exige acesso total de Marketing.</p></div>
  return <div className="nut-page"><header><div><span className="nut-eyebrow">MARKETING · PRÉVIA</span><h1>Nutrição</h1><p>Acompanhe os e-mails dos fluxos de nutrição por marca.</p></div><button onClick={() => tentar(v => v + 1)}><RefreshCw size={15} /> Recarregar</button></header>
    {erro ? <p role="alert">Não foi possível ler os dados. Tente recarregar.</p> : !dados ? <p role="status">Carregando a nutrição…</p> : <>
      <p className="nut-coverage">Dados até <strong>{dia(dados.fim)} (UTC)</strong> · Coleta em {horario(dados.coletado)} (Brasília). Prévia com fotografia da ouro.</p>
      <Resumo dados={dados} />
    </>}
  </div>
}
