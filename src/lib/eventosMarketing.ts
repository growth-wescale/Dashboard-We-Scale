import type { Lead } from './types'

export const EVENTOS_MARKETING = ['Scale Partner Geral', 'Beauty Connection'] as const
export type EventoMarketing = typeof EVENTOS_MARKETING[number]
export interface LeadEvento extends Lead { eventoMarketing: EventoMarketing }

/** Participações explícitas do CRM, independentes da marca/UTM do cadastro.
 * Não usa deduplicateLeads: uma pessoa pode pertencer aos dois eventos.
 */
export function leadsPorEvento(leads: Lead[], inicio: string, fim: string): LeadEvento[] {
  const result = new Map<string, LeadEvento>()
  for (const lead of leads) {
    const participacoes = lead.dados_extras?.eventos_marketing
    if (!Array.isArray(participacoes)) continue
    for (const p of participacoes) {
      if (!p || typeof p !== 'object' || !EVENTOS_MARKETING.includes(p.evento) ||
          typeof p.dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.dia) ||
          p.dia < inicio || p.dia > fim) continue
      const key = `${lead.id}:${p.evento}`
      const previous = result.get(key)
      if (previous && previous.dia <= p.dia) continue
      result.set(key, { ...lead, dia: p.dia, eventoMarketing: p.evento,
        cidade: typeof p.cidade === 'string' ? p.cidade : lead.cidade,
        uf: typeof p.uf === 'string' ? p.uf : lead.uf,
        dados_extras: { ...lead.dados_extras,
          empresa: typeof p.empresa === 'string' ? p.empresa : lead.dados_extras?.empresa },
      })
    }
  }
  return [...result.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id))
}
