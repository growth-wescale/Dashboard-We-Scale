import { normalizeMarcaRaw } from '@/constants/brands'
import type { FunnelRow, OrigemComercial } from '@/lib/funnelTypes'
import type { FunnelEventRow } from '@/lib/metrics'
import { asc, desc, type DefinicaoBase } from './colecao'

/**
 * Definição das duas bases ao vivo das abas de Vendas (colunas, chave, ordem).
 * Sem rede: a ligação com o Supabase fica em `basesVendas.ts`.
 */

/** Mesmas colunas que `useFunilVendas` lia de `vw_funil_vendas` (= `dash_colunas('vendas')`). */
export const COLUNAS_VENDAS = [
  'id_lead', 'ciclo', 'eh_reciclagem', 'eh_ciclo_atual',
  'marca', 'nome_funil', 'etapa_funil', 'id_etapa_atual', 'status_atual',
  'nome_sdr', 'nome_closer', 'nome_negociacao',
  'fonte_macro', 'sub_fonte', 'sub_fonte_crm', 'utm_source', 'utm_medium', 'utm_campaign',
  'valor_contrato', 'quantidade_unidades', 'valor_produto', 'motivo_perda',
  'data_criacao_negociacao', 'data_criacao_original',
  'data_novo_mql', 'data_tentando_contato', 'data_contato_efetivo',
  'data_interesse_reuniao', 'data_conexao',
  'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_no_show',
  'data_sal', 'data_oportunidade', 'data_comite', 'data_pre_contrato',
  'data_venda', 'data_perdido', 'origem_comercial',
] as const

/**
 * Colunas de `vw_funil_etapas_v2` (= `dash_colunas('etapas')`). `id_evento` é a
 * chave da linha; `origem_comercial` vem junto porque a base traz as duas
 * origens e o recorte é feito no navegador.
 */
export const COLUNAS_ETAPAS = [
  'id_evento', 'id_deal', 'dia', 'etapa_canonica', 'id_etapa', 'nome_funil',
  'ciclo', 'rn_deal_etapa_mes', 'marca_deal', 'origem_comercial',
] as const

export type EventoFunil = FunnelEventRow & { id_evento: number; origem_comercial: OrigemComercial | null }

export const DEFINICAO_VENDAS: DefinicaoBase<FunnelRow> = {
  nome: 'vendas',
  colunas: COLUNAS_VENDAS,
  chave: r => `${r.id_lead}|${r.ciclo}`,
  chaveRemovido: item => {
    const [id, ciclo] = item as [string, number]
    return `${id}|${ciclo}`
  },
  // ORDER BY data_criacao_negociacao DESC, id_lead, ciclo — o que o hook pedia ao PostgREST.
  comparar: (a, b) =>
    desc(a.data_criacao_negociacao, b.data_criacao_negociacao) || asc(a.id_lead, b.id_lead) || asc(a.ciclo, b.ciclo),
  // Alias de marca (ex.: 'Odonto Legacy' → 'Odonto Scale') antes de qualquer
  // filtro/agrupamento — ver MARCA_ALIASES em brands.ts.
  ajustar: r => { r.marca = normalizeMarcaRaw(r.marca) ?? r.marca },
}

export const DEFINICAO_ETAPAS: DefinicaoBase<EventoFunil> = {
  nome: 'etapas',
  colunas: COLUNAS_ETAPAS,
  chave: e => String(e.id_evento),
  chaveRemovido: item => String(item),
  // ORDER BY dia DESC, id_deal, id_etapa, etapa_canonica, nome_funil, ciclo,
  // rn_deal_etapa_mes (+ id_evento, ordem total). Em "Deals únicos" fica o 1º
  // evento de cada (deal, ciclo, mês): o mais recente do mês, como antes.
  comparar: (a, b) =>
    desc(a.dia, b.dia) || asc(a.id_deal, b.id_deal) || asc(a.id_etapa, b.id_etapa)
    || asc(a.etapa_canonica, b.etapa_canonica) || asc(a.nome_funil, b.nome_funil)
    || asc(a.ciclo, b.ciclo) || asc(a.rn_deal_etapa_mes, b.rn_deal_etapa_mes) || asc(a.id_evento, b.id_evento),
}

/**
 * Recorte por origem com a mesma referência para todos os componentes: a
 * lista só muda quando a base muda (os `useMemo` das páginas dependem disso).
 * Quem recebe NÃO pode mutar o array nem as linhas.
 */
const recortes = new WeakMap<readonly object[], Map<string, readonly object[]>>()

export function porOrigem<T extends { origem_comercial?: string | null }>(linhas: readonly T[], origem: OrigemComercial): T[] {
  let porChave = recortes.get(linhas)
  if (!porChave) {
    porChave = new Map()
    recortes.set(linhas, porChave)
  }
  let recorte = porChave.get(origem)
  if (!recorte) {
    recorte = linhas.filter(l => l.origem_comercial === origem)
    porChave.set(origem, recorte)
  }
  return recorte as T[]
}
