/**
 * Linha da view `vw_funil_vendas`.
 *
 * A view tem UMA LINHA POR CICLO DE VIDA do negócio: a chave é composta
 * (`id_lead` + `ciclo`). Um deal perdido e depois reciclado aparece uma vez
 * por ciclo, cada um com suas próprias datas de etapa, SDR e Closer.
 * Por isso identidade de linha usa `dealKey()`, nunca `id_lead` sozinho.
 */
export type OrigemComercial = 'Inbound' | 'Prospecção Ativa'

export const ORIGENS: readonly OrigemComercial[] = ['Inbound', 'Prospecção Ativa']

export interface FunnelRow {
  id_lead: string
  /** 1 = original, 2+ = reciclagens. */
  ciclo: number
  eh_reciclagem: boolean
  /** true no ciclo mais recente — é o estado presente no CRM. */
  eh_ciclo_atual: boolean

  marca: string | null
  nome_funil: string | null
  /**
   * Motor comercial do negócio: 'Prospecção Ativa' se QUALQUER evento dele
   * aconteceu no funil de mesmo nome, 'Inbound' caso contrário.
   *
   * Não confundir com `fonte_macro`, que também tem um valor
   * "Prospecção Ativa": são dimensões ortogonais e não se alinham 100%
   * (há deals Inbound com fonte 'Prospecção Ativa' e vice-versa).
   */
  origem_comercial: OrigemComercial | null
  /** Etapa crua do RD; precisa passar por resolveStage() antes de contar. */
  etapa_funil: string | null
  /**
   * Id da etapa CORRENTE do deal no RD (de `deal_snapshot.id_etapa`).
   * `etapa_funil` só carrega o nome, e "Reunião Agendada SQL" existe com o
   * mesmo nome no funil do SDR e no do Closer — o modo "Funil Atual" usa este
   * id para aplicar a mesma regra de funil obrigatório que os modos de evento.
   */
  id_etapa_atual?: string | null
  status_atual: 'Em andamento' | 'Ganho' | 'Perdido' | 'Excluído' | null
  /** Nome da negociação no RD — usado no popup de deals por etapa. */
  nome_negociacao: string | null

  nome_sdr: string | null
  nome_closer: string | null

  fonte_macro: string | null
  sub_fonte: string | null
  utm_source: string | null
  /** Campo "Sub-Fonte" do RD CRM (payload->>'Sub-Fonte'). Fallback quando não há utm_source. */
  sub_fonte_crm?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null

  valor_contrato: number | null
  quantidade_unidades: number | null
  motivo_perda: string | null

  data_criacao_negociacao?: string | null
  /** Criação real do deal — não reseta em reciclagem. */
  data_criacao_original?: string | null

  data_novo_mql: string | null
  data_tentando_contato: string | null
  data_contato_efetivo: string | null
  data_interesse_reuniao: string | null
  data_conexao: string | null
  data_agendamento_reuniao_sql: string | null
  data_reuniao_realizada: string | null
  data_no_show: string | null
  data_sal: string | null
  data_oportunidade: string | null
  data_comite: string | null
  data_pre_contrato: string | null
  data_venda: string | null
  data_perdido: string | null
}

/** Linha da view `vw_deal_etapa_periodos`, usada no modo Aging. */
export interface EtapaPeriodoRow {
  deal_id: string
  etapa: string | null
  data_entrada: string | null
  /** Null = o deal ainda está nesta etapa. */
  data_saida: string | null
  e_ultima_passagem: boolean | null
}
