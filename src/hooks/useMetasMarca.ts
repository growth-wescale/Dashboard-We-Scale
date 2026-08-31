import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

/**
 * Metas mensais por marca de franquia. Consumido pela página Campanha de Metas
 * (`/gp-setembro`). Realizado vem de `vw_funil_vendas` — este hook cuida só da meta.
 *
 * Estado atual (2026-08-31): tabela `DB_Metas_Marca` ainda não foi criada no
 * Supabase Expansão. Enquanto Junior/time de vendas não roda o SQL de criação
 * + popular, o hook devolve dados mockados extraídos direto da planilha
 * `Meta - Venda de Franquia.xlsx`. Quando a tabela existir, `USE_MOCK` vira
 * `false` e passa a consultar o banco. Assinatura pública não muda.
 */

// Flip para `false` quando `DB_Metas_Marca` existir no banco.
const USE_MOCK = true

export interface MetaMarca {
  marca: string
  mesReferencia: string   // 'YYYY-MM-01'
  metaQtd: number
  metaFaturamento: number
  taxaPadrao: number | null
  atualizadoEm?: string
  atualizadoPor?: string | null
}

export interface UseMetasMarcaResult {
  metas: MetaMarca[]
  loading: boolean
  error: string | null
  reload: () => void
}

// Ordem canônica das marcas na aba Franquia da planilha
export const MARCAS_FRANQUIA = ['Oral Unic', 'Lisô Laser', 'Inpot', 'B2Case', 'Viva', 'Eletrovias'] as const

// Dados exatos da planilha `Meta - Venda de Franquia.xlsx` (aba Franquia), set-dez 2026.
// Fica só como fallback enquanto a tabela DB_Metas_Marca não existe.
const MOCK_METAS: MetaMarca[] = [
  { marca: 'Oral Unic',  mesReferencia: '2026-09-01', metaQtd: 2, metaFaturamento: 149800, taxaPadrao: 74900 },
  { marca: 'Oral Unic',  mesReferencia: '2026-10-01', metaQtd: 0, metaFaturamento:      0, taxaPadrao: 74900 },
  { marca: 'Oral Unic',  mesReferencia: '2026-11-01', metaQtd: 2, metaFaturamento: 149800, taxaPadrao: 74900 },
  { marca: 'Oral Unic',  mesReferencia: '2026-12-01', metaQtd: 1, metaFaturamento:  74900, taxaPadrao: 74900 },
  { marca: 'Lisô Laser', mesReferencia: '2026-09-01', metaQtd: 2, metaFaturamento:  79800, taxaPadrao: 39900 },
  { marca: 'Lisô Laser', mesReferencia: '2026-10-01', metaQtd: 1, metaFaturamento:  39900, taxaPadrao: 39900 },
  { marca: 'Lisô Laser', mesReferencia: '2026-11-01', metaQtd: 1, metaFaturamento:  39900, taxaPadrao: 39900 },
  { marca: 'Lisô Laser', mesReferencia: '2026-12-01', metaQtd: 0, metaFaturamento:      0, taxaPadrao: 39900 },
  { marca: 'Inpot',      mesReferencia: '2026-09-01', metaQtd: 3, metaFaturamento: 224700, taxaPadrao: 74900 },
  { marca: 'Inpot',      mesReferencia: '2026-10-01', metaQtd: 2, metaFaturamento: 149800, taxaPadrao: 74900 },
  { marca: 'Inpot',      mesReferencia: '2026-11-01', metaQtd: 3, metaFaturamento: 224700, taxaPadrao: 74900 },
  { marca: 'Inpot',      mesReferencia: '2026-12-01', metaQtd: 1, metaFaturamento:  74900, taxaPadrao: 74900 },
  { marca: 'B2Case',     mesReferencia: '2026-09-01', metaQtd: 4, metaFaturamento:  40000, taxaPadrao: 10000 },
  { marca: 'B2Case',     mesReferencia: '2026-10-01', metaQtd: 3, metaFaturamento:  30000, taxaPadrao: 10000 },
  { marca: 'B2Case',     mesReferencia: '2026-11-01', metaQtd: 4, metaFaturamento:  40000, taxaPadrao: 10000 },
  { marca: 'B2Case',     mesReferencia: '2026-12-01', metaQtd: 4, metaFaturamento:  40000, taxaPadrao: 10000 },
  { marca: 'Viva',       mesReferencia: '2026-09-01', metaQtd: 1, metaFaturamento:  69900, taxaPadrao: 69900 },
  { marca: 'Viva',       mesReferencia: '2026-10-01', metaQtd: 0, metaFaturamento:      0, taxaPadrao: 69900 },
  { marca: 'Viva',       mesReferencia: '2026-11-01', metaQtd: 1, metaFaturamento:  69900, taxaPadrao: 69900 },
  { marca: 'Viva',       mesReferencia: '2026-12-01', metaQtd: 0, metaFaturamento:      0, taxaPadrao: 69900 },
  { marca: 'Eletrovias', mesReferencia: '2026-09-01', metaQtd: 4, metaFaturamento: 159600, taxaPadrao: 39900 },
  { marca: 'Eletrovias', mesReferencia: '2026-10-01', metaQtd: 2, metaFaturamento:  79800, taxaPadrao: 39900 },
  { marca: 'Eletrovias', mesReferencia: '2026-11-01', metaQtd: 4, metaFaturamento: 159600, taxaPadrao: 39900 },
  { marca: 'Eletrovias', mesReferencia: '2026-12-01', metaQtd: 3, metaFaturamento: 119700, taxaPadrao: 39900 },
]

