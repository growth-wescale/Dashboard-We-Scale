// Lógica pura da aba Bloqueio de Leads: tipos iguais às views do Supabase de Expansão
// (vw_distribuicao_bloqueios, vw_distribuicao_bloqueio_log, RPC distribuicao_lead_negocios) e as
// funções de texto/filtro/linha do tempo que a tela usa. Sem rede, sem React.
// Spec: docs/superpowers/specs/2026-11-23-bloqueio-de-leads-design.md

import type { AtribuicaoRow } from './regras'

export type AcaoBloqueio = 'bloqueio' | 'alteracao' | 'desbloqueio'

/** Linha de vw_distribuicao_bloqueios (estado atual de cada e-mail que já entrou na lista). */
export interface BloqueioRow {
  email: string
  /** Marcas (nome interno da regra) em que o e-mail está bloqueado. Vazio = desbloqueado. */
  marcas: string[]
  bloqueado: boolean
  motivo: string | null
  criado_em: string
  criado_por: string
  atualizado_em: string
  atualizado_por: string
  /** Última vez que foi bloqueado (de nenhuma para alguma marca) e por quem. */
  bloqueado_desde: string | null
  bloqueado_por: string | null
  tentativas_bloqueadas: number
  ultima_tentativa_bloqueada: string | null
  conversoes: number
  ultima_conversao: string | null
  negocios_crm: number
  nome: string | null
}

/** Linha de vw_distribuicao_bloqueio_log (append-only). */
export interface BloqueioLogRow {
  id: number
  email: string
  acao: AcaoBloqueio
  marcas_antes: string[]
  marcas_depois: string[]
  motivo: string
  autor: string
  em: string
}

/** Linha da RPC distribuicao_lead_negocios: negócio do e-mail no RD CRM (espelho). `marca` é o valor do RD. */
export interface NegocioLeadRow {
  email: string
  id_deal: string
  nome_contato: string | null
  marca: string | null
  nome_funil: string | null
  nome_etapa: string | null
  status: string | null
  responsavel: string | null
  criado_em: string | null
  fechado_em: string | null
  deleted_at: string | null
  motivo_perda: string | null
}

export type ConversaoLead = Pick<AtribuicaoRow, 'id' | 'recebido_em' | 'marca' | 'resultado' | 'motivo' | 'nome_sdr' | 'id_deal' | 'lead_nome'>

export type Rotulo = (marca: string) => string

/** Mesma regra do banco (distribuicao_bloqueio_salvar). */
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function normalizarEmail(s: string): string {
  return s.trim().toLowerCase()
}

export function emailValido(s: string): boolean {
  return REGEX_EMAIL.test(normalizarEmail(s))
}

function mesmoConjunto(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every(x => sb.has(x))
}

/** O que salvar `depois` faria a partir de `antes`. null = nada muda (o banco recusa). */
export function acaoDaMudanca(antes: readonly string[], depois: readonly string[]): AcaoBloqueio | null {
  if (mesmoConjunto(antes, depois)) return null
  if (antes.length === 0) return 'bloqueio'
  if (depois.length === 0) return 'desbloqueio'
  return 'alteracao'
}

export function diffMarcas(antes: readonly string[], depois: readonly string[]): { adicionadas: string[]; removidas: string[] } {
  const a = new Set(antes)
  const d = new Set(depois)
  return { adicionadas: depois.filter(m => !a.has(m)), removidas: antes.filter(m => !d.has(m)) }
}

function listaRotulos(marcas: readonly string[], rotulo: Rotulo): string {
  return [...new Set(marcas.map(rotulo))].sort((x, y) => x.localeCompare(y, 'pt-BR')).join(', ')
}

/** "Todas as marcas" quando cobre todas as oferecidas; "Nenhuma" quando vazio; senão os rótulos. */
export function textoMarcas(marcas: readonly string[], todas: readonly string[], rotulo: Rotulo): string {
  if (marcas.length === 0) return 'Nenhuma'
  if (todas.length > 0 && todas.every(m => marcas.includes(m))) return 'Todas as marcas'
  return listaRotulos(marcas, rotulo)
}

/** Uma linha do histórico em texto: o que mudou nas marcas. */
export function resumoLog(l: BloqueioLogRow, rotulo: Rotulo): string {
  if (l.acao === 'bloqueio') return `Bloqueou em ${listaRotulos(l.marcas_depois, rotulo)}`
  if (l.acao === 'desbloqueio') return `Desbloqueou (estava em ${listaRotulos(l.marcas_antes, rotulo)})`
  const { adicionadas, removidas } = diffMarcas(l.marcas_antes, l.marcas_depois)
  return [
    adicionadas.length ? `Incluiu ${listaRotulos(adicionadas, rotulo)}` : '',
    removidas.length ? `Tirou ${listaRotulos(removidas, rotulo)}` : '',
  ].filter(Boolean).join(' · ')
}

