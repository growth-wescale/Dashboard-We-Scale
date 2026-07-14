import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string)
  || 'https://jmuluoksnlqrvzbcltim.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptdWx1b2tzbmxxcnZ6YmNsdGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTg5MjcsImV4cCI6MjA5OTI3NDkyN30.3wOQrIqi1Eu_6WznDkcTR-ewQV2BoSeyUmEC5b89zIw'

export const supabase = createClient(url, key)
