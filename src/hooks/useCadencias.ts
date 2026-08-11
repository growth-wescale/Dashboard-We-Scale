import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Fluxo, Motivo, Touchpoint, MarcaContexto, PendenciaGlobal, StatusHistorico, StatusExecucao
} from '@/lib/types'

interface UseCadenciasResult {
  fluxos: Fluxo[]
  motivos: Motivo[]
  touchpoints: Touchpoint[]
  marcaContexto: MarcaContexto[]
  pendencias: PendenciaGlobal[]
  loading: boolean
  error: string | null
  updateStatus: (tpId: string, novoStatus: StatusExecucao) => Promise<{ ok: boolean; error?: string }>
  updateCopy: (tpId: string, copyAtual: string) => Promise<{ ok: boolean; error?: string }>
  fetchHistorico: (tpId: string) => Promise<StatusHistorico[]>
  reload: () => void
}

export function useCadencias(): UseCadenciasResult {
  const [fluxos, setFluxos] = useState<Fluxo[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([])
  const [marcaContexto, setMarcaContexto] = useState<MarcaContexto[]>([])
  const [pendencias, setPendencias] = useState<PendenciaGlobal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false

    async function fetchAll(showLoading = true) {
      if (showLoading) setLoading(true)
      setError(null)

      const [fRes, mRes, tRes, cRes, pRes] = await Promise.all([
        supabase.from('fluxos').select('*').order('ordem'),
        supabase.from('motivos').select('*').order('ordem'),
        supabase.from('touchpoints').select('*').order('ordem'),
        supabase.from('marca_contexto').select('*'),
        supabase.from('pendencias_globais').select('*'),
      ])

      if (cancelled) return

      const err = fRes.error || mRes.error || tRes.error || cRes.error || pRes.error
      if (err) { setError(err.message); setLoading(false); return }

      setFluxos((fRes.data ?? []) as Fluxo[])
      setMotivos((mRes.data ?? []) as Motivo[])
      setTouchpoints((tRes.data ?? []) as Touchpoint[])
      setMarcaContexto((cRes.data ?? []) as MarcaContexto[])
      setPendencias((pRes.data ?? []) as PendenciaGlobal[])
      setLoading(false)
    }

    fetchAll()

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [tick])

  async function updateStatus(tpId: string, novoStatus: StatusExecucao): Promise<{ ok: boolean; error?: string }> {
    const tp = touchpoints.find(t => t.id === tpId)
    if (!tp) return { ok: false, error: 'Touchpoint não encontrado' }

    const { error } = await supabase
      .from('touchpoints')
      .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
      .eq('id', tpId)

    if (error) {
      setError(`Erro ao salvar status: ${error.message}`)
      return { ok: false, error: error.message }
    }

    await supabase.from('status_historico').insert({
      touchpoint_id: tpId,
      status_anterior: tp.status,
      status_novo: novoStatus,
    })

    setTouchpoints(prev =>
      prev.map(t => t.id === tpId ? { ...t, status: novoStatus } : t)
    )
    return { ok: true }
  }

  async function updateCopy(tpId: string, copyAtual: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase
      .from('touchpoints')
      .update({ copy_atual: copyAtual, atualizado_em: new Date().toISOString() })
      .eq('id', tpId)

    if (error) {
      setError(`Erro ao salvar copy: ${error.message}`)
      return { ok: false, error: error.message }
    }

    setTouchpoints(prev =>
      prev.map(t => t.id === tpId ? { ...t, copy_atual: copyAtual } : t)
    )
    return { ok: true }
  }

  async function fetchHistorico(tpId: string): Promise<StatusHistorico[]> {
    const { data, error } = await supabase
      .from('status_historico')
      .select('*')
      .eq('touchpoint_id', tpId)
      .order('mudado_em', { ascending: false })
      .limit(20)

    if (error) return []
    return (data ?? []) as StatusHistorico[]
  }

  return { fluxos, motivos, touchpoints, marcaContexto, pendencias, loading, error, updateStatus, updateCopy, fetchHistorico, reload }
}
