import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { emJanelas, janelasKey, type Janela } from '@/constants/metasCampanhaF1'
import {
  lancamentosCloser,
  lancamentosSdr,
  somarLancamentos,
  CLOSER_SPEED_TIERS,
  SDR_SPEED_TIERS,
  type Lancamento,
  type LinhaTrilha,
} from '@/lib/corridaPerformance'
import {
  limitesDoMes,
  lookupPilotos,
  separarRrs,
  separarVendas,
  type ForaCorrida,
  type RawRr,
  type RawVenda,
} from '@/lib/corridaDados'

/**
 * Corrida de Performance — dados do mês pros 2 cards de trilha (SDR / Closer),
 * pro extrato de pontos e pro realizado do Grid dos SDRs da página Campanha de Metas.
 *
 * Lê `vw_funil_vendas` direto (mesmo padrão de `useMetasClosers` /
 * `useHistoricoAtingimento`, que também consultam a view por conta própria) —
 * **sem** filtro de origem: a pontuação pesa cada unidade pela `fonte_macro`
 * dela (1 pt Inbound/Indicação/Parceiro/Repasse, 2 pt o restante) e pela
 * `marca` dela (multiplicador de ticket — ver `TICKET_FAIXAS` em
 * `corridaPerformance.ts`), então precisa de todas as fontes e marcas juntas.
 * Quatro recortes do mês (limites em Brasília, ver `limitesDoMes`):
 *   - RR realizada  (`data_reuniao_realizada`)         → trilha SDR + realizado RR
 *   - SQL agendado  (`data_agendamento_reuniao_sql`)   → realizado SQL do SDR
 *   - SAL           (`data_sal`)                       → realizado SAL do SDR
 *   - venda ganha   (`data_venda` + `status = 'Ganho'`) → trilha Closer, por
 *     unidade vendida (`quantidade_unidades` via `saleUnits`, não 1 por deal)
 *
 * `janelas` (opcional) recorta os 3 conjuntos para a união desses intervalos
 * de data — usado pelo seletor de voltas. A query sempre traz o mês inteiro;
 * o recorte é client-side, então trocar de volta não refetcha.
 *
 * Cada trilha sai em lançamentos (1 por RR / venda, com os fatores da conta)
 * e o card de cada pessoa é a soma deles — o extrato e o card usam o MESMO
 * cálculo. RR/venda da janela de quem não é piloto (sem meta no mês ou campo
 * vazio no RD) volta em `foraSdr`/`foraCloser`, pra tela dizer o motivo.
 */

/** Pilotos do mês (quem tem meta) — vêm de `useMetasSDRs`/`useMetasClosers`. */
export interface PilotosCorrida {
  sdr: readonly string[]
  closer: readonly string[]
}

interface RawSql {
  nome_sdr: string | null
  data_agendamento_reuniao_sql: string | null
}
interface RawSal {
  nome_sdr: string | null
  data_sal: string | null
}

/** RRs realizadas do mês (Brasília). Também usada pelo pop-up "pontos" de um negócio. */
export async function fetchRrsCorrida(mesRef: string): Promise<RawRr[]> {
  const { inicio, fim } = limitesDoMes(mesRef)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('id_lead, ciclo, nome_negociacao, nome_sdr, fonte_macro, marca, data_novo_mql, data_agendamento_reuniao_sql, data_reuniao_realizada')
    .gte('data_reuniao_realizada', inicio)
    .lte('data_reuniao_realizada', fim)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawRr[]
}

async function fetchSqls(mesRef: string): Promise<RawSql[]> {
  const { inicio, fim } = limitesDoMes(mesRef)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_sdr, data_agendamento_reuniao_sql')
    .gte('data_agendamento_reuniao_sql', inicio)
    .lte('data_agendamento_reuniao_sql', fim)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawSql[]
}

async function fetchSals(mesRef: string): Promise<RawSal[]> {
  const { inicio, fim } = limitesDoMes(mesRef)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_sdr, data_sal')
    .gte('data_sal', inicio)
    .lte('data_sal', fim)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawSal[]
}

/** Vendas ganhas do mês (Brasília). Também usada pelo pop-up "pontos" de um negócio. */
export async function fetchVendasCorrida(mesRef: string): Promise<RawVenda[]> {
  const { inicio, fim } = limitesDoMes(mesRef)
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('id_lead, ciclo, nome_negociacao, nome_closer, fonte_macro, marca, quantidade_unidades, data_reuniao_realizada, data_venda')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fim)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawVenda[]
}

