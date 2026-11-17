import type { MomentoBruto } from './tipos'

/** Linha de `vw_deal_timeline_cadencias`. */
export interface CadenciaRow {
  id: string
  id_deal: string
  tipo: string
  instante: string | null
  cadencia_nome: string | null
  detalhe: string | null
  status: string | null
  ciclo: number | null
}

/** WhatsApp automático só entra quando saiu (ou falhou) — pulado/cancelado/pendente é ruído. */
const DISPARO_VISIVEL: ReadonlySet<string> = new Set(['enviado', 'erro'])

const MOTIVO_SAIDA: Record<string, string> = {
  saiu_da_etapa: 'saiu da etapa',
  deal_fechado: 'negócio fechado',
  manual: 'encerrada à mão',
  perda_por_cadencia: 'perdido no fim da cadência',
}

export function motivoSaidaCadencia(motivo: string | null): string | null {
  if (!motivo) return null
  return MOTIVO_SAIDA[motivo] ?? motivo.replace(/_/g, ' ')
}

/** `vw_deal_timeline_cadencias` → momentos (entrada, saída e WhatsApp automático). */
export function momentosDeCadencias(rows: CadenciaRow[]): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    if (!r.instante) continue
    const instante = new Date(r.instante)
    if (Number.isNaN(instante.getTime())) continue
    const cadencia = r.cadencia_nome?.trim() || null
    const base = { id: `cadencia:${r.id}`, idDeal: r.id_deal, instante, ator: null }
    if (r.tipo === 'entrada') {
      out.push({ ...base, tipo: 'cadencia', titulo: 'Entrou na cadência', detalhe: cadencia ?? undefined,
        meta: { kind: 'cadencia', evento: 'entrada', cadencia, detalhe: r.detalhe, status: r.status } })
    } else if (r.tipo === 'saida') {
      const motivo = motivoSaidaCadencia(r.detalhe)
      out.push({ ...base, tipo: 'cadencia', titulo: 'Saiu da cadência', detalhe: [cadencia, motivo].filter(Boolean).join(' · ') || undefined,
        meta: { kind: 'cadencia', evento: 'saida', cadencia, detalhe: motivo, status: r.status } })
    } else if (r.tipo === 'disparo' && DISPARO_VISIVEL.has(r.status ?? '')) {
      const erro = r.status === 'erro'
      out.push({ ...base, tipo: 'disparo', titulo: erro ? 'WhatsApp automático falhou' : 'WhatsApp automático enviado',
        detalhe: [r.detalhe ? `mensagem ${r.detalhe}` : null, cadencia].filter(Boolean).join(' · ') || undefined,
        meta: { kind: 'cadencia', evento: 'disparo', cadencia, detalhe: r.detalhe, status: r.status } })
    }
  }
  return out
}
