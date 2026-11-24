/**
 * Gráficos "Por Marca" e "Por pessoa" (SDR, Closer ou responsável) no topo dos
 * pop-ups de deals que não têm a barra de filtros do pop-up do funil
 * (Análise de Perda, Receita/Fechamentos/Vendas por fonte, Repetidos).
 *
 * Mesmo comportamento do `StageDealsPanel`: clicar numa barra filtra a tabela
 * (clicar de novo tira), e cada gráfico segue o filtro do OUTRO (estilo Excel)
 * — marcar uma marca mostra no "Por pessoa" só os deals dela, e as outras
 * barras do "Por Marca" ficam esmaecidas, não somem.
 */

import { useMemo, useState } from 'react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { useEquipeAtiva } from '@/hooks/useRosterVendas'
import { nomeNaVisao } from '@/lib/equipe'
import { breakdownPorCategoria, type BarRow } from './dealDrawerShared'

export interface FiltroGraficos { marca: string[]; pessoa: string[] }
export const FILTRO_GRAFICOS_VAZIO: FiltroGraficos = { marca: [], pessoa: [] }

type Pick<T> = (item: T) => string | null

/** Filtra pelos valores marcados nos gráficos. `ignorar` deixa um campo de fora
 *  (o gráfico daquele campo conta sem o próprio filtro). */
export function filtrarPorGraficos<T>(
  itens: T[], filtro: FiltroGraficos, marcaDe: Pick<T>, pessoaDe: Pick<T>, ignorar?: keyof FiltroGraficos,
): T[] {
  const porMarca = ignorar !== 'marca' && filtro.marca.length > 0
  const porPessoa = ignorar !== 'pessoa' && filtro.pessoa.length > 0
  if (!porMarca && !porPessoa) return itens
  return itens.filter(it =>
    (!porMarca || filtro.marca.includes(marcaDe(it)?.trim() ?? '')) &&
    (!porPessoa || filtro.pessoa.includes(pessoaDe(it)?.trim() ?? '')))
}

export interface GraficosMarcaPessoa<T> {
  filtrados: T[]
  porMarca: BarRow[]
  porPessoa: BarRow[]
  totalMarca: number
  totalPessoa: number
  filtro: FiltroGraficos
  alternar: (campo: keyof FiltroGraficos, valores: string[]) => void
  limpar: () => void
}

/**
 * `chave` zera o filtro quando muda — passe algo que identifique o recorte
 * aberto (ex.: título + subtítulo, ou '' com o pop-up fechado). Assim reabrir
 * o pop-up com outra lista não herda o clique da anterior.
 */
export function useGraficosMarcaPessoa<T>(
  itens: T[], marcaDe: Pick<T>, pessoaDe: Pick<T>, accent: string, chave: string,
): GraficosMarcaPessoa<T> {
  const [filtro, setFiltro] = useState<FiltroGraficos>(FILTRO_GRAFICOS_VAZIO)
  const [chaveAnterior, setChaveAnterior] = useState(chave)
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave)
    setFiltro(FILTRO_GRAFICOS_VAZIO)
  }
  const equipe = useEquipeAtiva()

  const semFiltroMarca = useMemo(() => filtrarPorGraficos(itens, filtro, marcaDe, pessoaDe, 'marca'), [itens, filtro, marcaDe, pessoaDe])
  const semFiltroPessoa = useMemo(() => filtrarPorGraficos(itens, filtro, marcaDe, pessoaDe, 'pessoa'), [itens, filtro, marcaDe, pessoaDe])
  const filtrados = useMemo(() => filtrarPorGraficos(itens, filtro, marcaDe, pessoaDe), [itens, filtro, marcaDe, pessoaDe])

  const porMarca = useMemo(
    () => breakdownPorCategoria(semFiltroMarca, marcaDe, m => BRAND_ACCENT[m] ?? 'var(--ws-border-strong)', marcaLabel),
    [semFiltroMarca, marcaDe],
  )
  // Quem saiu do time vira a barra "Ex-integrantes" (o nome fica na tabela).
  const porPessoa = useMemo(
    () => breakdownPorCategoria(semFiltroPessoa, pessoaDe, () => accent, nome => nomeNaVisao(nome, equipe)),
    [semFiltroPessoa, pessoaDe, accent, equipe],
  )

  const alternar = (campo: keyof FiltroGraficos, v: string[]) =>
    setFiltro(s => ({ ...s, [campo]: s[campo].length === v.length && v.every(x => s[campo].includes(x)) ? [] : v }))

  return {
    filtrados, porMarca, porPessoa,
    totalMarca: semFiltroMarca.length, totalPessoa: semFiltroPessoa.length,
    filtro, alternar, limpar: () => setFiltro(FILTRO_GRAFICOS_VAZIO),
  }
}
