import { useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { nomesComMeta } from '@/lib/pilotos'
import { lancamentosCloser, lancamentosSdr } from '@/lib/corridaPerformance'
import { separarRrs, separarVendas } from '@/lib/corridaDados'
import { mesDaRr, mesDaVenda, type CorridaDoMes, type NegocioCorrida } from '@/lib/corridaExtrato'
import { fetchRrsCorrida, fetchVendasCorrida } from '@/hooks/useCorridaPerformance'

/**
 * Pontos de UM negócio na Corrida de Performance — o link "pontos" dos pop-ups
 * de negócio (Visão Macro, Performance, Análise de Perda).
 *
 * O bônus de "mais de 1 unidade no mesmo dia" depende das outras RR/vendas da
 * pessoa, então não dá pra calcular só com a linha do negócio: carrega o mês
 * inteiro da Corrida (pilotos + RRs + vendas, as MESMAS consultas e a mesma
 * conta da Campanha de Metas) e procura o lançamento do negócio + ciclo.
 * Um mês carregado fica 2 min em memória — abrir outro negócio do mesmo mês
 * não consulta de novo.
 */

const VALIDADE_MS = 2 * 60_000
const cache = new Map<string, { em: number; promessa: Promise<CorridaDoMes> }>()

interface RawMeta {
  nome_colaborador: string | null
  funcao: string | null
}

async function fetchPilotos(mes: string): Promise<RawMeta[]> {
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, funcao')
    .eq('mes_referencia', mes)
    .in('funcao', ['SDR', 'Closer'])
  if (error) throw new Error(error.message)
  return (data ?? []) as RawMeta[]
}

/** Lançamentos e pilotos de um mês inteiro da Corrida (sem recorte de volta). */
export function carregarCorridaDoMes(mes: string): Promise<CorridaDoMes> {
  const atual = cache.get(mes)
  if (atual && Date.now() - atual.em < VALIDADE_MS) return atual.promessa
  const promessa = (async (): Promise<CorridaDoMes> => {
    const [metas, rrs, vendas] = await Promise.all([fetchPilotos(mes), fetchRrsCorrida(mes), fetchVendasCorrida(mes)])
    // Pilotos = quem tem meta no mês, igual a useMetasSDRs/useMetasClosers.
    const pilotosSdr = nomesComMeta(metas, 'SDR')
    const pilotosCloser = nomesComMeta(metas, 'Closer')
    return {
      mes,
      pilotosSdr,
      pilotosCloser,
      lancamentosSdr: lancamentosSdr(separarRrs(rrs, pilotosSdr).unidades, pilotosSdr),
      lancamentosCloser: lancamentosCloser(separarVendas(vendas, pilotosCloser).unidades, pilotosCloser),
    }
  })()
  cache.set(mes, { em: Date.now(), promessa })
  // Erro não fica guardado: a próxima abertura tenta de novo.
  promessa.catch(() => { if (cache.get(mes)?.promessa === promessa) cache.delete(mes) })
  return promessa
}

export interface UsePontosDoNegocioResult {
  /** Corrida de cada mês que o negócio toca (mês da RR e/ou da venda). */
  porMes: ReadonlyMap<string, CorridaDoMes>
  loading: boolean
  error: string | null
}

export function usePontosDoNegocio(row: NegocioCorrida): UsePontosDoNegocioResult {
  const meses = useMemo(
    () => [...new Set([mesDaRr(row), mesDaVenda(row)].filter((m): m is string => !!m))],
    [row],
  )
  const chave = meses.join('|')
  const [estado, setEstado] = useState<{ chave: string; dados: CorridaDoMes[]; error: string | null } | null>(null)

  useEffect(() => {
    let vivo = true
    const lista = chave ? chave.split('|') : []
    Promise.all(lista.map(carregarCorridaDoMes)).then(
      dados => { if (vivo) setEstado({ chave, dados, error: null }) },
      e => { if (vivo) setEstado({ chave, dados: [], error: e instanceof Error ? e.message : String(e) }) },
    )
    return () => { vivo = false }
  }, [chave])

  const pronto = estado?.chave === chave
  const porMes = useMemo(
    () => new Map((pronto ? estado!.dados : []).map(d => [d.mes, d])),
    [pronto, estado],
  )
  return { porMes, loading: !pronto, error: pronto ? estado!.error : null }
}
