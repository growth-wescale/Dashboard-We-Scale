// Formatadores compartilhados (pt-BR, tabular-nums).
// Fonte única de verdade — migrando de v2/format.ts pra src/lib/ e substituindo definições locais em cada página.

/** Número inteiro formatado em pt-BR ("1.234"). */
export function nf(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

/** Número inteiro arredondado pra CIMA, formatado em pt-BR ("1.235").
 *  Usado em metas fracionárias (rateio entre pessoas dá número quebrado) pra
 *  nunca aparecer vírgula na tela — e pra não subestimar um alvo. */
export function nfCeil(n: number): string {
  return Math.ceil(n).toLocaleString('pt-BR')
}

/** Número compacto — 1.234 → "1,2k"; 1.234.567 → "1,2M". */
export function nfK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
  return Math.round(n).toString()
}

/** Reais com separador ("R$ 1.234"). */
export function money(n: number): string {
  return 'R$ ' + nf(n)
}

/** Reais compacto (>=1000 vira "R$ 1,2 mil", >=1M vira "R$ 1,2M"). */
export function moneyK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M'
  if (Math.abs(n) >= 1_000)     return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  return money(n)
}

/** Percentual ("12,3%"). Padrão 1 decimal. */
export function pct(n: number, decimals = 1): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + '%'
}

/** Alias de moneyK — nome usado por várias páginas ("R$ 1,89M" / "R$ 543,3 mil"). */
export const moneyBig = moneyK
