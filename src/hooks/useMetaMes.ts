import { useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { ConfigEtapa, DiaSemana, EtapaMeta, PessoaComFuncao, Semana } from '@/lib/metasEngine'

export interface EstadoMesMarca {
  marca: string
  ticketMedio: number
  etapas: ConfigEtapa[]
  pessoas: PessoaComFuncao[]
}

export interface DistribuicaoSemanalItem {
  marca: string
  nomePessoa: string
  semanaNumero: number
  etapa: EtapaMeta
  valor: number
}

/**
 * Uma versão publicada das metas de um mês (V1 = lançamento, V2+ = revisões /
 * forecast). Imutável depois de criada — o banco bloqueia UPDATE/DELETE nas
 * tabelas da versão. A única coisa que muda é QUAL versão está ativa, e é a
 * ativa que alimenta `DB_Metas_Performance` (o que o dashboard inteiro lê).
 */
export interface VersaoMeta {
  id: number
  numero: number
  rotulo: string
  motivo: string | null
  origem: 'hub' | 'importado'
  ativa: boolean
  publicadoEm: string
  publicadoPor: string | null
  ativadaEm: string | null
  ativadaPor: string | null
  /** Somados das linhas congeladas do espelho (só Closers carregam venda/faturamento). */
  totalVendas: number
  totalFaturamento: number
}

export interface EstadoMes {
  status: 'inexistente' | 'publicado'
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

const VAZIO: EstadoMes = { status: 'inexistente', diaViradaSemana: 'terca', semanas: [], marcas: [], distribuicaoSemanal: [] }

function totaisEspelho(linhas: unknown): { vendas: number; faturamento: number } {
  if (!Array.isArray(linhas)) return { vendas: 0, faturamento: 0 }
  let vendas = 0
  let faturamento = 0
  for (const l of linhas as Array<Record<string, unknown>>) {
    if (l.funcao !== 'Closer') continue
    vendas += Number(l.meta_qtd_vendas) || 0
    faturamento += Number(l.meta_financeira) || 0
  }
  return { vendas, faturamento }
}

async function buscarVersoes(mesReferencia: string): Promise<{ versoes: VersaoMeta[]; error: string | null }> {
  const { data, error } = await supabaseVendas
    .from('meta_versao')
    .select('id, numero, rotulo, motivo, origem, ativa, publicado_em, publicado_por, ativada_em, ativada_por, linhas_espelho')
    .eq('mes_referencia', mesReferencia)
    .order('numero')
  if (error) return { versoes: [], error: error.message }
  const versoes = (data ?? []).map((v: any): VersaoMeta => {
    const t = totaisEspelho(v.linhas_espelho)
    return {
      id: v.id, numero: v.numero, rotulo: v.rotulo, motivo: v.motivo, origem: v.origem, ativa: v.ativa,
      publicadoEm: v.publicado_em, publicadoPor: v.publicado_por,
      ativadaEm: v.ativada_em, ativadaPor: v.ativada_por,
      totalVendas: t.vendas, totalFaturamento: t.faturamento,
    }
  })
  return { versoes, error: null }
}

/** Estado completo (semanas, funil por marca, pessoas, distribuição) de UMA versão. */
export async function buscarEstadoVersao(versaoId: number): Promise<{ estado: EstadoMes; error: string | null }> {
  const { data: versaoRow, error: erroVersao } = await supabaseVendas
    .from('meta_versao').select('dia_virada_semana').eq('id', versaoId).maybeSingle()
  if (erroVersao) return { estado: VAZIO, error: erroVersao.message }
  if (!versaoRow) return { estado: VAZIO, error: null }

  const [{ data: semanasRows, error: erroSemanas }, { data: marcasRows, error: erroMarcas }] = await Promise.all([
    supabaseVendas.from('meta_semana').select('numero, data_inicio, data_fim').eq('meta_versao_id', versaoId).order('numero'),
    supabaseVendas.from('meta_marca').select('id, marca, ticket_medio').eq('meta_versao_id', versaoId).order('marca'),
  ])
  if (erroSemanas) return { estado: VAZIO, error: erroSemanas.message }
  if (erroMarcas) return { estado: VAZIO, error: erroMarcas.message }

  const marcaIds = (marcasRows ?? []).map(m => m.id)
  const [{ data: etapasRows, error: erroEtapas }, { data: pessoasRows, error: erroPessoas }, { data: distribRows, error: erroDistrib }] = await Promise.all([
    marcaIds.length ? supabaseVendas.from('meta_marca_etapa').select('meta_marca_id, etapa, modo, valor_fixo, etapa_origem, taxa, taxa_origem').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [], error: null }),
    marcaIds.length ? supabaseVendas.from('meta_pessoa').select('id, meta_marca_id, nome, funcao, peso').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [], error: null }),
    marcaIds.length
      ? supabaseVendas.from('meta_pessoa_semana').select('etapa, valor, meta_pessoa_id, meta_semana_id, meta_pessoa!inner(nome, meta_marca_id, meta_marca!inner(marca)), meta_semana!inner(numero)').in('meta_pessoa.meta_marca_id', marcaIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (erroEtapas) return { estado: VAZIO, error: erroEtapas.message }
  if (erroPessoas) return { estado: VAZIO, error: erroPessoas.message }
  if (erroDistrib) return { estado: VAZIO, error: erroDistrib.message }

  const marcas: EstadoMesMarca[] = (marcasRows ?? []).map(m => ({
    marca: m.marca,
    ticketMedio: Number(m.ticket_medio) || 0,
    etapas: (etapasRows ?? []).filter((e: any) => e.meta_marca_id === m.id).map((e: any) => ({
      etapa: e.etapa as EtapaMeta, modo: e.modo, valorFixo: e.valor_fixo != null ? Number(e.valor_fixo) : undefined,
      etapaOrigem: e.etapa_origem ?? undefined, taxa: e.taxa != null ? Number(e.taxa) : undefined,
      taxaOrigem: e.taxa_origem ?? undefined,
    })),
    pessoas: (pessoasRows ?? []).filter((p: any) => p.meta_marca_id === m.id).map((p: any) => ({
      nome: p.nome, funcao: p.funcao, peso: Number(p.peso) || 0,
    })),
  }))

  const distribuicaoSemanal: DistribuicaoSemanalItem[] = (distribRows ?? []).map((d: any) => ({
    marca: d.meta_pessoa.meta_marca.marca, nomePessoa: d.meta_pessoa.nome, semanaNumero: d.meta_semana.numero, etapa: d.etapa, valor: Number(d.valor) || 0,
  }))

  return {
    estado: {
      status: 'publicado',
      diaViradaSemana: versaoRow.dia_virada_semana,
      semanas: (semanasRows ?? []).map(s => ({ numero: s.numero, inicio: s.data_inicio, fim: s.data_fim })),
      marcas,
      distribuicaoSemanal,
    },
    error: null,
  }
}

/**
 * Versões do mês + estado completo da versão ativa (ou da última publicada, se
 * nenhuma estiver ativa). Quem precisa de outra versão chama `buscarEstadoVersao`.
 */
export function useMetaMes(mesReferencia: string) {
  const [versoes, setVersoes] = useState<VersaoMeta[]>([])
  const [estado, setEstado] = useState<EstadoMes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef<(showLoading: boolean) => Promise<void>>(null!)

  useEffect(() => {
    let cancelled = false

    async function run(showLoading: boolean) {
      if (showLoading) setLoading(true)
      setError(null)
      const { versoes: vs, error: erroVersoes } = await buscarVersoes(mesReferencia)
      if (cancelled) return
      if (erroVersoes) { setError(erroVersoes); setLoading(false); return }

      const alvo = vs.find(v => v.ativa) ?? vs[vs.length - 1] ?? null
      let e = VAZIO
      if (alvo) {
        const r = await buscarEstadoVersao(alvo.id)
        if (cancelled) return
        if (r.error) { setError(r.error); setLoading(false); return }
        e = r.estado
      }
      setVersoes(vs)
      setEstado(e)
      setLoading(false)
    }

    runRef.current = run

    run(true).catch(() => {})

    const handleRefresh = () => { if (!cancelled) void run(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) void run(false) }, 300_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [mesReferencia])

  const versaoAtiva = versoes.find(v => v.ativa) ?? null
  const versaoExibida = versaoAtiva ?? versoes[versoes.length - 1] ?? null

  return { versoes, versaoAtiva, versaoExibida, estado, loading, error, reload: () => { void runRef.current?.(false) } }
}
