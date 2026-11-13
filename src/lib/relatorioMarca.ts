/**
 * Relatório da marca (Vendas › Relatórios): os números do relatório semanal
 * que o Brunno pede, para qualquer período.
 *
 * Módulo puro: recebe as linhas de `vw_funil_vendas` e os eventos de
 * `vw_funil_etapas_v2` (as mesmas bases ao vivo da Visão Macro) e devolve tudo
 * pronto para desenhar. As contagens usam as funções de `metrics.ts`, então o
 * relatório bate com o dashboard, com uma diferença de propósito: o MQL sai
 * SEM os negócios perdidos como "Duplicado" (o mesmo lead entrando de novo),
 * e o dashboard ainda conta esses negócios.
 */

import {
  DEFAULT_VIEW_MODES, STAGE_DATE_FIELD, STAGE_ORDER, countSales, currentStage, dealKey,
  eventsInStage, isInWindow, isLoss, isSale, noEscopoDoCiclo, sumRevenue, toWindow,
  type FunnelEventRow, type PeriodWindow, type StageKey,
} from '@/lib/metrics'
import { computeEtapaAtual } from '@/lib/aging'
import { etapaDaPerda } from '@/lib/perdaRows'
import { classificarMotivo, type CategoriaMotivo } from '@/constants/motivosPerda'
import { toLocalDate } from '@/lib/dateUtils'
import type { FunnelRow } from '@/lib/funnelTypes'

/* ── Relatórios disponíveis ──────────────────────────────────────────────── */

export interface RelatorioMarcaDef {
  /** Pedaço da URL: /relatorios/<slug>. */
  slug: string
  /** Marca como chega nas bases ao vivo (já com o apelido aplicado). */
  marca: string
  /** Nome que aparece no título. */
  nome: string
  descricao: string
}

export const RELATORIOS_MARCA: readonly RelatorioMarcaDef[] = [
  {
    slug: 'odonto-legacy',
    marca: 'Odonto Scale',
    nome: 'Odonto Legacy',
    descricao: 'Funil atual, funil de performance, safra de MQL, origem e perdas, sempre comparados com o período anterior. Escolha qualquer período; o período vai no link, então dá para abrir dois períodos em guias diferentes.',
  },
]

export function relatorioPorSlug(slug: string | undefined): RelatorioMarcaDef | null {
  return RELATORIOS_MARCA.find(r => r.slug === slug) ?? null
}

/* ── Período ─────────────────────────────────────────────────────────────── */

