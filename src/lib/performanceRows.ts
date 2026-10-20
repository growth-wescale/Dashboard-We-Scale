import type { FunnelRow } from '@/lib/funnelTypes'
import type { EventCountOptions, FunnelEventRow, PeriodWindow, SalesMode, StageKey, ViewModes } from '@/lib/metrics'
import { dealKey, eventsInStage, isInWindow, matchesStage, saleUnits } from '@/lib/metrics'
import type { MembroRoster } from '@/hooks/useRosterVendas'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'
import { findMeta } from '@/hooks/useMetasPerformance'
import { EX_INTEGRANTES, SEM_RESPONSAVEL } from '@/lib/equipe'

export type GrupoLinha = 'ex-integrantes' | 'sem-responsavel'

export interface SdrRow {
  nome: string
  mql: number; sql: number; rr: number; sal: number
  metaSql: number
  pctAting: number
  mqlToSql: number
  /** Linha de soma, sem posição no ranking: quem saiu do time (`EX_INTEGRANTES`)
   *  ou negócio sem responsável (`SEM_RESPONSAVEL`). */
  grupo?: GrupoLinha
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
  /** Linha de soma, sem posição no ranking: quem saiu do time (`EX_INTEGRANTES`)
   *  ou negócio sem responsável (`SEM_RESPONSAVEL`). */
  grupo?: GrupoLinha
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

/**
 * Em que linha da tabela cada negócio entra, pra soma fechar com o card:
 * - pessoa ativa no cadastro: linha com o nome, mesmo fora do cargo da tabela
 *   (ex.: a SDR que fecha como Closer no Instituto do Autismo);
 * - inativa ou fora do cadastro: soma em `EX_INTEGRANTES`, sem nome;
 * - sem responsável: soma em `SEM_RESPONSAVEL` ("Sem SDR"/"Sem Closer").
 * Quem é do cargo da tabela aparece mesmo zerado (acompanha a meta); o resto,
 * só com número no período.
 */
const EX_KEY = '#ex-integrantes'
const SEM_KEY = '#sem-responsavel'

function classificador(roster: MembroRoster[], cargos: string[]) {
  const ativos = new Set(roster.filter(r => r.ativo).map(r => key(r.nome)))
  const doCargo = new Set(roster.filter(r => r.ativo && r.cargo && cargos.includes(r.cargo)).map(r => key(r.nome)))
  return {
    chave(nome: string | undefined): string {
      if (!nome) return SEM_KEY
      const k = key(nome)
      // Sem cadastro carregado ninguém vira Ex-integrantes (o mesmo de `saiuDoTime`).
      return ativos.size && !ativos.has(k) ? EX_KEY : k
    },
    sempreVisivel: (chave: string) => doCargo.has(chave),
    nomesEx: roster.filter(r => !r.ativo).map(r => r.nome),
  }
}

function grupoDaChave(chave: string): GrupoLinha | undefined {
  return chave === EX_KEY ? 'ex-integrantes' : chave === SEM_KEY ? 'sem-responsavel' : undefined
}

/** Pessoas no ranking primeiro; depois Ex-integrantes e Sem responsável, sem posição. */
const ORDEM_GRUPO: Record<string, number> = { 'ex-integrantes': 1, 'sem-responsavel': 2 }
function ordenarComGrupos<T extends { grupo?: GrupoLinha }>(linhas: T[], cmp: (a: T, b: T) => number): T[] {
  return linhas.sort((a, b) => (ORDEM_GRUPO[a.grupo ?? ''] ?? 0) - (ORDEM_GRUPO[b.grupo ?? ''] ?? 0) || cmp(a, b))
}

function nomeDaLinha(chave: string, nome: string | undefined, sem: string): string {
  return chave === EX_KEY ? EX_INTEGRANTES : chave === SEM_KEY ? sem : nome!
}

export function buildSdrRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
  contagem?: ContagemPorEvento,
): SdrRow[] {
  const linhaDe = classificador(roster, ['SDR', 'SDR/Closer'])
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
    const normalized = linhaDe.chave(nome)
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
    if (!nomeOriginal.has(normalized)) nomeOriginal.set(normalized, nomeDaLinha(normalized, nome, SEM_RESPONSAVEL.sdr))
  }

  const linhas = Array.from(bucket.entries()).map(([normalized, v]): SdrRow & { _chave: string } => {
    const grupo = grupoDaChave(normalized)
    const nome = nomeOriginal.get(normalized)!
    const metaSql = grupo === 'ex-integrantes'
      ? linhaDe.nomesEx.reduce((s, n) => s + (findMeta(metas, n, 'SDR')?.metaSql ?? 0), 0)
      : grupo ? 0 : findMeta(metas, nome, 'SDR')?.metaSql ?? 0
    return {
      nome, ...v,
      metaSql,
      pctAting: metaSql > 0 ? (v.sql / metaSql) * 100 : 0,
      mqlToSql: v.mql > 0 ? (v.sql / v.mql) * 100 : 0,
      ...(grupo ? { grupo } : {}),
      _chave: normalized,
    }
  }).filter(l => linhaDe.sempreVisivel(l._chave) || l.mql + l.sql + l.rr + l.sal + l.metaSql > 0)
    .map(({ _chave, ...l }) => l)
  return ordenarComGrupos(linhas, (a, b) => b.pctAting - a.pctAting || b.sql - a.sql)
}

