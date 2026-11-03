import { supabase } from '@/lib/supabase'
import { apagarRegistros } from './armazemLocal'

/**
 * Quem pode guardar a base de Vendas no navegador, e a limpeza no logout.
 *
 * Carregado com o app inteiro (pelo AcessoContext), não só com as abas de
 * Vendas: sair da conta em qualquer tela apaga o que ficou guardado.
 *
 * Só guarda quem tem acesso a todas as marcas. Quem é limitado a algumas
 * marcas já recebe as outras na memória do navegador (limite conhecido, ver
 * "Entrega 2" no CLAUDE.md), mas elas não ficam gravadas no aparelho.
 */

let permitida = false

/** Chamado pelo AcessoProvider quando as permissões do usuário chegam ou mudam. */
export function definirGuardaLocal(ok: boolean) {
  if (permitida && !ok) void apagarRegistros()
  permitida = ok
}

export function guardaLocalPermitida(): boolean {
  return permitida
}

let usuarioAnterior: string | null = null
const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
  const novo = sessao?.user.id ?? null
  const trocou = usuarioAnterior !== null && novo !== null && novo !== usuarioAnterior
  if (evento === 'SIGNED_OUT' || trocou) {
    permitida = false
    void apagarRegistros()
  }
  if (novo) usuarioAnterior = novo
  else if (evento === 'SIGNED_OUT') usuarioAnterior = null
})
if (import.meta.hot) import.meta.hot.dispose(() => subscription.unsubscribe())
