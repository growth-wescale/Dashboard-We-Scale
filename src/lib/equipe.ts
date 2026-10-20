import type { MembroRoster } from '@/hooks/useRosterVendas'

/** Chave de comparação de nome de pessoa: sem acento, sem caixa, sem espaço nas pontas. */
export function chavePessoa(nome: string | null | undefined): string {
  return (nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Quem saiu do time (`nome_cargo_foto.ativo = false`). O nome dessas pessoas
 * não aparece nas visões por pessoa (tabelas, gráficos, opções de filtro): os
 * números delas entram juntos numa linha `EX_INTEGRANTES`, então a soma não
 * muda. O nome continua na lista de negócios dos pop-ups. Nome que não está no
 * cadastro não entra aqui.
 */
export function nomesInativos(roster: readonly MembroRoster[]): ReadonlySet<string> {
  return new Set(roster.filter(r => !r.ativo).map(r => chavePessoa(r.nome)))
}

export function saiuDoTime(nome: string | null | undefined, inativos?: ReadonlySet<string>): boolean {
  return !!inativos?.size && inativos.has(chavePessoa(nome))
}

/** Linha única com os números de quem saiu do time, sem nome nem posição no ranking. */
export const EX_INTEGRANTES = 'Ex-integrantes'

/** Nome numa visão por pessoa: quem saiu do time vira `EX_INTEGRANTES`. */
export function nomeNaVisao(nome: string, inativos?: ReadonlySet<string>): string {
  return saiuDoTime(nome, inativos) ? EX_INTEGRANTES : nome
}
