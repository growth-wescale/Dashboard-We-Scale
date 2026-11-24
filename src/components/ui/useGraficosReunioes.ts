/**
 * Estado dos gráficos do pop-up "Reuniões" (rosca Individual × LIVE, Por
 * Marca, Por Closer, Por SDR). Regras de contagem e filtro em
 * `@/lib/reunioesGraficos`; aqui só o estado do clique e as barras prontas.
 */

import { useMemo, useState } from 'react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { useEquipeAtiva } from '@/hooks/useRosterVendas'
import { nomeNaVisao } from '@/lib/equipe'
import type { Reuniao } from '@/lib/reunioesLive'
import {
  FILTRO_REUNIOES_VAZIO, TIPO_INDIVIDUAL, TIPO_LIVE, filtrarReunioesPorGraficos, paresPorDimensao,
  temFiltroReunioes, type DimReuniao, type FiltroReunioes,
} from '@/lib/reunioesGraficos'
import { breakdownPorCategoria, type BarRow } from './dealDrawerShared'

/** Cores da rosca (paleta categórica validada: CVD ΔE 24,7, contraste ≥ 3:1). */
export const COR_TIPO_REUNIAO: Record<string, string> = {
  [TIPO_INDIVIDUAL]: '#2a78d6',
  [TIPO_LIVE]: '#eb6834',
}

export interface FatiaRosca { valor: string; count: number; cor: string }

export interface GraficosReunioes {
  filtradas: Reuniao[]
  rosca: FatiaRosca[]
  totalRosca: number
  porMarca: BarRow[]
  porCloser: BarRow[]
  porSdr: BarRow[]
  totalMarca: number
  totalCloser: number
  totalSdr: number
  filtro: FiltroReunioes
  temFiltro: boolean
  alternar: (dim: DimReuniao, valores: string[]) => void
  limpar: () => void
}

/** `chave` zera o filtro quando muda (outro recorte aberto, ou pop-up fechado). */
export function useGraficosReunioes(reunioes: Reuniao[], accent: string, chave: string): GraficosReunioes {
  const [filtro, setFiltro] = useState<FiltroReunioes>(FILTRO_REUNIOES_VAZIO)
  const [chaveAnterior, setChaveAnterior] = useState(chave)
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave)
    setFiltro(FILTRO_REUNIOES_VAZIO)
  }
  const equipe = useEquipeAtiva()

  return useMemo(() => {
    const sem = (dim: DimReuniao) => filtrarReunioesPorGraficos(reunioes, filtro, dim)
    const semTipo = sem('tipo'), semMarca = sem('marca'), semCloser = sem('closer'), semSdr = sem('sdr')

    const contTipo = new Map<string, number>()
    for (const p of paresPorDimensao(semTipo, 'tipo')) contTipo.set(p.valor, (contTipo.get(p.valor) ?? 0) + 1)
    const rosca = [TIPO_INDIVIDUAL, TIPO_LIVE].map(valor => ({ valor, count: contTipo.get(valor) ?? 0, cor: COR_TIPO_REUNIAO[valor] }))

    const pessoa = (nome: string) => nomeNaVisao(nome, equipe)
    return {
      filtradas: filtrarReunioesPorGraficos(reunioes, filtro),
      rosca,
      totalRosca: semTipo.length,
      porMarca: breakdownPorCategoria(paresPorDimensao(semMarca, 'marca'), p => p.valor,
        m => BRAND_ACCENT[m] ?? 'var(--ws-border-strong)', marcaLabel),
      // Quem saiu do time vira a barra "Ex-integrantes" (o nome fica na lista).
      porCloser: breakdownPorCategoria(paresPorDimensao(semCloser, 'closer'), p => p.valor, () => accent, pessoa),
      porSdr: breakdownPorCategoria(paresPorDimensao(semSdr, 'sdr'), p => p.valor, () => accent, pessoa),
      totalMarca: semMarca.length,
      totalCloser: semCloser.length,
      totalSdr: semSdr.length,
      filtro,
      temFiltro: temFiltroReunioes(filtro),
      alternar: (dim: DimReuniao, v: string[]) =>
        setFiltro(s => ({ ...s, [dim]: s[dim].length === v.length && v.every(x => s[dim].includes(x)) ? [] : v })),
      limpar: () => setFiltro(FILTRO_REUNIOES_VAZIO),
    }
  }, [reunioes, filtro, equipe, accent])
}
