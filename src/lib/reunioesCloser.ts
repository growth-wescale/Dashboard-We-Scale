/**
 * Reuniões dos Closers por tipo (R1–R5), vindas do MeetRox — bloco
 * "Reuniões no MeetRox" da aba Performance › Closer.
 *
 * Base: view `vw_closer_reunioes` (Supabase de Expansão), uma linha por
 * reunião gravada. Ver docs/sql/2026-10-01-closer-reunioes-meetrox.sql.
 *
 * Tudo aqui é puro (testado em reunioesCloser.test.ts): o hook só busca, a
 * página só desenha.
 */

import type { OrigemComercial } from '@/lib/funnelTypes'
import { isInWindow, type EventSource, type PeriodWindow } from '@/lib/metrics'
import { normalizeFonteMacro, normalizeSubFonte } from '@/lib/fonteMapping'
import { toLocalYearMonth } from '@/lib/dateUtils'

export type TipoReuniao = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

export interface TipoReuniaoDef {
  tipo: TipoReuniao
  /** Nome curto do tipo de call no MeetRox (sem o prefixo "[Sales]"). */
  nome: string
  /**
   * Rampa ordinal de um tom só (teal do Closer), clara → escura: a jornada
   * R1 → R5 é uma sequência, então a cor mostra a ordem. Validada com
   * `validate_palette.js --ordinal` no tema claro (o escuro não é aplicado).
   */
  cor: string
}

export const TIPOS_REUNIAO: readonly TipoReuniaoDef[] = [
  { tipo: 'R1', nome: 'Diagnóstico', cor: '#4FC3BC' },
  { tipo: 'R2', nome: 'Apresentação Técnica e Financeira', cor: '#2BA8A1' },
  { tipo: 'R3', nome: 'Geomarketing + Explicação do Comitê', cor: '#1B8A85' },
  { tipo: 'R4', nome: 'Alinhamento COF', cor: '#146D69' },
  { tipo: 'R5', nome: 'Devolutiva do Comitê + Fechamento', cor: '#0F524F' },
]

/** Linha de `vw_closer_reunioes`. */
export interface ReuniaoRow {
  call_id: number
  /** null = gravada sem tipo de call no MeetRox ("Undefined"). */
  tipo: TipoReuniao | null
  call_timestamp: string
  duracao_min: number | null
  /** 0 a 1 — % dos critérios do scorecard atendidos, segundo a IA do MeetRox. */
  ai_score: number | null
  /** Nome no padrão do RD ("Jéssica"), não o nome completo do MeetRox. */
  closer: string
  /** Negócio do RD ligado à reunião (pode estar fora do funil). */
  id_deal: string | null
  /** O negócio existe em vw_funil_vendas — só então há marca/origem/fonte/SDR. */
  deal_no_funil: boolean
  negociacao: string | null
  titulo: string | null
  /** Link da gravação no MeetRox. */
  url: string | null
  marca: string | null
  origem_comercial: OrigemComercial | null
  fonte_macro: string | null
  utm_source: string | null
  sub_fonte_crm: string | null
  nome_sdr: string | null
  status_atual: string | null
}

export interface FiltroReunioes {
  origem: OrigemComercial
  /** Marcas selecionadas (valor de `marca`, já normalizado). */
  marcas: string[]
  /**
   * Todas as marcas marcadas (Consolidado). Só nesse caso entra reunião sem
   * negócio no funil — ela não tem marca para casar com uma seleção parcial.
   */
  consolidado: boolean
  fontes: string[]
  subFontes: string[]
  sdrs: string[]
  /** Filtra pelo Closer que CONDUZIU a reunião (quem gravou no MeetRox). */
  closers: string[]
  win: PeriodWindow
  /**
   * 'unique' (Deals únicos): o mesmo negócio conta uma vez por tipo de reunião
   * no mês — some a regravação de uma call que caiu. 'passages': toda reunião
   * gravada conta. Reunião sem negócio ou sem tipo nunca é deduplicada.
   */
  eventSource: EventSource
}

/**
 * Recorte das reuniões pelos filtros da barra + período (pela DATA DA
 * REUNIÃO, em Brasília). Origem do negócio: reunião sem negócio no funil conta
 * como Inbound — Prospecção Ativa não tem Closer, e é o mesmo fallback de
 * `buildScopeFilter`.
 */
