/**
 * perdaRows.ts — agregações da aba Análise de Perda.
 *
 * Grão: vw_funil_vendas (via FunnelRow), mesma base de Visão Macro e
 * Performance — não vw_perdas (evento). "Perda" usa a mesma trava de
 * snapshot que Fechamento usa pra venda: isLoss/rowsInLoss em metrics.ts,
 * status_atual === 'Perdido'. Um deal perdido e depois reciclado em outro
 * ciclo não conta aqui pro ciclo antigo — mesma regra de negócio do
 * Fechamento (não existe "perda" que reabriu).
 */

import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow, ViewModes, StageKey } from '@/lib/metrics'
import { rowsInLoss, countStage, currentStage, resolveStage, STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
import { EX_INTEGRANTES, nomeNaVisao } from '@/lib/equipe'
import { businessDaysBetween } from '@/lib/businessHours'
import { classificarMotivo } from '@/constants/motivosPerda'
import type { CategoriaMotivo } from '@/constants/motivosPerda'

/**
 * Camada da perda: Pré-vendas (SDR) ou Vendas (Closer), pela etapa em que o
 * negócio foi perdido — `stageOwnerRole`: até "Reunião Agendada SQL" e No Show
 * é SDR, do Diagnóstico em diante é Closer. Mesma regra da "Perda por
 * responsável". Deal sem etapa reconhecível não tem camada (só entra em Todos).
 */
export type CamadaPerda = 'todos' | 'SDR' | 'Closer'
export const CAMADAS_PERDA: readonly CamadaPerda[] = ['todos', 'SDR', 'Closer']

export function camadaDaPerda(r: FunnelRow): 'SDR' | 'Closer' | null {
  // Pelo NOME da etapa (resolveStage), não por currentStage: a camada não
  // depende do funil. "Reunião Agendada SQL" do funil do SDR não conta como
  // SQL (trava do Closer), mas a perda ali é do SDR do mesmo jeito.
  const stage = resolveStage(r.etapa_funil)
  if (!stage) return null
  return stageOwnerRole(stage) === 'sdr' ? 'SDR' : 'Closer'
}

export function filtrarPorCamada(rows: FunnelRow[], camada: CamadaPerda): FunnelRow[] {
  return camada === 'todos' ? rows : rows.filter(r => camadaDaPerda(r) === camada)
}

export function rotuloCamada(c: CamadaPerda): string {
  return c === 'SDR' ? 'Pré-vendas (SDR)' : c === 'Closer' ? 'Vendas (Closer)' : 'Todos'
}

/**
 * Base da taxa de perda: o que entrou na camada no período. Todos e SDR = MQL
 * (todo lead passa pelo SDR); Closer = Diagnóstico (reunião realizada), a 1ª
 * etapa da camada do Closer — perda do Closer sobre MQL dava um número sem
 * leitura nenhuma.
 */
export function etapaBaseDaCamada(camada: CamadaPerda): StageKey {
  return camada === 'Closer' ? 'Diagnóstico' : 'MQL'
}

/** Deals perdidos na janela — ponto único de entrada da aba sobre rowsInLoss (metrics.ts). */
export function perdidos(rows: FunnelRow[], win: PeriodWindow, modes: ViewModes): FunnelRow[] {
  return rowsInLoss(rows, win, modes)
}

/**
 * Perdidos que chegaram em "Oportunidade" ou depois — só esses entram na
 * receita perdida. Um deal perdido em etapa anterior (ex.: Diagnóstico)
 * normalmente não tem proposta de valor real ainda, mesmo que
 * `valor_contrato` esteja preenchido.
 */
export function dealsReceitaPerdida(perdas: FunnelRow[]): FunnelRow[] {
  return perdas.filter(r => !!r.data_oportunidade)
}

export interface KpisPerda {
  perdidasDeals: number
  /** Entradas da camada no período (MQL, ou Diagnóstico no Closer) — base da taxa. */
  basePeriodo: number
  taxaPerda: number
  emAberto: number
  leadtimeDias: number
  etapaTop: StageKey | null
  receitaPerdida: number
}

export function computeKpis(
  scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes, camada: CamadaPerda = 'todos',
): KpisPerda {
  const perdas = filtrarPorCamada(perdidos(scoped, win, modes), camada)
  const basePeriodo = countStage(scoped, etapaBaseDaCamada(camada), win, modes)
  const perdidasDeals = perdas.length
  const taxaPerda = basePeriodo > 0 ? (perdidasDeals / basePeriodo) * 100 : 0

  // Em aberto: negócio vivo parado numa etapa da camada (Todos = todos os vivos).
  const emAberto = filtrarPorCamada(
    scoped.filter(r => r.status_atual === 'Em andamento' && r.eh_ciclo_atual), camada,
  ).length

  const leadtimes: number[] = []
  const etapaCount = new Map<StageKey, number>()
  for (const p of perdas) {
    if (p.data_novo_mql && p.data_perdido) {
      const d = businessDaysBetween(p.data_novo_mql, p.data_perdido)
      if (d > 0) leadtimes.push(d)
    }
    const stage = currentStage(p)
    if (stage) etapaCount.set(stage, (etapaCount.get(stage) ?? 0) + 1)
  }
  const leadtimeDias = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
  const etapaTop = [...etapaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const receitaPerdida = dealsReceitaPerdida(perdas).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)

  return { perdidasDeals, basePeriodo, taxaPerda, emAberto, leadtimeDias, etapaTop, receitaPerdida }
}

/** Limpa o prefixo "[NOVO]" que o RD antepõe a alguns motivos, pra exibição/agrupamento. */
function limparMotivo(motivo: string): string {
  return motivo.replace(/^\[NOVO\]\s*/i, '').trim()
}

export interface MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null; deals: FunnelRow[] }