export function buildCloserRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
  salesMode: SalesMode = 'deals',
  contagem?: ContagemPorEvento,
): CloserRow[] {
  const linhaDe = classificador(roster, ['Closer', 'SDR/Closer'])
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
    const normalized = linhaDe.chave(nome)
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
    // Mesma trava do card (`countSales`): com "Deals criados no período" vale a
    // safra do MQL, não a data da venda.
    const venda = contagem ? matchesStage(r, 'Fechamento', win, contagem.modes) : r.status_atual === 'Ganho' && isInWindow(r.data_venda, win)
    if (venda) {
      // Toggle Negócios×Unidades da FilterBar — sem isso a coluna GANHOS da
      // tabela divergia do card Fechamentos, que já usava countSales.
      cur.ganhos += salesMode === 'units' ? saleUnits(r) : 1
      cur.faturamento += r.valor_contrato ?? 0
    }
    bucket.set(normalized, cur)
    if (!nomeOriginal.has(normalized)) nomeOriginal.set(normalized, nomeDaLinha(normalized, nome, SEM_RESPONSAVEL.closer))
  }

  const linhas = Array.from(bucket.entries()).map(([normalized, v]): CloserRow & { _chave: string } => {
    const grupo = grupoDaChave(normalized)
    const nome = nomeOriginal.get(normalized)!
    const metaFinanceira = grupo === 'ex-integrantes'
      ? linhaDe.nomesEx.reduce((s, n) => s + (findMeta(metas, n, 'Closer')?.metaFinanceira ?? 0), 0)
      : grupo ? 0 : findMeta(metas, nome, 'Closer')?.metaFinanceira ?? 0
    return {
      nome, ...v,
      metaFinanceira,
      pctAting: metaFinanceira > 0 ? (v.faturamento / metaFinanceira) * 100 : 0,
      winRate: v.rr > 0 ? (v.ganhos / v.rr) * 100 : 0,
      ...(grupo ? { grupo } : {}),
      _chave: normalized,
    }
  }).filter(l => linhaDe.sempreVisivel(l._chave) || l.rr + l.sal + l.cof + l.ganhos + l.faturamento + l.metaFinanceira > 0)
    .map(({ _chave, ...l }) => l)
  return ordenarComGrupos(linhas, (a, b) => b.pctAting - a.pctAting || b.faturamento - a.faturamento)
}
