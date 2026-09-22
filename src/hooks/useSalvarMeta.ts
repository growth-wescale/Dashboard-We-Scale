import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { DiaSemana, EtapaMeta, LinhaEspelho, Semana } from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMesMarca } from './useMetaMes'

const GRAVAR_META_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-meta`

async function chamarGravarMeta(body: Record<string, unknown>): Promise<{ ok: boolean; error: string | null; data: Record<string, unknown> | null }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa', data: null }

  const resp = await fetch(GRAVAR_META_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await resp.json().catch(() => null)
  if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}`, data: null }
  return { ok: true, error: null, data: json }
}

export interface PublicarVersaoInput {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  linhasEspelho: LinhaEspelho[]
  rotulo: string
  motivo: string
  /** true = a versão nova já passa a valer no dashboard. */
  ativar: boolean
}

/** Publica a PRÓXIMA versão do mês (V1, V2…). Nunca altera uma versão existente. */
export async function publicarVersao(input: PublicarVersaoInput): Promise<{ ok: boolean; error: string | null; numero: number | null }> {
  const r = await chamarGravarMeta({
    acao: 'publicar',
    mesReferencia: input.mesReferencia,
    diaViradaSemana: input.diaViradaSemana,
    semanas: input.semanas,
    marcas: input.marcas.map(m => ({
      marca: m.marca, ticketMedio: m.ticketMedio,
      etapas: m.etapas, pessoas: m.pessoas,
    })),
    distribuicaoSemanal: input.distribuicaoSemanal,
    linhasEspelho: input.linhasEspelho,
    rotulo: input.rotulo,
    motivo: input.motivo,
    ativar: input.ativar,
  })
  return { ok: r.ok, error: r.error, numero: typeof r.data?.numero === 'number' ? r.data.numero : null }
}

/** Troca a versão ativa do mês — o dashboard passa a medir o time por ela. */
export async function ativarVersao(versaoId: number): Promise<{ ok: boolean; error: string | null }> {
  const r = await chamarGravarMeta({ acao: 'ativar', versaoId })
  return { ok: r.ok, error: r.error }
}

/** Sugestão de taxa pro Passo 2 (D10): a taxa da versão ATIVA do mês anterior
 *  pra essa marca/etapa, se existir. Leitura direta — RLS já permite SELECT. */
export function useTaxaMesAnterior(mesAnterior: string, marca: string, etapa: EtapaMeta) {
  const [taxa, setTaxa] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabaseVendas
        .from('meta_marca_etapa')
        .select('taxa, meta_marca!inner(marca, mes_referencia, meta_versao!inner(ativa))')
        .eq('etapa', etapa)
        .eq('meta_marca.marca', marca)
        .eq('meta_marca.mes_referencia', mesAnterior)
        .eq('meta_marca.meta_versao.ativa', true)
        .maybeSingle()
      setTaxa((data as any)?.taxa != null ? Number((data as any).taxa) : null)
      setLoading(false)
    })()
  }, [mesAnterior, marca, etapa])

  return { taxa, loading }
}
