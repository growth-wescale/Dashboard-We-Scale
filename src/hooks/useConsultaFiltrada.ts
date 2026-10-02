import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { criarCacheFiltrado } from '@/lib/consultaFiltrada'

const cache = criarCacheFiltrado()
let userId: string | null = null
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  const next = session?.user.id ?? null
  if (event === 'SIGNED_OUT' || next !== userId) cache.clear()
  userId = next
})
if (import.meta.hot) import.meta.hot.dispose(() => { subscription.unsubscribe(); cache.clear() })

const EMPTY: never[] = []
/** Não mostra dados de outra chave, não descarta recorte novo e não silencia erro. */
export function useConsultaFiltrada<T>(key: string, fetch: (signal: AbortSignal) => Promise<T[]>, enabled = true) {
  const [state, setState] = useState<{ key: string; data: T[]; loading: boolean; error: string | null }>({ key, data: [], loading: enabled, error: null })
  useEffect(() => {
    let active = true
    let request: ReturnType<typeof cache.acquire<T[]>> | undefined
    if (!enabled) {
      setState({ key, data: [], loading: false, error: null })
      return
    }
    async function load(force: boolean) {
      if (request) return
      const lease = cache.acquire(key, fetch, force)
      request = lease
      setState(previous => ({ key, data: lease.cached ?? (previous.key === key ? previous.data : []),
        loading: lease.cached === undefined, error: null }))
      try {
        const data = await lease.promise
        if (active) setState({ key, data, loading: false, error: null })
      } catch (error) {
        if (active) setState(previous => ({ ...previous, loading: false,
          error: error instanceof Error ? error.message : String(error) }))
      } finally {
        lease.release()
        if (request === lease) request = undefined
      }
    }
    void load(false)
    const refresh = () => { void load(true) }
    window.addEventListener('dashboard:refresh', refresh)
    const timer = setInterval(refresh, 300_000)
    return () => {
      active = false
      request?.release()
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', refresh)
    }
  }, [key, fetch, enabled])
  if (!enabled) return { data: EMPTY as T[], loading: false, error: null }
  if (state.key !== key) return { data: EMPTY as T[], loading: true, error: null }
  return { data: state.data, loading: state.loading, error: state.error }
}
