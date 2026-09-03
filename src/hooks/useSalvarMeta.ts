import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { DiaSemana, EtapaMeta, LinhaEspelho, Semana } from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMesMarca } from './useMetaMes'

const GRAVAR_META_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-meta`

interface SalvarMetaInput {
  acao: 'salvar_rascunho' | 'publicar'
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  linhasEspelho: LinhaEspelho[]
}

export async function salvarMeta(input: SalvarMetaInput): Promise<{ ok: boolean; error: string | null }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa' }

  const resp = await fetch(GRAVAR_META_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      acao: input.acao,
      mesReferencia: input.mesReferencia,
      diaViradaSemana: input.diaViradaSemana,
      semanas: input.semanas,
      marcas: input.marcas.map(m => ({
        marca: m.marca, ticketMedio: m.ticketMedio,
        etapas: m.etapas, pessoas: m.pessoas,
      })),
      distribuicaoSemanal: input.distribuicaoSemanal,
      linhasEspelho: input.acao === 'publicar' ? input.linhasEspelho : [],
      autor: null, // D6 — sem controle de permissão ainda; a Edge Function já grava o e-mail da sessão
    }),
  })

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    return { ok: false, error: body.error ?? `HTTP ${resp.status}` }
  }
  return { ok: true, error: null }
}

/** Sugestão de taxa pro Passo 2 (D10): a taxa que o mês anterior publicou pra
 *  essa marca/etapa, se existir. Leitura direta — RLS já permite SELECT. */
export function useTaxaMesAnterior(mesAnterior: string, marca: string, etapa: EtapaMeta) {
  const [taxa, setTaxa] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabaseVendas
        .from('meta_marca_etapa')
        .select('taxa, meta_marca!inner(marca, mes_referencia)')
        .eq('etapa', etapa)
        .eq('meta_marca.marca', marca)
        .eq('meta_marca.mes_referencia', mesAnterior)
        .maybeSingle()
      setTaxa((data as any)?.taxa ?? null)
      setLoading(false)
    })()
  }, [mesAnterior, marca, etapa])

  return { taxa, loading }
}
