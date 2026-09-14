import { useCallback, useSyncExternalStore } from 'react'

/**
 * Breakpoints do layout — os mesmos valores de `src/styles/responsive.css`.
 * Use CSS (classes `rs-*`) sempre que der; o hook é pra quando a ESTRUTURA muda
 * (menu vira gaveta, barra de filtros vira painel), não só o tamanho.
 */
export const MQ_CELULAR = '(max-width: 640px)'
/** Celular + tablet em pé: sem espaço pro menu lateral fixo nem pra barra de filtros aberta. */
export const MQ_COMPACTO = '(max-width: 1023px)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