export const ROTULO_ACAO: Record<AcaoBloqueio, string> = {
  bloqueio: 'Bloqueio', alteracao: 'Alteração', desbloqueio: 'Desbloqueio',
}

export type SituacaoFiltro = 'bloqueados' | 'desbloqueados' | 'todos'

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarBloqueios(rows: readonly BloqueioRow[], f: { busca: string; situacao: SituacaoFiltro }): BloqueioRow[] {
  const q = semAcento(f.busca.trim())
  return rows.filter(r => {
    if (f.situacao === 'bloqueados' && !r.bloqueado) return false
    if (f.situacao === 'desbloqueados' && r.bloqueado) return false
    if (!q) return true
    return semAcento(r.email).includes(q) || semAcento(r.nome ?? '').includes(q)
  })
}

export type ItemLinhaLead =
  | { tipo: 'conversao'; quando: string; conversao: ConversaoLead; negocio: NegocioLeadRow | null }
  | { tipo: 'negocio'; quando: string; negocio: NegocioLeadRow }
  | { tipo: 'bloqueio'; quando: string; log: BloqueioLogRow }

/**
 * Linha do tempo única do lead, do mais recente para o mais antigo: conversões que chegaram na
 * distribuição (desde 16/10/2026), negócios no RD CRM (de qualquer época) e ações de bloqueio. A
 * conversão que criou um negócio leva o negócio junto (não aparece duas vezes). Sem data vai pro fim.
 */
export function montarLinhaDoTempoLead(
  conversoes: readonly ConversaoLead[], negocios: readonly NegocioLeadRow[], log: readonly BloqueioLogRow[],
): ItemLinhaLead[] {
  const porDeal = new Map(negocios.map(n => [n.id_deal, n]))
  const absorvidos = new Set<string>()
  const itens: ItemLinhaLead[] = []
  for (const c of conversoes) {
    const n = c.id_deal ? porDeal.get(c.id_deal) ?? null : null
    if (n) absorvidos.add(n.id_deal)
    itens.push({ tipo: 'conversao', quando: c.recebido_em, conversao: c, negocio: n })
  }
  for (const n of negocios) {
    if (!absorvidos.has(n.id_deal)) itens.push({ tipo: 'negocio', quando: n.criado_em ?? n.fechado_em ?? '', negocio: n })
  }
  for (const l of log) itens.push({ tipo: 'bloqueio', quando: l.em, log: l })
  const ms = (q: string) => (q ? new Date(q).getTime() : Number.NEGATIVE_INFINITY)
  return itens
    .map((item, i) => ({ item, i }))
    .sort((a, b) => ms(b.item.quando) - ms(a.item.quando) || a.i - b.i)
    .map(x => x.item)
}

export function rotuloStatusNegocio(status: string | null, deletedAt: string | null): string {
  if (deletedAt) return 'Excluído no RD'
  switch (status) {
    case 'open': case 'ongoing': return 'Em andamento'
    case 'won': return 'Ganho'
    case 'lost': return 'Perdido'
    default: return status ?? '—'
  }
}

export interface MarcaBloqueio { marca: string; rotulo: string }

/** Marcas oferecidas na tela: regras vigentes, sem as de teste, com o nome que aparece no RD. */
export function marcasDoBloqueio(regras: ReadonlyArray<{ marca: string; marca_rd: string; vigente_ate: string | null }>): MarcaBloqueio[] {
  const vistas = new Map<string, string>()
  for (const r of regras) {
    if (r.vigente_ate || r.marca.startsWith('Teste')) continue
    vistas.set(r.marca, r.marca_rd || r.marca)
  }
  return [...vistas].map(([marca, rotulo]) => ({ marca, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

/** Onde o e-mail já apareceu, por marca (nome do RD): conversões na distribuição e negócios no CRM. */
export function resumoOndeApareceu(
  conversoes: readonly ConversaoLead[], negocios: readonly NegocioLeadRow[], rotulo: Rotulo,
): Array<{ rotulo: string; conversoes: number; negocios: number }> {
  const m = new Map<string, { rotulo: string; conversoes: number; negocios: number }>()
  const linha = (r: string) => m.get(r) ?? m.set(r, { rotulo: r, conversoes: 0, negocios: 0 }).get(r)!
  for (const c of conversoes) linha(rotulo(c.marca)).conversoes++
  for (const n of negocios) linha(n.marca ?? 'Sem marca').negocios++
  return [...m.values()].sort((a, b) => (b.conversoes + b.negocios) - (a.conversoes + a.negocios) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}
