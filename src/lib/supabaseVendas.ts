import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_VENDAS_URL
const anonKey = import.meta.env.VITE_SUPABASE_VENDAS_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Env do banco de vendas ausente. Defina VITE_SUPABASE_VENDAS_URL e VITE_SUPABASE_VENDAS_ANON_KEY no .env',
  )
}

export const supabaseVendas = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