export function computeMotivos(perdas: FunnelRow[]): MotivoRow[] {
  const comMotivo = perdas.filter(p => p.motivo_perda)
  const total = comMotivo.length || 1
  const bucket = new Map<string, FunnelRow[]>()
  for (const p of comMotivo) {
    const m = limparMotivo(p.motivo_perda!)
    const cur = bucket.get(m) ?? []
    cur.push(p)
    bucket.set(m, cur)
  }
  return [...bucket.entries()]
    .map(([motivo, deals]) => ({
      motivo, qtd: deals.length, pct: (deals.length / total) * 100,
      categoria: classificarMotivo(motivo), deals,
    }))
    .sort((a, b) => b.qtd - a.qtd)
}

export interface EvitavelStats { pctEvitavel: number; qtdProcesso: number; qtdMercado: number }

export function computeEvitavel(perdas: FunnelRow[]): EvitavelStats {
  let qtdProcesso = 0, qtdMercado = 0
  for (const p of perdas) {
    const c = classificarMotivo(p.motivo_perda)
    if (c === 'processo') qtdProcesso += 1
    else if (c === 'mercado') qtdMercado += 1
  }
  const total = qtdProcesso + qtdMercado
  const pctEvitavel = total > 0 ? (qtdProcesso / total) * 100 : 0
  return { pctEvitavel, qtdProcesso, qtdMercado }
}

/**
 * Posição de ordenação de uma etapa nas listas/heatmap de perda. `STAGE_ORDER`
 * não inclui "No Show" DE PROPÓSITO (metrics.ts: "fora da sequência do
 * funil... o deal volta dela para o fluxo normal", mesma regra da Visão
 * Macro, que a exibe como saída lateral após "Reunião Agendada SQL", não como
 * degrau do funil). `STAGE_ORDER.indexOf('No Show')` sem esse tratamento
 * devolve -1 e ordena "No-show" ANTES de "MQL" — errado. Aqui ela entra logo
 * depois de "Reunião Agendada SQL" (índice fracionário, sem empurrar as
 * etapas seguintes), o mesmo lugar em que o deal sai do fluxo normal.
 */
function ordemEtapa(stage: StageKey): number {
  if (stage === 'No Show') return STAGE_ORDER.indexOf('Reunião Agendada SQL') + 0.5
  return STAGE_ORDER.indexOf(stage)
}

export interface EtapaRow { etapa: StageKey; ordem: number; qtd: number; leadtime: number; deals: FunnelRow[] }

export function computeEtapas(perdas: FunnelRow[]): EtapaRow[] {
  const bucket = new Map<StageKey, FunnelRow[]>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (!stage) continue
    const cur = bucket.get(stage) ?? []
    cur.push(p)
    bucket.set(stage, cur)
  }
  return [...bucket.entries()]
    .map(([etapa, deals]) => {
      const leadtimes = deals
        .filter(d => d.data_novo_mql && d.data_perdido)
        .map(d => businessDaysBetween(d.data_novo_mql!, d.data_perdido!))
        .filter(d => d > 0)
      const leadtime = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
      return { etapa, ordem: ordemEtapa(etapa), qtd: deals.length, leadtime, deals }
    })
    .sort((a, b) => a.ordem - b.ordem)
}

