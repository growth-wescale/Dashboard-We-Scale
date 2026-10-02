/** Cache curto/cancelável para as consultas paginadas de Marketing. */
export function criarCacheFiltrado(ttl = 60_000, timeout = 60_000, limite = 16) {
  type Entry = { value?: unknown; at: number; pending?: Promise<unknown>; controller?: AbortController; users: number }
  const entries = new Map<string, Entry>()
  function trim() {
    const completed = [...entries.entries()].filter(([, e]) => !e.pending && e.users === 0)
      .sort((a, b) => a[1].at - b[1].at)
    for (const [key] of completed) {
      if (entries.size <= limite) break
      entries.delete(key)
    }
  }
  function clear() {
    for (const entry of entries.values()) entry.controller?.abort()
    entries.clear()
  }
  function acquire<T>(key: string, fetch: (signal: AbortSignal) => Promise<T>, force = false) {
    let entry = entries.get(key)
    if (!entry) { entry = { at: 0, users: 0 }; entries.set(key, entry) }
    const current = entry
    current.users++
    const cached = current.value as T | undefined
    if (!current.pending && (force || cached === undefined || Date.now() - current.at >= ttl)) {
      const controller = new AbortController()
      current.controller = controller
      let timedOut = false
      let timer: ReturnType<typeof setTimeout>
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(timedOut
          ? 'A consulta demorou mais de 60 segundos. Tente um período menor ou atualize os dados.'
          : 'Consulta cancelada.')), { once: true })
        timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
      })
      current.pending = Promise.race([Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error('Consulta cancelada.')
        return fetch(controller.signal)
      }), aborted]).then(value => {
        if (entries.get(key) === current && !controller.signal.aborted) {
          current.value = value; current.at = Date.now()
        }
        return value
      }).finally(() => {
        clearTimeout(timer)
        current.pending = undefined
        current.controller = undefined
        trim()
      })
    }
    const promise = (current.pending ?? Promise.resolve(cached)) as Promise<T>
    let released = false
    return { cached, promise, release() {
      if (released) return
      released = true
      current.users--
      trim()
      // Permite reaproveitamento na remontagem de efeitos do StrictMode.
      queueMicrotask(() => {
        if (current.users === 0 && current.controller && entries.get(key) === current) {
          entries.delete(key)
          current.controller.abort()
        }
      })
    } }
  }
  return { acquire, clear }
}
