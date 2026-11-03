/**
 * Bases "ao vivo" das abas de Vendas — a parte pura (sem rede, sem React).
 *
 * O banco mantém cópias prontas de `vw_funil_vendas` e `vw_funil_etapas_v2`
 * (`dash_vendas`, `dash_etapas`, ver
 * docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql). Cada linha guarda a
 * versão em que mudou pela última vez. O navegador baixa a base inteira uma vez
 * (`dash_base`) e depois só o que mudou desde a versão que tem
 * (`dash_mudancas`). Este módulo monta os objetos e aplica as mudanças.
 *
 * As linhas chegam como arrays (posição → nome em `cols`) e viram os mesmos
 * objetos que o PostgREST devolvia das views, com os mesmos valores.
 */

export interface PacoteBase {
  base: string
  epoca: number
  versao: number
  /** Nome de cada posição dos arrays de `linhas`. */
  cols: string[]
  linhas: unknown[][]
  /** Última vez que alguma linha mudou no banco (ISO). */
  atualizado_em?: string | null
}

export interface PacoteMudancas {
  base: string
  epoca: number
  versao: number
  /** O banco não garante a conta a partir da versão pedida: baixar a base inteira. */
  reset: boolean
  cols?: string[]
  linhas?: unknown[][]
  /** Chaves que saíram da view: `[id_lead, ciclo]` em vendas, `id_evento` em etapas. */
  removidos?: unknown[]
  atualizado_em?: string | null
}

export interface DefinicaoBase<T> {
  /** Nome da base no banco (`p_base` das RPCs). */
  nome: string
  /** Colunas que o dashboard usa; a resposta do banco tem que trazer todas. */
  colunas: readonly string[]
  chave: (linha: T) => string
  /** Chave de um item de `removidos`. */
  chaveRemovido: (item: unknown) => string
  /** Ordem da lista entregue às páginas (a mesma que a consulta às views usava). */
  comparar: (a: T, b: T) => number
  /** Ajuste por linha depois de montar o objeto (ex.: alias de marca). */
  ajustar?: (linha: T) => void
}

export interface Colecao<T> {
  epoca: number
  versao: number
  porChave: ReadonlyMap<string, T>
  /** Ordenada por `comparar`. Nunca é mutada: mudança gera lista nova. */
  linhas: readonly T[]
  atualizadoEm: string | null
}

export function montarLinhas<T>(def: DefinicaoBase<T>, cols: readonly string[], linhas: readonly unknown[][]): T[] {
  const faltando = def.colunas.filter(c => !cols.includes(c))
  if (faltando.length) throw new Error(`Base "${def.nome}" veio sem as colunas: ${faltando.join(', ')}`)
  const out = new Array<T>(linhas.length)
  for (let i = 0; i < linhas.length; i++) {
    const valores = linhas[i]
    const obj: Record<string, unknown> = {}
    for (let j = 0; j < cols.length; j++) obj[cols[j]] = valores[j] ?? null
    const linha = obj as T
    def.ajustar?.(linha)
    out[i] = linha
  }
  return out
}

function ordenar<T>(def: DefinicaoBase<T>, linhas: T[]): T[] {
  return linhas.sort(def.comparar)
}

export function colecaoDaBase<T>(def: DefinicaoBase<T>, pacote: PacoteBase): Colecao<T> {
  const porChave = new Map<string, T>()
  for (const linha of montarLinhas(def, pacote.cols, pacote.linhas)) porChave.set(def.chave(linha), linha)
  return {
    epoca: pacote.epoca,
    versao: pacote.versao,
    porChave,
    linhas: ordenar(def, [...porChave.values()]),
    atualizadoEm: pacote.atualizado_em ?? null,
  }
}

/**
 * Aplica um pacote de `dash_mudancas`. Devolve a coleção nova, a MESMA
 * coleção (nada mudou) ou `'reset'` (baixar a base inteira). Nunca muta
 * `atual`: quem tem a lista antiga em mãos continua com ela intacta.
 */
export function aplicarMudancas<T>(def: DefinicaoBase<T>, atual: Colecao<T>, pacote: PacoteMudancas): Colecao<T> | 'reset' {
  if (pacote.reset || pacote.epoca !== atual.epoca) return 'reset'
  const atualizadoEm = pacote.atualizado_em ?? atual.atualizadoEm
  const novas = pacote.linhas?.length ? montarLinhas(def, pacote.cols ?? [], pacote.linhas) : []
  const removidos = pacote.removidos ?? []

  if (!novas.length && !removidos.length) {
    if (pacote.versao === atual.versao && atualizadoEm === atual.atualizadoEm) return atual
    return { ...atual, versao: pacote.versao, atualizadoEm }
  }

  const porChave = new Map(atual.porChave)
  for (const linha of novas) porChave.set(def.chave(linha), linha)
  for (const item of removidos) porChave.delete(def.chaveRemovido(item))
  return {
    epoca: pacote.epoca,
    versao: pacote.versao,
    porChave,
    linhas: ordenar(def, [...porChave.values()]),
    atualizadoEm,
  }
}

/** Linhas de volta para arrays (formato compacto do armazenamento local). */
export function paraArrays<T>(colecao: Colecao<T>, cols: readonly string[]): unknown[][] {
  return colecao.linhas.map(linha => cols.map(c => (linha as Record<string, unknown>)[c] ?? null))
}

/* ── Comparadores ──────────────────────────────────────────────────────────
 * Reproduzem o ORDER BY que os hooks mandavam ao PostgREST. A ordem importa:
 * em "Deals únicos" o 1º evento de cada (deal, ciclo, mês) é o que fica, e a
 * data dele aparece nos popups.
 *
 * Postgres põe NULL primeiro no DESC e por último no ASC; aqui também.
 */

type Valor = string | number | boolean | null | undefined

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/**
 * Instantes saem do banco em UTC ("…+00:00") e aí a ordem do texto é a do
 * tempo (vale com e sem fração de segundo). Com outro fuso, compara o instante.
 */
function compararTexto(a: string, b: string): number {
  if (INSTANTE.test(a) && INSTANTE.test(b) && !(a.endsWith('+00:00') && b.endsWith('+00:00'))) {
    return Date.parse(a) - Date.parse(b)
  }
  return a < b ? -1 : a > b ? 1 : 0
}

function comparar(a: Valor, b: Valor): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return compararTexto(String(a), String(b))
}

export function asc(a: Valor, b: Valor): number {
  const na = a === null || a === undefined
  const nb = b === null || b === undefined
  if (na || nb) return na === nb ? 0 : na ? 1 : -1
  return comparar(a, b)
}

export function desc(a: Valor, b: Valor): number {
  const na = a === null || a === undefined
  const nb = b === null || b === undefined
  if (na || nb) return na === nb ? 0 : na ? -1 : 1
  return -comparar(a, b)
}
