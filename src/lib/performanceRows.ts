import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow } from '@/lib/metrics'
import { isInWindow } from '@/lib/metrics'
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
  ganhos: number; faturamento: number
  metaFinanceira: number
  pctAting: number
  winRate: number
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function rosterSet(roster: MembroRoster[], cargos: MembroRoster['cargo'][]): Set<string> {
  return new Set(roster.filter(r => cargos.includes(r.cargo)).map(r => key(r.nome)))
}

export function buildSdrRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
): SdrRow[] {
  const valid = rosterSet(roster, ['SDR', 'SDR/Closer'])
  const bucket = new Map<string, { mql: number; sql: number; rr: number; sal: number }>()
  const nomeOriginal = new Map<string, string>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_sdr?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const normalized = key(nome)
    const cur = bucket.get(normalized) ?? { mql: 0, sql: 0, rr: 0, sal: 0 }
    if (isInWindow(r.data_novo_mql, win)) cur.mql++
    if (isInWindow(r.data_agendamento_reuniao_sql, win)) cur.sql++
    if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
    if (isInWindow(r.data_sal, win)) cur.sal++
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
  }).sort((a, b) => b.pctAting - a.pctAting)
}

export function buildCloserRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
): CloserRow[] {
  const valid = rosterSet(roster, ['Closer', 'SDR/Closer'])
  const bucket = new Map<string, { rr: number; sal: number; cof: number; ganhos: number; faturamento: number }>()
  const nomeOriginal = new Map<string, string>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_closer?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const normalized = key(nome)
    const cur = bucket.get(normalized) ?? { rr: 0, sal: 0, cof: 0, ganhos: 0, faturamento: 0 }
    if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
    if (isInWindow(r.data_sal, win)) cur.sal++
    if (isInWindow(r.data_oportunidade, win)) cur.cof++
    if (r.status_atual === 'Ganho' && isInWindow(r.data_venda, win)) {
      cur.ganhos++
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
  }).sort((a, b) => b.pctAting - a.pctAting)
}
