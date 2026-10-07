import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { toLocalDate } from '@/lib/dateUtils'
import { consultarMissao } from '@/lib/missaoConsulta'
import { criarCacheMissao, MISSAO_INTERVALO, type LeituraMissao } from '@/lib/missaoCache'
import type { DadosMissao } from '@/lib/missaoMetas'
import { useAuth } from './useAuth'

const cache = criarCacheMissao<DadosMissao>()
let userId: string | null = null
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  const next = session?.user.id ?? null
  if (event === 'SIGNED_OUT' || next !== userId) cache.clear()
  userId = next
})
if (import.meta.hot) import.meta.hot.dispose(() => { subscription.unsubscribe(); cache.clear() })

export function useMissaoResumo() {
  const { session } = useAuth()
  const [pedido, setPedido] = useState({ hoje: toLocalDate(new Date().toISOString())!, versao: 0 })
  const [bloqueado, setBloqueado] = useState(false)
  const key = `${session?.user.id ?? ''}:${pedido.hoje}`
  const [state, setState] = useState<LeituraMissao<DadosMissao> & { key: string; loading: boolean }>({ key: '', data: null, error: null, loading: true })
  useEffect(() => {
    if (!session?.user.id) return
    let active = true
    const lease = cache.acquire(key, signal => consultarMissao(supabaseVendas, supabase, pedido.hoje, signal), pedido.versao > 0)
    setState({ key, data: null, error: null, loading: true })
    setBloqueado(true)
    const timer = setTimeout(() => { if (active) setBloqueado(false) }, MISSAO_INTERVALO)
    lease.promise.then(result => {
      if (active) setState({ key, ...result, loading: false })
    }).catch(() => {
      if (active) setState({ key, data: null, loading: false, error: 'A leitura foi interrompida ou excedeu 20 segundos. Nenhum total parcial foi exibido. Tente novamente mais tarde.' })
    }).finally(lease.release)
    return () => { active = false; clearTimeout(timer); lease.release() }
  }, [key, session?.user.id, pedido.hoje, pedido.versao])
  const atualizar = useCallback(() => {
    if (bloqueado || state.loading) return
    setPedido(p => ({ hoje: toLocalDate(new Date().toISOString())!, versao: p.versao + 1 }))
  }, [bloqueado, state.loading])
  const result = state.key === key && session ? state : { data: null, error: null, loading: true }
  return { ...result, atualizar, bloqueado }
}
