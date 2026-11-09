import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MessageSquare, CheckCheck, Wallet } from 'lucide-react'
import { useAcesso } from '@/contexts/AcessoContext'
import { supabase } from '@/lib/supabase'
import { dividirEnvios, type EvidenciaEnvio } from '@/lib/finalidadesWhatsapp'
import './GastosWhatsapp.css'

type DiaConta = {
  conta: string; marca: string; dia: string; enviados: number | null; entregues: number | null
  precificados: number | null; custo: number | null; sem_tarifa: number
  entrega_ok: boolean; preco_ok: boolean; parcial: boolean; erro: boolean; vazio: boolean
  entrega_completa: boolean | null
}
type Medicao = {
  evento: string; modelo: string; id: string; conta: string; marca: string; produto: string
  dia: string; enviados: number | null; entregues: number | null; lidos: number | null
  desatualizado: boolean; projecao: number | null
}
type Dados = { versao: number; inicio: string; fim: string; gerado: string; contas: DiaConta[]; eventos: Medicao[]; finalidades: EvidenciaEnvio[] }

const eventos = [
  { id: 'btg', nome: 'Live do Leo com BTG', periodo: 'Outubro', fonte: 'Modelos identificados como live_btg.' },
  { id: 'diretores', nome: 'Live do Leo com Diretores', periodo: 'Edição de 03/11', fonte: 'Convites e lembretes identificados como live0311. A edição teve mudança de convidados.' },
]
const brl = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR')
const dia = (v: string) => v.split('-').reverse().join('/')
function soma(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}
function custo(rows: DiaConta[]) {
  return rows.some(r => r.sem_tarifa > 0) ? null : soma(rows.map(r => r.custo))
}
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
    <p>Rotina reúne modelos identificados da cadência da marca. Evento reúne modelos das lives mapeadas. O saldo do total observado fica a classificar.</p>
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
function Eventos({ rows }: { rows: Medicao[] }) {
  return <section className="wa-section"><h2>Gastos por evento de disparo</h2>
    <p>Projeção por modelo: entregas observadas × tarifa pós-paga brasileira da categoria. Datas dos modelos em UTC. A projeção é apresentada separadamente do custo por conta.</p>
    {eventos.map(evento => {
      const itens = rows.filter(r => r.evento === evento.id)
      const valor = itens.some(r => r.projecao === null) ? null : soma(itens.map(r => r.projecao))
      return <details key={evento.id} className="wa-event"><summary>
        <span><strong>{evento.nome}</strong><small>{evento.periodo}</small></span>
        <span>{itens.length ? num(soma(itens.map(r => r.entregues))) + ' entregues' : 'Sem medição no recorte'}</span>
        <b>{brl(valor)}</b></summary>
        <p>{evento.fonte}</p>
        {itens.length > 0 && <div className="wa-scroll"><table><thead><tr>{['Dia (UTC)','Conta / modelo','Enviadas','Entregues','Lidas','Projeção'].map(c=><th key={c}>{c}</th>)}</tr></thead>
          <tbody>{itens.map(r=><tr key={[r.dia,r.conta,r.id,r.produto].join(':')}><td>{dia(r.dia)}</td><td><strong>{r.marca}</strong><small>{r.modelo} · {r.produto}{r.desatualizado?' · medição anterior':''}</small></td><td>{num(r.enviados)}</td><td>{num(r.entregues)}</td><td>{num(r.lidos)}</td><td>{brl(r.projecao)}</td></tr>)}</tbody></table></div>}
      </details>
    })}
    <div className="wa-pending"><strong>Ativações das marcas</strong><span>Aguardando vínculo entre a campanha do RD Conversas, a conta e o modelo enviado.</span></div>
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
  const rows=contas.flatMap(c=>c.rows)
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
      const response=await fetch('/api/previa-whatsapp/v1/resumo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:'{}',signal:ctrl.signal})
      if(!response.ok) throw new Error()
      const snapshot:Dados=await response.json()
      if(snapshot.versao!==2 || !Array.isArray(snapshot.contas) || !Array.isArray(snapshot.eventos) || !Array.isArray(snapshot.finalidades)) throw new Error()
      if(!ctrl.signal.aborted) setDados(snapshot)
    }
    void carregar().catch(()=>{if(!ctrl.signal.aborted)setErro(true)})
    return ()=>ctrl.abort()
  },[acessoTotal,tentativa])
  return <main className="wa-page"><header><h1>Gastos de WhatsApp</h1>{dados&&<p><CalendarDays size={15}/> Consulta de {new Date(dados.gerado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})} · Brasília</p>}</header>
    {!acessoTotal?<p>Acesso restrito à prévia.</p>:erro?<div role="alert">Não foi possível carregar os dados. <button onClick={()=>repetir(n=>n+1)}>Tentar novamente</button></div>:dados?<Resumo dados={dados}/>:<p role="status">Carregando gastos de WhatsApp…</p>}
  </main>
}
