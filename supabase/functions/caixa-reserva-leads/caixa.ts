// Caixa reserva da distribuição de leads (roda no Supabase de MARKETING, não no de Expansão).
// O RD Marketing não reenvia webhook: se a API do Supabase de Expansão cair, a conversão some.
// Um 2º webhook do RD manda cada conversão também pra cá; a caixa guarda e a repassar-caixa-reserva
// (Expansão) busca e entrega para a distribuir-lead, que ignora conversão já recebida (chave uuid do
// lead | evento | horário da conversão): repassar o que já tinha chegado não duplica deal.
// Lógica pura aqui (testada em caixa.test.ts); index.ts só faz I/O.

/** Eventos que nunca viram deal: eventos do CRM, chat e as conversões de COF que a própria distribuição dispara. */
const RUIDO = [/RD Station CRM$/i, /^CHAT_/i, /^cof_/i]

/** Identificadores das conversões de um corpo de webhook (formato legado leads[] ou novo event_identifier). */
export function identificadores(body: unknown): string[] {
  // deno-lint-ignore no-explicit-any
  const b = body as any
  if (b && Array.isArray(b.leads)) {
    return b.leads.map((l: Record<string, unknown>) => {
      // deno-lint-ignore no-explicit-any
      const lc = (l?.last_conversion ?? {}) as any
      const ident = lc?.conversion_identifier ?? lc?.content?.identificador ?? lc?.content?.identifier ?? lc?.identificador ?? lc?.identifier ?? null
      return ident ? String(ident) : ''
    })
  }
  if (b && typeof b === 'object' && 'event_identifier' in b) return [b.event_identifier ? String(b.event_identifier) : '']
  return []
}

/** Guarda o corpo? Não guarda o que é só ruído; guarda formato desconhecido (identificador vazio) por segurança. */
export function deveGuardar(idents: string[]): boolean {
  if (idents.length === 0) return false
  return idents.some(i => i === '' || !RUIDO.some(r => r.test(i)))
}

/** Espera até a próxima tentativa: 2, 4, 8 min… limitado a 10 min (queda longa é retomada em até 10 min). */
export function esperaMinutos(tentativas: number): number {
  return Math.min(10, 2 ** Math.max(1, tentativas))
}
