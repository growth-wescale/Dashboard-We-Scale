import { useEffect, useState, useCallback } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { todayLocal } from '@/lib/dateUtils'

// Aviso configurável exibido no topo das páginas de vendas.
// Fonte: tabela dashboard_notices no banco de Expansão (policy pública de leitura).
export interface DashboardNotice {
  id: number
  ativo: boolean
  data_inicio: string | null   // 'YYYY-MM-DD'
  data_fim: string | null      // 'YYYY-MM-DD' (null = sem data-fim)
  mostrar_banner: boolean
  mostrar_popup: boolean
  popup_dispensavel: boolean | null
  titulo: string | null
  mensagem: string | null
  cor_fundo: string | null
  cor_texto: string | null
}

interface UseResult {
  notice: DashboardNotice | null   // Notice ativa mais recente (ou null se nenhuma)
  loading: boolean
  error: string | null
}

function isWithinRange(n: DashboardNotice, today: string): boolean {
  if (n.data_inicio && today < n.data_inicio) return false
  if (n.data_fim    && today > n.data_fim)    return false
  return true
}

async function fetchActive(): Promise<{ notice: DashboardNotice | null; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('dashboard_notices')
    .select('id, ativo, data_inicio, data_fim, mostrar_banner, mostrar_popup, popup_dispensavel, titulo, mensagem, cor_fundo, cor_texto')
    .eq('ativo', true)
    .order('atualizado_em', { ascending: false })
    .limit(5)

  if (error) return { notice: null, error: error.message }
  const today = todayLocal()
  const rows = (data ?? []) as DashboardNotice[]
  const active = rows.find(r => isWithinRange(r, today)) ?? null
  return { notice: active, error: null }
}

export function useDashboardNotice(): UseResult {
  const [notice, setNotice] = useState<DashboardNotice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { notice: n, error: err } = await fetchActive()
    if (err) { setError(err); setLoading(false); return }
    setNotice(n)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    // Notices mudam pouco; check a cada 5 min
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [fetchAll])

  return { notice, loading, error }
}
