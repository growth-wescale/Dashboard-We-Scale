import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MessageSquare, CheckCheck, Wallet } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { supabase } from '@/lib/supabase'
import { dividirEnvios, type EvidenciaEnvio } from '@/lib/finalidadesWhatsapp'
import { brl, num, soma, custo, consumoPorMarca, type DiaConta } from '@/lib/consumoWhatsapp'
import { GraficosWhatsapp } from '@/components/GraficosWhatsapp'
import { whatsappResumo } from '@/lib/previaWhatsapp'
import './GastosWhatsapp.css'

type Medicao = {
  evento: string; modelo: string; id: string; conta: string; marca: string; produto: string
  dia: string; enviados: number | null; entregues: number | null; lidos: number | null; cliques?: number | null; somente_cliques?: boolean
  desatualizado: boolean; projecao: number | null
}
type Dados = { versao: number; inicio: string; fim: string; gerado: string; contas: DiaConta[]; eventos: Medicao[]; finalidades: EvidenciaEnvio[] }

const eventos = [
  { id: 'btg', nome: 'Live do Leo com BTG', periodo: 'Outubro', fonte: 'Modelos da live e dos convites e lembretes de 17 a 19/10.' },
  { id: 'diretores', nome: 'Live do Leo com Diretores', periodo: 'Edição de 03/11', fonte: 'Convites e lembretes identificados como live0311. A edição teve mudança de convidados.' },
  { id: 'webinar_b2case', nome: 'Webinar B2Case', periodo: 'Disparo de 07/10' },
  { id: 'webinar_liso', nome: 'Webinar Lisô Laser', periodo: 'Pré-evento de 06/10' },
  { id: 'beauty', nome: 'Beauty Connection', periodo: 'Convites de 30 e 31/10' },
  { id: 'scale_partner', nome: 'Scale Partner', periodo: 'Disparo de 20/10 · conta We Scale' },
  { id: 'plano_legacy', nome: 'Plano de Ação para 5 Clínicas · Legacy', periodo: 'Ativação de 20/10 · conta We Scale' },
]
const dia = (v: string) => v.split('-').reverse().join('/')
function status(rows: DiaConta[], dias: number) {
  if (!rows.some(r => r.entrega_ok || r.preco_ok)) return 'Sem cobertura'
  if (rows.some(r => r.sem_tarifa > 0)) return 'Tarifa pendente'
  if (rows.length < dias || rows.some(r => r.parcial || !r.entrega_ok || !r.preco_ok)) return 'Parcial'
  return 'Completa'
}
function EnviosPorFinalidade({ dados, inicio, fim, marca }: { dados: Dados; inicio: string; fim: string; marca: string }) {
  const rows = useMemo(
    () => dividirEnvios(dados.contas, dados.finalidades, inicio, fim, marca),
    [dados, inicio, fim, marca],
  )
  const colunas = ['rotina','evento','pendente','total'] as const
  return <section className="wa-section" aria-labelledby="wa-finalidades">
    <h2 id="wa-finalidades">Envios por finalidade</h2>
    <p>Rotina inclui as cadências da marca. Evento inclui convites, lembretes e ativações pontuais. Os envios sem vínculo confirmado ficam a classificar.</p>
    <div className="wa-scroll"><table aria-label="Envios por marca e finalidade">
      <thead><tr>{['Marca','Rotina','Evento','A classificar','Total de envios'].map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map(r=><tr key={r.marca}><th scope="row">{r.marca}</th>
        {colunas.map(c=><td key={c}>{num(r[c])}</td>)}</tr>)}</tbody>
      <tfoot><tr><th scope="row">Total observado</th>
        {colunas.map(c=><td key={c}>{num(soma(rows.map(r=>r[c])))}</td>)}</tr></tfoot>
    </table></div>
    <small>As medições dos modelos são diárias em UTC. Só classificamos envios com a janela inteira dentro do período selecionado em Brasília e compatíveis com o volume da conta. O traço indica ausência de cobertura.</small>
  </section>
}
function IndicadorEvento({ itens, campo, titulo }: {
  itens: Medicao[]; campo: 'entregues' | 'lidos' | 'cliques'; titulo: string
}) {
  const medidas = itens.map(r => r[campo]).filter((v): v is number => v != null)
  return <span className="wa-event-metrica">
    <small>{titulo}</small><b>{medidas.length ? num(soma(medidas)) : '—'}</b>
    {medidas.length > 0 && medidas.length < itens.length &&
      <small>Parcial · {medidas.length}/{itens.length}</small>}
  </span>
}

