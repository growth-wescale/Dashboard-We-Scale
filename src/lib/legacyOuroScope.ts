export const legacyOuroEnabled = import.meta.env.VITE_LEGACY_OURO_ENABLED === 'true'
export const LEGACY_MEDIA = [
  { canal: 'meta', account: '24763396173316651', id: '120248355011530752', names: ['[ODL] Consultoria I LEADS I SITE LEGACY'] },
  { canal: 'google', account: '9733883995', id: '24054007136', names: ['[SEARCH] Intenção - Defesa de Marca'] },
  { canal: 'google', account: '9733883995', id: '24054143009', names: ['[SEARCH] Intenção - Gestão & escala de clínica'] },
] as const
export function inLegacyWindow(r: { dia?: unknown }) {
  return typeof r.dia === 'string' && r.dia >= '2026-10-01' && r.dia < '2026-11-01'
}
// A base anterior não expõe IDs de mídia. De-para fechado por canal e nome;
// nenhuma campanha da comunidade/franquia é substituída.
export function isLegacyMigrationMedia(r: { marca?: unknown; canal?: unknown; campanha?: unknown }) {
  return ['Oral Unic', 'Odonto Scale'].includes(String(r.marca)) && LEGACY_MEDIA.some(c => c.canal === r.canal && c.names.some(n => n === r.campanha))
}
