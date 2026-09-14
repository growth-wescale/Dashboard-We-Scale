/** Lógica pura da tela Usuários & Acessos (testada em acessosAdmin.test.ts). */

export type StatusUsuario = 'ativo' | 'pendente' | 'desativado' | 'sem-acesso'

export interface LinhaStatusUsuario {
  papelId: string | null
  ativo: boolean
  convitePendente: boolean
}

export function statusDoUsuario(u: LinhaStatusUsuario): StatusUsuario {
  if (!u.papelId) return 'sem-acesso'
  if (!u.ativo) return 'desativado'
  if (u.convitePendente) return 'pendente'
  return 'ativo'
}

export function diffPermissoes(atuais: readonly string[], novas: readonly string[]) {
  const a = new Set(atuais)
  const n = new Set(novas)
  return {
    adicionar: [...n].filter(p => !a.has(p)).sort(),
    remover: [...a].filter(p => !n.has(p)).sort(),
  }
}

/** Erro do Supabase → frase que dá pra mostrar na tela. */
export function traduzirErroAcesso(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return 'Algo deu errado. Tente de novo.'
  if (e.code === '23505') return 'Já existe um papel com esse nome.'
  if (e.code === '23503') return 'Esse papel ainda tem pessoas. Mude o papel delas antes de apagar.'
  if (e.code === '42501') return 'Você não tem permissão pra isso.'
  return e.message || 'Algo deu errado. Tente de novo.'
}

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function fmtUltimoAcesso(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'nunca'
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(d)) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  return d.toLocaleDateString('pt-BR')
}
