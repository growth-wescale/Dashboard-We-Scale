import type { Lead } from './types'

export function negocioMensal(row: Pick<Lead, 'dados_extras'>) {
  return row.dados_extras?.origem_leitura === 'previa_mensal_ouro' && row.dados_extras.metric_grain === 'crm_deal'
}
