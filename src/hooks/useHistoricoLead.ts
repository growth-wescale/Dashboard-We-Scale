import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { emailValido, normalizarEmail, type BloqueioLogRow, type ConversaoLead, type NegocioLeadRow } from '@/lib/distribuicao/bloqueio'

// Tudo o que se sabe de um e-mail: conversões que chegaram na distribuição (desde 16/10/2026),
// negócios dele no RD CRM (espelho) e o histórico de bloqueio. Descarta resposta de um e-mail
// que já não é o ativo (trocar de lead rápido não deixa dado do anterior na tela).

export interface HistoricoLead {
  conversoes: ConversaoLead[]
  negocios: NegocioLeadRow[]
  log: BloqueioLogRow[]
}

const VAZIO: HistoricoLead = { conversoes: [], negocios: [], log: [] }

export function useHistoricoLead(email: string | null) {
  const alvo = email && emailValido(email) ? normalizarEmail(email) : null
  const [dados, setDados] = useState<HistoricoLead>(VAZIO)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ativo = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    ativo.current = alvo
    if (!alvo) { setDados(VAZIO); setError(null); setLoading(false); return }
    setLoading(true)
    const [conv, neg, log] = await Promise.all([
      supabaseVendas.from('vw_distribuicao_atribuicoes')
        .select('id, recebido_em, marca, resultado, motivo, nome_sdr, id_deal, lead_nome')
        .eq('lead_email', alvo).order('recebido_em', { ascending: false }).order('id', { ascending: false }).limit(500),
      supabaseVendas.from('vw_distribuicao_lead_negocios').select('*').eq('email', alvo).order('id_deal').limit(200),
      supabaseVendas.from('vw_distribuicao_bloqueio_log').select('*').eq('email', alvo).order('em', { ascending: false }).order('id', { ascending: false }),
    ])
    if (ativo.current !== alvo) return // resposta de um e-mail anterior
    const erro = [conv, neg, log].find(r => r.error)?.error?.message ?? null
    setError(erro)
    setDados(erro ? VAZIO : {
      conversoes: (conv.data ?? []) as ConversaoLead[],
      negocios: (neg.data ?? []) as NegocioLeadRow[],
      log: (log.data ?? []) as BloqueioLogRow[],
    })
    setLoading(false)
  }, [alvo])

  useEffect(() => { carregar().catch(() => {}) }, [carregar])

  return { ...dados, email: alvo, loading, error, refetch: carregar }
}
