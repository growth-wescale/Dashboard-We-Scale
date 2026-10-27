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
