// Formatadores compartilhados dos primitivos V2 (pt-BR, tabular).
export const fmt = (n: number): string => Math.round(n).toLocaleString('pt-BR')

export const fmtK = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
  return Math.round(n).toString()
}

export const money = (n: number): string => 'R$ ' + fmt(n)

export const moneyK = (n: number): string => {
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  return money(n)
}

export const pct = (n: number, decimals = 1): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%'
