// A ouro pode estar renovando sua cópia. O PDF espera pela resposta íntegra dentro
// do mesmo prazo da requisição. Falhas de permissão ou outros erros não são repetidos.
export async function leituraOuroSop(ler: typeof fetch, url: string, init: RequestInit, route: string) {
  let resposta = await ler(url, init)
  if (route !== '/sop-marketing') return resposta
  for (const espera of [5_000, 10_000, 15_000, 15_000]) {
    if (resposta.status !== 503) break
    const erro = await resposta.clone().json().catch(() => null)
    if (erro?.code !== 'source_refresh_pending') break
    await new Promise(resolve => setTimeout(resolve, espera))
    init.signal?.throwIfAborted()
    resposta = await ler(url, init)
  }
  return resposta
}
