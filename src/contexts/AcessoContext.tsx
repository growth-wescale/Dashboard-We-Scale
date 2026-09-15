import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ACESSO_VAZIO, parseMinhasPermissoes, pode as podeFn, type EstadoAcesso } from '@/lib/permissoes'

interface AcessoContextValue extends EstadoAcesso {
  carregando: boolean
  erro: string | null
  pode: (chave: string) => boolean
  recarregar: () => Promise<void>
}

const AcessoContext = createContext<AcessoContextValue>({
  ...ACESSO_VAZIO,
  carregando: true,
  erro: null,
  pode: () => false,
  recarregar: async () => {},
})

/**
 * Carrega o que o usuário logado pode ver e fazer (`minhas_permissoes()` no
 * Supabase de Marketing). Falha fechada: se a consulta der erro, ninguém vê
 * nada até recarregar. Rechecagem ao voltar pra aba do navegador — é o que
 * derruba na hora quem foi desativado com o dashboard aberto.
 */
export function AcessoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [estado, setEstado] = useState<EstadoAcesso>(ACESSO_VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('minhas_permissoes')
    if (error) {
      setErro(error.message)
    } else {
      setEstado(parseMinhasPermissoes(data))
      setErro(null)
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    if (!userId) return
    setCarregando(true)
    recarregar()
  }, [userId, recarregar])

  useEffect(() => {
    if (!userId) return
    const onVisivel = () => { if (document.visibilityState === 'visible') recarregar() }
    document.addEventListener('visibilitychange', onVisivel)
    return () => document.removeEventListener('visibilitychange', onVisivel)
  }, [userId, recarregar])

  const value = useMemo<AcessoContextValue>(() => ({
    ...estado,
    carregando,
    erro,
    pode: (chave: string) => podeFn(estado, chave),
    recarregar,
  }), [estado, carregando, erro, recarregar])

  return <AcessoContext.Provider value={value}>{children}</AcessoContext.Provider>
}

export function useAcesso() {
  return useContext(AcessoContext)
}
