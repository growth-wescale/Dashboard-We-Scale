import { useConsultaFiltrada } from './useConsultaFiltrada'
import { supabase } from '@/lib/supabase'

export interface ParticipantePartner { dia: string; participante: string; valor: number }

async function carregar(signal: AbortSignal): Promise<ParticipantePartner[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Entre novamente para consultar os participantes.')
  const res = await fetch('/api/partner-ouro/v1/read', { method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset: 'participantesEvento', route: '/sop-marketing' }) })
  if (!res.ok) throw new Error('Lista de participantes indisponível.')
  const data = await res.json()
  if (data.contract !== 'partner_evento_stripe_v1' || !Array.isArray(data.rows) ||
    !data.rows.every((r: ParticipantePartner) => r.participante && /^\d{4}-\d{2}-\d{2}$/.test(r.dia) && Number.isFinite(r.valor))) {
    throw new Error('Lista de participantes incompleta.')
  }
  return data.rows
}

export function useParticipantesPartner(enabled: boolean) {
  return useConsultaFiltrada('sop:partner-participantes-stripe', carregar, enabled)
}
