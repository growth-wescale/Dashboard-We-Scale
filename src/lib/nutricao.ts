export const nutricaoPrevia = import.meta.env.VITE_PREVIA_NUTRICAO === 'true' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)
export const nutricaoAtiva = nutricaoPrevia || import.meta.env.VITE_NUTRICAO_OURO_ENABLED === 'true'
export const nutricaoResumo = nutricaoPrevia ? '/api/previa-nutricao/v1/resumo' : '/api/nutricao-ouro/v1/resumo'
export type FluxoNutricao = { id: string; nome: string; marca: string; status: string; modelos: string[] }
export const metricasNutricao = ['processed', 'delivered', 'unique_opens', 'unique_clicks', 'soft_bounces', 'hard_bounces', 'dropped', 'unsubscribed', 'spam_reports'] as const
export type MetricaNutricao = typeof metricasNutricao[number]
export type MedicaoNutricao = Record<MetricaNutricao, number | null> & { fluxo: string; acao: string; email: string; dia: string; fim: string; collected_at: string }
export type DadosNutricao = { versao: number; inicio: string; fim: string; dias: string[]; coletado: string; gerado: string; modo?: 'automatico'; inventarioEm: string; fluxos: FluxoNutricao[]; medicoes: MedicaoNutricao[] }
export function somaNutricao(rows: MedicaoNutricao[], field: MetricaNutricao): number | null {
  // Sem medição não é zero; campos ausentes também não viram zero parcial.
  return !rows.length || rows.some(r => r[field] == null) ? null : rows.reduce((n, r) => n + r[field]!, 0)
}
export function filtrarNutricao(data: DadosNutricao, inicio: string, fim: string, marca = '', fluxo = '') {
  const fluxos = data.fluxos.filter(f => (!marca || f.marca === marca) && (!fluxo || f.id === fluxo))
  const ids = new Set(fluxos.map(f => f.id))
  return { fluxos, rows: data.medicoes.filter(r => ids.has(r.fluxo) && r.dia >= inicio && r.dia <= fim) }
}
export function periodoNutricaoValido(data: DadosNutricao, inicio: string, fim: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim || inicio < data.inicio || fim > data.fim) return false
  const count = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1
  return Number.isInteger(count) && data.dias.filter(d => d >= inicio && d <= fim).length === count
}
