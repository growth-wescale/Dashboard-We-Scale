import { describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { consultarMissao, LIMITES_MISSAO } from './missaoConsulta'
import { captacaoMissao } from './missaoMetas'
import { createEletroviasOuroFetch } from './eletroviasOuroFetch'
import { linhaMensal, marcasMensais } from './previaMensal'

function banco(resultados: Array<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>) {
  const calls: Array<{ table: string; filtros: Array<[string, unknown[]]> }> = []
  const client = { from(table: string) {
    const call = { table, filtros: [] as Array<[string, unknown[]]> }; calls.push(call)
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'lt', 'lte', 'limit', 'abortSignal', 'in', 'or', 'order', 'range']) {
      query[method] = (...args: unknown[]) => { call.filtros.push([method, args]); return query }
    }
    query.then = (resolve: (r: unknown) => void) => Promise.resolve(resultados.shift() ?? { data: [], error: null }).then(resolve)
    return query
  } } as unknown as SupabaseClient
  return { client, calls }
}
const ok = (data: unknown[] = []) => ({ data, error: null })
const signal = () => new AbortController().signal

describe('Consultas da Missão: recortes e limites obrigatórios', () => {
  it('faz três leituras CRM e uma de mídia; nunca busca eventos, contatos ou base inteira', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco([ok()])
    const dados = await consultarMissao(v.client, m.client, '2026-10-07', signal())
    expect(v.calls.map(c => c.table)).toEqual(['vw_funil_vendas', 'DB_Metas_Performance', 'vw_funil_vendas'])
    expect(v.calls[0].filtros).toContainEqual(['eq', ['status_atual', 'Ganho']])
    expect(v.calls[0].filtros).toContainEqual(['gte', ['data_venda', '2026-01-01T00:00:00-03:00']])
    expect(v.calls[0].filtros).toContainEqual(['lt', ['data_venda', '2026-10-08T00:00:00-03:00']])
    expect(v.calls[0].filtros).toContainEqual(['limit', [501]])
    expect(v.calls[1].filtros).toContainEqual(['in', ['funcao', ['SDR', 'Closer']]])
    expect(v.calls[1].filtros).toContainEqual(['in', ['marca', ['Oral Unic', 'Inpot', 'Eletrovias', 'Lisô Laser', 'B2Case', 'Viva', 'Instituto do Autismo']]])
    expect(JSON.stringify(v.calls[1])).toContain('nome_colaborador')
    expect(JSON.stringify(v.calls[2])).toContain('data_sal.gte.2026-10-01T00:00:00-03:00')
    expect(JSON.stringify(v.calls)).not.toMatch(/\*|vw_funil_etapas|telefone|email/)
    expect(m.calls[0].filtros).toContainEqual(['order', ['id', { ascending: true }]])
    expect(m.calls[0].filtros).toContainEqual(['lte', ['dia', '2026-10-07']])
    expect(m.calls[0].filtros).toContainEqual(['range', [0, 499]])
    expect(dados.hoje).toBe('2026-10-07')
  })
  it('interrompe no primeiro erro, sem retry ou resultados parciais', async () => {
    const v = banco([{ data: null, error: { message: 'falha interna' } }]), m = banco([])
    await expect(consultarMissao(v.client, m.client, '2026-10-07', signal())).rejects.toThrow('vendas de 2026')
    expect(v.calls).toHaveLength(1); expect(m.calls).toHaveLength(0)
  })
  it('não inicia a segunda leitura enquanto a primeira está pendente', async () => {
    let terminar: (r: unknown) => void = () => {}
    let calls = 0
    const query = new Proxy({}, { get: (_, key) => key === 'then'
      ? (resolve: (r: unknown) => void) => { terminar = resolve }
      : () => query })
    const v = { from: () => { calls++; return query } } as unknown as SupabaseClient
    const m = banco([])
    const controller = new AbortController()
    const promise = consultarMissao(v, m.client, '2026-10-07', controller.signal)
    await Promise.resolve(); await Promise.resolve()
    expect(calls).toBe(1); expect(m.calls).toHaveLength(0)
    controller.abort(); terminar(ok())
    await expect(promise).rejects.toThrow()
    expect(calls).toBe(1)
  })
  it.each([[501, 'vendas'], [201, 'metas'], [501, 'etapas']] as const)('não aceita %i linhas truncadas em %s', async (length, etapa) => {
    const resultados = etapa === 'vendas' ? [] : etapa === 'metas' ? [ok()] : [ok(), ok()]
    const v = banco([...resultados, ok(Array.from({ length }, () => ({})))]), m = banco([])
    await expect(consultarMissao(v.client, m.client, '2026-10-07', signal())).rejects.toThrow('Limite de leitura')
    expect(m.calls).toHaveLength(0)
  })
  it('pagina mídia sequencialmente, com ordenação e limite máximo de oito páginas', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco(Array.from({ length: 8 }, () => ok(Array.from({ length: 500 }, () => ({})))))
    await expect(consultarMissao(v.client, m.client, '2026-10-07', signal())).rejects.toThrow('Nenhum total parcial')
    expect(m.calls).toHaveLength(8)
    expect(m.calls[7].filtros).toContainEqual(['range', [3500, 3999]])
  })
  it('encerra mídia na primeira página incompleta', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco([ok(Array.from({ length: 500 }, () => ({}))), ok([{}])])
    const r = await consultarMissao(v.client, m.client, '2026-10-07', signal())
    expect(m.calls).toHaveLength(4); expect(r.midia).toHaveLength(501)
  })
  it('aborta antes de começar; fora de Q4 só consulta o consolidado e metas', async () => {
    const v = banco([]), m = banco([]), controller = new AbortController(); controller.abort()
    await expect(consultarMissao(v.client, m.client, '2026-10-07', controller.signal)).rejects.toThrow()
    expect(v.calls).toHaveLength(0)
    await consultarMissao(v.client, m.client, '2027-01-01', signal())
    expect(v.calls).toHaveLength(2); expect(m.calls).toHaveLength(0)
    expect(v.calls[0].filtros).toContainEqual(['lt', ['data_venda', '2027-01-01T00:00:00-03:00']])
  })
  it('limita metas MQL e leads às três marcas e ao mês, com ordenação estável', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), ok()])
    await consultarMissao(v.client, m.client, '2026-10-07', signal())
    expect(m.calls.map(c => c.table)).toEqual(['media_daily_raw', 'metas', 'leads'])
    expect(m.calls[1].filtros).toContainEqual(['eq', ['metrica', 'mql']])
    expect(m.calls[1].filtros).toContainEqual(['eq', ['mes', '2026-10-01']])
    expect(m.calls[2].filtros).toContainEqual(['in', ['marca', ['Inpot', 'Eletrovias', 'Lisô Laser']]])
    expect(m.calls[2].filtros).toContainEqual(['gte', ['dia', '2026-10-01']])
    expect(m.calls[2].filtros).toContainEqual(['lte', ['dia', '2026-10-07']])
    expect(m.calls[2].filtros).toContainEqual(['order', ['id', { ascending: true }]])
  })
  it('recusa leads acima do teto e erros novos sem exibir totais parciais', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), { ...ok(), count: LIMITES_MISSAO.leads + 1 }])
    await expect(consultarMissao(v.client, m.client, '2026-10-07', signal())).rejects.toThrow('Limite de leitura de leads')
    const v2 = banco([ok(), ok(), ok()]), m2 = banco([ok(), { data: null, error: { message: 'falha' } }])
    await expect(consultarMissao(v2.client, m2.client, '2026-10-07', signal())).rejects.toThrow('metas de MQL')
    expect(m2.calls).toHaveLength(2)
  })
})

