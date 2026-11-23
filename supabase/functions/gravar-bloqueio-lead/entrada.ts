// Leitura do corpo do POST de gravar-bloqueio-lead. Só confere os tipos: a regra (e-mail válido,
// marcas conhecidas, motivo com 3+ letras, "nada mudou") é do banco, em distribuicao_bloqueio_salvar.

export type Entrada =
  | { ok: true; email: string; marcas: string[]; motivo: string }
  | { ok: false; erro: string }

export function lerEntrada(body: unknown): Entrada {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, erro: 'corpo inválido' }
  const b = body as Record<string, unknown>
  if (typeof b.email !== 'string' || b.email.trim() === '') return { ok: false, erro: 'e-mail obrigatório' }
  if (!Array.isArray(b.marcas) || b.marcas.some(m => typeof m !== 'string')) return { ok: false, erro: 'marcas deve ser uma lista' }
  if (typeof b.motivo !== 'string') return { ok: false, erro: 'motivo obrigatório' }
  return { ok: true, email: b.email, marcas: b.marcas as string[], motivo: b.motivo }
}