export interface SdrRealizado {
  sql: number
  rr: number
  sal: number
}

/** Uma trilha pronta: o card (`linhas`), o extrato (`lancamentos`) e o que ficou de fora. */
export interface TrilhaCorrida {
  linhas: LinhaTrilha[]
  lancamentos: Lancamento[]
  fora: ForaCorrida[]
}

export interface UseCorridaPerformanceResult {
  sdrTrilha: LinhaTrilha[]
  closerTrilha: LinhaTrilha[]
  /** Card + extrato + "não pontuou" de cada trilha — `sdr.linhas === sdrTrilha`. */
  sdr: TrilhaCorrida
  closer: TrilhaCorrida
  /** Realizado de SQL, RR e SAL no mês, por SDR canônico — alimenta o Grid dos SDRs. */
  sdrRealizado: Map<string, SdrRealizado>
  loading: boolean
  error: string | null
}

function agregarRealizadoSdr(
  rrs: RawRr[],
  sqls: RawSql[],
  sals: RawSal[],
  nomesSdr: readonly string[],
  janelas?: readonly Janela[],
): Map<string, SdrRealizado> {
  const SDR_LOOKUP = lookupPilotos(nomesSdr)
  const chave = (s: string | null) => (s ?? '').trim().toLowerCase()
  const map = new Map<string, SdrRealizado>(nomesSdr.map(n => [n, { sql: 0, rr: 0, sal: 0 }]))
  for (const r of sqls) {
    if (!emJanelas(r.data_agendamento_reuniao_sql, janelas)) continue
    const nome = SDR_LOOKUP.get(chave(r.nome_sdr))
    if (nome) map.get(nome)!.sql++
  }
  for (const r of rrs) {
    if (!emJanelas(r.data_reuniao_realizada, janelas)) continue
    const nome = SDR_LOOKUP.get(chave(r.nome_sdr))
    if (nome) map.get(nome)!.rr++
  }
  for (const r of sals) {
    if (!emJanelas(r.data_sal, janelas)) continue
    const nome = SDR_LOOKUP.get(chave(r.nome_sdr))
    if (nome) map.get(nome)!.sal++
  }
  return map
}

export function useCorridaPerformance(mesRef: string, pilotos: PilotosCorrida, janelas?: readonly Janela[]): UseCorridaPerformanceResult {
  const [rrs, setRrs] = useState<RawRr[]>([])
  const [sqls, setSqls] = useState<RawSql[]>([])
  const [sals, setSals] = useState<RawSal[]>([])
  const [vendas, setVendas] = useState<RawVenda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const [r, s, sl, v] = await Promise.all([
        fetchRrsCorrida(mesRef),
        fetchSqls(mesRef),
        fetchSals(mesRef),
        fetchVendasCorrida(mesRef),
      ])
      setRrs(r)
      setSqls(s)
      setSals(sl)
      setVendas(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [mesRef])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const handleRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', handleRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', handleRefresh)
    }
  }, [fetchAll])

  const jKey = janelasKey(janelas)
  const sdrKey = pilotos.sdr.join('|')
  const closerKey = pilotos.closer.join('|')

  const sdr = useMemo<TrilhaCorrida>(() => {
    const { unidades, fora } = separarRrs(rrs, pilotos.sdr, janelas)
    const lancamentos = lancamentosSdr(unidades, pilotos.sdr)
    return { linhas: somarLancamentos(pilotos.sdr, lancamentos, SDR_SPEED_TIERS), lancamentos, fora }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rrs, jKey, sdrKey])

  const closer = useMemo<TrilhaCorrida>(() => {
    const { unidades, fora } = separarVendas(vendas, pilotos.closer, janelas)
    const lancamentos = lancamentosCloser(unidades, pilotos.closer)
    return { linhas: somarLancamentos(pilotos.closer, lancamentos, CLOSER_SPEED_TIERS), lancamentos, fora }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas, jKey, closerKey])

  const sdrRealizado = useMemo(
    () => agregarRealizadoSdr(rrs, sqls, sals, pilotos.sdr, janelas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rrs, sqls, sals, jKey, sdrKey],
  )

  return { sdrTrilha: sdr.linhas, closerTrilha: closer.linhas, sdr, closer, sdrRealizado, loading, error }
}
