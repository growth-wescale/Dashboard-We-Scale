export type Marca =
  | 'Oral Unic'
  | 'Odonto Scale'
  | 'Inpot'
  | 'Eletrovias'
  | 'Lisô Laser'
  | 'B2Case'
  | 'Viva'

export type Canal = 'meta' | 'google'

export type Pipeline = 'closer' | 'sdr'

export type EtapaCategoria = 'mql' | 'sql' | 'diagnostico' | 'sal' | 'fechado' | 'perdido'

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

// === BASELINE FUNIL ===
export interface BaselineFunil {
  id: string
  marca: string
  etapa: string
  total: number
  criado_em: string
}

// === CADÊNCIAS ===
export type StatusExecucao =
  | 'a_fazer'
  | 'copy_escrita'
  | 'testeira'
  | 'revisao'
  | 'aprovado'
  | 'publicado'

export type PrioridadeTp = 'p1_critico' | 'p2_importante' | 'p3_base'

export interface Fluxo {
  id: string
  marca: string
  titulo: string
  fnota: string | null
  prioridade_default: PrioridadeTp
  ordem: number
}

export interface Motivo {
  id: string
  fluxo_id: string
  titulo: string | null
  origem: string | null
  fnota: string | null
  ordem: number
}

export interface Touchpoint {
  id: string
  fluxo_id: string
  motivo_id: string | null
  dia: string | null
  canal: string | null
  tag: string | null
  ttitle: string | null
  objetivo: string | null
  copy_original: string | null
  copy_atual: string | null
  criativo_status: 'ok' | 'todo' | null
  criativo_nota: string | null
  status: StatusExecucao
  prioridade: PrioridadeTp | null
  responsavel: string | null
  atualizado_em: string
  atualizado_por: string | null
  ordem: number
}

export interface StatusHistorico {
  id: string
  touchpoint_id: string
  status_anterior: string | null
  status_novo: string | null
  mudado_por: string | null
  mudado_em: string
}

export interface MarcaContexto {
  marca: string
  meta: Record<string, string> | null
  alerta: string | null
  extra: string | null
  bignums: Array<{ claim: string; fonte: string | null }> | null
  pills: Array<{ pergunta: string; resposta: string }> | null
  pendencia_documento: string | null
  legacy_operacional: Record<string, unknown> | null
  legacy_paginas: unknown[] | null
}

export interface PendenciaGlobal {
  id: string
  descricao: string
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
  'Oral Unic':    '#3b82f6',
  'Odonto Scale': '#0ea5e9',
  'Inpot':        '#10b981',
  'Lisô Laser':   '#8b5cf6',
  'Viva':         '#059669',
  'Eletrovias':   '#f59e0b',
  'B2Case':       '#6366f1',
}