interface RawRow {
  marca: string
  mes_referencia: string
  meta_qtd: number
  meta_faturamento: number
  taxa_padrao: number | null
  atualizado_em?: string
  atualizado_por?: string | null
}

function toMetaMarca(r: RawRow): MetaMarca {
  return {
    marca: r.marca,
    mesReferencia: r.mes_referencia,
    metaQtd: Number(r.meta_qtd) || 0,
    metaFaturamento: Number(r.meta_faturamento) || 0,
    taxaPadrao: r.taxa_padrao != null ? Number(r.taxa_padrao) : null,
    atualizadoEm: r.atualizado_em,
    atualizadoPor: r.atualizado_por,
  }
}

/** Lê metas de todos os meses (ou de um mês específico). */
export function useMetasMarca(mesFiltro?: string): UseMetasMarcaResult {
  const [metas, setMetas] = useState<MetaMarca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    if (USE_MOCK) {
      const filtered = mesFiltro ? MOCK_METAS.filter(m => m.mesReferencia === mesFiltro) : MOCK_METAS
      setMetas(filtered)
      setLoading(false)
      return
    }

    let q = supabaseVendas
      .from('DB_Metas_Marca')
      .select('marca, mes_referencia, meta_qtd, meta_faturamento, taxa_padrao, atualizado_em, atualizado_por')
    if (mesFiltro) q = q.eq('mes_referencia', mesFiltro)
    const { data, error: err } = await q
    if (err) { setError(err.message); setLoading(false); return }
    setMetas(((data ?? []) as RawRow[]).map(toMetaMarca))
    setLoading(false)
  }, [mesFiltro])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    return () => { cancelled = true; window.removeEventListener('dashboard:refresh', handleRefresh) }
  }, [fetchAll])

  const stable = useMemo(() => metas, [metas])
  return { metas: stable, loading, error, reload: () => fetchAll(true) }
}

/**
 * Faz upsert em `DB_Metas_Marca`. Retorna { ok, error }. Enquanto USE_MOCK for
 * true, apenas simula sucesso — nada persiste. UI mostra aviso "modo mock".
 */
export async function upsertMetaMarca(input: {
  marca: string
  mesReferencia: string
  metaQtd: number
  metaFaturamento: number
  taxaPadrao?: number | null
  atualizadoPor?: string | null
}): Promise<{ ok: boolean; error: string | null; mocked: boolean }> {
  if (USE_MOCK) {
    return { ok: true, error: null, mocked: true }
  }

  const { error } = await supabaseVendas
    .from('DB_Metas_Marca')
    .upsert(
      {
        marca: input.marca,
        mes_referencia: input.mesReferencia,
        meta_qtd: input.metaQtd,
        meta_faturamento: input.metaFaturamento,
        taxa_padrao: input.taxaPadrao ?? null,
        atualizado_por: input.atualizadoPor ?? null,
      },
      { onConflict: 'marca,mes_referencia' },
    )
  if (error) return { ok: false, error: error.message, mocked: false }
  return { ok: true, error: null, mocked: false }
}

export { USE_MOCK }
