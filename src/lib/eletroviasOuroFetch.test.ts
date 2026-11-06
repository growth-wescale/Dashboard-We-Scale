import { describe, expect, it, vi } from 'vitest'
import { createEletroviasOuroFetch, ELETROVIAS_MARKETING_ROUTES } from './eletroviasOuroFetch'
import { ELETROVIAS_MEDIA } from './eletroviasOuroScope'
import { filterRows } from './partnerOuroQuery'
const origin = 'https://marketing.test'
const lead = (id: string, marca = 'Eletrovias', dia = '2026-10-10') => ({ id, marca, dia })
const reference = [lead('capture'), lead('import'), lead('legacy', 'Odonto Scale'), lead('oral', 'Oral Unic'), lead('liso', 'Lisô Laser'), lead('partner', 'We Scale'), lead('history', undefined, '2026-09-10')]
function setup(route = '/', rows = [lead('gold')]) {
 const referenceFetch = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(filterRows(reference, new URL(String(input)).searchParams))))
 const fetch = vi.fn(async () => new Response(JSON.stringify({ mode: 'ouro', contract: 'eletrovias_marketing_v1', rows })))
 const token = vi.fn(async () => 'token')
 return { referenceFetch, fetch, token, read: createEletroviasOuroFetch({ origin, route: () => route, fetch, referenceFetch, token }) }
}
describe('Eletrovias isolada em Marketing', () => {
 it.each([...ELETROVIAS_MARKETING_ROUTES])('preserva integralmente outras marcas e história em %s', async route => {
  const s=setup(route)
  const data=await (await s.read(`${origin}/rest/v1/leads?order=id.asc`)).json()
  expect(data).toEqual([lead('gold'), ...reference.filter(r => !['capture','import'].includes(r.id)).sort((a,b)=>a.id.localeCompare(b.id))])
 })
 it.each(['/funil-vendas','/performance-vendas','/analise-perda','/metas','/esteira','/gp-setembro/tv'])('mantém %s nativa',async route=>{
  const s=setup(route);await s.read(`${origin}/rest/v1/leads`);expect(s.fetch).not.toHaveBeenCalled();expect(s.token).not.toHaveBeenCalled()
 })
 it('não intercepta outras marcas, histórico, escritas, origem diferente ou CRM',async()=>{
  const s=setup();for(const path of ['leads?marca=in.(Oral%20Unic,Odonto%20Scale)','leads?marca=eq.We%20Scale','leads?dia=lte.2026-09-30','vw_funil_vendas'])await s.read(`${origin}/rest/v1/${path}`)
  await s.read(`${origin}/rest/v1/leads`,{method:'POST'});await s.read('https://sales.test/rest/v1/leads');expect(s.fetch).not.toHaveBeenCalled()
 })
 it('rejeita escopo incorreto e identidade indisponível sem fallback silencioso',async()=>{
  const s=setup('/',[lead('other','Oral Unic')]);await expect(s.read(`${origin}/rest/v1/leads`)).rejects.toThrow('Escopo')
  const t=setup();t.fetch.mockImplementation(async()=>new Response('{}',{status:409}));await expect(t.read(`${origin}/rest/v1/leads`)).rejects.toThrow('ouro de Eletrovias');expect(t.referenceFetch).not.toHaveBeenCalled()
 })
 it('aplica filtro, paginação e projeção depois da união',async()=>{
  const s=setup();const rows=await (await s.read(`${origin}/rest/v1/leads?select=id&marca=eq.Eletrovias&order=id.asc&offset=1&limit=1`)).json();expect(rows).toEqual([{id:'history'}])
 })
 it('troca apenas campanhas mapeadas com canal e nome exato',async()=>{
  const campaigns=ELETROVIAS_MEDIA.map((c,i)=>({...lead(`old-${i}`),canal:c.canal,campanha:c.names[0],spend_brl:1.234567}))
  const preserved=[{...lead('other-campaign'),canal:'meta',campanha:'Outra campanha'}, {...lead('other-brand','Oral Unic'),canal:'meta',campanha:campaigns[1].campanha}]
  const gold=campaigns.map((c,i)=>({...c,id:`gold-${i}`,spend_brl:2.345678}))
  const s=setup();s.referenceFetch.mockImplementation(async()=>new Response(JSON.stringify([...campaigns,...preserved])));s.fetch.mockImplementation(async()=>new Response(JSON.stringify({mode:'ouro',contract:'eletrovias_marketing_v1',rows:gold})))
  expect(await(await s.read(`${origin}/rest/v1/media_daily_raw?order=id.asc`)).json()).toEqual([...gold,...preserved].sort((a,b)=>a.id.localeCompare(b.id)))
 })
 it('flag desligada preserva fonte original',async()=>{
  const s=setup();const read=createEletroviasOuroFetch({origin,route:()=> '/',token:s.token,fetch:s.fetch,referenceFetch:s.referenceFetch,enabled:false});await read(`${origin}/rest/v1/leads`);expect(s.fetch).not.toHaveBeenCalled()
 })
 it('não aceita contrato de outra marca',async()=>{
  const s=setup();s.fetch.mockImplementation(async()=>new Response(JSON.stringify({mode:'ouro',contract:'oral_unic_marketing_v1',rows:[lead('gold')]})))
  await expect(s.read(`${origin}/rest/v1/leads`)).rejects.toThrow('Contrato')
 })
})

