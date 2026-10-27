import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { createOralUnicOuroFetch } from './oralUnicOuroFetch'
import { oralUnicOuroEnabled } from './oralUnicOuroScope'

let client: SupabaseClient | undefined

// A Esteira preserva sua referência de consultoria/comunidade. Encadear aqui
// todos os providers de Marketing migraria também Legacy sem autorização.
export function oralUnicMarketingClient(): SupabaseClient {
  if (!oralUnicOuroEnabled) return supabase
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null
  return client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    accessToken: token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createOralUnicOuroFetch({
      origin: import.meta.env.VITE_SUPABASE_URL,
      token,
      route: () => window.location.pathname.replace(import.meta.env.VITE_APP_BASENAME || '', '') || '/',
    }) },
  })
}
