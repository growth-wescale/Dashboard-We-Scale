import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { ConfigEtapa, DiaSemana, EtapaMeta, PessoaComFuncao, Semana } from '@/lib/metasEngine'

export interface EstadoMesMarca {
  marca: string
  ticketMedio: number
  etapas: ConfigEtapa[]
  pessoas: PessoaComFuncao[]
}

export interface DistribuicaoSemanalItem {
  nomePessoa: string
  semanaNumero: number
  etapa: EtapaMeta
  valor: number
}

export interface EstadoMes {
  status: 'inexistente' | 'rascunho' | 'publicado'
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

const VAZIO: EstadoMes = { status: 'inexistente', diaViradaSemana: 'terca', semanas: [], marcas: [], distribuicaoSemanal: [] }

async function buscar(mesReferencia: string): Promise<{ estado: EstadoMes; error: string | null }> {
  const { data: mesRow, error: erroMes } = await supabaseVendas
    .from('meta_mes').select('status, dia_virada_semana').eq('mes_referencia', mesReferencia).maybeSingle()
  if (erroMes) return { estado: VAZIO, error: erroMes.message }
  if (!mesRow) return { estado: VAZIO, error: null }

  const [{ data: semanasRows, error: erroSemanas }, { data: marcasRows, error: erroMarcas }] = await Promise.all([
    supabaseVendas.from('meta_semana').select('numero, data_inicio, data_fim').eq('mes_referencia', mesReferencia).order('numero'),
    supabaseVendas.from('meta_marca').select('id, marca, ticket_medio').eq('mes_referencia', mesReferencia),
  ])
  if (erroSemanas) return { estado: VAZIO, error: erroSemanas.message }
  if (erroMarcas) return { estado: VAZIO, error: erroMarcas.message }

  const marcaIds = (marcasRows ?? []).map(m => m.id)
  const [{ data: etapasRows, error: erroEtapas }, { data: pessoasRows, error: erroPessoas }, { data: distribRows, error: erroDistrib }] = await Promise.all([
    marcaIds.length ? supabaseVendas.from('meta_marca_etapa').select('meta_marca_id, etapa, modo, valor_fixo, etapa_origem, taxa, taxa_origem').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [], error: null }),
    marcaIds.length ? supabaseVendas.from('meta_pessoa').select('id, meta_marca_id, nome, funcao, peso').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [], error: null }),
    marcaIds.length
      ? supabaseVendas.from('meta_pessoa_semana').select('etapa, valor, meta_pessoa_id, meta_semana_id, meta_pessoa!inner(nome, meta_marca_id), meta_semana!inner(numero)').in('meta_pessoa.meta_marca_id', marcaIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (erroEtapas) return { estado: VAZIO, error: erroEtapas.message }
  if (erroPessoas) return { estado: VAZIO, error: erroPessoas.message }
  if (erroDistrib) return { estado: VAZIO, error: erroDistrib.message }

  const marcas: EstadoMesMarca[] = (marcasRows ?? []).map(m => ({
    marca: m.marca,
    ticketMedio: Number(m.ticket_medio) || 0,
    etapas: (etapasRows ?? []).filter((e: any) => e.meta_marca_id === m.id).map((e: any) => ({
      etapa: e.etapa as EtapaMeta, modo: e.modo, valorFixo: e.valor_fixo ?? undefined,
      etapaOrigem: e.etapa_origem ?? undefined, taxa: e.taxa ?? undefined,
      taxaOrigem: e.taxa_origem ?? undefined,
    })),
    pessoas: (pessoasRows ?? []).filter((p: any) => p.meta_marca_id === m.id).map((p: any) => ({
      nome: p.nome, funcao: p.funcao, peso: Number(p.peso) || 0,
    })),
  }))

  const distribuicaoSemanal: DistribuicaoSemanalItem[] = (distribRows ?? []).map((d: any) => ({
    nomePessoa: d.meta_pessoa.nome, semanaNumero: d.meta_semana.numero, etapa: d.etapa, valor: Number(d.valor) || 0,
  }))

  return {
    estado: {
      status: mesRow.status,
      diaViradaSemana: mesRow.dia_virada_semana,
      semanas: (semanasRows ?? []).map(s => ({ numero: s.numero, inicio: s.data_inicio, fim: s.data_fim })),
      marcas,
      distribuicaoSemanal,
    },
    error: null,
  }
}

export function useMetaMes(mesReferencia: string) {
  const [estado, setEstado] = useState<EstadoMes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { estado: e, error: err } = await buscar(mesReferencia)
    if (err) { setError(err); if (showLoading) setLoading(false); return }
    setEstado(e)
    if (showLoading) setLoading(false)
  }, [mesReferencia])

  useEffect(() => {
    let cancelled = false
    const run = (showLoading: boolean) => { if (!cancelled) void fetchAll(showLoading) }

    run(true)

    const handleRefresh = () => { if (!cancelled) run(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) run(false) }, 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [fetchAll])

  return { estado, loading, error, reload: () => void fetchAll(false) }
}
