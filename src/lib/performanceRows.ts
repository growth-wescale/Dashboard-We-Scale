import type { FunnelRow } from '@/lib/funnelTypes'
import type { EventCountOptions, FunnelEventRow, PeriodWindow, SalesMode, StageKey, ViewModes } from '@/lib/metrics'
import { dealKey, eventsInStage, isInWindow, saleUnits } from '@/lib/metrics'
import type { MembroRoster } from '@/hooks/useRosterVendas'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'
import { findMeta } from '@/hooks/useMetasPerformance'

export interface SdrRow {
  nome: string
  mql: number; sql: number; rr: number; sal: number
  metaSql: number
  pctAting: number
  mqlToSql: number
}

export interface CloserRow {
  nome: string
  rr: number; sal: number; cof: number
  /** Vendas na janela — negócios, ou unidades quando `salesMode = 'units'`
   *  (mesma regra de `countSales`: `saleUnits`, piso 1 por deal). */
  ganhos: number; faturamento: number
  metaFinanceira: number
  pctAting: number
  winRate: number
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Contagem por evento — a MESMA dos cards (`countStageEvents`, com o mesmo
 * `opts` de escopo/safra). Cada evento é creditado ao SDR/Closer do CICLO dele.
 * Assim a soma da tabela é o card: valem a trava de funil da "Reunião Agendada
 * SQL", o toggle Passagens e a reentrada na etapa em outro mês.
 *
 * Sem ela, a tabela cai na data da etapa gravada na linha do deal — uma data
 * só por ciclo e sem a trava de funil (set/26: card SQL do Thiago 23 × tabela
 * 22, da Vanessa 19 × 20).
 */
export interface ContagemPorEvento {
  eventos: FunnelEventRow[]
  modes: ViewModes
  opts?: EventCountOptions
}

function eventosPorCiclo(
  c: ContagemPorEvento, stage: StageKey, win: PeriodWindow,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of eventsInStage(c.eventos, stage, win, c.modes, c.opts)) {
    const k = dealKey({ id_lead: e.id_deal, ciclo: e.ciclo })
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

function rosterSet(roster: MembroRoster[], cargos: MembroRoster['cargo'][]): Set<string> {
  return new Set(roster.filter(r => cargos.includes(r.cargo)).map(r => key(r.nome)))
}

export function buildSdrRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
  contagem?: ContagemPorEvento,
): SdrRow[] {
  const valid = rosterSet(roster, ['SDR', 'SDR/Closer'])
  const ev = contagem && {
    sql: eventosPorCiclo(contagem, 'Reunião Agendada SQL', win),
    rr: eventosPorCiclo(contagem, 'Diagnóstico', win),
    sal: eventosPorCiclo(contagem, 'SAL', win),
  }
  const bucket = new Map<string, { mql: number; sql: number; rr: number; sal: number }>()
  const nomeOriginal = new Map<string, string>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_sdr?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const normalized = key(nome)
    const cur = bucket.get(normalized) ?? { mql: 0, sql: 0, rr: 0, sal: 0 }
    if (isInWindow(r.data_novo_mql, win)) cur.mql++
    if (ev) {
      const k = dealKey(r)
      cur.sql += ev.sql.get(k) ?? 0
      cur.rr += ev.rr.get(k) ?? 0
      cur.sal += ev.sal.get(k) ?? 0
    } else {
      if (isInWindow(r.data_agendamento_reuniao_sql, win)) cur.sql++
      if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
      if (isInWindow(r.data_sal, win)) cur.sal++
    }
    bucket.set(normalized, cur)
    if (!nomeOriginal.has(normalized)) nomeOriginal.set(normalized, nome)
  }

  return Array.from(bucket.entries()).map(([normalized, v]) => {
    const nome = nomeOriginal.get(normalized)!
    const metaSql = findMeta(metas, nome, 'SDR')?.metaSql ?? 0
    return {
      nome, ...v,
      metaSql,
      pctAting: metaSql > 0 ? (v.sql / metaSql) * 100 : 0,
      mqlToSql: v.mql > 0 ? (v.sql / v.mql) * 100 : 0,
    }
  }).sort((a, b) => b.pctAting - a.pctAting || b.sql - a.sql)
}

export function buildCloserRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
  salesMode: SalesMode = 'deals',
  contagem?: ContagemPorEvento,
): CloserRow[] {
  const valid = rosterSet(roster, ['Closer', 'SDR/Closer'])
  const ev = contagem && {
    rr: eventosPorCiclo(contagem, 'Diagnóstico', win),
    sal: eventosPorCiclo(contagem, 'SAL', win),
    cof: eventosPorCiclo(contagem, 'Oportunidade COF', win),
  }
  const bucket = new Map<string, { rr: number; sal: number; cof: number; ganhos: number; faturamento: number }>()
  const nomeOriginal = new Map<string, string>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_closer?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const normalized = key(nome)
    const cur = bucket.get(normalized) ?? { rr: 0, sal: 0, cof: 0, ganhos: 0, faturamento: 0 }
    if (ev) {
      const k = dealKey(r)
      cur.rr += ev.rr.get(k) ?? 0
      cur.sal += ev.sal.get(k) ?? 0
      cur.cof += ev.cof.get(k) ?? 0
    } else {
      if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
      if (isInWindow(r.data_sal, win)) cur.sal++
      if (isInWindow(r.data_oportunidade, win)) cur.cof++
    }
    if (r.status_atual === 'Ganho' && isInWindow(r.data_venda, win)) {
      // Toggle Negócios×Unidades da FilterBar — sem isso a coluna GANHOS da
      // tabela divergia do card Fechamentos, que já usava countSales.
      cur.ganhos += salesMode === 'units' ? saleUnits(r) : 1
      cur.faturamento += r.valor_contrato ?? 0
    }
    bucket.set(normalized, cur)
    if (!nomeOriginal.has(normalized)) nomeOriginal.set(normalized, nome)
  }

  return Array.from(bucket.entries()).map(([normalized, v]) => {
    const nome = nomeOriginal.get(normalized)!
    const metaFinanceira = findMeta(metas, nome, 'Closer')?.metaFinanceira ?? 0
    return {
      nome, ...v,
      metaFinanceira,
      pctAting: metaFinanceira > 0 ? (v.faturamento / metaFinanceira) * 100 : 0,
      winRate: v.rr > 0 ? (v.ganhos / v.rr) * 100 : 0,
    }
  }).sort((a, b) => b.pctAting - a.pctAting || b.faturamento - a.faturamento)
}
