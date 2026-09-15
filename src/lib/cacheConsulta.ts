/**
 * Cache em memória compartilhado entre páginas (vive enquanto a aba do
 * navegador estiver aberta; um F5 começa do zero).
 *
 * Visão Macro, Performance e Análise de Perda leem a MESMA base
 * (`vw_funil_vendas` por origem). Sem cache, cada troca de aba baixava tudo de
 * novo e a tela ficava em "carregando". Com ele, a página mostra na hora o que
 * já foi baixado e revalida em segundo plano (quem decide quando revalidar é o
 * hook — este módulo só guarda e deduplica).
 *
 * Os valores guardados são compartilhados por referência: quem consome NÃO
 * pode mutar os arrays/objetos recebidos.
 */

interface Entrada {
  valor?: unknown
  atualizadoEm: number
  emVoo?: Promise<unknown>
}

/** Poucas chaves: 2 origens × base de deals + alguns recortes de período de eventos. */
const MAX_ENTRADAS = 16

const entradas = new Map<string, Entrada>()

export function lerCache<T>(chave: string): { valor: T; atualizadoEm: number } | undefined {
  const e = entradas.get(chave)
  if (!e || !('valor' in e)) return undefined
  return { valor: e.valor as T, atualizadoEm: e.atualizadoEm }
}

function descartarExcedente() {
  const comValor = [...entradas.entries()].filter(([, e]) => 'valor' in e && !e.emVoo)
  let sobra = comValor.length - MAX_ENTRADAS
  if (sobra <= 0) return
  comValor.sort((a, b) => a[1].atualizadoEm - b[1].atualizadoEm)
  for (const [chave] of comValor) {
    if (sobra-- <= 0) break
    entradas.delete(chave)
  }
}

/**
 * Executa `carregar` e guarda o resultado. Se já houver uma carga em voo para
 * a mesma chave, devolve ela em vez de disparar outra. Erro não sobrescreve o
 * último valor bom e é repassado para quem chamou.
 */
export function carregarComCache<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
  const atual = entradas.get(chave)
  if (atual?.emVoo) return atual.emVoo as Promise<T>

  const promessa = carregar().then(
    valor => {
      entradas.set(chave, { valor, atualizadoEm: Date.now() })
      descartarExcedente()
      return valor
    },
    erro => {
      const e = entradas.get(chave)
      if (e) {
        delete e.emVoo
        if (!('valor' in e)) entradas.delete(chave)
      }
      throw erro
    },
  )

  if (atual) atual.emVoo = promessa
  else entradas.set(chave, { atualizadoEm: 0, emVoo: promessa })
  return promessa
}

/** Só para testes. */
export function limparCache() {
  entradas.clear()
}
