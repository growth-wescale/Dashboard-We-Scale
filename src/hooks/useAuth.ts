import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Só a sessão do Supabase Auth (quem está logado). O que a pessoa pode ver e
 * fazer vem do controle de acessos — `useAcesso()` em `contexts/AcessoContext`.
 * (Até 14/09/2026 o papel vinha de `app_metadata.role`; foi migrado pra
 * tabela `acesso_usuarios` no Supabase de Marketing.)
 */
export interface AuthState {
  session: Session | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}
