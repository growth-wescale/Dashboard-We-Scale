import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { AtribuicaoRow, DisponibilidadeRow, PainelMarca, RegraRow } from '@/lib/distribuicao/regras'

// Leitura da aba Distribuição de Leads. Só views (supabaseVendas é anon; as tabelas têm RLS
// sem policy). Escrita é só por gravar-distribuicao (useGravarDistribuicao).

export interface SaudeMarca {
  marca: string
  marca_rd: string
  modo: 'desligado' | 'sombra' | 'ativo'
  ultimo_recebido_em: string | null
  erros_pendentes: number
  deals_rd_sem_registro_24h: number | null
  /** atribuido/fallback sem id_deal há mais de 5 min: o POST no RD não fechou; reprocessar. */
  presos_sem_deal: number
}

export interface CampoVisto { marca: string; chave: string; valores: string[] | null; ultima_vez: string; ocorrencias: number }

export interface PessoaRd { nome: string; cargo: string; ativo: boolean; user_id: string | null }

export interface DadosDistribuicao {
  painel: PainelMarca[]
  regras: RegraRow[]
  atribuicoes: AtribuicaoRow[]
  disponibilidade: DisponibilidadeRow[]
  saude: SaudeMarca[]
  camposVistos: CampoVisto[]
  pessoas: PessoaRd[]
}

const VAZIO: DadosDistribuicao = { painel: [], regras: [], atribuicoes: [], disponibilidade: [], saude: [], camposVistos: [], pessoas: [] }
const LIMITE_LOG = 500

async function buscar(): Promise<{ dados: DadosDistribuicao; error: string | null }> {
  const [painel, regras, atribuicoes, disponibilidade, saude, campos, pessoas] = await Promise.all([
    supabaseVendas.from('vw_distribuicao_painel').select('*').order('marca').order('nome_sdr'),
    supabaseVendas.from('vw_distribuicao_regras').select('*').order('marca').order('versao', { ascending: false }),
    supabaseVendas.from('vw_distribuicao_atribuicoes').select('*').order('recebido_em', { ascending: false }).limit(LIMITE_LOG),
    supabaseVendas.from('vw_distribuicao_disponibilidade').select('*').order('inicio', { ascending: false }).limit(200),
    supabaseVendas.from('vw_distribuicao_saude').select('*').order('marca'),
    supabaseVendas.from('vw_distribuicao_campos_vistos').select('*').order('marca').order('chave'),
    supabaseVendas.from('nome_cargo_foto').select('nome, cargo, ativo, user_id').in('cargo', ['SDR', 'Closer', 'SDR/Closer', 'Gestor']).order('nome'),
  ])
  const erro = [painel, regras, atribuicoes, disponibilidade, saude, campos, pessoas].find(r => r.error)?.error?.message ?? null
  if (erro) return { dados: VAZIO, error: erro }
  return {
    dados: {
      painel: (painel.data ?? []) as PainelMarca[],
      regras: (regras.data ?? []) as RegraRow[],
      atribuicoes: (atribuicoes.data ?? []) as AtribuicaoRow[],
      disponibilidade: (disponibilidade.data ?? []) as DisponibilidadeRow[],
      saude: (saude.data ?? []) as SaudeMarca[],
      camposVistos: (campos.data ?? []) as CampoVisto[],
      pessoas: (pessoas.data ?? []) as PessoaRd[],
    },
    error: null,
  }
}

export function useDistribuicao() {
  const [dados, setDados] = useState<DadosDistribuicao>(VAZIO)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (mostrarLoading = false) => {
    if (mostrarLoading) setLoading(true)
    const r = await buscar()
    setError(r.error)
    if (!r.error) setDados(r.dados)
    setLoading(false)
  }, [])

  useEffect(() => {
    let vivo = true
    refetch(true).catch(() => {})
    const onRefresh = () => { if (vivo) refetch(false) }
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => { if (vivo) refetch(false) }, 60_000)
    return () => { vivo = false; clearInterval(timer); window.removeEventListener('dashboard:refresh', onRefresh) }
  }, [refetch])

  return { ...dados, loading, error, refetch }
}
