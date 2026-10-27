/** Transporte da classificação de origem; não decide qualificação por capital. */
export interface LisoQualification {
  marca: string
  formulario: string | null
  capital: string | null
  mqlObservado: boolean | null
  /** Vínculo efetivamente resolvido no SELECT ouro; não apenas ID digitado/importado. */
  dealCrm?: { contaId: string; id: string; segmento: 'liso' | 'beauty' } | null
}
export type LisoDecision = {
  mql: boolean | null
  origem: 'evento_separado' | 'fora_escopo' | 'classificacao_observada' | 'sem_classificacao_origem' | 'deal_criado_crm'
  segmento?: 'liso' | 'beauty'
}
export function readLisoCaptureQualification(row: LisoQualification): LisoDecision {
  if (row.dealCrm?.contaId === 'wescale_principal_crm' && row.dealCrm.id.trim()) {
    // A existência confirmada do deal prevalece sobre a classificação de captação.
    return { mql: true, origem: 'deal_criado_crm', segmento: row.dealCrm.segmento }
  }
  if (row.formulario === 'beautyconnection_multistep') return { mql: null, origem: 'evento_separado' }
  if (row.marca !== 'Lisô Laser' || row.formulario !== 'lisolaser_multistep') return { mql: null, origem: 'fora_escopo' }
  // CRM e LP/formulário decidem MQL. Capital é atributo, nunca fallback.
  if (row.mqlObservado !== null) return { mql: row.mqlObservado, origem: 'classificacao_observada' }
  return { mql: null, origem: 'sem_classificacao_origem' }
}