export function filtrarReunioes(rows: readonly ReuniaoRow[], f: FiltroReunioes): ReuniaoRow[] {
  const dentro = rows.filter(r => {
    if (!isInWindow(r.call_timestamp, f.win)) return false
    if ((r.origem_comercial ?? 'Inbound') !== f.origem) return false
    if (!f.consolidado && !(r.marca && f.marcas.includes(r.marca))) return false
    if (f.fontes.length && !(r.deal_no_funil && f.fontes.includes(normalizeFonteMacro(r.fonte_macro)))) return false
    if (f.subFontes.length && !(r.deal_no_funil && f.subFontes.includes(normalizeSubFonte(r.utm_source, r.sub_fonte_crm)))) return false
    if (f.sdrs.length && !(r.nome_sdr && f.sdrs.includes(r.nome_sdr))) return false
    if (f.closers.length && !f.closers.includes(r.closer)) return false
    return true
  })
  if (f.eventSource === 'passages') return dentro

  // Deals únicos: fica a primeira reunião de cada (negócio, tipo, mês). Sem
  // tipo não deduplica: duas reuniões sem tipo do mesmo negócio podem ser
  // coisas diferentes ("Alinhamento" e "Finalização").
  const ordenadas = [...dentro].sort((a, b) => a.call_timestamp.localeCompare(b.call_timestamp) || a.call_id - b.call_id)
  const vistos = new Set<string>()
  return ordenadas.filter(r => {
    if (!r.id_deal || !r.tipo) return true
    const chave = `${r.id_deal}|${r.tipo}|${toLocalYearMonth(r.call_timestamp)}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

export type ContagemPorTipo = Record<TipoReuniao, number>

const zeroPorTipo = (): ContagemPorTipo => ({ R1: 0, R2: 0, R3: 0, R4: 0, R5: 0 })

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

export interface LinhaReunioes {
  /** Nome do Closer, ou a marca (null = sem negócio no funil). */
  chave: string | null
  porTipo: ContagemPorTipo
  /** Só as reuniões tipadas (R1–R5). */
  total: number
  semTipo: number
  /** Médias das reuniões tipadas. */
  duracaoMedia: number | null
  notaMedia: number | null
}

export type DimensaoReunioes = 'closer' | 'marca'

/** Chave da linha de uma reunião na dimensão escolhida. */
export function chaveDaReuniao(r: ReuniaoRow, dim: DimensaoReunioes): string | null {
  return dim === 'closer' ? r.closer : r.marca
}

/**
 * Uma linha por Closer (ou por marca), da maior para a menor quantidade de
 * reuniões tipadas. Linha só com reuniões sem tipo vai para o fim — ela não
 * tem o que mostrar nas colunas R1–R5, mas some se for descartada. Na visão
 * por marca, "sem negócio vinculado" (chave nula) fica sempre por último.
 */
export function agruparReunioes(rows: readonly ReuniaoRow[], dim: DimensaoReunioes): LinhaReunioes[] {
  const grupos = new Map<string | null, { porTipo: ContagemPorTipo; semTipo: number; dur: number[]; nota: number[] }>()
  for (const r of rows) {
    const chave = chaveDaReuniao(r, dim)
    let g = grupos.get(chave)
    if (!g) {
      g = { porTipo: zeroPorTipo(), semTipo: 0, dur: [], nota: [] }
      grupos.set(chave, g)
    }
    if (!r.tipo) { g.semTipo++; continue }
    g.porTipo[r.tipo]++
    if (r.duracao_min != null) g.dur.push(r.duracao_min)
    if (r.ai_score != null) g.nota.push(r.ai_score)
  }
  const linhas: LinhaReunioes[] = [...grupos.entries()].map(([chave, g]) => ({
    chave,
    porTipo: g.porTipo,
    total: TIPOS_REUNIAO.reduce((s, t) => s + g.porTipo[t.tipo], 0),
    semTipo: g.semTipo,
    duracaoMedia: media(g.dur),
    notaMedia: media(g.nota),
  }))
  return linhas.sort((a, b) =>
    // "sem negócio vinculado" (marca nula) sempre por último: não é uma marca
    (a.chave === null ? 1 : 0) - (b.chave === null ? 1 : 0)
    || b.total - a.total
    || b.semTipo - a.semTipo
    || (a.chave ?? '').localeCompare(b.chave ?? '', 'pt-BR'),
  )
}

export interface ResumoTipo {
  tipo: TipoReuniao
  quantidade: number
  duracaoMedia: number | null
  notaMedia: number | null
  /** Closers distintos que fizeram esse tipo no recorte. */
  closers: number
}

export interface ResumoReunioes {
  porTipo: ResumoTipo[]
  total: number
  semTipo: number
  /** Médias de todas as reuniões tipadas do recorte. */
  duracaoMedia: number | null
  notaMedia: number | null
}

/** Totais por tipo para os cards do topo do bloco. */
export function resumirReunioes(rows: readonly ReuniaoRow[]): ResumoReunioes {
  const porTipo = TIPOS_REUNIAO.map(({ tipo }) => {
    const doTipo = rows.filter(r => r.tipo === tipo)
    return {
      tipo,
      quantidade: doTipo.length,
      duracaoMedia: media(doTipo.flatMap(r => (r.duracao_min != null ? [r.duracao_min] : []))),
      notaMedia: media(doTipo.flatMap(r => (r.ai_score != null ? [r.ai_score] : []))),
      closers: new Set(doTipo.map(r => r.closer)).size,
    }
  })
  const tipadas = rows.filter(r => r.tipo)
  return {
    porTipo,
    total: tipadas.length,
    semTipo: rows.length - tipadas.length,
    duracaoMedia: media(tipadas.flatMap(r => (r.duracao_min != null ? [r.duracao_min] : []))),
    notaMedia: media(tipadas.flatMap(r => (r.ai_score != null ? [r.ai_score] : []))),
  }
}
