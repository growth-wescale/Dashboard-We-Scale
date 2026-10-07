import { criarCacheFiltrado } from './consultaFiltrada'

export const MISSAO_TTL = 15 * 60_000
export const MISSAO_INTERVALO = 60_000
export const MISSAO_TIMEOUT = 20_000
export type LeituraMissao<T> = { data: T | null; error: string | null }

/** Cache exclusivo desta tela. Erros também são reutilizados, sem retry automático. */
export function criarCacheMissao<T>() {
  const cache = criarCacheFiltrado(MISSAO_TTL, MISSAO_TIMEOUT, 2)
  const tentativas = new Map<string, number>()
  return {
    clear() { cache.clear(); tentativas.clear() },
    acquire(key: string, fetch: (signal: AbortSignal) => Promise<T>, force = false) {
      const ultima = tentativas.get(key)
      const podeAtualizar = ultima === undefined || Date.now() - ultima >= MISSAO_INTERVALO
      return cache.acquire<LeituraMissao<T>>(key, async signal => {
        const anterior = tentativas.get(key)
        if (anterior !== undefined && Date.now() - anterior < MISSAO_INTERVALO) {
          return { data: null, error: 'Aguarde um minuto entre tentativas de atualização.' }
        }
        tentativas.set(key, Date.now())
        // No máximo a data atual/anterior da sessão; não acumular chaves indefinidamente.
        for (const [k, at] of tentativas) if (k !== key && Date.now() - at >= MISSAO_TTL) tentativas.delete(k)
        try { return { data: await fetch(signal), error: null } }
        catch (error) {
          signal.throwIfAborted()
          return { data: null, error: error instanceof Error ? error.message : 'Não foi possível completar a leitura.' }
        }
      }, force && podeAtualizar)
    },
  }
}
