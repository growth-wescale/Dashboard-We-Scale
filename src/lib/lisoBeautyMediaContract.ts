/** Recorte de mídia Lisô/Beauty para validar uma futura leitura da ouro. */
export type LisoMediaSegment = 'liso' | 'beauty'
export type LisoMediaChannel = 'meta' | 'google'

export interface LisoMediaCandidate {
  dia: string
  canal: string
  conta_id: string
  campanha_id: string
  moeda: string
  spend_brl: number
}

const CAMPAIGNS: Record<string, { conta: string; canal: LisoMediaChannel; segment: LisoMediaSegment }> = {
  '120249196601180044': { conta: '1923360421973366', canal: 'meta', segment: 'liso' },
  '120250473527040783': { conta: '655039566905092', canal: 'meta', segment: 'beauty' },
  '23604680552': { conta: '9186518266', canal: 'google', segment: 'liso' },
  '24118318500': { conta: '9186518266', canal: 'google', segment: 'liso' },
}

/** IDs e moeda são exigidos; nome de campanha ou marca física não atribuem gasto. */
export function classifyLisoMedia(row: LisoMediaCandidate): LisoMediaSegment | null {
  const expected = CAMPAIGNS[row.campanha_id]
  if (!expected || row.conta_id !== expected.conta || row.canal !== expected.canal || row.moeda !== 'BRL') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dia) || Number.isNaN(Date.parse(row.dia)) || new Date(row.dia).toISOString().slice(0, 10) !== row.dia) return null
  if (!Number.isFinite(row.spend_brl) || row.spend_brl < 0) return null
  return expected.segment
}

/** Compara totais já agregados no mesmo intervalo fechado; retorna centavos. */
export function mediaDifferenceCents(platformBrl: number, goldBrl: number): number {
  if (!Number.isFinite(platformBrl) || !Number.isFinite(goldBrl)) throw new Error('Total de mídia inválido')
  return Math.round((platformBrl - goldBrl) * 100)
}
