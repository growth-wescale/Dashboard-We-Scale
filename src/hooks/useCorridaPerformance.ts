import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { emJanelas, janelasKey, type Janela } from '@/constants/metasCampanhaF1'
import { saleUnits } from '@/lib/metrics'
import {
  pontosSdr,
  pontosCloser,
  type LinhaTrilha,
  type RrUnidade,
  type VendaUnidade,
} from '@/lib/corridaPerformance'

/**
 * Corrida de Performance — dados do mês pros 2 cards de trilha (SDR / Closer)
 * e pro realizado do Grid dos SDRs da página Campanha de Metas.
 *
 * Lê `vw_funil_vendas` direto (mesmo padrão de `useMetasClosers` /
 * `useHistoricoAtingimento`, que também consultam a view por conta própria) —
 * **sem** filtro de origem: a pontuação pesa cada unidade pela `fonte_macro`
 * dela (1 pt Inbound/Indicação/Parceiro/Repasse, 2 pt o restante) e pela
 * `marca` dela (multiplicador de ticket — ver `TICKET_FAIXAS` em
 * `corridaPerformance.ts`), então precisa de todas as fontes e marcas juntas.
 * Três recortes do mês:
 *   - RR realizada  (`data_reuniao_realizada`)         → trilha SDR + realizado RR
 *   - SQL agendado  (`data_agendamento_reuniao_sql`)   → realizado SQL do SDR
 *   - venda ganha   (`data_venda` + `status = 'Ganho'`) → trilha Closer, por
 *     unidade vendida (`quantidade_unidades` via `saleUnits`, não 1 por deal)
 *
 * `janelas` (opcional) recorta os 3 conjuntos para a união desses intervalos
 * de data — usado pelo seletor de voltas. A query sempre traz o mês inteiro;
 * o recorte é client-side, então trocar de volta não refetcha.
 *
 * A pontuação em si (volume × multiplicador de velocidade, por-unidade) mora
 * em `src/lib/corridaPerformance.ts`, puro e testado.
 */

function normalizeNome(s: string): string {
  return s.trim().toLowerCase()
}

/** Pilotos do mês (quem tem meta) — vêm de `useMetasSDRs`/`useMetasClosers`. */
export interface PilotosCorrida {
  sdr: readonly string[]
  closer: readonly string[]
}

function lookup(nomes: readonly string[]): Map<string, string> {
  return new Map(nomes.map(n => [normalizeNome(n), n]))
}