describe('dataset de negociações opt-in', () => {
 it.each([...ELETROVIAS_MARKETING_ROUTES])('mesma composição em %s, sem alterar contatos, mídia ou outras marcas',async route=>{
  const contact={...lead('gold'),email:'real@example.test',dados_extras:{lead_type:'MQL',id_deal:'crm'}}
  const deal={...lead('deal'),email:null,dados_extras:{metric_grain:'crm_deal',conta_id:'wescale_principal_crm',id_deal:'crm'}}
  const s=setup(route)
  s.fetch.mockImplementation(async(_input?:unknown,init?:RequestInit)=>{
   const dataset=JSON.parse(String(init?.body)).dataset
   return new Response(JSON.stringify({mode:'ouro',contract:dataset==='negocios'?'eletrovias_negocios_v1':'eletrovias_marketing_v1',rows:dataset==='negocios'?[deal]:[contact]}))
  })
  const read=createEletroviasOuroFetch({origin,route:()=>route,token:s.token,fetch:s.fetch,referenceFetch:s.referenceFetch,dealsEnabled:true})
  const data=await(await read(`${origin}/rest/v1/leads?order=id.asc`)).json()
  expect(data.filter((r:{marca:string;dia:string})=>r.marca!=='Eletrovias'||r.dia<'2026-10-01')).toEqual(reference.filter(r=>!['capture','import'].includes(r.id)).sort((a,b)=>a.id.localeCompare(b.id)))
  expect(data.find((r:{id:string})=>r.id==='gold')).toEqual({...contact,dados_extras:{...contact.dados_extras,metric_grain:'contact_only'}})
  expect(data.find((r:{id:string})=>r.id==='deal').email).toBe('real@example.test')
  expect(contact.dados_extras).not.toHaveProperty('metric_grain')
  const page=await(await read(`${origin}/rest/v1/leads?marca=eq.Eletrovias&order=id.asc&limit=1&offset=1`)).json()
  expect(page.map((r:{id:string})=>r.id)).toEqual(['gold'])
 })
 it('não usa contagem antiga quando o dataset de negócios falha',async()=>{
  const s=setup();let calls=0
  s.fetch.mockImplementation(async()=>new Response(JSON.stringify(++calls===1?{mode:'ouro',contract:'eletrovias_marketing_v1',rows:[lead('gold')]}:{mode:'legacy'})))
  const read=createEletroviasOuroFetch({origin,route:()=> '/',token:s.token,fetch:s.fetch,referenceFetch:s.referenceFetch,dealsEnabled:true})
  await expect(read(`${origin}/rest/v1/leads`)).rejects.toThrow('Contrato de negociações')
 })
})

describe('gateway mensal de Marketing', () => {
 function monthly(route = '/') {
  const referenceFetch = vi.fn(async () => new Response(JSON.stringify([
   lead('october', 'Inpot', '2026-10-10'), lead('old-nov', 'Inpot', '2026-11-02'),
   lead('partner', 'We Scale', '2026-11-02'),
  ])))
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
   const { periodo } = JSON.parse(String(init?.body))
   return new Response(JSON.stringify({ mode: 'ouro', contract: 'marketing_mensal_v1',
    rows: [lead('gold-' + periodo.inicio, 'Inpot', periodo.inicio)] }))
  })
  const read = createEletroviasOuroFetch({ origin, route: () => route, token: async () => 'token',
   fetch, referenceFetch, marketingScope: { mensal: true, brands: ['Inpot'],
    endpoint: '/api/marketing-mensal-ouro/v1/read', contract: 'marketing_mensal_v1', includes: r => r.marca === 'Inpot' } })
  return { read, fetch, referenceFetch }
 }
 it('preserva outubro e Partner no intervalo misto e separa o cache por mês', async () => {
  const s = monthly()
  const rows = await (await s.read(`${origin}/rest/v1/leads?dia=gte.2026-10-01&dia=lte.2026-11-06&order=id.asc`)).json()
  expect(rows.map((r: { id: string }) => r.id)).toEqual(['gold-2026-11-01', 'october', 'partner'])
  expect(JSON.parse(String(s.fetch.mock.calls[0][1]?.body)).periodo).toEqual({ inicio: '2026-11-01', fim: '2026-11-06' })
  await s.read(`${origin}/rest/v1/leads?dia=gte.2026-12-01&dia=lte.2026-12-31`)
  expect(s.fetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(s.fetch.mock.calls[1][1]?.body)).periodo).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' })
 })
 it.each(['/funil-vendas', '/performance-vendas', '/esteira'])('não consulta o mensal em %s', async route => {
  const s = monthly(route)
  await s.read(`${origin}/rest/v1/leads?dia=gte.2026-11-01`)
  expect(s.fetch).not.toHaveBeenCalled()
  expect(s.referenceFetch).toHaveBeenCalledOnce()
 })
 it('delega outubro integralmente ao leitor existente', async () => {
  const s = monthly()
  await s.read(`${origin}/rest/v1/leads?dia=gte.2026-10-01&dia=lte.2026-10-31`)
  expect(s.fetch).not.toHaveBeenCalled()
  expect(s.referenceFetch).toHaveBeenCalledOnce()
 })
 it('não troca publicação ausente por zero ou fonte antiga', async () => {
  const s = monthly()
  s.fetch.mockImplementation(async () => new Response(JSON.stringify({ code: 'periodo_sem_publicacao' }), { status: 409 }))
  await expect(s.read(`${origin}/rest/v1/leads?dia=gte.2026-12-01`)).rejects.toThrow('ainda não publicou')
  expect(s.referenceFetch).not.toHaveBeenCalled()
 })
})
