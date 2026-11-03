import { useMemo } from 'react'
import { baseVendas, porOrigem } from '@/lib/aoVivo/basesVendas'
import { useBaseAoVivo } from './useBaseAoVivo'
import type { FunnelRow, OrigemComercial } from '@/lib/funnelTypes'

/**
 * Base do funil de Vendas: as linhas de `vw_funil_vendas` (Supabase de
 * Expansão), agora pela base ao vivo (`src/lib/aoVivo`). Abre na hora com o
 * que já está na memória ou no navegador e recebe sozinha o que mudar no
 * banco — ver docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql.
 *
 * Traz as linhas SEM filtro de data e deixa o recorte por período para a
 * camada `metrics.ts`. Isso é de propósito: o hook antigo filtrava no servidor
 * com um `.or()` sobre cinco colunas de data, e qualquer etapa fora dessa lista
 * sumia do funil. Além disso o modo safra precisa de deals cujo MQL está na
 * janela mas cuja etapa aconteceu fora dela — impossível num filtro só.
 *
 * São ~9,3 mil linhas (nov/26: 7,7 mil Inbound + 1,6 mil Prospecção Ativa);
 * a view já exclui deals de teste, status Excluído e funis fora do escopo
 * comercial. A base traz as duas origens e o recorte por `origem` é feito
 * aqui (trocar o toggle é instantâneo). Marca também é filtrada no cliente,
 * pelas páginas: filtrar 1 marca no servidor colapsava a lista de "marcas com
 * dado" e fazia marcas sumirem/reaparecerem conforme a seleção.
 */

export interface UseFunilVendasResult {
  /** Compartilhado entre componentes: NÃO mutar o array nem as linhas. */
  data: FunnelRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

const recarregar = () => void baseVendas.sincronizar()

export function useFunilVendas(origem: OrigemComercial): UseFunilVendasResult {
  const { linhas, carregando, erro } = useBaseAoVivo(baseVendas)
  const data = useMemo(() => porOrigem(linhas, origem), [linhas, origem])
  return { data, loading: carregando, error: erro, reload: recarregar }
}
