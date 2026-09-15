/**
 * Paginação paralela sobre o PostgREST (limite de 1000 linhas por request).
 *
 * Antes cada hook buscava página por página, em série: 6 páginas × latência.
 * Com a rede oscilando, cada página levava 3–8 s e o funil demorava 10–30 s,
 * mesmo com o banco respondendo em ~300 ms. Aqui a 1ª página traz a contagem
 * total e as demais saem em paralelo (com limite de concorrência, pra não
 * despejar dezenas de queries simultâneas na instância).
 *
 * ATENÇÃO — a query tem que ter ORDEM TOTAL (desempate até não sobrar linha
 * empatada). OFFSET sobre ordem com empate devolve páginas que se sobrepõem:
 * com `order=dia` só, set/26 Inbound vinha com 81 eventos duplicados e 81
 * faltando, em série ou em paralelo.
 */

export interface PaginaBuscada<T> {
  rows: T[]
  error: string | null
  /** Total de linhas da consulta, quando pedido (`contar`). */
  total?: number | null
}

/** Busca as linhas `de`..`ate` (inclusivo, como o header Range). */
export type BuscarPagina<T> = (de: number, ate: number, contar: boolean) => Promise<PaginaBuscada<T>>

export interface OpcoesPaginacao {
  tamanhoPagina: number
  /** Máximo de requests simultâneos. */
  concorrencia: number
}

async function emParalelo<T>(indices: number[], limite: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(indices.length)
  let proximo = 0
  const trabalhador = async () => {
    while (proximo < indices.length) {
      const pos = proximo++
      out[pos] = await fn(indices[pos])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, indices.length) }, trabalhador))
  return out
}

export async function buscarTodasPaginas<T>(
  buscar: BuscarPagina<T>,
  { tamanhoPagina, concorrencia }: OpcoesPaginacao,
): Promise<{ rows: T[]; error: string | null }> {
  const pagina = (i: number, contar: boolean) =>
    buscar(i * tamanhoPagina, i * tamanhoPagina + tamanhoPagina - 1, contar)

  const primeira = await pagina(0, true)
  if (primeira.error) return { rows: [], error: primeira.error }

  const paginas: T[][] = [primeira.rows]
  if (primeira.rows.length < tamanhoPagina) return { rows: primeira.rows, error: null }

  // Com contagem: sabe exatamente quantas páginas faltam, e se a última ainda
  // vier cheia (total múltiplo de 1000, ou base cresceu) confere 1 página por
  // vez. Sem contagem: lotes do tamanho da concorrência até achar página
  // incompleta.
  const temTotal = typeof primeira.total === 'number'
  const passoExtra = temTotal ? 1 : concorrencia
  let proxima = 1
  let ate = temTotal ? Math.ceil((primeira.total as number) / tamanhoPagina) : 1 + concorrencia

  for (;;) {
    if (ate <= proxima) ate = proxima + passoExtra
    const indices = Array.from({ length: ate - proxima }, (_, k) => proxima + k)
    const lote = await emParalelo(indices, concorrencia, i => pagina(i, false))

    let acabou = false
    for (const p of lote) {
      if (p.error) return { rows: [], error: p.error }
      paginas.push(p.rows)
      if (p.rows.length < tamanhoPagina) acabou = true
    }
    if (acabou) break
    proxima = ate
  }

  return { rows: paginas.flat(), error: null }
}
