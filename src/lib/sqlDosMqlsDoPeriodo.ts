import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { toLocalDate } from './dateUtils'
import { chaveContato, isLeadMql, isMarketingDeal } from './leadUtils'
import type { Lead } from './types'

type Sql = Pick<VwMarketingFunil, 'marca' | 'id_lead' | 'data_sql' | 'ciclo'>
type Passagem = { dia: string; instante: number | null; ciclo?: number }

function instante(value: unknown) {
  if (typeof value !== 'string' || !value.includes('T')) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function chaveGrupo(row: Lead) {
  const contato = !isMarketingDeal(row) && chaveContato(row)
  return contato ? JSON.stringify([row.marca, contato]) : null
}

// mqls e sqls são as mesmas populações dos dois cards, após os filtros da tela.
export function sqlDosMqlsDoPeriodo(mqls: Lead[], leads: Lead[], sqls: Sql[], inicio: string, fim: string) {
  const passagens = new Map<string, Passagem[]>()
  for (const sql of sqls) {
    const dia = toLocalDate(sql.data_sql)
    if (!dia || dia < inicio || dia > fim) continue
    const key = JSON.stringify([sql.marca, sql.id_lead])
    const lista = passagens.get(key) ?? []
    lista.push({ dia, instante: instante(sql.data_sql), ciclo: sql.ciclo })
    passagens.set(key, lista)
  }

  // O card de MQLs agrupa contatos históricos. Cada registro do grupo pode
  // trazer uma negociação diferente, mas o contato entra uma só vez no resultado.
  const contatos = new Map<string, Lead[]>()
  for (const row of leads) {
    const key = chaveGrupo(row)
    if (!key || !isLeadMql(row) || row.dia < inicio || row.dia > fim) continue
    const grupo = contatos.get(key) ?? []
    grupo.push(row)
    contatos.set(key, grupo)
  }

  let convertidos = 0
  let semVinculo = 0
  for (const mql of mqls) {
    if (mql.dia < inicio || mql.dia > fim) continue
    const key = chaveGrupo(mql)
    const candidatos = (key && contatos.get(key)) || [mql]
    let faltaVinculo = false
    const virouSql = candidatos.some(row => {
      const extra = row.dados_extras
      const direto = extra?.id_deal || extra?.crm_deal_id
      const ids = (direto ? [direto] : Array.isArray(extra?.crm_deal_ids) ? extra.crm_deal_ids : [])
        .filter((id): id is string => typeof id === 'string' && !!id.trim())
      if (!ids.length) faltaVinculo = true
      // Nas importações manuais, criado_em pode ser a data da importação.
      const criacao = isMarketingDeal(row) || extra?.ciclo_mql != null ? instante(row.criado_em) : null
      return ids.some(id => passagens.get(JSON.stringify([row.marca, id.trim()]))?.some(
        sql => sql.dia >= row.dia
          && (criacao === null || sql.instante === null || sql.instante >= criacao)
          && (extra?.ciclo_mql == null || sql.ciclo === extra.ciclo_mql),
      ))
    })
    if (virouSql) convertidos++
    else if (faltaVinculo) semVinculo++
  }
  return { convertidos, semVinculo }
}
