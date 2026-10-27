// Fechamento fornecido por Gabriel em 27/10/2026. Snapshot editorial, sem consulta viva.
// Preservar os valores informados: faturamento arredondado não recompõe o ticket exato.
export const PARTNER_FECHAMENTO = {
  source: 'https://claude.ai/artifact/9fUjSYbkM5ryWqtzyW5y73',
  periods: [
    {
      label: '01/05 a 12/08', investment: 35748.98, activeDays: 98, calendarDays: 104,
      dailyInvestment: 364.79, leads: 107, mql: 49, sales: 15, people: 17,
      cpl: 334.10, cpmql: 729.57, cpv: 2383.27, cpp: 2102.88,
      revenue: 27550, ticket: 1836.67, roas: 0.77, revenuePerPerson: 1620.59,
      leadToMql: 45.8, mqlToSale: 30.6, leadToSale: 14.0,
      pace: { investment: 10312, leads: 30.9, mql: 14.1, sales: 4.3 },
    },
    {
      label: '15/08 a 19/10', investment: 21133.85, activeDays: 65, calendarDays: 66,
      dailyInvestment: 325.14, leads: 98, mql: 51, sales: 6, people: 11,
      cpl: 215.65, cpmql: 414.39, cpv: 3522.31, cpp: 1921.26,
      revenue: 13718, ticket: 2286.28, roas: 0.65, revenuePerPerson: 1247.06,
      leadToMql: 52.0, mqlToSale: 11.8, leadToSale: 6.1,
      pace: { investment: 9606, leads: 44.5, mql: 23.2, sales: 2.7 },
    },
  ],
  costs: [
    { key: 'cpl', label: 'CPL · custo por lead', change: '−35,5%', improved: true },
    { key: 'cpmql', label: 'CPMQL · custo por MQL', change: '−43,2%', improved: true },
    { key: 'cpv', label: 'CPV · custo por venda única', change: '+47,8%', improved: false },
    { key: 'cpp', label: 'CPP · custo por pessoa no geral', change: '−8,6%', improved: true },
  ],
} as const
