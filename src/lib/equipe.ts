import type { MembroRoster } from '@/hooks/useRosterVendas'

/** Chave de comparação de nome de pessoa: sem acento, sem caixa, sem espaço nas pontas. */
export function chavePessoa(nome: string | null | undefined): string {
  return (nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Quem é do time hoje: `nome_cargo_foto.ativo = true`. Quem não é (saiu, ou nem
 * está no cadastro) não aparece pelo nome nas visões por pessoa (tabelas,
 * gráficos, opções de filtro): os números entram juntos numa linha
 * `EX_INTEGRANTES`, então a soma não muda. O nome continua na tabela de negócios
 * dos pop-ups. Pessoa nova precisa entrar no cadastro pra aparecer pelo nome.
 */
export function equipeAtiva(roster: readonly MembroRoster[]): ReadonlySet<string> {
  return new Set(roster.filter(r => r.ativo).map(r => chavePessoa(r.nome)))
}

/** Fora do time = não está ativo no cadastro. Sem cadastro carregado, ninguém sai. */
export function saiuDoTime(nome: string | null | undefined, equipe?: ReadonlySet<string>): boolean {
  return !!equipe?.size && !!nome?.trim() && !equipe.has(chavePessoa(nome))
}

/** Linha única com os números de quem não é do time, sem nome nem posição no ranking. */
export const EX_INTEGRANTES = 'Ex-integrantes'

/** Dica da linha `EX_INTEGRANTES`. */
export const DICA_EX_INTEGRANTES = 'Soma de quem saiu do time ou não está no cadastro de pessoas'

/** Nome numa visão por pessoa: quem não é do time vira `EX_INTEGRANTES`. */
export function nomeNaVisao(nome: string, equipe?: ReadonlySet<string>): string {
  return saiuDoTime(nome, equipe) ? EX_INTEGRANTES : nome
}

/** Linha de soma dos negócios sem responsável nas tabelas por pessoa. */
export const SEM_RESPONSAVEL = { sdr: 'Sem SDR', closer: 'Sem Closer' } as const
