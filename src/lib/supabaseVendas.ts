import { createClient } from '@supabase/supabase-js'

export const supabaseVendas = createClient(
  'https://cygxmduuwlwfbodfrlkr.supabase.co',
  'sb_publishable_COkU5FKuNyW28Uhcv69_8A_Bb3FkdcN',
  { auth: { persistSession: false, autoRefreshToken: false } }
)
