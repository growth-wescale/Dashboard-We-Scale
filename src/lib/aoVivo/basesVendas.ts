import { supabaseVendas } from '@/lib/supabaseVendas'
import { supabase } from '@/lib/supabase'
import type { FunnelRow } from '@/lib/funnelTypes'
import { criarBaseAoVivo, type BaseAoVivo, type DependenciasBase } from './baseAoVivo'
import { criarCanal, type AvisoVersao } from './canal'
import { gravarRegistro, lerRegistro } from './armazemLocal'
import { guardaLocalPermitida } from './guardaLocal'
import { DEFINICAO_ETAPAS, DEFINICAO_VENDAS, type EventoFunil } from './definicoes'

/**
 * As duas bases ao vivo das abas de Vendas ligadas ao Supabase, e o canal que
 * as avisa. Ver `baseAoVivo.ts`, `canal.ts` e
 * docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql.
 */

export { porOrigem, type EventoFunil } from './definicoes'

/* ── Usuário logado (Supabase de Marketing) ─────────────────────────────────
 * O armazenamento local fica marcado com o dono e só é usado por quem pode
 * guardar (`guardaLocal.ts`, que também apaga tudo no logout).
 */
let usuarioAtual: string | null = null
let marcarAuthPronto: () => void = () => {}
const authPronto = new Promise<void>(resolve => { marcarAuthPronto = resolve })

async function usuario(): Promise<string | null> {
  // INITIAL_SESSION chega em milissegundos; o limite é só para nunca travar a carga.
  await Promise.race([authPronto, new Promise(r => setTimeout(r, 3_000))])
  return guardaLocalPermitida() ? usuarioAtual : null
}

const canal = criarCanal({
  abrir(aoAviso, aoStatus) {
    const ch = supabaseVendas.channel('dashboard-vendas')
    ch.on('broadcast', { event: 'versao' }, mensagem => aoAviso((mensagem.payload ?? {}) as AvisoVersao))
    ch.subscribe(status => aoStatus(status))
    return { fechar: () => { void supabaseVendas.removeChannel(ch) } }
  },
  janela: typeof window !== 'undefined' ? window : undefined,
})

const dependencias: DependenciasBase = {
  async rpc(nome, args, sinal) {
    const { data, error } = await supabaseVendas.rpc(nome, args).abortSignal(sinal)
    if (error) throw new Error(error.message)
    return data
  },
  ler: lerRegistro,
  gravar: gravarRegistro,
  usuario,
  ativou: base => canal.ativar(base),
  desativou: base => canal.desativar(base),
}

export const baseVendas: BaseAoVivo<FunnelRow> = criarBaseAoVivo(DEFINICAO_VENDAS, dependencias)
export const baseEtapas: BaseAoVivo<EventoFunil> = criarBaseAoVivo(DEFINICAO_ETAPAS, dependencias)
export const canalVendas = canal

// Logout ou troca de usuário: esquece a base da memória. No logout não busca
// nada (a tela vai para o login); na troca, quem estiver na tela recarrega.
const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
  const novo = sessao?.user.id ?? null
  const trocou = usuarioAtual !== null && novo !== null && novo !== usuarioAtual
  if (evento === 'SIGNED_OUT' || trocou) {
    for (const base of [baseVendas, baseEtapas] as BaseAoVivo<unknown>[]) {
      base.limpar()
      if (trocou && base.emUso() > 0) void base.sincronizar()
    }
  }
  usuarioAtual = novo
  marcarAuthPronto()
})
if (import.meta.hot) import.meta.hot.dispose(() => subscription.unsubscribe())