function Eventos({ rows }: { rows: Medicao[] }) {
  return <section className="wa-section"><h2>Gastos por evento de disparo</h2>
    <p>Aberturas são mensagens marcadas como lidas. Cliques incluem links e respostas rápidas. Quando a cobertura é parcial, o valor soma as medições disponíveis por conta, modelo e dia (UTC). O custo projeta as entregas pela tarifa brasileira da categoria.</p>
    {eventos.map(evento => {
      const itens = rows.filter(r => r.evento === evento.id)
      if (!itens.length && !evento.fonte) return null
      const comMensagens = itens.filter(r => !r.somente_cliques)
      const valor = comMensagens.some(r => r.projecao === null) ? null : soma(comMensagens.map(r => r.projecao))
      return <details key={evento.id} className="wa-event"><summary>
        <span><strong>{evento.nome}</strong><small>{evento.periodo}</small></span>
        {itens.length ? <>
          <IndicadorEvento itens={itens} campo="entregues" titulo="Entregues"/>
          <IndicadorEvento itens={itens} campo="lidos" titulo="Aberturas"/>
          <IndicadorEvento itens={itens} campo="cliques" titulo="Cliques"/>
          <span className="wa-event-metrica"><small>Custo projetado</small><b>{brl(valor)}</b></span>
        </> : <span className="wa-event-vazio">Sem medição no recorte</span>}
      </summary>
        {evento.fonte && <p>{evento.fonte}</p>}
        {itens.length > 0 && <div className="wa-scroll"><table><thead><tr>{['Dia (UTC)','Conta / modelo','Enviadas','Entregues','Aberturas','Cliques','Projeção'].map(c=><th key={c}>{c}</th>)}</tr></thead>
          <tbody>{itens.map(r=><tr key={[r.dia,r.conta,r.id,r.produto].join(':')}><td>{dia(r.dia)}</td><td><strong>{r.marca}</strong><small>{r.modelo} · {r.produto}{r.desatualizado?' · medição anterior':''}</small></td><td>{num(r.enviados)}</td><td>{num(r.entregues)}</td><td>{num(r.lidos)}</td><td>{num(r.cliques ?? null)}</td><td>{brl(r.projecao)}</td></tr>)}</tbody></table></div>}
      </details>
    })}
  </section>
}
function Resumo({ dados }: { dados: Dados }) {
  const [inicio,setInicio]=useState(dados.fim.slice(0,7)+'-01'), [fim,setFim]=useState(dados.fim), [marca,setMarca]=useState('')
  const marcas=useMemo(()=>[...new Set(dados.contas.map(r=>r.marca))].sort(),[dados])
  const valido=inicio>=dados.inicio && fim<=dados.fim && inicio<=fim && !!fim
  const contas=useMemo(()=>{
    const map=new Map<string,{ nome:string; id:string; rows:DiaConta[] }>()
    for(const r of dados.contas){
      if(marca && r.marca!==marca) continue
      if(!map.has(r.conta)) map.set(r.conta,{nome:r.marca,id:r.conta,rows:[]})
      if(r.dia>=inicio && r.dia<=fim) map.get(r.conta)!.rows.push(r)
    }
    return [...map.values()].sort((a,b)=>a.nome.localeCompare(b.nome)||a.id.localeCompare(b.id))
  },[dados,marca,inicio,fim])
  const rows=useMemo(()=>contas.flatMap(c=>c.rows),[contas])
  const consumo=useMemo(()=>consumoPorMarca(rows,marca?[marca]:marcas,inicio,fim),[rows,marca,marcas,inicio,fim])
  const ev=dados.eventos.filter(r=>(!marca||r.marca===marca)&&r.dia>=inicio&&r.dia<=fim)
  const dias=(Date.parse(fim)-Date.parse(inicio))/86400000+1
  const completo=contas.every(c=>status(c.rows,dias)==='Completa')
  return <>
    <div className="wa-toolbar">
      <label>De<input type="date" value={inicio} min={dados.inicio} max={dados.fim} onChange={e=>setInicio(e.target.value)} /></label>
      <label>Até<input type="date" value={fim} min={dados.inicio} max={dados.fim} onChange={e=>setFim(e.target.value)} /></label>
      <label>Marca<select value={marca} onChange={e=>setMarca(e.target.value)}><option value="">Todas as marcas</option>{marcas.map(m=><option key={m}>{m}</option>)}</select></label>
      {dados.inicio <= '2026-10-01' && dados.fim >= '2026-10-31' && <button onClick={()=>{setInicio('2026-10-01');setFim('2026-10-31')}}>Outubro</button>}
      {dados.inicio <= '2026-10-17' && dados.fim >= '2026-11-06' && <button onClick={()=>{setInicio('2026-10-17');setFim('2026-11-06')}}>Período das lives</button>}
      <button onClick={()=>{setInicio(dados.fim.slice(0,7)+'-01');setFim(dados.fim)}}>Mês atual</button>
    </div>
    {!valido ? <p role="alert">Selecione um intervalo entre {dia(dados.inicio)} e {dia(dados.fim)}.</p> : <>
      <div className="wa-kpis">{[
        {title:'Mensagens enviadas',value:num(soma(rows.map(r=>r.enviados))),icon:MessageSquare},
        {title:'Mensagens entregues',value:num(soma(rows.map(r=>r.entregues))),icon:CheckCheck},
        {title:'Custo RD estimado',value:brl(custo(rows)),icon:Wallet},
      ].map(k=><article key={k.title}><k.icon size={20}/><h2>{k.title}</h2><strong>{k.value}</strong></article>)}</div>
      <p className="wa-note">{completo?'Cobertura completa no período.':'Cobertura parcial. Os totais incluem somente os registros disponíveis.'} Valores pós-pagos estimados, em reais.</p>
      <GraficosWhatsapp consumo={consumo}/>
      <section className="wa-section"><h2>Resumo por marca</h2>
        <div className="wa-scroll"><table aria-label="Resumo por marca"><thead><tr>
          {['Marca','Enviadas','Entregues','Custo estimado','Cobertura','Última observação (Brasília)'].map(c=><th scope="col" key={c}>{c}</th>)}
        </tr></thead><tbody>{consumo.series.map(s=>{
          const situacoes=contas.filter(c=>c.nome===s.marca).map(c=>status(c.rows,dias))
          const cobertura=situacoes.every(v=>v==='Sem cobertura')?'Sem cobertura'
            :situacoes.includes('Tarifa pendente')?'Tarifa pendente':situacoes.every(v=>v==='Completa')?'Completa':'Parcial'
          return <tr key={s.marca}><th scope="row">{s.marca}</th><td>{num(s.enviados)}</td><td>{num(s.entregues)}</td><td>{brl(s.custo)}</td>
            <td>{cobertura}</td><td>{s.ultima?new Date(s.ultima).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—'}</td></tr>
        })}</tbody></table></div>
      </section>
      <EnviosPorFinalidade dados={dados} inicio={inicio} fim={fim} marca={marca}/>
      <section className="wa-section"><h2>Consumo por conta</h2><div className="wa-scroll"><table><thead><tr>{['Marca / conta','Envios','Entregas','Custo estimado','Cobertura','Último dia válido'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
        {contas.map(c=>{
          const validos=c.rows.filter(r=>r.entrega_ok||r.preco_ok).map(r=>r.dia).sort()
          const entrega=c.rows.filter(r=>r.entrega_ok).length,preco=c.rows.filter(r=>r.preco_ok).length
          return <tr key={c.id}><td><strong>{c.nome}</strong><small>{c.id}</small></td><td>{num(soma(c.rows.map(r=>r.enviados)))}</td><td>{num(soma(c.rows.map(r=>r.entregues)))}</td><td>{brl(custo(c.rows))}</td><td><strong>{status(c.rows,dias)}</strong><small>Entrega {entrega}/{dias} dias · Preço {preco}/{dias} dias</small></td><td>{validos.length?dia(validos[validos.length-1]):'—'}</td></tr>
        })}
      </tbody></table></div></section>
      <Eventos rows={ev}/>
    </>}
  </>
}
export function GastosWhatsapp(){
  const { acessoTotal }=useAcesso()
  const [dados,setDados]=useState<Dados|null>(null),[erro,setErro]=useState(false),[tentativa,repetir]=useState(0)
  useEffect(()=>{
    if(!acessoTotal) return
    const ctrl=new AbortController()
    setErro(false)
    async function carregar(){
      const {data:{session}}=await supabase.auth.getSession()
      if(!session) throw new Error()
      const response=await fetch(whatsappResumo,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:'{}',signal:ctrl.signal})
      if(!response.ok) throw new Error()
      const snapshot:Dados=await response.json()
      if(snapshot.versao!==2 || !Array.isArray(snapshot.contas) || !Array.isArray(snapshot.eventos) || !Array.isArray(snapshot.finalidades)) throw new Error()
      if(!ctrl.signal.aborted) setDados(snapshot)
    }
    void carregar().catch(()=>{if(!ctrl.signal.aborted)setErro(true)})
    return ()=>ctrl.abort()
  },[acessoTotal,tentativa])
  return <main className="wa-page"><header><h1>Gastos de WhatsApp</h1>{dados&&<p><CalendarDays size={15}/> Consulta de {new Date(dados.gerado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})} · Brasília</p>}</header>
    {!acessoTotal?<p>Acesso restrito.</p>:erro?<div role="alert">Não foi possível carregar os dados. <button onClick={()=>repetir(n=>n+1)}>Tentar novamente</button></div>:dados?<Resumo dados={dados}/>:<p role="status">Carregando gastos de WhatsApp…</p>}
  </main>
}
