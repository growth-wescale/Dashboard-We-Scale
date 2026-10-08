import { daysInMonth, toLocalDate } from './dateUtils'
import { saleUnits } from './metrics'
import { deduplicateLeads, isLeadMql } from './leadUtils'
import type { Lead } from './types'

export const MISSAO = { anual: 4_932_000, trimestre: 2_068_360, inicio: '2026-10-01', fim: '2026-12-31' } as const
export const MESES_MISSAO = ['2026-10-01', '2026-11-01', '2026-12-01'] as const
export function pacingTrimestre(hoje: string) {
  const dia = 86_400_000
  const inicio = Date.parse(MISSAO.inicio + 'T00:00:00Z')
  const fim = Date.parse(MISSAO.fim + 'T00:00:00Z')
  return Math.max(0, Math.min(1, (Date.parse(hoje + 'T00:00:00Z') - inicio + dia) / (fim - inicio + dia)))
}
export const FRENTES_MISSAO = [
  { marca: 'Inpot', investimento: 90_000 },
  { marca: 'Eletrovias', investimento: 76_000 },
  { marca: 'Lisô Laser', investimento: 72_000 },
] as const

export interface MetaMissaoRow {
  mes_referencia: string; marca: string; funcao: string
  meta_financeira: number | null; meta_qtd_vendas: number | null
  meta_sql: number | null; meta_volume_sal: string | null
}
export interface VendaMissaoRow {
  id_lead: string; ciclo: number; marca: string; status_atual: string
  valor_contrato: number | null; quantidade_unidades: number | null; data_venda: string | null
}
export interface EtapaMissaoRow {
  id_lead: string; ciclo: number; marca: string; status_atual: string
  data_agendamento_reuniao_sql: string | null; data_sal: string | null
}
export interface MidiaMissaoRow { id: string; dia: string; marca: string; canal: string; spend_brl: number | null }
export interface DadosMissao {
  hoje: string; atualizadoEm: string; metas: MetaMissaoRow[]; vendas: VendaMissaoRow[]
  etapas: EtapaMissaoRow[]; midia: MidiaMissaoRow[]
  leads?: Lead[]; metasMql?: Array<{ marca: string; valor_meta: number }>
}

export const CP_MQL_MISSAO: Record<string, number> = { Inpot: 220, Eletrovias: 37, 'Lisô Laser': 300 }
// Metas aprovadas por Gabriel para esta página, sem publicar no cadastro global.
export const MQL_MISSAO: Record<string, readonly number[]> = {
  Inpot: [164, 163, 82], Eletrovias: [757, 756, 541], 'Lisô Laser': [96, 96, 48],
}

/** Mesmo dedupe/classificação dos KPIs de Marketing, dentro de cada marca. */
export function captacaoMissao(dados: DadosMissao, marca: string) {
  const inicio = dados.hoje.slice(0, 7) + '-01'
  const leads = (dados.leads ?? []).filter(r => r.marca === marca && r.dia >= inicio && r.dia <= dados.hoje)
  const mql = deduplicateLeads(leads).filter(isLeadMql).length
  const registros = (dados.metasMql ?? []).filter(r => r.marca === marca)
  const indice = MESES_MISSAO.indexOf(inicio as typeof MESES_MISSAO[number])
  const metaMql = indice >= 0 && MQL_MISSAO[marca]
    ? MQL_MISSAO[marca][indice]
    : registros.length === 1 ? numeroMeta(registros[0].valor_meta) : null
  const investimento = FRENTES_MISSAO.find(f => f.marca === marca)?.investimento ?? 0
  const gasto = pacingMissao(dados.midia, marca, investimento, dados.hoje).gasto
  return { mql, metaMql, cpmql: mql > 0 ? gasto / mql : null, metaCpMql: CP_MQL_MISSAO[marca] }
}

