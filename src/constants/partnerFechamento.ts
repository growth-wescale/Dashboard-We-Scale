// Fechamentos informados por Gabriel em 27/10/2026. Não são totais mensais.
// Fonte: https://claude.ai/artifact/9fUjSYbkM5ryWqtzyW5y73 (texto fornecido no chat).
export const PARTNER_FECHAMENTOS = [
  {
    start: '2026-05-01', end: '2026-08-12', label: '01/05 a 12/08',
    invest: 35748.98, leads: 107, mql: 49, cpMql: 729.57, vendas: 15, receita: 27550,
    nota: 'Conta We Scale Holding, sem IDA e LISO Evento; inclui Google, testes e carrosséis.',
  },
  {
    start: '2026-08-15', end: '2026-10-19', label: '15/08 a 19/10',
    invest: 21133.85, leads: 98, mql: 51, cpMql: 414.39, vendas: 6, receita: 13718,
    nota: 'Conta We Scale Holding, sem IDA e LISO Evento; Google não incluído e vendas ainda em maturação no fechamento.',
  },
] as const

export const PARTNER_FECHAMENTO_ATUAL = PARTNER_FECHAMENTOS[1]

/** Não atribuir agregados do fechamento a meses, fontes ou intervalos distintos. */
export function getPartnerFechamento(start: string, end: string, fonte: string) {
  if (fonte !== '__all__') return null
  return PARTNER_FECHAMENTOS.find(p => p.start === start && p.end === end) ?? null
}
