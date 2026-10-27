import { createEletroviasOuroFetch } from './eletroviasOuroFetch'
import { eletroviasOuroEnabled } from './eletroviasOuroScope'
import { createOralUnicOuroFetch } from './oralUnicOuroFetch'
import { oralUnicOuroEnabled } from './oralUnicOuroScope'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { supabaseVendas } from './supabaseVendas'
import { createPartnerOuroFetch } from './partnerOuroFetch'
import { createLegacyOuroFetch } from './legacyOuroFetch'
import { legacyOuroEnabled } from './legacyOuroScope'
import { createLisoOuroFetch } from './lisoOuroFetch'

// Clientes exclusivos de Marketing. Os clientes compartilhados de Vendas e
// Marketing continuam nativos, inclusive para mídia/CAC/ROAS de Vendas.
let marketing: SupabaseClient | undefined
let crm: SupabaseClient | undefined
const enabled = import.meta.env.VITE_PARTNER_OURO_ENABLED === 'true'
const lisoEnabled = import.meta.env.VITE_LISO_OURO_ENABLED === 'true'
export function partnerMarketingCacheScope(optIn = true) {
  if (!optIn) return ''
  return (enabled ? ':partner-ouro:marketing:v1' : '') + (lisoEnabled ? ':liso-ouro:marketing:v1' : '') + (legacyOuroEnabled ? ':legacy-ouro:marketing:v1' : '') + (oralUnicOuroEnabled ? ':oral-unic-ouro:marketing:v1' : '') + (eletroviasOuroEnabled ? ':eletrovias-ouro:marketing:v1' : '')
}
function client(source: 'marketing' | 'vendas') {
  const vendas = source === 'vendas'
  const options = {
    source, origin: vendas ? import.meta.env.VITE_SUPABASE_VENDAS_URL : import.meta.env.VITE_SUPABASE_URL,
    token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    route: () => window.location.pathname.replace(import.meta.env.VITE_APP_BASENAME || '', '') || '/',
  }
  const partnerFetch = createPartnerOuroFetch({ ...options, enabled })
  const lisoFetch = !vendas && lisoEnabled
    ? createLisoOuroFetch({ ...options, referenceFetch: partnerFetch }) : partnerFetch
  const legacyFetch = !vendas && legacyOuroEnabled
    ? createLegacyOuroFetch({ ...options, referenceFetch: lisoFetch }) : lisoFetch
  const oralFetch = !vendas && oralUnicOuroEnabled
    ? createOralUnicOuroFetch({ ...options, referenceFetch: legacyFetch }) : legacyFetch
  const fetch = !vendas && eletroviasOuroEnabled
    ? createEletroviasOuroFetch({ ...options, referenceFetch: oralFetch }) : oralFetch
  return createClient(
    vendas ? import.meta.env.VITE_SUPABASE_VENDAS_URL : import.meta.env.VITE_SUPABASE_URL,
    vendas ? import.meta.env.VITE_SUPABASE_VENDAS_ANON_KEY : import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      // RLS de Marketing exige o mesmo usuário do cliente original. O JWT
      // desse projeto nunca é enviado ao Supabase de Expansão.
      ...(!vendas ? { accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null } : {}),
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch },
    },
  )
}
export function marketingDataClient(optIn = true): SupabaseClient {
  if ((!enabled && !lisoEnabled && !legacyOuroEnabled && !oralUnicOuroEnabled && !eletroviasOuroEnabled) || !optIn) return supabase
  return marketing ??= client('marketing')
}
export function marketingCrmClient(optIn = true): SupabaseClient {
  if (!enabled || !optIn) return supabaseVendas
  return crm ??= client('vendas')
}
