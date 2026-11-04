import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from './types'
import { consultarInbound } from './mqlInbound'

const mql = (id: string, deal?: string): Lead => ({ id, marca: 'Inpot', dia: '2026-10-03', nome: null, email: id + '@example.test', telefone: null, uf: null, cidade: null, utm_source: null, utm_medium: null, utm_campaign: null, formulario: null, row_hash: null, criado_em: '2026-10-03T12:00:00Z', dados_extras: { lead_type: 'MQL', crm_deal_id: deal } })
function crm(data: unknown[] | null) {
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(async () => ({ data, error: data ? null : 'permission' })) }
  for (const k of ['select', 'eq', 'in', 'order', 'limit'] as const) chain[k].mockReturnValue(chain)
  const log = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(async (): Promise<{data: Array<{marca:string;lead_email:string;id_deal:string;recebido_em:string}>;error:null}> => ({ data: [], error: null })) }
  for (const k of ['select','eq','not','gte','lt','order','range'] as const) log[k].mockReturnValue(log)
  return { log, db: { from: (table: string) => table === 'vw_distribuicao_atribuicoes' ? log : chain } as unknown as SupabaseClient, chain }
}
describe('realizado Inbound', () => {
  it('usa ID, marca e fonte explícita; duas linhas do mesmo negócio não multiplicam o realizado', async () => {
    const { db, chain } = crm([{ id_lead:'a', fonte_macro:' Inbound ' },{ id_lead:'b', fonte_macro:'Evento' },{ id_lead:'c', fonte_macro:null }])
    const leads = [mql('1','a'),mql('2','a'),mql('3','b'),mql('4','c'),mql('5')]
    expect((await consultarInbound(db,leads,['Inpot'],new AbortController().signal)).Inpot).toEqual({inbound:1,semOrigem:2})
    expect(chain.eq).toHaveBeenCalledWith('marca','Inpot')
  })
  it('conta uma vez a fonte explícita da ouro mesmo quando o negócio ainda falta no espelho', async () => {
    const { db, chain } = crm([])
    const negocio = (id: string, fonte: string) => ({
      ...mql(id), dados_extras: { origem_leitura: 'ouro_outubro_2026', metric_grain: 'crm_deal',
        conta_id: 'wescale_principal_crm', id_deal: id, fonte_macro: fonte },
    })
    const rows = [negocio('1', 'Inbound'), negocio('1', 'Inbound'), negocio('2', 'Prospecção Ativa')]
    expect((await consultarInbound(db, rows, ['Inpot'], new AbortController().signal)).Inpot)
      .toEqual({ inbound: 1, semOrigem: 0 })
    expect(chain.select).not.toHaveBeenCalled()
  })
  it('recupera vínculo único pela distribuição e rejeita ambiguidade e outra data em Brasília',async()=>{
    const {db, log}=crm([{ id_lead:'unico', fonte_macro:'Inbound' }, {id_lead:'amb1', fonte_macro:'Inbound'}])
    const atribuicao=(lead_email:string,id_deal:string,recebido_em:string)=>({marca:'Inpot',lead_email,id_deal,recebido_em})
    log.abortSignal.mockResolvedValue({error:null,data:[
      atribuicao('UM@EXAMPLE.TEST','unico','2026-10-04T01:00:00Z'),
      atribuicao('dois@example.test','amb1','2026-10-03T13:00:00Z'),
      atribuicao('dois@example.test','amb2','2026-10-03T14:00:00Z'),
      atribuicao('tres@example.test','unico','2026-10-04T04:00:00Z'),
    ]})
    expect((await consultarInbound(db,[mql('um'),mql('dois'),mql('tres')],['Inpot'],new AbortController().signal)).Inpot).toEqual({inbound:1,semOrigem:2})
  })
  it('distingue uma fonte vazia, falta de vínculo e erro de leitura', async () => {
    const contagem = async (rows: unknown[] | null) => (await consultarInbound(crm(rows).db,[mql('1','a')],['Inpot'],new AbortController().signal)).Inpot.inbound
    expect(await contagem([{id_lead:'a',fonte_macro:null}])).toBe(0)
    expect(await contagem([])).toBeNull()
    expect(await contagem(null)).toBeNull()
  })
})
