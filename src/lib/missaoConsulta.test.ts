import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarMissao } from './missaoConsulta'

function banco(resultados: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
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
    expect(JSON.stringify(v.calls[2])).toContain('data_sal.gte.2026-10-01T00:00:00-03:00')
    expect(JSON.stringify(v.calls)).not.toMatch(/\*|vw_funil_etapas|nome|telefone|email/)
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
  it('recusa leads truncados e erros novos sem exibir totais parciais', async () => {
    const v = banco([ok(), ok(), ok()]), m = banco([ok(), ok(), ...Array.from({ length: 8 }, () => ok(Array.from({ length: 500 }, () => ({}))))])
    await expect(consultarMissao(v.client, m.client, '2026-10-07', signal())).rejects.toThrow('Limite de leitura de leads')
    const v2 = banco([ok(), ok(), ok()]), m2 = banco([ok(), { data: null, error: { message: 'falha' } }])
    await expect(consultarMissao(v2.client, m2.client, '2026-10-07', signal())).rejects.toThrow('metas de MQL')
    expect(m2.calls).toHaveLength(2)
  })
})
