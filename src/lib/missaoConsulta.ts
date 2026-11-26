import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarInbound } from './mqlInbound'
import type { Lead } from './types'
import { FRENTES_MISSAO, MARCAS_META_PERIODO_MISSAO, MESES_MISSAO, proximoDia, type DadosMissao, type VendaMissaoRow, type MetaMissaoRow, type EtapaMissaoRow, type MidiaMissaoRow } from './missaoMetas'

// Proteções locais: nunca baixar toda a base nem repetir consulta em caso de erro.
export const LIMITES_MISSAO = { vendas: 500, metas: 200, etapas: 500, paginaMidia: 500, paginasMidia: 8, paginaLeads: 500, leads: 50_000 } as const
type Resposta = { data: unknown[] | null; error: { message: string } | null }
function ler<T>(res: Resposta, nome: string, limite: number): T[] {
  if (res.error) throw new Error(`Não foi possível consultar ${nome}. Tente novamente mais tarde.`)
  if (!res.data) throw new Error(`Resposta vazia ao consultar ${nome}.`)
  if (res.data.length > limite) throw new Error(`Limite de leitura de ${nome} atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.`)
  return res.data as T[]
}

async function lerLeadsMissao(db: SupabaseClient, marcas: string[], mes: string, hoje: string, signal: AbortSignal) {
  const leads: Lead[] = []
  const ids = new Set<string>()
  let total: number | undefined
  const incompleta = () => new Error('A leitura de leads ficou incompleta ou mudou durante a consulta. Nenhum total parcial será exibido; atualize os dados para tentar novamente.')
  const excedido = () => new Error('Limite de leitura de leads atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.')
  // Mesmo teto do contrato mensal. Sem contagem informada, a linha adicional
  // distingue exatamente 50 mil registros de uma resposta truncada nesse teto.
  while (leads.length <= LIMITES_MISSAO.leads) {
    signal.throwIfAborted()
    const de = leads.length
    const tamanho = Math.min(LIMITES_MISSAO.paginaLeads, LIMITES_MISSAO.leads + 1 - de)
    const resposta = await db.from('leads')
      .select('id,dia,marca,email,telefone,dados_extras', { count: 'exact' }).in('marca', marcas).gte('dia', mes).lte('dia', hoje)
      .order('dia', { ascending: false }).order('id', { ascending: true })
      .range(de, de + tamanho - 1).abortSignal(signal)
    signal.throwIfAborted()
    const lote = ler<Lead>(resposta, 'leads do mês', tamanho)
    if (resposta.count != null) {
      if (!Number.isSafeInteger(resposta.count) || resposta.count < 0) throw incompleta()
      if (resposta.count > LIMITES_MISSAO.leads) throw excedido()
      if (total !== undefined && total !== resposta.count) throw incompleta()
      total = resposta.count
    }
    for (const row of lote) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw incompleta()
      ids.add(row.id)
      leads.push(row)
    }
    if (leads.length > LIMITES_MISSAO.leads) throw excedido()
    if (total !== undefined && leads.length > total) throw incompleta()
    if (lote.length < tamanho || leads.length === total) {
      if (total !== undefined && leads.length !== total) throw incompleta()
      return leads
    }
  }
  throw excedido()
}

/** Uma requisição por vez. Nome do Closer somente nas metas, para paridade com Vendas; sem contatos ou SELECT *. */
export async function consultarMissao(vendasDb: SupabaseClient, marketingDb: SupabaseClient, hoje: string, signal: AbortSignal): Promise<DadosMissao> {
  const marcas = FRENTES_MISSAO.map(m => m.marca)
  const mes = hoje.slice(0, 7) + '-01'
  const ate = `${proximoDia(hoje < '2026-12-31' ? hoje : '2026-12-31')}T00:00:00-03:00`
  signal.throwIfAborted()
  const vendas = hoje < '2026-01-01' ? [] : ler<VendaMissaoRow>(await vendasDb.from('vw_funil_vendas')
    .select('id_lead,ciclo,marca,status_atual,valor_contrato,quantidade_unidades,data_venda')
    .eq('status_atual', 'Ganho').gte('data_venda', '2026-01-01T00:00:00-03:00').lt('data_venda', ate)
    .limit(LIMITES_MISSAO.vendas + 1).abortSignal(signal), 'vendas de 2026', LIMITES_MISSAO.vendas)
  signal.throwIfAborted()
  const metas = ler<MetaMissaoRow>(await vendasDb.from('DB_Metas_Performance')
    .select('mes_referencia,marca,funcao,nome_colaborador,meta_financeira,meta_qtd_vendas,meta_sql,meta_volume_sal')
    .in('mes_referencia', [...MESES_MISSAO]).in('marca', [...MARCAS_META_PERIODO_MISSAO]).in('funcao', ['SDR', 'Closer'])
    .limit(LIMITES_MISSAO.metas + 1).abortSignal(signal), 'metas cadastradas', LIMITES_MISSAO.metas)
  // Fora da missão, não apresentar o realizado de outro mês contra metas de 2026.
  if (!MESES_MISSAO.some(m => m === mes)) {
    return { hoje, atualizadoEm: new Date().toISOString(), vendas, metas, etapas: [], midia: [] }
  }
  signal.throwIfAborted()
  const inicioMes = `${mes}T00:00:00-03:00`, fimMes = `${proximoDia(hoje)}T00:00:00-03:00`
  const etapas = ler<EtapaMissaoRow>(await vendasDb.from('vw_funil_vendas')
    .select('id_lead,ciclo,marca,status_atual,data_agendamento_reuniao_sql,data_sal')
    .in('marca', marcas)
    .or(`and(data_agendamento_reuniao_sql.gte.${inicioMes},data_agendamento_reuniao_sql.lt.${fimMes}),and(data_sal.gte.${inicioMes},data_sal.lt.${fimMes})`)
    .limit(LIMITES_MISSAO.etapas + 1).abortSignal(signal), 'SQL e SAL do mês', LIMITES_MISSAO.etapas)
  const midia: MidiaMissaoRow[] = []
  for (let page = 0; page < LIMITES_MISSAO.paginasMidia; page++) {
    signal.throwIfAborted()
    const from = page * LIMITES_MISSAO.paginaMidia
    const lote = ler<MidiaMissaoRow>(await marketingDb.from('media_daily_raw')
      .select('id,dia,marca,canal,spend_brl').in('marca', marcas).gte('dia', mes).lte('dia', hoje)
      .order('dia', { ascending: true }).order('id', { ascending: true })
      .range(from, from + LIMITES_MISSAO.paginaMidia - 1).abortSignal(signal), 'mídia do mês', LIMITES_MISSAO.paginaMidia)
    midia.push(...lote)
    if (lote.length < LIMITES_MISSAO.paginaMidia) {
      const metasMql = ler<{ marca: string; valor_meta: number }>(await marketingDb.from('metas')
        .select('marca,valor_meta').in('marca', marcas).eq('mes', mes).eq('metrica', 'mql')
        .limit(LIMITES_MISSAO.metas + 1).abortSignal(signal), 'metas de MQL do mês', LIMITES_MISSAO.metas)
      const leads = await lerLeadsMissao(marketingDb, marcas, mes, hoje, signal)
      const inbound = await consultarInbound(vendasDb, leads, marcas, signal)
      return { hoje, atualizadoEm: new Date().toISOString(), vendas, metas, etapas, midia, metasMql, leads, inbound }
    }
  }
  throw new Error('Limite de leitura da mídia atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.')
}
