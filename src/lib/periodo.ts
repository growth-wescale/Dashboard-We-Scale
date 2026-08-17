/**
 * Períodos do filtro de Vendas.
 *
 * A granularidade (dia / mês / trimestre / ano) escolhe o TIPO de período; o
 * seletor ao lado escolhe QUAL período. Um período que ainda está correndo
 * termina hoje, não no seu último dia — senão o funil compararia agosto inteiro
 * contra meio mês de dados e todo indicador pareceria em queda.
 *
 * Módulo puro: sem React, sem Supabase, testável direto.
 */

export type PeriodMode = 'dia' | 'mes' | 'trimestre' | 'ano'
export interface DateRange { start: string; end: string }
export interface OpcaoPeriodo { value: string; label: string }

/** Primeiro mês com dado no CRM de Expansão. Ajuste se houver backfill anterior. */
export const PISO_PERIODO = '2026-01'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** Último dia do mês (m é 1-indexado). O dia 0 do mês seguinte resolve bissexto. */
const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate()

// Meio-dia evita bug de fuso: soma/subtração perto da virada de dia podia
// pular ou repetir um dia dependendo do horário de verão local.
const noon = (isoStr: string) => new Date(isoStr + 'T12:00:00')

/** Nº de dias corridos entre duas datas ISO (positivo se `b` é depois de `a`). */
function diffDias(a: string, b: string): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000)
}

/** Data ISO `n` dias depois (ou antes, se negativo). `setDate` estoura de mês
 *  corretamente — ao contrário de `setMonth`, nunca produz um dia inválido. */
function addDias(isoStr: string, n: number): string {
  const d = noon(isoStr)
  d.setDate(d.getDate() + n)
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Chave do período corrente para a granularidade. */
export function periodoAtual(mode: Exclude<PeriodMode, 'dia'>, hoje = new Date()): string {
  const y = hoje.getFullYear()
  const m = hoje.getMonth() + 1
  if (mode === 'mes') return `${y}-${pad(m)}`
  if (mode === 'trimestre') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  return String(y)
}

/**
 * Range de um período. Trunca em hoje quando o período ainda está correndo.
 * Valor irreconhecível cai no período atual — o filtro nunca deve quebrar a tela.
 */
export function rangeForPeriod(
  mode: Exclude<PeriodMode, 'dia'>,
  value: string,
  hoje = new Date(),
): DateRange {
  const hojeIso = iso(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())
  const clamp = (fim: string) => (fim > hojeIso ? hojeIso : fim)

  if (mode === 'mes') {
    const m = /^(\d{4})-(\d{2})$/.exec(value)
    if (!m) return rangeForPeriod('mes', periodoAtual('mes', hoje), hoje)
    const y = Number(m[1]), mes = Number(m[2])
    return { start: iso(y, mes, 1), end: clamp(iso(y, mes, ultimoDia(y, mes))) }
  }

  if (mode === 'trimestre') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value)
    if (!m) return rangeForPeriod('trimestre', periodoAtual('trimestre', hoje), hoje)
    const y = Number(m[1]), q = Number(m[2])
    const mesInicio = (q - 1) * 3 + 1
    const mesFim = mesInicio + 2
    return { start: iso(y, mesInicio, 1), end: clamp(iso(y, mesFim, ultimoDia(y, mesFim))) }
  }

  const m = /^(\d{4})$/.exec(value)
  if (!m) return rangeForPeriod('ano', periodoAtual('ano', hoje), hoje)
  const y = Number(m[1])
  return { start: iso(y, 1, 1), end: clamp(iso(y, 12, 31)) }
}

/** Chave do período imediatamente anterior, na mesma granularidade. */
export function periodoAnterior(mode: Exclude<PeriodMode, 'dia'>, value: string): string {
  if (mode === 'mes') {
    const m = /^(\d{4})-(\d{2})$/.exec(value)
    if (!m) return value
    let y = Number(m[1]), mes = Number(m[2]) - 1
    if (mes === 0) { mes = 12; y -= 1 }
    return `${y}-${pad(mes)}`
  }
  if (mode === 'trimestre') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value)
    if (!m) return value
    let y = Number(m[1]), q = Number(m[2]) - 1
    if (q === 0) { q = 4; y -= 1 }
    return `${y}-Q${q}`
  }
  const m = /^(\d{4})$/.exec(value)
  if (!m) return value
  return String(Number(m[1]) - 1)
}

