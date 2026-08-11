// Mapeamento das frentes dentro da marca Inpot (Franquia · Evento · Visão Geral).
// Segue o padrão de oralUnicMapping.ts.

// ─── Mídia (media_daily_raw.campanha) ────────────────────────────────────

// EVT: campanha de evento presencial. Padrão observado:
//   - WSL nomenclatura tem "| EVT |" no meio (ex: "16 - WSL | EVT | INP | ALL | ...")
//   - Nome final costuma incluir "Evento Inpot"
//   - Prefixo explícito [EVT] também aceito
export function isMediaEventoInpot(campanha: string | null): boolean {
  const c = (campanha ?? '').toUpperCase()
  if (c.includes('| EVT |') || c.includes('|EVT|')) return true
  if (c.includes('[EVT]')) return true
  if (c.includes('EVENTO INPOT')) return true
  return false
}

// FRANQUIA: default do Inpot (perpetuo, funil de leads, search etc.).
// Tudo que não é evento cai aqui.
export function isMediaFranquiaInpot(campanha: string | null): boolean {
  return !isMediaEventoInpot(campanha)
}

// ─── Leads (leads.dados_extras.evento) ───────────────────────────────────

// Lead veio do webhook do evento (marcador dados_extras.evento não vazio).
export function isLeadEventoInpot(lead: { dados_extras: Record<string, unknown> | null }): boolean {
  const ev = lead.dados_extras?.['evento']
  return typeof ev === 'string' && ev.trim() !== ''
}

// ─── CRM (vw_marketing_funil.fonte / fonte_macro) ────────────────────────

// Deal do CRM veio do evento (fonte ou fonte_macro contém "EVENTO").
export function isCrmEventoInpot(row: { fonte?: string | null; fonte_macro?: string | null }): boolean {
  const f  = (row.fonte ?? '').toUpperCase()
  const fm = (row.fonte_macro ?? '').toUpperCase()
  return f.includes('EVENTO') || fm.includes('EVENTO')
}
