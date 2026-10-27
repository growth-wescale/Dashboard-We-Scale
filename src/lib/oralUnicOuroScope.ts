export const oralUnicOuroEnabled = import.meta.env.VITE_ORAL_UNIC_OURO_ENABLED === 'true'
// IDs conciliados com Meta/Google em27/10. Fonte e recorte analítico são separados.
export const ORAL_UNIC_MEDIA = [
  { canal: 'meta', account: '24763396173316651', id: '120249498633040752', names: ['[OUF] FUNDO_MQL_FRANQUIA_NOVA'] },
  { canal: 'meta', account: '24763396173316651', id: '120246002967810752', names: ['[GS][CONV][LEAD] - Avaliadores - 05/06/2026'] },
  { canal: 'google', account: '9733883995', id: '23324303426', names: ['[SEARCH] LEGACY Franchise marca'] },
] as const
export function inOralUnicWindow(r: { dia?: unknown }) {
  return typeof r.dia === 'string' && r.dia >= '2026-10-01' && r.dia < '2026-11-01'
}
export function isOralUnicMigrationMedia(r: { marca?: unknown; canal?: unknown; campanha?: unknown }) {
  return r.marca === 'Oral Unic' && ORAL_UNIC_MEDIA.some(c => c.canal === r.canal && c.names.some(n => n === r.campanha))
}
export function isOralUnicMigrationLead(r: { marca?: unknown; formulario?: unknown; dados_extras?: unknown; utm_campaign?: unknown }) {
  if (r.marca !== 'Oral Unic' || r.formulario === 'comunidade_multistep' || String(r.utm_campaign ?? '').toUpperCase().includes('[V4]')) return false
  const extra = (r.dados_extras ?? {}) as Record<string, unknown>
  return r.formulario === 'oralunic_multistep' || extra.segmento === 'oral-unic'
    || typeof extra.crm_deal_id === 'string' && !!extra.crm_deal_id
}
export function isOralUnicFranchiseLead(r: { formulario?: unknown; dados_extras?: unknown; utm_campaign?: unknown }) {
  const extra = (r.dados_extras ?? {}) as Record<string, unknown>
  return (r.formulario === 'oralunic_multistep' || extra.segmento === 'oral-unic') && !String(r.utm_campaign ?? '').toUpperCase().includes('[V4]')
}