function ultimoDiaMes(mesRef: string): string {
  const d = new Date(mesRef + 'T00:00:00')
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const y = fim.getFullYear()
  const m = String(fim.getMonth() + 1).padStart(2, '0')
  const dd = String(fim.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

interface RawRr {
  nome_sdr: string | null
  fonte_macro: string | null
  marca: string | null
  data_novo_mql: string | null
  data_agendamento_reuniao_sql: string | null
  data_reuniao_realizada: string | null
}
interface RawSql {
  nome_sdr: string | null
  data_agendamento_reuniao_sql: string | null
}
interface RawVenda {
  nome_closer: string | null
  fonte_macro: string | null
  marca: string | null
  quantidade_unidades: number | null
  data_reuniao_realizada: string | null
  data_venda: string | null
}

async function fetchRrs(inicio: string, fimTs: string): Promise<RawRr[]> {
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_sdr, fonte_macro, marca, data_novo_mql, data_agendamento_reuniao_sql, data_reuniao_realizada')
    .gte('data_reuniao_realizada', inicio)
    .lte('data_reuniao_realizada', fimTs)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawRr[]
}

async function fetchSqls(inicio: string, fimTs: string): Promise<RawSql[]> {
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_sdr, data_agendamento_reuniao_sql')
    .gte('data_agendamento_reuniao_sql', inicio)
    .lte('data_agendamento_reuniao_sql', fimTs)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawSql[]
}

async function fetchVendas(inicio: string, fimTs: string): Promise<RawVenda[]> {
  const { data, error } = await supabaseVendas
    .from('vw_funil_vendas')
    .select('nome_closer, fonte_macro, marca, quantidade_unidades, data_reuniao_realizada, data_venda')
    .eq('status_atual', 'Ganho')
    .gte('data_venda', inicio)
    .lte('data_venda', fimTs)
  if (error) throw new Error(error.message)
  return (data ?? []) as RawVenda[]
}

export interface SdrRealizado {
  sql: number
  rr: number
}

export interface UseCorridaPerformanceResult {
  sdrTrilha: LinhaTrilha[]
  closerTrilha: LinhaTrilha[]
  /** Realizado de SQL e RR no mês, por SDR canônico — alimenta o Grid dos SDRs. */
  sdrRealizado: Map<string, SdrRealizado>
  loading: boolean
  error: string | null
}

function agregarRealizadoSdr(
  rrs: RawRr[],
  sqls: RawSql[],
  nomesSdr: readonly string[],
  janelas?: readonly Janela[],
): Map<string, SdrRealizado> {
  const SDR_LOOKUP = lookup(nomesSdr)
  const map = new Map<string, SdrRealizado>(nomesSdr.map(n => [n, { sql: 0, rr: 0 }]))
  for (const r of sqls) {
    if (!emJanelas(r.data_agendamento_reuniao_sql, janelas)) continue
    const nome = SDR_LOOKUP.get(normalizeNome(r.nome_sdr ?? ''))
    if (nome) map.get(nome)!.sql++
  }
  for (const r of rrs) {
    if (!emJanelas(r.data_reuniao_realizada, janelas)) continue
    const nome = SDR_LOOKUP.get(normalizeNome(r.nome_sdr ?? ''))
    if (nome) map.get(nome)!.rr++
  }
  return map
}

export function useCorridaPerformance(mesRef: string, pilotos: PilotosCorrida, janelas?: readonly Janela[]): UseCorridaPerformanceResult {
  const [rrs, setRrs] = useState<RawRr[]>([])
  const [sqls, setSqls] = useState<RawSql[]>([])
  const [vendas, setVendas] = useState<RawVenda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const inicio = mesRef
    const fimTs = ultimoDiaMes(mesRef) + 'T23:59:59'
    try {
      const [r, s, v] = await Promise.all([
        fetchRrs(inicio, fimTs),
        fetchSqls(inicio, fimTs),
        fetchVendas(inicio, fimTs),
      ])
      setRrs(r)
      setSqls(s)
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

  const sdrTrilha = useMemo(() => {
    const SDR_LOOKUP = lookup(pilotos.sdr)
    const unidades: RrUnidade[] = rrs
      .map(r => {
        const nome = SDR_LOOKUP.get(normalizeNome(r.nome_sdr ?? ''))
        if (!nome || !r.data_reuniao_realizada) return null
        if (!emJanelas(r.data_reuniao_realizada, janelas)) return null
        return {
          nome,
          fonte: r.fonte_macro,
          marca: r.marca,
          dataMql: r.data_novo_mql,
          dataAgendamento: r.data_agendamento_reuniao_sql,
          dataRr: r.data_reuniao_realizada,
        }
      })
      .filter((u): u is RrUnidade => u !== null)
    return pontosSdr(unidades, [...pilotos.sdr])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rrs, jKey, sdrKey])

  const closerTrilha = useMemo(() => {
    const CLOSER_LOOKUP = lookup(pilotos.closer)
    const unidades: VendaUnidade[] = vendas
      .map(v => {
        const nome = CLOSER_LOOKUP.get(normalizeNome(v.nome_closer ?? ''))
        if (!nome || !v.data_venda) return null
        if (!emJanelas(v.data_venda, janelas)) return null
        return {
          nome,
          fonte: v.fonte_macro,
          marca: v.marca,
          dataRr: v.data_reuniao_realizada,
          dataVenda: v.data_venda,
          unidades: saleUnits(v),
        }
      })
      .filter((u): u is VendaUnidade => u !== null)
    return pontosCloser(unidades, [...pilotos.closer])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas, jKey, closerKey])

  const sdrRealizado = useMemo(
    () => agregarRealizadoSdr(rrs, sqls, pilotos.sdr, janelas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rrs, sqls, jKey, sdrKey],
  )

  return { sdrTrilha, closerTrilha, sdrRealizado, loading, error }
}
