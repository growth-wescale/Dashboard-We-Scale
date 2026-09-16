import { resolveStage, STAGE_LABEL } from '@/lib/metrics'
import type { MomentoBruto } from './tipos'

/** Linha de `deal_eventos` (só as colunas que o hook seleciona). */
export interface DealEventoRow {
  id_evento: number
  id_deal: string
  tipo_evento: string
  nome_funil: string | null
  id_etapa: string | null
  nome_etapa: string | null
  nome_etapa_anterior: string | null
  responsavel: string | null
  valor_anterior: string | null
  valor_novo: string | null
  data_evento: string
  motivo_perda: string | null
  anotacao_perda: string | null
}

const CAMPO_LABEL: Record<string, string> = {
  mudanca_marca: 'Marca',
  mudanca_fonte_macro: 'Fonte Macro',
}

const seta = (de: string | null, para: string | null) => `${de ?? '—'} → ${para ?? '—'}`

/**
 * `deal_eventos` → momentos brutos. `deal_deletado` e tipos desconhecidos são
 * descartados. Etapa que `resolveStage` não conhece NÃO some — vira nó com o
 * nome cru (`etapaCrua`), pra história do deal não ter buraco.
 */
export function momentosDeEventos(rows: DealEventoRow[]): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const instante = new Date(r.data_evento)
    if (Number.isNaN(instante.getTime())) continue
    const base = { id: `evento:${r.id_evento}`, idDeal: r.id_deal, instante, ator: r.responsavel ?? null }
    const metaEtapa = { kind: 'etapa' as const, etapaAnterior: r.nome_etapa_anterior, funil: r.nome_funil, idEtapa: r.id_etapa }

    switch (r.tipo_evento) {
      case 'mudanca_etapa': {
        const etapa = resolveStage(r.nome_etapa)
        const crua = r.nome_etapa?.trim() || 'Etapa desconhecida'
        if (etapa === 'No Show') {
          out.push({ ...base, tipo: 'no_show', etapa, titulo: STAGE_LABEL['No Show'], detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        } else if (etapa) {
          out.push({ ...base, tipo: 'etapa', etapa, titulo: STAGE_LABEL[etapa], detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        } else {
          out.push({ ...base, tipo: 'etapa', etapa: null, etapaCrua: crua, titulo: crua, detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        }
        break
      }
      case 'perda':
        out.push({ ...base, tipo: 'perda', titulo: 'Perdido', detalhe: r.motivo_perda ?? undefined,
          meta: { kind: 'perda', motivo: r.motivo_perda, anotacao: r.anotacao_perda } })
        break
      case 'ganho':
        out.push({ ...base, tipo: 'ganho', titulo: 'Ganho' })
        break
      case 'deal_retomado':
        out.push({ ...base, tipo: 'retomada', titulo: 'Reaberto', detalhe: r.nome_etapa ?? undefined })
        break
      case 'troca_responsavel':
        out.push({ ...base, tipo: 'troca_responsavel', titulo: 'Troca de responsável', detalhe: seta(r.valor_anterior, r.valor_novo),
          meta: { kind: 'campo', campo: 'Responsável', de: r.valor_anterior, para: r.valor_novo } })
        break
      case 'mudanca_funil':
        out.push({ ...base, tipo: 'mudanca_funil', titulo: 'Mudou de funil', detalhe: seta(r.valor_anterior, r.valor_novo ?? r.nome_funil),
          meta: { kind: 'campo', campo: 'Funil', de: r.valor_anterior, para: r.valor_novo ?? r.nome_funil } })
        break
      case 'mudanca_marca':
      case 'mudanca_fonte_macro':
        out.push({ ...base, tipo: 'mudanca_campo', titulo: `${CAMPO_LABEL[r.tipo_evento]} alterada`, detalhe: seta(r.valor_anterior, r.valor_novo),
          meta: { kind: 'campo', campo: CAMPO_LABEL[r.tipo_evento], de: r.valor_anterior, para: r.valor_novo } })
        break
      default:
        break
    }
  }
  return out
}
