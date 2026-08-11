export type Marca =
  | 'Oral Unic'
  | 'Odonto Scale'
  | 'Inpot'
  | 'Eletrovias'
  | 'Lisô Laser'
  | 'B2Case'
  | 'Viva'

export type Canal = 'meta' | 'google'

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
// Marcas Marketing (sem Odonto Scale, que existe só como funil de vendas).
// Fonte única: src/constants/brands.ts
export const MARCAS: Marca[] = [
  'Oral Unic',
  'Inpot',
  'Eletrovias',
  'Lisô Laser',
  'B2Case',
  'Viva',
]
