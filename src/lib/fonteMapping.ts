/**
 * Normalização da sub-fonte (utm_source).
 *
 * O utm_source vem sujo do RD: Meta aparece como 'meta', 'ig', 'facebook',
 * 'instagram' e 'fb'; Google como 'google' e 'adwords'; e há template de UTM
 * que nunca foi substituído ('{{site_source_name}}'). Sem agrupar, o filtro de
 * Sub-Fonte vira uma lista de 20+ opções com a mesma origem repartida.
 *
 * Regra: valor desconhecido cai em 'Outros' — nunca é descartado silenciosamente.
 * Ao descobrir um utm_source novo e relevante, adicione ao grupo certo aqui.
 */

export const SUB_FONTE_GRUPOS = [
  'Meta',
  'Google',
  'Evento',
  'Landing Page',
  'Outros',
  'Não identificado',
] as const

export type SubFonteGrupo = (typeof SUB_FONTE_GRUPOS)[number]

/** utm_source cru (minúsculo, sem espaços) -> grupo canônico. */
const MAPA: Record<string, SubFonteGrupo> = {
  // Meta
  meta: 'Meta',
  ig: 'Meta',
  fb: 'Meta',
  facebook: 'Meta',
  instagram: 'Meta',
  an: 'Meta', // audience network
  'forms nativo meta': 'Meta',
  facebookluizti: 'Meta',
  // Google
  google: 'Google',
  adwords: 'Google',
  // Evento presencial
  evento: 'Evento',
  'lp-evento': 'Evento',
  qrcode: 'Evento',
  // Landing pages próprias
  'landing-page-viva': 'Landing Page',
  'inpot-landing': 'Landing Page',
}

/** Valores que significam "não sabemos", incluindo macro de UTM não resolvida. */
const VAZIOS = new Set(['', '{{site_source_name}}', 'null', 'undefined', 'desconhecido'])

/**
 * Grupo canônico da sub-fonte a partir do `utm_source`.
 *
 * Fallback (pedido do Junior, 31/08): quando o `utm_source` está vazio ou é um
 * template de UTM não resolvido, usa o campo "Sub-Fonte" do RD CRM
 * (`subFonteCrm`, vindo de `payload->>'Sub-Fonte'`) — CRU, sem agrupar, porque
 * são nomes de lista/evento/repasse ("Feira de Franquias 2026", "Busca
 * Orgânica", "SBC Repasse") que não mapeiam nos grupos de tráfego. Só quando
 * nem isso existe é que cai em "Não identificado".
 *
 * O retorno deixou de ser a união fechada `SubFonteGrupo` por causa desses
 * valores livres do RD.
 */
export function normalizeSubFonte(
  utmSource: string | null | undefined,
  subFonteCrm?: string | null,
): string {
  const raw = (utmSource ?? '').trim().toLowerCase()
  if (VAZIOS.has(raw)) {
    const crm = (subFonteCrm ?? '').trim()
    return crm || 'Não identificado'
  }
  return MAPA[raw] ?? 'Outros'
}

/**
 * Normalização da fonte macro (classificação de negócio do CRM).
 *
 * O campo "Fonte Macro" no RD é texto livre — parte dos deals foi escrita como
 * 'INBOUND' (caixa alta) por um processo antigo, o resto como 'Inbound'. Sem
 * normalizar, viram duas opções separadas no filtro e a contagem de Inbound
 * fica dividida entre elas. Corrige só a exibição; o valor no RD fica como está.
 */
const FONTE_MACRO_CANONICA = [
  'Inbound',
  'Resgate',
  'Prospecção Ativa',
  'Evento',
  'Outro CRM',
  'Indicação',
] as const

export function normalizeFonteMacro(fonteMacro: string | null | undefined): string {
  const raw = (fonteMacro ?? '').trim()
  if (!raw) return 'Sem Classificação'
  const canonica = FONTE_MACRO_CANONICA.find(v => v.toLowerCase() === raw.toLowerCase())
  return canonica ?? raw
}
