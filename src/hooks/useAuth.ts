import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Papéis do dashboard.
 *
 * - `admin`: time interno da We Scale (Gabriel/Junior + operadores). Vê tudo.
 * - `marca`: pessoa da marca cliente (ex.: franqueado Inpot). Vê só as abas
 *   de marketing da própria marca. `marcaPermitida` diz qual (slug de BRAND_LIST).
 *
 * Papel default (usuário sem `role` no app_metadata) é `admin` — se você
 * criou o user, é interno; usuários externos só ganham acesso via admin
 * explicitamente setando role='marca'. Fail-safe: falta de flag = interno.
 */
export type Role = 'admin' | 'marca'

export interface AuthState {
  session: Session | null
  loading: boolean
  role: Role
  /** Slug de BRAND_LIST (ex.: 'inpot'). null quando role='admin'. */
  marcaPermitida: string | null
}

/**
 * Lê role/marca de `app_metadata` da sessão do Supabase Auth. Esse campo é
 * gerenciado só pelo lado Admin (Service Role) — o usuário não consegue
 * escalar privilégio via UI, ao contrário de `user_metadata`.
 *
 * Padronização:
 *   raw_app_meta_data = { "role": "marca", "marca": "inpot" }
 *   raw_app_meta_data = { "role": "admin" }        // ou apenas sem role
 */
function extrairRole(session: Session | null): { role: Role; marcaPermitida: string | null } {
  const meta = session?.user?.app_metadata as Record<string, unknown> | undefined
  const role = meta?.role === 'marca' ? 'marca' : 'admin'
  const marca = typeof meta?.marca === 'string' ? meta.marca : null
  return {
    role,
    // Sanidade: role=marca sem marca definida seria estado inválido. Nesses
    // casos, cai pra admin (fail-safe pra não travar o dashboard num limbo).
    marcaPermitida: role === 'marca' && marca ? marca : null,
  }
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

  const { role, marcaPermitida } = extrairRole(session)
  const marcaEfetiva = role === 'marca' && !marcaPermitida ? null : marcaPermitida
  const roleEfetivo: Role = role === 'marca' && !marcaPermitida ? 'admin' : role
  return { session, loading, role: roleEfetivo, marcaPermitida: marcaEfetiva }
}
