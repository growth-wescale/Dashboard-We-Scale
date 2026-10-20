import type { MembroRoster } from '@/hooks/useRosterVendas'

/** Chave de comparação de nome de pessoa: sem acento, sem caixa, sem espaço nas pontas. */
export function chavePessoa(nome: string | null | undefined): string {
  return (nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Quem saiu do time (`nome_cargo_foto.ativo = false`). Essas pessoas não viram
 * linha, barra nem opção de filtro nas visões por pessoa. As vendas e etapas
 * delas continuam nos totais do time e da marca, e o nome continua na lista de
 * negócios dos pop-ups. Nome que não está no cadastro não entra aqui.
 */
export function nomesInativos(roster: readonly MembroRoster[]): ReadonlySet<string> {
  return new Set(roster.filter(r => !r.ativo).map(r => chavePessoa(r.nome)))
}

export function saiuDoTime(nome: string | null | undefined, inativos?: ReadonlySet<string>): boolean {
  return !!inativos?.size && inativos.has(chavePessoa(nome))
}
