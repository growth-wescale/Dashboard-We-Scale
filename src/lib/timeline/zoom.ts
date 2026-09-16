export type NivelZoom = 'macro' | 'etapas' | 'micro'

/** Escalas em px por dia. Fronteiras com histerese pra não piscar de nível. */
export const ZOOM = { MACRO_ENTRA: 9, MACRO_SAI: 12, MICRO_ENTRA: 90, MICRO_SAI: 70, K_MAX: 400, FRACAO_MIN: 0.6 } as const

/** Margens horizontais da pista dentro do SVG (px). */
export const MARGENS = { ESQ: 30, DIR: 90 } as const

export function nivelDeZoom(k: number, atual: NivelZoom): NivelZoom {
  if (atual === 'macro') return k > ZOOM.MACRO_SAI ? (k > ZOOM.MICRO_ENTRA ? 'micro' : 'etapas') : 'macro'
  if (atual === 'micro') return k < ZOOM.MICRO_SAI ? (k < ZOOM.MACRO_ENTRA ? 'macro' : 'etapas') : 'micro'
  if (k < ZOOM.MACRO_ENTRA) return 'macro'
  if (k > ZOOM.MICRO_ENTRA) return 'micro'
  return 'etapas'
}

/** k que faz o deal inteiro caber na largura útil do viewport. */
export function kAjuste(diasTotal: number, larguraPx: number): number {
  const util = Math.max(100, larguraPx - MARGENS.ESQ - MARGENS.DIR)
  return util / Math.max(1, diasTotal)
}

/** k entre 60% do ajuste (não deixa o deal virar um pontinho) e K_MAX. */
export function clampK(k: number, kAjustado: number): number {
  return Math.min(ZOOM.K_MAX, Math.max(kAjustado * ZOOM.FRACAO_MIN, k))
}

/** x0 (deslocamento em px) sem deixar a pista sair da tela. */
export function clampX0(x0: number, larguraConteudo: number, larguraViewport: number): number {
  const max = Math.max(0, larguraConteudo - larguraViewport)
  return Math.min(max, Math.max(0, x0))
}
