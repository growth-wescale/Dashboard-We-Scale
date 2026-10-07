import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from './types'
import { FRENTES_MISSAO, MESES_MISSAO, proximoDia, type DadosMissao, type VendaMissaoRow, type MetaMissaoRow, type EtapaMissaoRow, type MidiaMissaoRow } from './missaoMetas'

// Proteções locais: nunca baixar toda a base nem repetir consulta em caso de erro.
export const LIMITES_MISSAO = { vendas: 500, metas: 200, etapas: 500, paginaMidia: 500, paginasMidia: 8, paginasLeads: 8 } as const
type Resposta = { data: unknown[] | null; error: { message: string } | null }
function ler<T>(res: Resposta, nome: string, limite: number): T[] {
  if (res.error) throw new Error(`Não foi possível consultar ${nome}. Tente novamente mais tarde.`)
  if (!res.data) throw new Error(`Resposta vazia ao consultar ${nome}.`)
  if (res.data.length > limite) throw new Error(`Limite de leitura de ${nome} atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.`)
  return res.data as T[]
}

/** Uma requisição por vez. Sem eventos históricos, nomes, contatos, count ou SELECT *. */
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
    .select('mes_referencia,marca,funcao,meta_financeira,meta_qtd_vendas,meta_sql,meta_volume_sal')
    .in('mes_referencia', [...MESES_MISSAO]).in('marca', marcas).in('funcao', ['SDR', 'Closer'])
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
      const leads: Lead[] = []
      for (let pagina = 0; pagina < LIMITES_MISSAO.paginasLeads; pagina++) {
        signal.throwIfAborted()
        const de = pagina * 500
        const loteLeads = ler<Lead>(await marketingDb.from('leads')
          .select('id,dia,marca,email,telefone,dados_extras').in('marca', marcas).gte('dia', mes).lte('dia', hoje)
          .order('dia', { ascending: false }).order('id', { ascending: true })
          .range(de, de + 499).abortSignal(signal), 'leads do mês', 500)
        leads.push(...loteLeads)
        if (loteLeads.length < 500) return { hoje, atualizadoEm: new Date().toISOString(), vendas, metas, etapas, midia, metasMql, leads }
      }
      throw new Error('Limite de leitura de leads atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.')
    }
  }
  throw new Error('Limite de leitura da mídia atingido. Nenhum total parcial será exibido; solicite uma revisão da consulta.')
}