describe('Paginação completa dos leads de Acompanhamento Meta', () => {
  const contato = (i: number) => ({ id: `contato-${i}`, dia: '2026-11-26', marca: 'Eletrovias', email: null, telefone: null, dados_extras: { metric_grain: 'contact_only' } })
  const negocio = (i: number) => ({ ...contato(i), id: `negocio-${i}`, dados_extras: {
    metric_grain: 'crm_deal', origem_leitura: 'previa_mensal_ouro', conta_id: 'wescale_principal_crm', id_deal: `deal-${i}`, fonte_macro: i % 2 ? 'Inbound' : 'Outbound',
  } })
  function paginas(rows: unknown[], contar = true) {
    return Array.from({ length: Math.floor(rows.length / 500) + 1 }, (_, i) => ({
      ...ok(rows.slice(i * 500, i * 500 + 500)), ...(contar ? { count: rows.length } : {}),
    }))
  }
  async function consultar(rows: unknown[], contar = true) {
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), ...paginas(rows, contar)])
    const dados = await consultarMissao(v.client, m.client, '2026-11-26', signal())
    return { dados, calls: m.calls.filter(c => c.table === 'leads') }
  }
  it('lê 4.728 registros em dez páginas sem transformar contatos em MQLs nem mudar Inbound', async () => {
    const rows = [...Array.from({ length: 3574 }, (_, i) => contato(i)), ...Array.from({ length: 1154 }, (_, i) => negocio(i))]
    const { dados, calls } = await consultar(rows)
    expect(dados.leads).toEqual(rows)
    expect(calls).toHaveLength(10)
    expect(calls.at(-1)?.filtros).toContainEqual(['range', [4500, 4999]])
    expect(captacaoMissao(dados, 'Eletrovias').mql).toBe(1154)
    expect(dados.inbound?.Eletrovias).toEqual({ inbound: 577, semOrigem: 0 })
  })
  it.each([0, 500, 4000, 50_000])('aceita exatamente %i registros com término confirmado, mesmo sem count', async length => {
    const rows = Array.from({ length }, (_, i) => contato(i))
    const { dados, calls } = await consultar(rows, false)
    expect(dados.leads).toHaveLength(length)
    expect(calls).toHaveLength(length / 500 + 1)
    if (length === 50_000) expect(calls.at(-1)?.filtros).toContainEqual(['range', [50_000, 50_000]])
  })
  it('usa a contagem completa para encerrar em uma página cheia sem solicitar outra', async () => {
    const { calls } = await consultar(Array.from({ length: 4000 }, (_, i) => contato(i)))
    expect(calls).toHaveLength(8)
    expect(calls[0].filtros).toContainEqual(['select', ['id,dia,marca,email,telefone,dados_extras', { count: 'exact' }]])
  })
  it('pagina pelo cliente Supabase e adaptador mensal reais, com Content-Range e sem refazer a leitura da ouro', async () => {
    const rows = Array.from({ length: 4728 }, (_, i) => negocio(i))
    let leiturasLeads = 0
    const adapter = createEletroviasOuroFetch({
      origin: 'https://marketing.example', route: () => '/okrs', token: async () => 'sessao-teste',
      marketingScope: { mensal: true, brands: marcasMensais, endpoint: '/api/marketing-mensal-ouro/v1/read', contract: 'marketing_mensal_v1', includes: linhaMensal },
      fetch: async (_input, init) => {
        const { dataset } = JSON.parse(String(init?.body))
        if (dataset === 'leads') leiturasLeads++
        return Response.json({ mode: 'ouro', contract: 'marketing_mensal_v1', rows: dataset === 'leads' ? rows : [], observed_at: null, warnings: [] })
      },
      referenceFetch: async () => Response.json([]),
    })
    const m = createClient('https://marketing.example', 'chave-publica-teste', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: adapter },
    })
    const v = banco([ok(), ok(), ok()])
    const dados = await consultarMissao(v.client, m, '2026-11-26', signal())
    expect(dados.leads).toHaveLength(rows.length)
    expect(new Set(dados.leads?.map(r => r.id)).size).toBe(rows.length)
    expect(leiturasLeads).toBe(1)
    expect(captacaoMissao(dados, 'Eletrovias').mql).toBe(rows.length)
  })
  it('recusa uma 50.001ª linha quando a origem não informa contagem', async () => {
    const v = banco([ok(), ok(), ok()]), rows = Array.from({ length: 50_001 }, (_, i) => contato(i))
    const m = banco([ok(), ok(), ...paginas(rows, false)])
    await expect(consultarMissao(v.client, m.client, '2026-11-26', signal())).rejects.toThrow('Limite de leitura de leads')
  })
  it.each(['repetida', 'truncada', 'contagem alterada', 'falha'])('recusa página %s sem calcular total parcial', async problema => {
    const primeira = Array.from({ length: 500 }, (_, i) => contato(i))
    const segunda = problema === 'falha' ? { data: null, error: { message: 'falha' } }
      : problema === 'repetida' ? { ...ok([primeira[0]]), count: 501 }
        : problema === 'truncada' ? { ...ok(), count: 501 }
          : { ...ok([contato(500)]), count: 502 }
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), { ...ok(primeira), count: 501 }, segunda])
    await expect(consultarMissao(v.client, m.client, '2026-11-26', signal())).rejects.toThrow(problema === 'falha' ? 'consultar leads' : 'leitura de leads ficou incompleta')
    expect(v.calls).toHaveLength(3)
  })
  it('preserva o recorte e os MQLs de outubro', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...negocio(i), dia: '2026-10-31', dados_extras: {
      ...negocio(i).dados_extras, origem_leitura: 'ouro_outubro_2026',
    } }))
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), ...paginas(rows)])
    const dados = await consultarMissao(v.client, m.client, '2026-10-31', signal())
    expect(dados.leads).toEqual(rows)
    for (const call of m.calls.filter(c => c.table === 'leads')) {
      expect(call.filtros).toContainEqual(['gte', ['dia', '2026-10-01']])
      expect(call.filtros).toContainEqual(['lte', ['dia', '2026-10-31']])
    }
    expect(captacaoMissao(dados, 'Eletrovias').mql).toBe(501)
  })
})
