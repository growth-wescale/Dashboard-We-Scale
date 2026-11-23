// Leitura do corpo do POST de gravar-bloqueio-lead e a regra de acesso. Só confere os tipos: a regra
// do bloqueio (e-mail válido, marcas conhecidas, motivo com 3+ letras, "nada mudou", tela
// desatualizada) é do banco, em distribuicao_bloqueio_salvar.

export type Entrada =
  | { ok: true; email: string; marcas: string[]; marcasAntes: string[]; motivo: string }
  | { ok: false; erro: string }

const listaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every(m => typeof m === 'string')

export function lerEntrada(body: unknown): Entrada {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, erro: 'corpo inválido' }
  const b = body as Record<string, unknown>
  if (typeof b.email !== 'string' || b.email.trim() === '') return { ok: false, erro: 'e-mail obrigatório' }
  if (!listaDeTextos(b.marcas)) return { ok: false, erro: 'marcas deve ser uma lista' }
  // O que a tela mostrava: o banco recusa se o bloqueio mudou nesse meio-tempo.
  if (!listaDeTextos(b.marcas_antes)) return { ok: false, erro: 'marcas_antes deve ser uma lista' }
  if (typeof b.motivo !== 'string') return { ok: false, erro: 'motivo obrigatório' }
  return { ok: true, email: b.email, marcas: b.marcas, marcasAntes: b.marcas_antes, motivo: b.motivo }
}

/**
 * Mesma regra de `pode()` no front (src/lib/permissoes.ts), aplicada no servidor sobre o retorno de
 * minhas_permissoes() do Marketing: conta registrada e ativa, e quem é limitado a marcas não usa
 * esta aba (ela mexe em todas as marcas), a menos que tenha acesso total. A permissão da aba em si
 * vem de tem_permissao('aba.bloqueio-leads'), conferida à parte.
 */
export function acessoPermiteBloquear(minhas: unknown): boolean {
  if (!minhas || typeof minhas !== 'object') return false
  const m = minhas as Record<string, unknown>
  if (m.registrado !== true || m.ativo !== true) return false
  if (m.acesso_total === true) return true
  const marcas = Array.isArray(m.marcas) ? m.marcas.filter(x => typeof x === 'string' && x !== '') : []
  const marcaUnica = typeof m.marca === 'string' && m.marca !== ''
  return marcas.length === 0 && !marcaUnica
}
