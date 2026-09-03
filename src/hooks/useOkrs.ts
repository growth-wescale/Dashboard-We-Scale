import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * OKRs H2 2026 — objetivos & resultados-chave do time de Marketing.
 * Consumido pela página `/okrs` (Meta & OKRs).
 *
 * Persistência: tabela `okrs_h2` no Supabase de **Marketing**
 * (`jmuluoksnlqrvzbcltim`). Enquanto Gabriel não roda o SQL de criação,
 * o hook devolve dados iniciais mockados (mesmos valores dos slides
 * apresentados). Quando a tabela existir, `USE_MOCK` vira `false`.
 */

// Tabela `okrs_h2` criada em 01/09/2026 no Supabase de Marketing
// (jmuluoksnlqrvzbcltim) via MCP. Persistência ativa.
const USE_MOCK = false

export interface Okr {
  id: string                    // slug único
  titulo: string
  descricao: string | null
  valorMeta: number
  valorAtual: number
  unidade: 'pct' | 'moeda' | 'numero'
  direcao: 'aumentar' | 'reduzir' // aumentar: quanto maior melhor; reduzir: quanto menor melhor
  atualizadoEm?: string
  atualizadoPor?: string | null
}

/** Snapshot inicial baseado nos slides mostrados pelo time. */
const MOCK_OKRS: Okr[] = [
  {
    id: 'meta_1_owned_mql',
    titulo: '5% dos MQLs vindos de canais owned',
    descricao: '5% de todos os MQLs por mês via e-mail + ManyChat',
    valorMeta: 5,
    valorAtual: 0,
    unidade: 'pct',
    direcao: 'aumentar',
  },
  {
    id: 'meta_2_cp_mql',
    titulo: 'Reduzir o CP-MQL agregado em 20%',
    descricao: 'Custo por MQL agregado, -20% no semestre',
    valorMeta: 99.11,
    valorAtual: 164,
    unidade: 'moeda',
    direcao: 'reduzir',
  },
]

interface RawRow {
  id: string
  titulo: string
  descricao: string | null
  valor_meta: number
  valor_atual: number
  unidade: string
  direcao: string
  atualizado_em?: string
  atualizado_por?: string | null
}

function toOkr(r: RawRow): Okr {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    valorMeta: Number(r.valor_meta) || 0,
    valorAtual: Number(r.valor_atual) || 0,
    unidade: (r.unidade as Okr['unidade']) || 'numero',
    direcao: (r.direcao as Okr['direcao']) || 'aumentar',
    atualizadoEm: r.atualizado_em,
    atualizadoPor: r.atualizado_por,
  }
}

export interface UseOkrsResult {
  okrs: Okr[]
  loading: boolean
  error: string | null
  reload: () => void
  mocked: boolean
}

export function useOkrs(): UseOkrsResult {
  const [okrs, setOkrs] = useState<Okr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    if (USE_MOCK) {
      setOkrs(MOCK_OKRS)
      setLoading(false)
      return
    }

    const { data, error: err } = await supabase
      .from('okrs_h2')
      .select('id, titulo, descricao, valor_meta, valor_atual, unidade, direcao, atualizado_em, atualizado_por')
      .order('id')
    if (err) { setError(err.message); setLoading(false); return }
    setOkrs(((data ?? []) as RawRow[]).map(toOkr))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const stable = useMemo(() => okrs, [okrs])
  return { okrs: stable, loading, error, reload: () => fetchAll(true), mocked: USE_MOCK }
}

/**
 * Atualiza o `valor_atual` de uma OKR. Em modo mock, apenas simula sucesso.
 * Quando a tabela existir, faz UPDATE persistente.
 */
export async function updateOkrValor(input: {
  id: string
  valorAtual: number
  atualizadoPor?: string | null
}): Promise<{ ok: boolean; error: string | null; mocked: boolean }> {
  if (USE_MOCK) {
    return { ok: true, error: null, mocked: true }
  }

  const { error } = await supabase
    .from('okrs_h2')
    .update({
      valor_atual: input.valorAtual,
      atualizado_por: input.atualizadoPor ?? null,
    })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message, mocked: false }
  return { ok: true, error: null, mocked: false }
}

export { USE_MOCK }
