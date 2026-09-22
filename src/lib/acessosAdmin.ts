/** Lógica pura da tela Usuários & Acessos (testada em acessosAdmin.test.ts). */

export type StatusUsuario = 'ativo' | 'pendente' | 'desativado' | 'sem-acesso'

export const ORDEM_STATUS: readonly StatusUsuario[] = ['ativo', 'pendente', 'desativado', 'sem-acesso']

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

/** "Todas as marcas" · "Inpot" · "Inpot, Viva" · "Inpot, Viva +2". */
export function resumoMarcas(marcas: readonly string[] | null, rotulo: (slug: string) => string): string {
  if (!marcas || marcas.length === 0) return 'Todas as marcas'
  const nomes = marcas.map(rotulo)
  return nomes.length <= 2 ? nomes.join(', ') : `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
}

// ── Filtros e ordenação da lista de usuários ────────────────────────────────

/** Valor do filtro de Marca que casa com quem NÃO é limitado a marcas. */
export const SEM_LIMITE_DE_MARCA = '__todas__'

export interface LinhaUsuarioLista extends LinhaStatusUsuario {
  email: string
  papelNome: string | null
  marcas: string[] | null
  ultimoLogin: string | null
}

export interface FiltrosUsuarios {
  busca: string
  status: StatusUsuario[]
  /** ids de papel */
  papeis: string[]
  /** slugs de marca e/ou SEM_LIMITE_DE_MARCA */
  marcas: string[]
}

export const FILTROS_VAZIOS: FiltrosUsuarios = { busca: '', status: [], papeis: [], marcas: [] }

export function temFiltroAtivo(f: FiltrosUsuarios): boolean {
  return f.busca.trim() !== '' || f.status.length > 0 || f.papeis.length > 0 || f.marcas.length > 0
}

/** Lista vazia num filtro = não filtra por ele. Filtros diferentes se somam (E). */
export function filtrarUsuarios<T extends LinhaUsuarioLista>(lista: readonly T[], f: FiltrosUsuarios): T[] {
  const termo = f.busca.trim().toLowerCase()
  const status = new Set(f.status)
  const papeis = new Set(f.papeis)
  const marcas = new Set(f.marcas)
  return lista.filter(u => {
    if (termo && !u.email.toLowerCase().includes(termo)) return false
    if (status.size > 0 && !status.has(statusDoUsuario(u))) return false
    if (papeis.size > 0 && !(u.papelId && papeis.has(u.papelId))) return false
    if (marcas.size > 0) {
      const casa = u.marcas === null ? marcas.has(SEM_LIMITE_DE_MARCA) : u.marcas.some(m => marcas.has(m))
      if (!casa) return false
    }
    return true
  })
}

export type ColunaOrdem = 'email' | 'papel' | 'marcas' | 'status' | 'ultimoLogin'

export interface Ordem {
  coluna: ColunaOrdem
  direcao: 'asc' | 'desc'
}

export const ORDEM_PADRAO: Ordem = { coluna: 'email', direcao: 'asc' }

/** Clicar na coluna já ordenada inverte; coluna nova começa crescente (último acesso: mais recente primeiro). */
export function proximaOrdem(atual: Ordem, coluna: ColunaOrdem): Ordem {
  if (atual.coluna === coluna) return { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
  return { coluna, direcao: coluna === 'ultimoLogin' ? 'desc' : 'asc' }
}

const cmpTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })

/**
 * Ordena sem mexer na lista original. Valores vazios (nunca entrou, sem tipo
 * de acesso) ficam sempre no fim, nas duas direções. Empate → e-mail.
 */
export function ordenarUsuarios<T extends LinhaUsuarioLista>(
  lista: readonly T[],
  ordem: Ordem,
  rotuloMarca: (slug: string) => string = s => s,
): T[] {
  const sinal = ordem.direcao === 'asc' ? 1 : -1

  function chave(u: T): string | number | null {
    switch (ordem.coluna) {
      case 'email': return u.email.toLowerCase()
      case 'papel': return u.papelNome
      case 'marcas': return u.marcas === null ? '' : u.marcas.map(rotuloMarca).sort(cmpTexto).join(', ')
      case 'status': return ORDEM_STATUS.indexOf(statusDoUsuario(u))
      case 'ultimoLogin': {
        const t = u.ultimoLogin ? new Date(u.ultimoLogin).getTime() : NaN
        return Number.isNaN(t) ? null : t
      }
    }
  }

  return [...lista].sort((a, b) => {
    const ka = chave(a)
    const kb = chave(b)
    if (ka === null && kb !== null) return 1
    if (kb === null && ka !== null) return -1
    let r = 0
    if (ka !== null && kb !== null) {
      r = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : cmpTexto(String(ka), String(kb))
    }
    return r !== 0 ? r * sinal : cmpTexto(a.email, b.email)
  })
}
