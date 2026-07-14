export type Marca =
  | 'Oral Unic'
  | 'Inpot'
  | 'Eletrovias'
  | 'Lisô Laser'
  | 'B2Case'
  | 'Viva'

export type Canal = 'meta' | 'google'

export type Pipeline = 'closer' | 'sdr'

export type EtapaCategoria = 'mql' | 'sql' | 'sal' | 'fechado' | 'perdido'

export type CanalCrm = 'meta' | 'google' | 'organico' | 'direto' | 'outros'

export type Metrica =
  | 'investimento'
  | 'leads'
  | 'mql'
  | 'sql'
  | 'fechamentos'

// === MÍDIA PAGA ===
export interface MediaDailyRaw {
  id: string
  dia: string              // ISO date
  marca: Marca
  canal: Canal
  campanha: string | null
  conjunto: string | null
  anuncio: string | null
  spend_brl: number
  impressoes: number
  cliques_link: number
  lpv: number
  cpm: number | null
  cpc: number | null
  leads: number
  video_p50: number | null
  video_thruplay: number | null
  criado_em: string
}

// === LEADS BRUTOS ===
export interface Lead {
  id: string
  dia: string              // ISO date
  marca: Marca
  nome: string | null
  email: string | null
  telefone: string | null
  uf: string | null
  cidade: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  formulario: string | null
  dados_extras: Record<string, unknown> | null
  row_hash: string | null
  criado_em: string
}

// === FUNIL CRM ===
export interface CrmFunilRaw {
  id: string
  marca: Marca
  pipeline: Pipeline
  deal_id: string
  etapa_atual: string | null
  etapa_categoria: EtapaCategoria | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  canal: CanalCrm | null
  valor_proposta: number | null
  capital_declarado: string | null
  data_criacao: string | null
  atualizado_em: string
}

// === METAS ===
export interface Meta {
  id: string
  marca: Marca
  mes: string              // ISO date (first day of month)
  metrica: Metrica
  valor_meta: number
  criado_em: string
  atualizado_em: string
}

// === CONSTANTES ===
export const MARCAS: Marca[] = [
  'Oral Unic',
  'Inpot',
  'Eletrovias',
  'Lisô Laser',
  'B2Case',
  'Viva',
]

export const MARCA_COR: Record<Marca, string> = {
  'Oral Unic':  '#3b82f6',
  'Inpot':      '#10b981',
  'Lisô Laser': '#8b5cf6',
  'Viva':       '#059669',
  'Eletrovias': '#f59e0b',
  'B2Case':     '#6366f1',
}