export interface Periodo { de: string; ate: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const partes = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

function valida(s: string | null | undefined): s is string {
  if (!s || !ISO.test(s)) return false
  const { y, m, d } = partes(s)
  return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDia(y, m)
}

/** Soma meses mantendo o dia, e encosta no último dia quando o mês é mais curto. */
export function somarMeses(dia: string, n: number): string {
  const { y, m, d } = partes(dia)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return iso(ny, nm, Math.min(d, ultimoDia(ny, nm)))
}

export function somarDias(dia: string, n: number): string {
  const { y, m, d } = partes(dia)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

function diasEntre(de: string, ate: string): number {
  const a = partes(de), b = partes(ate)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

/** Do dia 1 do mês até hoje: o período em curso termina hoje, não no fim do mês. */
export function periodoPadrao(hoje: string): Periodo {
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje }
}

/**
 * Período vindo da URL, já validado: data inválida vira o padrão, "até" depois
 * de hoje encosta em hoje e "de" depois de "até" troca de lugar.
 */
export function normalizarPeriodo(de: string | null | undefined, ate: string | null | undefined, hoje: string): Periodo {
  const padrao = periodoPadrao(hoje)
  let a = valida(de) ? de : padrao.de
  let b = valida(ate) ? ate : (valida(de) ? hoje : padrao.ate)
  if (b > hoje) b = hoje
  if (a > hoje) a = hoje
  if (a > b) [a, b] = [b, a]
  return { de: a, ate: b }
}

const ehInicioDeMes = (dia: string) => partes(dia).d === 1
const ehFimDeMes = (dia: string) => { const { y, m, d } = partes(dia); return d === ultimoDia(y, m) }

/**
 * Período de comparação:
 *  • meses inteiros (do dia 1 ao último dia) → os mesmos meses imediatamente antes;
 *  • até 31 dias → as mesmas datas um mês antes (01–12/11 → 01–12/10);
 *  • mais que isso → o mesmo número de dias logo antes do período.
 */
export function periodoComparacao(p: Periodo): Periodo {
  if (ehInicioDeMes(p.de) && ehFimDeMes(p.ate)) {
    const meses = (partes(p.ate).y * 12 + partes(p.ate).m) - (partes(p.de).y * 12 + partes(p.de).m) + 1
    const de = somarMeses(p.de, -meses)
    const fim = partes(somarMeses(p.ate, -meses))
    return { de, ate: iso(fim.y, fim.m, ultimoDia(fim.y, fim.m)) }
  }
  const span = diasEntre(p.de, p.ate) + 1
  if (span <= 31) return { de: somarMeses(p.de, -1), ate: somarMeses(p.ate, -1) }
  const ate = somarDias(p.de, -1)
  return { de: somarDias(ate, -(span - 1)), ate }
}

export const fmtDia = (dia: string) => { const { y, m, d } = partes(dia); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` }
const fmtDiaCurto = (dia: string) => fmtDia(dia).slice(0, 5)

/** "01 a 12/11/2026", "28/10 a 05/11/2026" ou "01/12/2025 a 05/01/2026". */
export function rotuloPeriodo(p: Periodo): string {
  if (p.de === p.ate) return fmtDia(p.de)
  const a = partes(p.de), b = partes(p.ate)
  if (a.y !== b.y) return `${fmtDia(p.de)} a ${fmtDia(p.ate)}`
  if (a.m !== b.m) return `${fmtDiaCurto(p.de)} a ${fmtDia(p.ate)}`
  return `${String(a.d).padStart(2, '0')} a ${fmtDia(p.ate)}`
}

/** Título do relatório: "Novembro 2026" quando cabe num mês só, senão as datas. */
export function tituloPeriodo(p: Periodo): string {
  const a = partes(p.de), b = partes(p.ate)
  if (a.y === b.y && a.m === b.m) return `${MESES[a.m - 1]} ${a.y}`
  return rotuloPeriodo(p)
}

/** "(mês fechado)", "(mês em curso)" ou nada. */
export function situacaoPeriodo(p: Periodo, hoje: string): string | null {
  const a = partes(p.de), b = partes(p.ate)
  if (a.y !== b.y || a.m !== b.m || a.d !== 1) return null
  if (ehFimDeMes(p.ate)) return 'mês fechado'
  if (p.ate === hoje) return 'mês em curso'
  return null
}

/** Atalhos da barra de período. */
export function atalhosPeriodo(hoje: string): { rotulo: string; periodo: Periodo }[] {
  const inicioMes = `${hoje.slice(0, 7)}-01`
  const mesPassadoDe = somarMeses(inicioMes, -1)
  const mp = partes(mesPassadoDe)
  return [
    { rotulo: 'Este mês', periodo: { de: inicioMes, ate: hoje } },
    { rotulo: 'Mês passado', periodo: { de: mesPassadoDe, ate: iso(mp.y, mp.m, ultimoDia(mp.y, mp.m)) } },
    { rotulo: 'Últimos 7 dias', periodo: { de: somarDias(hoje, -6), ate: hoje } },
    { rotulo: 'Últimos 30 dias', periodo: { de: somarDias(hoje, -29), ate: hoje } },
  ]
}

const janela = (p: Periodo): PeriodWindow => toWindow(null, null, [{ from: p.de, to: p.ate }])

/* ── Rótulos das etapas no formato do relatório ─────────────────────────── */

export const ROTULO_ETAPA: Record<StageKey, string> = {
  'MQL': 'MQL',
  'Tentando Contato': 'Tentando contato',
  'Contato Efetivo': 'Contato efetivo',
  'Interesse Reunião': 'Interesse reunião',
  'Conexão': 'Conexão',
  'Reunião Agendada SQL': 'SQL · reunião agendada',
  'Diagnóstico': 'Diagnóstico',
  'SAL': 'SAL',
  'Oportunidade COF': 'Oportunidade',
  'Comitê': 'Comitê',
  'Pré-Contrato': 'Pré-contrato',
  'Fechamento': 'Fechamento',
  'No Show': 'No Show',
}

/** Etapas a partir do agendamento (barra dourada). */
export const DEPOIS_DO_AGENDAMENTO = new Set<StageKey>([
  'Reunião Agendada SQL', 'Diagnóstico', 'SAL', 'Oportunidade COF', 'Comitê', 'Pré-Contrato', 'Fechamento',
])

/* ── Regras pequenas ─────────────────────────────────────────────────────── */

const limparMotivo = (m: string) => m.replace(/^\[NOVO\]\s*/i, '').trim()

/** Negócio perdido como "Duplicado": é o mesmo lead entrando de novo, não um MQL novo. */
export function ehDuplicado(r: Pick<FunnelRow, 'status_atual' | 'motivo_perda'>): boolean {
  return r.status_atual === 'Perdido'
    && limparMotivo(r.motivo_perda ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === 'duplicado'
}

/** Canal pelo utm_source, separando Facebook, Instagram e Audience Network. */
export function canalUtm(utm: string | null | undefined): string {
  const u = (utm ?? '').trim().toLowerCase()
  if (!u || u === '{{site_source_name}}' || u === 'null' || u === 'undefined') return 'Sem UTM'
  if (u === 'facebook' || u === 'fb') return 'Facebook'
  if (u === 'instagram' || u === 'ig') return 'Instagram'
  if (u === 'audience_network' || u === 'an') return 'Audience Network'
  if (['meta', 'messenger', 'msg', 'threads', 'forms nativo meta'].includes(u)) return 'Meta (outros)'
  if (u === 'google' || u === 'adwords') return 'Google'
  return 'Outros'
}

const DIA_MS = 86_400_000
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/* ── Saída ───────────────────────────────────────────────────────────────── */

export interface LinhaAtual { etapa: StageKey; deals: number; mediaEtapa: number | null; mediaAndamento: number | null }
export interface LinhaPerformance { etapa: StageKey; atual: number; anterior: number; conv: number | null }
export interface Contagem { rotulo: string; n: number }
export interface MotivoPerda { motivo: string; categoria: CategoriaMotivo | null; atual: number; anterior: number }
export interface LinhaCanal { canal: string; mqlAtual: number; mqlAnterior: number; perdidosAtual: number }

export interface Safra {
  mql: number
  abertos: Contagem[]
  totalAbertos: number
  perdidos: Contagem[]
  totalPerdidos: number
  vendidos: number
}

export interface Perdas {
  total: number
  duplicados: number
  diasMedios: number | null
  porEtapa: Contagem[]
  fimCadencia: number
}

export interface RelatorioDados {
  periodo: Periodo
  comparacao: Periodo
  kpis: {
    abertos: number
    mql: number
    mqlComDuplicados: number
    sql: number
    vendas: number
    receita: number
    perdidos: number
    perdidosDuplicados: number
  }
  atual: {
    linhas: LinhaAtual[]
    totalTabela: number
    abertos: number
    noShow: number
    tentandoParados21: number
    tentando: number
  }
  performance: {
    linhas: LinhaPerformance[]
    mqlComDuplicados: { atual: number; anterior: number }
    convMqlSql: { atual: number | null; anterior: number | null }
    vendasSemMql: number
  }
  safra: { atual: Safra; anterior: Safra }
  perdas: { atual: Perdas; anterior: Perdas; motivos: MotivoPerda[] }
  canais: LinhaCanal[]
  ultimaVenda: string | null
  receitaAnterior: number
}

export interface EntradaRelatorio {
  rows: FunnelRow[]
  eventos: FunnelEventRow[]
  marca: string
  periodo: Periodo
  /** Instante de "agora" (para tempo parado). */
  agora: number
}

const ETAPAS_TABELA_ATUAL = STAGE_ORDER.filter(s => s !== 'Fechamento')

function contarSafra(rows: FunnelRow[], p: Periodo): Safra {
  const win = janela(p)
  const safra = rows.filter(r => !ehDuplicado(r) && isInWindow(r.data_novo_mql, win))
  const abertos = new Map<string, number>()
  const perdidos = new Map<string, number>()
  let vendidos = 0
  for (const r of safra) {
    if (r.status_atual === 'Em andamento') {
      const e = currentStage(r)
      const rot = e ? ROTULO_ETAPA[e] : (r.etapa_funil ?? 'Sem etapa')
      abertos.set(rot, (abertos.get(rot) ?? 0) + 1)
    } else if (r.status_atual === 'Perdido') {
      const e = etapaDaPerda(r)
      const rot = e ? ROTULO_ETAPA[e] : (r.etapa_funil ?? 'Sem etapa')
      perdidos.set(rot, (perdidos.get(rot) ?? 0) + 1)
    } else if (isSale(r)) {
      vendidos += 1
    }
  }
  const ordem = (m: Map<string, number>) => [...m.entries()]
    .map(([rotulo, n]) => ({ rotulo, n }))
    .sort((a, b) => ordemRotulo(a.rotulo) - ordemRotulo(b.rotulo))
  const ab = ordem(abertos)
  const pe = ordem(perdidos)
  return {
    mql: safra.length,
    abertos: ab,
    totalAbertos: ab.reduce((s, x) => s + x.n, 0),
    perdidos: pe,
    totalPerdidos: pe.reduce((s, x) => s + x.n, 0),
    vendidos,
  }
}

function ordemRotulo(rot: string): number {
  const i = ([...STAGE_ORDER, 'No Show'] as StageKey[]).findIndex(s => ROTULO_ETAPA[s] === rot)
  return i < 0 ? 99 : i
}

function contarPerdas(rows: FunnelRow[], p: Periodo): Perdas & { lista: FunnelRow[] } {
  const win = janela(p)
  const lista = rows.filter(r => isLoss(r) && isInWindow(r.data_perdido, win))
  const porEtapa = new Map<string, number>()
  const dias: number[] = []
  let fimCadencia = 0
  for (const r of lista) {
    const e = etapaDaPerda(r)
    const rot = e ? ROTULO_ETAPA[e] : (r.etapa_funil ?? 'Sem etapa')
    porEtapa.set(rot, (porEtapa.get(rot) ?? 0) + 1)
    if (r.data_perdido && r.data_novo_mql) {
      const d = (new Date(r.data_perdido).getTime() - new Date(r.data_novo_mql).getTime()) / DIA_MS
      if (Number.isFinite(d) && d >= 0) dias.push(d)
    }
    if (/fim da cad/i.test(r.motivo_perda ?? '')) fimCadencia += 1
  }
  return {
    lista,
    total: lista.length,
    duplicados: lista.filter(ehDuplicado).length,
    diasMedios: media(dias),
    porEtapa: [...porEtapa.entries()].map(([rotulo, n]) => ({ rotulo, n }))
      .sort((a, b) => ordemRotulo(a.rotulo) - ordemRotulo(b.rotulo)),
    fimCadencia,
  }
}

/** Monta todos os números do relatório. */
export function montarRelatorio({ rows, eventos, marca, periodo, agora }: EntradaRelatorio): RelatorioDados {
  const comparacao = periodoComparacao(periodo)
  const winA = janela(periodo)
  const winB = janela(comparacao)

  const escopo = rows.filter(r => r.marca === marca && (r.origem_comercial ?? 'Inbound') === 'Inbound')
  const semDup = escopo.filter(r => !ehDuplicado(r))
  const noEscopo = noEscopoDoCiclo(semDup)
  const noEscopoTodos = noEscopoDoCiclo(escopo)

  const evMql = (win: PeriodWindow, filtro: (e: FunnelEventRow) => boolean) =>
    eventsInStage(eventos, 'MQL', win, DEFAULT_VIEW_MODES, filtro)
  const contar = (stage: StageKey, win: PeriodWindow) => stage === 'Fechamento'
    ? countSales(escopo, win, DEFAULT_VIEW_MODES)
    : eventsInStage(eventos, stage, win, DEFAULT_VIEW_MODES, noEscopo).length

  // Funil de performance
  const linhas: LinhaPerformance[] = []
  STAGE_ORDER.forEach((stage, i) => {
    const atual = contar(stage, winA)
    const anterior = contar(stage, winB)
    const ant = i > 0 ? linhas[i - 1].atual : 0
    linhas.push({ etapa: stage, atual, anterior, conv: i > 0 && ant > 0 ? atual / ant : null })
  })
  const n = (s: StageKey) => linhas.find(l => l.etapa === s)!
  const mql = n('MQL'), sql = n('Reunião Agendada SQL')
  const mqlComDup = { atual: evMql(winA, noEscopoTodos).length, anterior: evMql(winB, noEscopoTodos).length }

  // Funil atual (estoque de hoje, sem recorte de data)
  const agg = computeEtapaAtual(escopo, null, agora)
  const linhasAtual: LinhaAtual[] = ETAPAS_TABELA_ATUAL.map(etapa => {
    const a = agg.get(etapa)
    return { etapa, deals: a?.deals ?? 0, mediaEtapa: a?.mediaEtapa ?? null, mediaAndamento: a?.mediaAndamento ?? null }
  })
  const vivos = escopo.filter(r => r.eh_ciclo_atual && r.status_atual === 'Em andamento')
  const tentando = vivos.filter(r => currentStage(r) === 'Tentando Contato')
  const tentandoParados21 = tentando.filter(r => {
    const d = r[STAGE_DATE_FIELD['Tentando Contato']]
    return !!d && (agora - new Date(d).getTime()) / DIA_MS > 21
  }).length

  // Perdas
  const pA = contarPerdas(escopo, periodo)
  const pB = contarPerdas(escopo, comparacao)
  const motivos = new Map<string, MotivoPerda>()
  const somaMotivo = (lista: FunnelRow[], campo: 'atual' | 'anterior') => {
    for (const r of lista) {
      const m = limparMotivo(r.motivo_perda ?? '') || 'Sem motivo'
      const cur = motivos.get(m) ?? { motivo: m, categoria: classificarMotivo(m), atual: 0, anterior: 0 }
      cur[campo] += 1
      motivos.set(m, cur)
    }
  }
  somaMotivo(pA.lista, 'atual')
  somaMotivo(pB.lista, 'anterior')

  // Canais: MQL (sem duplicados) pelo utm_source do negócio
  const porChave = new Map(escopo.map(r => [dealKey(r), r]))
  const canais = new Map<string, LinhaCanal>()
  const linhaCanal = (c: string) => canais.get(c) ?? { canal: c, mqlAtual: 0, mqlAnterior: 0, perdidosAtual: 0 }
  const somaMqlCanal = (win: PeriodWindow, campo: 'mqlAtual' | 'mqlAnterior') => {
    const vistos = new Set<string>()
    for (const e of evMql(win, noEscopo)) {
      const k = dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })
      if (vistos.has(k)) continue
      vistos.add(k)
      const c = canalUtm(porChave.get(k)?.utm_source)
      const l = linhaCanal(c)
      l[campo] += 1
      canais.set(c, l)
    }
  }
  somaMqlCanal(winA, 'mqlAtual')
  somaMqlCanal(winB, 'mqlAnterior')
  for (const r of pA.lista) {
    if (ehDuplicado(r)) continue
    const c = canalUtm(r.utm_source)
    const l = linhaCanal(c)
    l.perdidosAtual += 1
    canais.set(c, l)
  }

  // Última venda da marca (qualquer data até o fim do período)
  const vendasAte = escopo
    .filter(r => isSale(r) && r.data_venda && (toLocalDate(r.data_venda) ?? '') <= periodo.ate)
    .map(r => toLocalDate(r.data_venda)!)
    .sort()
  const vendasSemMql = escopo.filter(r => isSale(r) && isInWindow(r.data_venda, winA) && !r.data_novo_mql).length

  const { lista: _la, ...perdasA } = pA
  const { lista: _lb, ...perdasB } = pB
  void _la; void _lb

  return {
    periodo,
    comparacao,
    kpis: {
      abertos: vivos.length,
      mql: mql.atual,
      mqlComDuplicados: mqlComDup.atual,
      sql: sql.atual,
      vendas: n('Fechamento').atual,
      receita: sumRevenue(escopo, winA),
      perdidos: pA.total,
      perdidosDuplicados: pA.duplicados,
    },
    atual: {
      linhas: linhasAtual,
      totalTabela: linhasAtual.reduce((s, l) => s + l.deals, 0),
      abertos: vivos.length,
      noShow: agg.get('No Show')?.deals ?? 0,
      tentandoParados21,
      tentando: tentando.length,
    },
    performance: {
      linhas,
      mqlComDuplicados: mqlComDup,
      convMqlSql: {
        atual: mql.atual > 0 ? sql.atual / mql.atual : null,
        anterior: mql.anterior > 0 ? sql.anterior / mql.anterior : null,
      },
      vendasSemMql,
    },
    safra: { atual: contarSafra(escopo, periodo), anterior: contarSafra(escopo, comparacao) },
    perdas: {
      atual: perdasA,
      anterior: perdasB,
      motivos: [...motivos.values()].sort((a, b) => b.atual - a.atual || b.anterior - a.anterior || a.motivo.localeCompare(b.motivo, 'pt-BR')),
    },
    canais: [...canais.values()].sort((a, b) => b.mqlAtual - a.mqlAtual || b.perdidosAtual - a.perdidosAtual),
    ultimaVenda: vendasAte.length ? vendasAte[vendasAte.length - 1] : null,
    receitaAnterior: sumRevenue(escopo, winB),
  }
}

/* ── Leitura em texto ────────────────────────────────────────────────────── */

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
export const fmtReais = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`
export const fmtPct = (x: number | null, casas = 1) =>
  x === null ? '—' : `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

function variacao(atual: number, anterior: number): string {
  if (anterior === 0) return atual === 0 ? 'igual' : 'sem base de comparação'
  const v = (atual - anterior) / anterior
  if (Math.abs(v) < 0.005) return 'igual'
  return `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`
}

export interface Leitura { titulo: string; texto: string }

/** Os 4 destaques do topo, montados só a partir dos números. */
export function leiturasRelatorio(d: RelatorioDados): Leitura[] {
  const ant = rotuloPeriodo(d.comparacao)
  const mql = d.performance.linhas[0]
  const out: Leitura[] = []

  // 1. Volume
  const v = variacao(mql.atual, mql.anterior)
  const direcao = mql.anterior === 0 || v === 'igual' ? 'Volume'
    : mql.atual > mql.anterior ? 'Volume acima do período anterior' : 'Volume abaixo do período anterior'
  let t1 = `Foram ${fmtInt(mql.atual)} MQL contra ${fmtInt(mql.anterior)} em ${ant}`
  t1 += v === 'igual' || v === 'sem base de comparação' ? '.' : ` (${v}).`
  const dup = d.kpis.mqlComDuplicados - d.kpis.mql
  if (dup > 0) {
    t1 += ` O dashboard mostra ${fmtInt(d.kpis.mqlComDuplicados)}: ${fmtInt(dup)} ${dup === 1 ? 'é' : 'são'} o mesmo lead entrando de novo, ${dup === 1 ? 'perdido' : 'perdidos'} como Duplicado, e ${dup === 1 ? 'ficou' : 'ficaram'} fora daqui.`
  }
  out.push({ titulo: `${direcao}.`, texto: t1 })

  // 2. Agendamento
  const sql = d.performance.linhas.find(l => l.etapa === 'Reunião Agendada SQL')!
  const diag = d.performance.linhas.find(l => l.etapa === 'Diagnóstico')!
  out.push({
    titulo: `${fmtInt(sql.atual)} ${sql.atual === 1 ? 'SQL' : 'SQL'} no período (${fmtInt(sql.anterior)} no anterior).`,
    texto: `Conversão MQL → SQL de ${fmtPct(d.performance.convMqlSql.atual)} (anterior: ${fmtPct(d.performance.convMqlSql.anterior)}). ${fmtInt(diag.atual)} ${diag.atual === 1 ? 'diagnóstico' : 'diagnósticos'} no período, contra ${fmtInt(diag.anterior)}.`,
  })

  // 3. Vendas
  const vendas = d.kpis.vendas
  out.push(vendas > 0
    ? {
        titulo: `${fmtInt(vendas)} ${vendas === 1 ? 'venda' : 'vendas'} no período, ${fmtReais(d.kpis.receita)}.`,
        texto: `No período anterior: ${fmtInt(d.performance.linhas.find(l => l.etapa === 'Fechamento')!.anterior)} ${d.performance.linhas.find(l => l.etapa === 'Fechamento')!.anterior === 1 ? 'venda' : 'vendas'}, ${fmtReais(d.receitaAnterior)}.${d.performance.vendasSemMql > 0 ? ` ${fmtInt(d.performance.vendasSemMql)} ${d.performance.vendasSemMql === 1 ? 'entrou' : 'entraram'} direto em negociação, sem passar pelo topo do funil.` : ''}`,
      }
    : {
        titulo: 'Nenhuma venda no período.',
        texto: d.ultimaVenda ? `A última venda da marca foi em ${fmtDia(d.ultimaVenda)}.` : 'Não há venda da marca registrada.',
      })

  // 4. Perdas e carteira
  const pa = d.perdas.atual
  // Duplicado não é perda de verdade (é o mesmo lead de novo): não vira o "motivo mais comum".
  const topo = d.perdas.motivos.find(m => m.atual > 0 && m.categoria !== 'ignorar')
  let t4 = `${fmtInt(pa.total)} ${pa.total === 1 ? 'lead perdido' : 'leads perdidos'} (anterior: ${fmtInt(d.perdas.anterior.total)})`
  t4 += topo ? `; o motivo mais comum foi "${topo.motivo}" (${fmtInt(topo.atual)}).` : '.'
  t4 += ` Hoje há ${fmtInt(d.atual.abertos)} leads abertos, ${fmtInt(d.atual.tentando)} em Tentando contato`
  t4 += d.atual.tentandoParados21 > 0 ? `, ${fmtInt(d.atual.tentandoParados21)} parados lá há mais de 21 dias.` : '.'
  out.push({ titulo: 'Perdas e carteira.', texto: t4 })

  return out
}
