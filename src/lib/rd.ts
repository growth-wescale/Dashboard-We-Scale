/** URL da negociação no RD Station CRM a partir do id_deal (== id_lead em vw_funil_vendas). */
export function rdDealUrl(idDeal: string): string {
  return `https://crm.rdstation.com/app/deals/${idDeal}`
}

/** Id de deal do RD: 24 caracteres hexadecimais. Também é a única forma aceita numa query por id. */
export const ID_DEAL_RE = /^[0-9a-f]{24}$/

/** Extrai um id de deal de um id cru ou de uma URL do RD; null se o texto não é isso (ex.: nome de deal). */
export function parseIdDeal(texto: string): string | null {
  const t = texto.trim().toLowerCase()
  if (ID_DEAL_RE.test(t)) return t
  const m = t.match(/\/deals\/([0-9a-f]{24})(?:[/?#]|$)/)
  return m ? m[1] : null
}
