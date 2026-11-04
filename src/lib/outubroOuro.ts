export const marcasOuroOutubro = ['Inpot', 'B2Case', 'Viva'] as const

export function negocioOuroOutubro(row: { marca: unknown; dados_extras: Record<string, unknown> | null }) {
  return marcasOuroOutubro.some(marca => marca === row.marca)
    && row.dados_extras?.origem_leitura === 'ouro_outubro_2026'
    && row.dados_extras?.metric_grain === 'crm_deal'
}

const campanhas = new Map<string, Set<string>>([
  ['B2Case:meta', new Set(['B2CASE_FUNDO_CONVERSOES_FRIO_SULSD_AON', 'B2CASE_FUNDO_CONVERSOES_FRIO_NACIONAL_AON', 'B2CASE_FUNDO_CONVERSOES_NACIONAL_AON'])],
  ['Inpot:meta', new Set(['INPOT_FUNDO_LEADS_AON', 'INPOT_FUNDO_LEADS_AON - ANTIGA', 'INPOT_FUNDO_REMARKETING_SULESUDESTE'])],
  ['Inpot:google', new Set(['02 - [Inpot] [Ongoing] [Leads] [Search] Cidades acima de 200k', '01 - [Inpot] [Ongoing] [Leads] [Search] Institucional'])],
  ['Viva:meta', new Set(['VIVA_FRIO_CONVERSOES_FORMSNATIVO_AON', 'VIVA_FRIO_CONVERSOES_SULSD_AON', 'VIVA_FRIO_CONVERSOES_FORMSOPERADOR_AON'])],
  ['Viva:google', new Set(['01 - [Viva Franquias] [Ongoing] [MQL] [Search] [Fundo Funil] Genéricos + Marca'])],
])

export function linhaOuroOutubro(row: Record<string, unknown>, table: string) {
  if (!marcasOuroOutubro.some(marca => marca === row.marca)) return false
  return table === 'leads' || (table === 'media_daily_raw' &&
    campanhas.get(`${row.marca}:${row.canal}`)?.has(String(row.campanha)) === true)
}
