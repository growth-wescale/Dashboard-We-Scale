import { useCallback, useSyncExternalStore } from 'react'
import { ESTADO_VAZIO, type BaseAoVivo, type EstadoBase } from '@/lib/aoVivo/baseAoVivo'
import { canalVendas } from '@/lib/aoVivo/basesVendas'
import type { StatusCanal } from '@/lib/aoVivo/canal'

const naoAssinar = () => () => {}
const obterVazio = () => ESTADO_VAZIO

/**
 * Liga um componente a uma base ao vivo. Montar já dispara a carga (memória →
 * armazenamento local → banco); com `ativo = false` não carrega nada.
 */
export function useBaseAoVivo<T>(base: BaseAoVivo<T>, ativo = true): EstadoBase<T> {
  const assinar = useCallback((ouvinte: () => void) => base.assinar(ouvinte), [base])
  return useSyncExternalStore(ativo ? assinar : naoAssinar, ativo ? base.obter : obterVazio) as EstadoBase<T>
}

/** Status do aviso ao vivo do banco (Realtime). */
export function useCanalAoVivo(): StatusCanal {
  return useSyncExternalStore(canalVendas.assinarStatus, canalVendas.status)
}
