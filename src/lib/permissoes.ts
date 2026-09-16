/**
 * Catálogo de permissões do dashboard — a fonte de verdade do que existe pra
 * marcar num papel. A tela de Usuários & Acessos desenha os checklists a partir
 * daqui, e o banco (Supabase de Marketing, `acesso_papel_permissoes`) só guarda
 * as chaves. Aba nova no dashboard = uma linha em ABAS; ninguém ganha acesso a
 * ela sozinho (só o Administrador, que tem acesso total).
 */

export type AreaAba = 'Marketing' | 'Vendas'

export interface DefAba {
  chave: string
  label: string
  rota: string
  area: AreaAba
}

export interface DefAcao {
  chave: string
  label: string
  descricao: string
}

export const ABAS: readonly DefAba[] = [
  { chave: 'aba.visao-geral',      label: 'Visão Geral',          rota: '/',                   area: 'Marketing' },
  { chave: 'aba.saude-marca',      label: 'Saúde da Marca',       rota: '/marca',              area: 'Marketing' },
  { chave: 'aba.okrs',             label: 'Meta & OKRs',          rota: '/okrs',               area: 'Marketing' },
  { chave: 'aba.sop-marketing',    label: 'S&OP Marketing',       rota: '/sop-marketing',      area: 'Marketing' },
  { chave: 'aba.visao-macro',      label: 'Visão Macro',          rota: '/funil-vendas',       area: 'Vendas' },
  { chave: 'aba.performance',      label: 'Performance',          rota: '/performance-vendas', area: 'Vendas' },
  { chave: 'aba.analise-perda',    label: 'Análise de Perda',     rota: '/analise-perda',      area: 'Vendas' },
  { chave: 'aba.linha-do-tempo',   label: 'Linha do Tempo',       rota: '/linha-do-tempo',     area: 'Vendas' },
  { chave: 'aba.analise-objecoes', label: 'Análise de Objeções',  rota: '/analise-objecoes',   area: 'Vendas' },
  { chave: 'aba.campanha-metas',   label: 'Campanha de Metas',    rota: '/gp-setembro',        area: 'Vendas' },
  { chave: 'aba.metas',            label: 'Metas',                rota: '/metas',              area: 'Vendas' },
]

export const PERM_GERENCIAR_USUARIOS = 'acao.usuarios-gerenciar'

export const ACOES: readonly DefAcao[] = [
  { chave: 'acao.metas-publicar', label: 'Publicar e ativar metas', descricao: 'No Hub de Metas: publicar uma versão nova e trocar a versão ativa do mês.' },
  { chave: 'acao.okrs-editar',    label: 'Atualizar OKRs',          descricao: 'Mudar o valor atual dos OKRs em Meta & OKRs.' },
  { chave: 'acao.assistente-ia',  label: 'Usar o assistente IA',    descricao: 'Chat flutuante que responde com dados de todas as marcas.' },
  { chave: PERM_GERENCIAR_USUARIOS, label: 'Gerenciar usuários e papéis', descricao: 'Convidar, desativar e dar qualquer acesso a qualquer pessoa. Na prática, é ser administrador.' },
]

export const ROTA_ACESSOS = '/acessos'

/**
 * Telas que sabem filtrar por marca. Pessoa limitada a algumas marcas (ex.:
 * franqueado da Inpot) só entra nestas — sempre filtradas nas marcas dela —,
 * mesmo que o papel marque outras. As demais (OKRs, Campanha, Objeções, Metas)
 * e todas as ações mostram dados do time ou de todas as marcas juntas.
 */
export const TELAS_COM_FILTRO_DE_MARCA: ReadonlySet<string> = new Set([
  'aba.visao-geral', 'aba.saude-marca', 'aba.sop-marketing',
  'aba.visao-macro', 'aba.performance', 'aba.analise-perda', 'aba.linha-do-tempo',
])

export interface EstadoAcesso {
  /** Tem linha em acesso_usuarios. Conta sem linha = sem acesso nenhum. */
  registrado: boolean
  ativo: boolean
  papel: string | null
  acessoTotal: boolean
  /** Slugs de BRAND_LIST a que a pessoa está limitada. null = todas as marcas. */
  marcas: string[] | null
  permissoes: string[]
}

export const ACESSO_VAZIO: EstadoAcesso = {
  registrado: false, ativo: false, papel: null, acessoTotal: false, marcas: null, permissoes: [],
}

function soTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []
}

/** Lê o jsonb de `minhas_permissoes()` sem confiar no formato — qualquer coisa estranha vira sem acesso. */
export function parseMinhasPermissoes(raw: unknown): EstadoAcesso {
  if (!raw || typeof raw !== 'object') return ACESSO_VAZIO
  const r = raw as Record<string, unknown>
  if (r.registrado !== true) return ACESSO_VAZIO
  const marcas = Array.isArray(r.marcas)
    ? soTextos(r.marcas)
    : typeof r.marca === 'string' && r.marca !== '' ? [r.marca] : []
  return {
    registrado: true,
    ativo: r.ativo === true,
    papel: typeof r.papel === 'string' ? r.papel : null,
    acessoTotal: r.acesso_total === true,
    marcas: marcas.length > 0 ? [...new Set(marcas)] : null,
    permissoes: soTextos(r.permissoes),
  }
}

export function pode(estado: EstadoAcesso, chave: string): boolean {
  if (!estado.registrado || !estado.ativo) return false
  if (estado.acessoTotal) return true
  if (estado.marcas && !TELAS_COM_FILTRO_DE_MARCA.has(chave)) return false
  return estado.permissoes.includes(chave)
}

/**
 * Seleção de marcas que vale pra quem é limitado: só o que está dentro das
 * marcas permitidas; se não sobrar nada (ou nada selecionado), todas as dele.
 * Sem limite (`permitidas` null), devolve a seleção como veio.
 */
export function restringirMarcas(selecionadas: readonly string[], permitidas: readonly string[] | null): string[] {
  if (!permitidas) return [...selecionadas]
  const p = new Set(permitidas)
  const dentro = selecionadas.filter(m => p.has(m))
  return dentro.length > 0 ? dentro : [...permitidas]
}

/** Permissão exigida pra abrir uma rota. null = rota que só redireciona (o destino é checado depois). */
export function permissaoDaRota(pathname: string): string | null {
  if (pathname === '/') return 'aba.visao-geral'
  if (pathname.startsWith(ROTA_ACESSOS)) return PERM_GERENCIAR_USUARIOS
  if (pathname.startsWith('/copa-b2b')) return 'aba.okrs'
  const aba = ABAS.find(a => a.rota !== '/' && pathname.startsWith(a.rota))
  return aba?.chave ?? null
}

/** Primeira tela que o usuário pode abrir, na ordem do menu. null = não pode abrir nada. */
export function primeiraRotaPermitida(estado: EstadoAcesso): string | null {
  const aba = ABAS.find(a => pode(estado, a.chave))
  if (aba) return aba.rota
  return pode(estado, PERM_GERENCIAR_USUARIOS) ? ROTA_ACESSOS : null
}