export interface EtapaMeta { etapa: StageKey; ordem: number }
export interface CruzCel { motivo: string; etapa: StageKey; qtd: number; deals: FunnelRow[] }

/** Todos os motivos do recorte (sem corte), do mais ao menos frequente. */
export function computeCruzamentos(
  perdas: FunnelRow[],
): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] } {
  const motivos = computeMotivos(perdas).map(m => m.motivo)
  const motivosSet = new Set(motivos)

  const etapasMap = new Map<StageKey, number>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (stage) etapasMap.set(stage, ordemEtapa(stage))
  }
  const etapas = [...etapasMap.entries()]
    .map(([etapa, ordem]) => ({ etapa, ordem }))
    .sort((a, b) => a.ordem - b.ordem)

  const cel = new Map<string, FunnelRow[]>()
  for (const p of perdas) {
    if (!p.motivo_perda) continue
    const m = limparMotivo(p.motivo_perda)
    if (!motivosSet.has(m)) continue
    const stage = currentStage(p)
    if (!stage) continue
    const key = `${m}|||${stage}`
    const cur = cel.get(key) ?? []
    cur.push(p)
    cel.set(key, cur)
  }

  const celulas: CruzCel[] = []
  for (const m of motivos) {
    for (const e of etapas) {
      const deals = cel.get(`${m}|||${e.etapa}`) ?? []
      celulas.push({ motivo: m, etapa: e.etapa, qtd: deals.length, deals })
    }
  }
  return { motivos, etapas, celulas }
}

export interface RespRow {
  nome: string; camada: 'SDR' | 'Closer' | '—'; qtd: number; deals: FunnelRow[]
  /** Linha `EX_INTEGRANTES`: soma de quem saiu do time. */
  exIntegrantes?: boolean
}

/**
 * Uma linha por pessoa E camada: quem perde como SDR e como Closer (ex.: a
 * Bruna, Closer que aparece como SDR em negócio que voltou pro No Show) vira
 * duas linhas, senão tudo caía na camada do primeiro negócio. Quem não é do
 * time (`equipe`, os ativos do cadastro) entra somado em `EX_INTEGRANTES`.
 */
export function computeResponsaveis(perdas: FunnelRow[], equipe?: ReadonlySet<string>): RespRow[] {
  const bucket = new Map<string, { nome: string; camada: 'SDR' | 'Closer' | '—'; deals: FunnelRow[] }>()
  for (const p of perdas) {
    const camada: 'SDR' | 'Closer' | '—' = camadaDaPerda(p) ?? '—'
    const nomeDeal = (camada === 'SDR' ? p.nome_sdr : camada === 'Closer' ? p.nome_closer : null)?.trim()
    if (!nomeDeal) continue
    const nome = nomeNaVisao(nomeDeal, equipe)
    const chave = `${camada}|${nome}`
    const cur = bucket.get(chave) ?? { nome, camada, deals: [] }
    cur.deals.push(p)
    bucket.set(chave, cur)
  }
  return [...bucket.values()]
    .map(v => ({
      nome: v.nome, camada: v.camada, qtd: v.deals.length, deals: v.deals,
      ...(v.nome === EX_INTEGRANTES ? { exIntegrantes: true } : {}),
    }))
    .sort((a, b) => b.qtd - a.qtd)
}

export interface MarcaRow { marca: string; qtd: number; pctSobreMql: number; deals: FunnelRow[] }

/** % sobre a base da camada na própria marca (MQL; Diagnóstico no Closer). */
export function computeMarcas(
  perdas: FunnelRow[], scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes,
  camada: CamadaPerda = 'todos',
): MarcaRow[] {
  const etapaBase = etapaBaseDaCamada(camada)
  const porMarca = new Map<string, FunnelRow[]>()
  for (const p of perdas) {
    if (!p.marca) continue
    const cur = porMarca.get(p.marca) ?? []
    cur.push(p)
    porMarca.set(p.marca, cur)
  }
  return [...porMarca.entries()]
    .map(([marca, deals]) => {
      const mqlMarca = countStage(scoped, etapaBase, win, modes, r => r.marca === marca)
      return {
        marca, qtd: deals.length,
        pctSobreMql: mqlMarca > 0 ? (deals.length / mqlMarca) * 100 : 0,
        deals,
      }
    })
    .sort((a, b) => b.qtd - a.qtd)
}
