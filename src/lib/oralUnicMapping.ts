// Mapeamento das 3 frentes dentro da conta de mídia Oral Unic
// (usado em SaudeDaMarca, EsteiraOralUnic e SopMarketing)

// LEGACY: Comunidade (prefixos [LEGACY] e [CMD])
export function isMediaLegacy(campanha: string | null): boolean {
  const c = (campanha ?? '').toUpperCase()
  return c.includes('[LEGACY]') || c.includes('LEGACY]') || c.includes('[LEGACY') || c.includes('[CMD]')
}

// ODL: Odonto Legacy/Consultoria (ex-Odonto Scale)
export function isMediaOdontoLegacy(campanha: string | null): boolean {
  const c = (campanha ?? '').toUpperCase().trim()
  if (c.includes('[ODL]') || c.startsWith('OS ') || c.startsWith('[OS]') || c.startsWith('OS-') || c.startsWith('OS_')) return true
  // Google Ads mapeadas manualmente (destino odonto-scale / consultoria Legacy)
  if (c.includes('[SEARCH] INTENÇÃO - DEFESA DE MARCA')) return true
  if (c.includes('[SEARCH] INTENÇÃO - GESTÃO')) return true
  return false
}

// V4: campanhas da conta compartilhada da V4 Company (prefixo [V4])
export function isMediaV4(campanha: string | null): boolean {
  return (campanha ?? '').toUpperCase().includes('[V4]')
}

// OUF: Franquia (default se não é Legacy nem ODL nem V4, ou prefixo explícito [OUF])
export function isMediaFranquia(campanha: string | null): boolean {
  const c = (campanha ?? '').toUpperCase()
  if (c.includes('[OUF]')) return true
  return !isMediaLegacy(campanha) && !isMediaOdontoLegacy(campanha) && !isMediaV4(campanha)
}

// Estratégias descontinuadas — mostradas separadamente
export function isPausedStrategy(campanha: string | null, conjunto: string | null): boolean {
  const c = (campanha ?? '').toUpperCase()
  const s = (conjunto ?? '').toUpperCase().trim()
  if (c.includes('COMPRA DIRETA') || c.includes('HOTMART')) return true
  if ((c.includes('[LEGACY]') || c.includes('[CMD]')) && s.startsWith('ISCA')) return true
  return false
}
