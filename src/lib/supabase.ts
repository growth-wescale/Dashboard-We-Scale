import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/**
 * Link de e-mail que abriu esta aba (convite ou redefinição de senha), lido
 * ANTES de o cliente do Supabase consumir e limpar o `#...` da URL. É o que
 * manda quem clicou no convite direto pra tela de criar senha.
 */
export const linkAuth: { tipo: string | null; erro: string | null } = (() => {
  try {
    const p = new URLSearchParams(window.location.hash.slice(1))
    return { tipo: p.get('type'), erro: p.get('error_description') }
  } catch {
    return { tipo: null, erro: null }
  }
})()

export const supabase = createClient(url, key)
