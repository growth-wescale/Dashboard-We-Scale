// Regras puras do repasse da caixa reserva (testadas em repasse.test.ts).

/** Status da distribuir-lead que contam como entregue. 400/422 também: repetir o mesmo corpo não muda nada. */
export function entregue(status: number): boolean {
  return (status >= 200 && status < 300) || status === 400 || status === 422
}

/** Para a rodada depois de N falhas seguidas: a API de Expansão está fora, a próxima rodada tenta de novo. */
export const FALHAS_SEGUIDAS_PARA_PARAR = 3

/** Tira qualquer chave de um texto de erro (o Deno põe a URL inteira, com ?chave=, em erro de rede). */
export function semChave(s: string): string {
  return s.replace(/chave=[^&\s"']+/g, 'chave=***')
}
