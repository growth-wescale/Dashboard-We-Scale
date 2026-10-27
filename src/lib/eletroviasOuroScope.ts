export const eletroviasOuroEnabled = import.meta.env.VITE_ELETROVIAS_OURO_ENABLED === 'true'
// IDs observados na ouro e nomes exatos presentes na referência. Conciliação externa não presumida.
export const ELETROVIAS_MEDIA = [
  { canal: 'google', account: '2319926905', id: '23778217190', names: ['01 - [Eletrovias] [Ongoing] [MQL] [Search] [Fundo Funil] [Genéricos]'] },
  { canal: 'meta', account: '2424035941347251', id: '52585384013024', names: ['01 - WSL | PERPETUO | ELETRO | ALL | NA | T4-FRIO | IG | MQL | BR | 2026-04-20 | Aquisição fria'] },
  { canal: 'meta', account: '2424035941347251', id: '52671387111024', names: ['ELETROVIAS_FUNDO_LEADS_AON - MQL'] },
  { canal: 'meta', account: '2424035941347251', id: '52682815187224', names: ['ELETROVIAS_REMARKETING - MQL'] },
  { canal: 'meta', account: '2424035941347251', id: '52683550378024', names: ['ELETROVIAS_FORMS_AON - MQL'] },
] as const
export function inEletroviasWindow(r: { dia?: unknown }) {
  return typeof r.dia === 'string' && r.dia >= '2026-10-01' && r.dia < '2026-11-01'
}
export function isEletroviasMigrationMedia(r: { marca?: unknown; canal?: unknown; campanha?: unknown }) {
  return r.marca === 'Eletrovias' && ELETROVIAS_MEDIA.some(c => c.canal === r.canal && c.names.some(n => n === r.campanha))
}
export function isEletroviasMigrationLead(r: { marca?: unknown }) {
  return r.marca === 'Eletrovias'
}
