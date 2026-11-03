import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from './types'
import { toLocalDate } from './dateUtils'
import vinculos from './inpotVinculosOutubro.json'

async function hashIdentificador(id: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

const auditados: Record<string, string> = vinculos

// Vínculos de outubro confirmados por e-mail e telefone do mesmo contato,
// com uma única negociação criada na mesma data em Brasília. A fonte continua viva no CRM.
export async function vinculosInpot(db: SupabaseClient, rows: Lead[], signal: AbortSignal) {
  const registros = new Map<string, { id: string; dia: string }>()
  for (const row of rows) {
    if (row.marca !== 'Inpot' || !row.dia?.startsWith('2026-10-')) continue
    const chave = auditados[await hashIdentificador(row.id + '|' + row.dia)]
    if (chave) registros.set(chave, row)
  }
  const ids = new Map<string, string>()
  if (!registros.size) return ids
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('vw_funil_vendas').select('id_lead,data_criacao_original')
      .eq('marca', 'Inpot').eq('eh_ciclo_atual', true)
      .gte('data_criacao_original', '2026-10-01T00:00:00-03:00')
      .lt('data_criacao_original', '2026-11-01T00:00:00-03:00')
      .order('id_lead').range(offset, offset + 499).abortSignal(signal)
    signal.throwIfAborted()
    if (error || !data) throw new Error(error?.message || 'Falha ao consultar os vínculos de Inpot.')
    for (const deal of data) {
      const row = registros.get(await hashIdentificador(deal.id_lead))
      if (row && row.dia === toLocalDate(deal.data_criacao_original)) ids.set(row.id, deal.id_lead)
    }
    if (data.length < 500) return ids
  }
}