export function numeroMeta(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Lê o espelho publicado pelo motor de metas, sem recalcular ou gravar metas. */
export function metaCadastrada(rows: MetaMissaoRow[], marca: string, meses: readonly string[], campo: 'meta_financeira' | 'meta_qtd_vendas' | 'meta_sql' | 'meta_volume_sal') {
  const funcao = campo === 'meta_financeira' || campo === 'meta_qtd_vendas' ? 'Closer' : 'SDR'
  const faltantes: string[] = []
  let parcial = 0
  for (const mes of meses) {
    const registros = rows.filter(r => r.marca === marca && r.funcao === funcao && r.mes_referencia.slice(0, 10) === mes)
    if (!registros.length || registros.some(r => numeroMeta(r[campo]) === null)) faltantes.push(mes)
    parcial += registros.reduce((s, r) => s + (numeroMeta(r[campo]) ?? 0), 0)
  }
  parcial = Math.round(parcial * 100) / 100
  return { valor: faltantes.length ? null : parcial, parcial, faltantes }
}

function noPeriodo(data: string | null, inicio: string, fim: string) {
  const dia = toLocalDate(data)
  return dia !== null && dia >= inicio && dia <= fim
}

export function realizadoMissao(rows: VendaMissaoRow[], inicio: string, fim: string, marca?: string) {
  const vistos = new Set<string>()
  let centavos = 0, unidades = 0, negocios = 0, semValor = 0
  for (const r of rows) {
    if (r.status_atual !== 'Ganho' || (marca && r.marca !== marca) || !noPeriodo(r.data_venda, inicio, fim)) continue
    const key = `${r.id_lead}:${r.ciclo}`
    if (vistos.has(key)) continue
    vistos.add(key)
    negocios++
    unidades += saleUnits(r)
    // Mesma soma de Vendas, inclusive ajustes negativos registrados na origem.
    const valor = Number(r.valor_contrato ?? 0) || 0
    if (!valor) semValor++
    centavos += Math.round(valor * 100)
  }
  return { receita: centavos / 100, unidades, negocios, semValor }
}

/** Datas consolidadas por ciclo, como a campanha; não conta reentradas/passagens. */
export function etapasMissao(rows: EtapaMissaoRow[], marca: string, inicio: string, fim: string) {
  const sql = new Set<string>(), sal = new Set<string>()
  for (const r of rows) {
    if (r.marca !== marca || r.status_atual === 'Excluído') continue
    const key = `${r.id_lead}:${r.ciclo}`
    if (noPeriodo(r.data_agendamento_reuniao_sql, inicio, fim)) sql.add(key)
    if (noPeriodo(r.data_sal, inicio, fim)) sal.add(key)
  }
  return { sql: sql.size, sal: sal.size }
}

export function orcamentoMensalMissao(marca: string, investimento: number, indice: number): number | null {
  if (indice < 0 || indice > 2) return null
  return marca === 'Eletrovias' ? [28_000, 28_000, 20_000][indice] : investimento * [0.4, 0.4, 0.2][indice]
}

export function pacingMissao(rows: MidiaMissaoRow[], marca: string, investimento: number, hoje: string) {
  const inicio = hoje.slice(0, 7) + '-01'
  const indice = MESES_MISSAO.indexOf(inicio as typeof MESES_MISSAO[number])
  const orcamento = orcamentoMensalMissao(marca, investimento, indice)
  const vistos = new Set<string>()
  let gasto = 0
  for (const r of rows) {
    if (r.marca !== marca || r.dia < inicio || r.dia > hoje || vistos.has(r.id)) continue
    vistos.add(r.id)
    gasto += r.spend_brl ?? 0
  }
  gasto = Math.round(gasto * 100) / 100
  const fracaoMes = Number(hoje.slice(-2)) / daysInMonth(hoje.slice(0, 7))
  const previsto = orcamento === null ? null : orcamento * fracaoMes
  return { gasto, orcamento, previsto, fracaoMes, ritmo: previsto ? gasto / previsto : null }
}

export function proximoDia(iso: string) {
  const date = new Date(iso + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
