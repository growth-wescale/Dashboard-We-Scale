/**
 * Kanban da "casa" da Linha do Tempo: uma coluna por etapa, um card por deal.
 *
 * Diferente do funil das outras abas de Vendas, aqui o número não é métrica —
 * é inventário. Cada deal aparece em exatamente uma coluna, a que diz onde ele
 * está (ou onde morreu) agora.
 */

import { STAGE_DATE_FIELD, STAGE_ORDER, currentStage, resolveStage, type StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { diasEntre } from './tipos'

/**
 * As colunas do quadro: as 12 etapas do catálogo, com 'No Show' logo depois de
 * 'Reunião Agendada SQL'. O no-show é a saída da reunião agendada, então é ali
 * que ele cai no fluxo — `STAGE_ORDER` deixa a etapa de fora de propósito
 * porque ela não é um degrau do funil, mas um quadro de inventário precisa
 * mostrar quem está parado nela.
 */
export const KANBAN_COLUNAS: StageKey[] = (() => {
  const i = STAGE_ORDER.indexOf('Reunião Agendada SQL')
  return [...STAGE_ORDER.slice(0, i + 1), 'No Show', ...STAGE_ORDER.slice(i + 1)]
})()

/**
 * Em que coluna o deal entra. Duas regras, nesta ordem:
 *
 * 1. **Ganho vai para Fechamento**, seja qual for a etapa crua. No RD ganhar é
 *    uma flag de status, não um movimento de etapa: medido, os 40 deals ganhos
 *    da base estão todos parados em "Pré Contrato". Respeitar a etapa crua
 *    espalharia as vendas pelo meio do funil e deixaria Fechamento vazio.
 *
 * 2. **Todo o resto fica na etapa corrente** — inclusive o perdido, que assim
 *    fica onde morreu.
 *
 * O fallback de `currentStage` para `resolveStage` PARECE contradizer a trava
 * de "Reunião Agendada SQL só no funil do Closer", e não contradiz: são
 * perguntas diferentes. `currentStage` devolve `null` para os deals parados na
 * etapa homônima do funil do SDR (medido: 68 deals) porque, NAS MÉTRICAS, o
 * handoff SDR→Closer gera dois eventos para a mesma reunião e contá-los
 * duplicaria a passagem. Aqui não há passagem para duplicar: um deal é um card
 * e aparece uma vez só. Sumir com esses 68 do quadro seria esconder inventário
 * real, então eles caem na coluna de SQL, que é onde o RD de fato os mostra.
 */
export function colunaDoDeal(
  row: Pick<FunnelRow, 'status_atual' | 'etapa_funil' | 'id_etapa_atual'>,
): StageKey | null {
  if (row.status_atual === 'Ganho') return 'Fechamento'
  return currentStage(row) ?? resolveStage(row.etapa_funil)
}

/**
 * Há quantos dias o deal está parado nessa coluna: da data da etapa até agora,
 * caindo no MQL e depois na criação do deal quando a etapa não tem data
 * gravada. `null` quando não sobrou nenhuma data utilizável.
 */
export function diasParado(row: FunnelRow, etapa: StageKey, agora: Date): number | null {
  const candidatos = [row[STAGE_DATE_FIELD[etapa]], row.data_novo_mql, row.data_criacao_original]
  for (const iso of candidatos) {
    if (!iso) continue
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) return diasEntre(d, agora)
  }
  return null
}

export interface CardKanban {
  row: FunnelRow
  /** Dias parado na coluna. `null` = deal sem nenhuma data utilizável. */
  dias: number | null
}

export interface ColunaKanban {
  etapa: StageKey
  cards: CardKanban[]
}

/**
 * Monta o quadro inteiro: sempre as 13 colunas (mesmo vazias, pro fluxo ficar
 * legível) e, dentro de cada uma, o deal parado há mais tempo primeiro — é ele
 * que precisa de atenção. Deal sem data vai para o fim da coluna.
 */
export function montarKanban(rows: FunnelRow[], agora: Date): ColunaKanban[] {
  const porEtapa = new Map<StageKey, CardKanban[]>(KANBAN_COLUNAS.map(e => [e, []]))
  for (const row of rows) {
    const etapa = colunaDoDeal(row)
    // Etapa que não resolve não ganha coluna inventada: medido, nenhum deal
    // da base cai aqui hoje — se algum cair, some do quadro em vez de virar
    // um balde "Outros".
    if (!etapa) continue
    porEtapa.get(etapa)?.push({ row, dias: diasParado(row, etapa, agora) })
  }
  for (const cards of porEtapa.values()) {
    cards.sort((a, b) => (b.dias ?? -Infinity) - (a.dias ?? -Infinity))
  }
  return KANBAN_COLUNAS.map(etapa => ({ etapa, cards: porEtapa.get(etapa) ?? [] }))
}
