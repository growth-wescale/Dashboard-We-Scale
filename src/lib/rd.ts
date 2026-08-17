/** URL da negociação no RD Station CRM a partir do id_deal (== id_lead em vw_funil_vendas). */
export function rdDealUrl(idDeal: string): string {
  return `https://crm.rdstation.com/app/deals/${idDeal}`
}
