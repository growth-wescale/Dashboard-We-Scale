import type { Lead } from './types'

/** Na fonte histórica, inscrições Beauty também podem carregar a marca Lisô. */
export function isLisoSopFranchiseLead(lead: Pick<Lead, 'marca' | 'formulario' | 'dados_extras'>): boolean {
  return lead.marca === 'Lisô Laser'
    && lead.formulario !== 'beautyconnection_multistep'
    && lead.dados_extras?.segmento !== 'beauty'
}
