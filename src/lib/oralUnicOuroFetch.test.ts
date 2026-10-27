import { describe, expect, it, vi } from 'vitest'
import { createOralUnicOuroFetch, ORAL_UNIC_MARKETING_ROUTES } from './oralUnicOuroFetch'
import { filterRows } from './partnerOuroQuery'
import { isOralUnicFranchiseLead } from './oralUnicOuroScope'
const origin = 'https://marketing.test'
const lead = (id: string, marca = 'Oral Unic', dia = '2026-10-10', formulario: string | null = 'oralunic_multistep', dados_extras = {}) => ({ id, marca, dia, formulario, dados_extras })
const reference = [lead('capture'), lead('import', undefined, undefined, null, { crm_deal_id: 'real-deal' }), lead('community', undefined, undefined, 'comunidade_multistep'), lead('cof', undefined, undefined, 'cof_oralunic'), lead('legacy', 'Odonto Scale'), lead('liso', 'Lisô Laser'), lead('history', undefined, '2026-09-10')]
function setup(route = '/', rows = [lead('gold', undefined, undefined, null, { segmento: 'oral-unic', classification_source: 'deal_criado_crm' })]) {
 const referenceFetch = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(filterRows(reference, new URL(String(input)).searchParams))))
 const fetch = vi.fn(async () => new Response(JSON.stringify({ mode: 'ouro', contract: 'oral_unic_marketing_v1', rows })))
 const token = vi.fn(async () => 'token')
 return { referenceFetch, fetch, token, read: createOralUnicOuroFetch({ origin, route: () => route, fetch, referenceFetch, token }) }
}
describe('Oral Unic isolada em Marketing', () => {
 it.each([...ORAL_UNIC_MARKETING_ROUTES])('preserva comunidade, COF, Legacy, outras marcas e história em %s', async route => {
  const s=setup(route)
  const data=await (await s.read(`${origin}/rest/v1/leads?select=id&order=id.asc`)).json()
  expect(data.map((r: {id:string})=>r.id)).toEqual(['cof','community','gold','history','legacy','liso'])
 })
 it.each(['/funil-vendas','/performance-vendas','/analise-perda','/metas','/gp-setembro/tv'])('mantém %s nativa',async route=>{
  const s=setup(route);await s.read(`${origin}/rest/v1/leads`);expect(s.fetch).not.toHaveBeenCalled();expect(s.token).not.toHaveBeenCalled()
 })
 it('não intercepta outras marcas, histórico, escritas ou CRM',async()=>{
  const s=setup();for(const path of ['leads?marca=in.(Eletrovias,Odonto%20Scale)','leads?marca=eq.We%20Scale','leads?dia=lte.2026-09-30','vw_funil_vendas'])await s.read(`${origin}/rest/v1/${path}`)
  await s.read(`${origin}/rest/v1/leads`,{method:'POST'});expect(s.fetch).not.toHaveBeenCalled()
 })
 it('rejeita escopo incorreto e identidade indisponível sem fallback',async()=>{
  const s=setup('/',[lead('other','Odonto Scale')]);await expect(s.read(`${origin}/rest/v1/leads`)).rejects.toThrow('Escopo')
  s.fetch.mockImplementation(async()=>new Response('{}',{status:409}));const t=setup();t.fetch.mockImplementation(async()=>new Response('{}',{status:409}));await expect(t.read(`${origin}/rest/v1/leads`)).rejects.toThrow('ouro de Oral Unic');expect(t.referenceFetch).not.toHaveBeenCalled()
 })
 it('página e projeção são aplicadas após preservar comunidade e unir ouro',async()=>{
  const s=setup();const rows=await (await s.read(`${origin}/rest/v1/leads?select=id&marca=eq.Oral%20Unic&order=id.asc&offset=1&limit=2`)).json();expect(rows).toEqual([{id:'community'},{id:'gold'}])
 })
 it('marca/frente comercial não depende de inventar formulário para contatos do CRM',()=>{
  expect(isOralUnicFranchiseLead(lead('gold',undefined,undefined,null,{segmento:'oral-unic'}))).toBe(true)
  expect(isOralUnicFranchiseLead(lead('community',undefined,undefined,'comunidade_multistep'))).toBe(false)
 })
 it('troca só os três IDs mapeados por nome exato; mídia Legacy/comunidade/V4 fica nativa',async()=>{
  const old=[{...lead('ouf'),canal:'meta',campanha:'[OUF] FUNDO_MQL_FRANQUIA_NOVA'}, {...lead('odl'),canal:'meta',campanha:'[ODL] Consultoria I LEADS I SITE LEGACY'}, {...lead('cmd'),canal:'meta',campanha:'[CMD] AQUISIÇÃO (comunidade) I LEADS'}, {...lead('v4'),canal:'meta',campanha:'[V4] aquisição'}]
  const s=setup();s.referenceFetch.mockImplementation(async()=>new Response(JSON.stringify(old)));s.fetch.mockImplementation(async()=>new Response(JSON.stringify({mode:'ouro',contract:'oral_unic_marketing_v1',rows:[{...old[0],id:'gold'}]})))
  expect((await(await s.read(`${origin}/rest/v1/media_daily_raw?select=id&order=id.asc`)).json()).map((r:{id:string})=>r.id)).toEqual(['cmd','gold','odl','v4'])
 })
 it('flag desligada preserva fonte original',async()=>{
  const s=setup();const read=createOralUnicOuroFetch({origin,route:()=> '/',token:s.token,fetch:s.fetch,referenceFetch:s.referenceFetch,enabled:false});await read(`${origin}/rest/v1/leads`);expect(s.fetch).not.toHaveBeenCalled()
 })
})
