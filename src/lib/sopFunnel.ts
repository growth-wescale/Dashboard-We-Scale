import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import { DEFAULT_VIEW_MODES, eventsInStage, resolveStage, toWindow, type FunnelEventRow } from '@/lib/metrics'
import { inPeriod } from '@/lib/vendasUtils'

/**
 * SQL da S&OP por negócio único.
 *
 * A view legada pode deixar `data_sql` vazia mesmo quando o histórico registra
 * a passagem. A união evita tanto o zero falso quanto a duplicação de um deal
 * presente nas duas fontes.
 */
export function countSopSqlDeals(
  rows: VwMarketingFunil[],
  events: FunnelEventRow[],
  start: string,
  end: string,
): number {
  const scopedIds = new Set(rows.map(row => String(row.id_lead)))
  const ids = new Set(
    rows
      .filter(row => inPeriod(row.data_sql, start, end))
      .map(row => String(row.id_lead)),
  )

  const history = eventsInStage(
    events,
    'Reunião Agendada SQL',
    toWindow(null, { from: start, to: end }),
    DEFAULT_VIEW_MODES,
    event => event.id_deal != null && scopedIds.has(String(event.id_deal)),
  )

  for (const event of history) ids.add(String(event.id_deal))

  // Fallback final para históricos incompletos: alguns deals antigos têm só o
  // evento SQL do SDR e não a duplicata do Closer. Como a união é por negócio,
  // aceitar esse evento não reinfla os casos que possuem os dois registros.
  for (const event of events) {
    if (event.id_deal == null || !scopedIds.has(String(event.id_deal))) continue
    if (resolveStage(event.etapa_canonica) !== 'Reunião Agendada SQL') continue
    if (!inPeriod(event.dia, start, end)) continue
    ids.add(String(event.id_deal))
  }
  return ids.size
}