/** Data bem no futuro: usada pra pedir a `rangeForPeriod` o fim NATURAL do
 *  período (sem truncar em "hoje"), pra descobrir se o período pedido está
 *  em curso ou já fechado. */
const SEM_CLAMP = new Date(8640000000000000)

/** O período pedido ainda está em andamento (contém "hoje", não terminou)? */
export function periodoEmCurso(
  mode: Exclude<PeriodMode, 'dia'>,
  value: string,
  hoje = new Date(),
): boolean {
  const atual = rangeForPeriod(mode, value, hoje)
  const semClamp = rangeForPeriod(mode, value, SEM_CLAMP)
  return atual.end < semClamp.end
}

/**
 * Range do período anterior, comparável ao período pedido.
 *
 * Período fechado -> mês/trimestre/ano anterior inteiro. Período em curso
 * (truncado em hoje, ver `rangeForPeriod`) -> mesmo nº de dias corridos no
 * período anterior, senão o anterior fechado inteiro compete contra um
 * pedaço do atual e a comparação sempre cai (mesmo raciocínio do truncamento
 * em "hoje").
 *
 * Não usa `Date.setMonth()` pra voltar um período: em meses de 31 dias cujo
 * antecessor é mais curto (jul->jun, mar->fev, mai->abr, out->set, dez->nov),
 * `setMonth` estoura pro início do mês CORRENTE em vez de cair no mês
 * anterior — poluindo a comparação com dias do próprio período atual.
 */
export function rangeAnteriorComparavel(
  mode: Exclude<PeriodMode, 'dia'>,
  value: string,
  hoje = new Date(),
): DateRange {
  const atual = rangeForPeriod(mode, value, hoje)
  const anterior = rangeForPeriod(mode, periodoAnterior(mode, value), hoje)

  if (!periodoEmCurso(mode, value, hoje)) return anterior

  const diasCorridos = diffDias(atual.start, atual.end) + 1
  return { start: anterior.start, end: addDias(anterior.start, diasCorridos - 1) }
}

/** Range anterior para o modo 'dia' (datas livres): mesmo nº de dias,
 *  imediatamente antes do início do range pedido. */
export function rangeAnteriorDia(atual: DateRange): DateRange {
  const dias = diffDias(atual.start, atual.end) + 1
  const end = addDias(atual.start, -1)
  return { start: addDias(end, -(dias - 1)), end }
}

/** Meses de hoje até o piso, do mais recente para o mais antigo. */
export function opcoesMeses(hoje = new Date(), piso = PISO_PERIODO): OpcaoPeriodo[] {
  const [pisoY, pisoM] = piso.split('-').map(Number)
  const out: OpcaoPeriodo[] = []
  let y = hoje.getFullYear()
  let m = hoje.getMonth() + 1

  while (y > pisoY || (y === pisoY && m >= pisoM)) {
    out.push({ value: `${y}-${pad(m)}`, label: `${MESES[m - 1]} ${y}` })
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}

/** Trimestres de hoje até o piso, do mais recente para o mais antigo. */
export function opcoesTrimestres(hoje = new Date(), piso = PISO_PERIODO): OpcaoPeriodo[] {
  const [pisoY, pisoM] = piso.split('-').map(Number)
  const pisoQ = Math.floor((pisoM - 1) / 3) + 1
  const out: OpcaoPeriodo[] = []
  let y = hoje.getFullYear()
  let q = Math.floor(hoje.getMonth() / 3) + 1

  while (y > pisoY || (y === pisoY && q >= pisoQ)) {
    out.push({ value: `${y}-Q${q}`, label: `${q}º trimestre ${y}` })
    q -= 1
    if (q === 0) { q = 4; y -= 1 }
  }
  return out
}

/** Anos de hoje até o piso, do mais recente para o mais antigo. */
export function opcoesAnos(hoje = new Date(), piso = PISO_PERIODO): OpcaoPeriodo[] {
  const pisoY = Number(piso.split('-')[0])
  const out: OpcaoPeriodo[] = []
  for (let y = hoje.getFullYear(); y >= pisoY; y--) out.push({ value: String(y), label: String(y) })
  return out
}

export function opcoesPara(mode: Exclude<PeriodMode, 'dia'>, hoje = new Date()): OpcaoPeriodo[] {
  if (mode === 'mes') return opcoesMeses(hoje)
  if (mode === 'trimestre') return opcoesTrimestres(hoje)
  return opcoesAnos(hoje)
}
