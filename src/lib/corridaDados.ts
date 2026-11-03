import { emJanelas, type Janela } from '@/constants/metasCampanhaF1'
import { saleUnits } from '@/lib/metrics'
import type { RrUnidade, Trilha, VendaUnidade } from '@/lib/corridaPerformance'

/**
 * Corrida de Performance — linhas de `vw_funil_vendas` → unidades do placar.
 *
 * Puro (sem Supabase), pra o hook da página (`useCorridaPerformance`) e o
 * pop-up "pontos" de um negócio (`usePontosDoNegocio`) separarem o que
 * pontua EXATAMENTE do mesmo jeito: só quem tem meta no mês (o piloto) entra;
 * o resto vira "não pontuou", com o nome que estava no RD, pra tela de
 * transparência dizer o motivo.
 */

/** RR realizada, como vem de `vw_funil_vendas`. */
export interface RawRr {
  id_lead: string
  ciclo: number
  nome_negociacao: string | null
  nome_sdr: string | null
  fonte_macro: string | null
  marca: string | null
  data_novo_mql: string | null
  data_agendamento_reuniao_sql: string | null
  data_reuniao_realizada: string | null
}

/** Venda ganha, como vem de `vw_funil_vendas`. */
export interface RawVenda {
  id_lead: string
  ciclo: number
  nome_negociacao: string | null
  nome_closer: string | null
  fonte_macro: string | null
  marca: string | null
  quantidade_unidades: number | null
  data_reuniao_realizada: string | null
  data_venda: string | null
}

/** RR ou venda da janela que não pontuou pra ninguém (responsável vazio ou sem meta no mês). */
export interface ForaCorrida {
  trilha: Trilha
  idLead: string
  ciclo: number
  negociacao: string | null
  marca: string | null
  /** Nome como está no RD (`nome_sdr`/`nome_closer`); `null` = campo vazio. */
  nome: string | null
  /** RR realizada (SDR) ou venda (Closer). */
  data: string
  unidades: number
}

function chaveNome(s: string): string {
  return s.trim().toLowerCase()
}

/** Nome do RD → nome canônico do piloto (sem diferenciar caixa e espaço nas pontas). */
export function lookupPilotos(nomes: readonly string[]): Map<string, string> {
  return new Map(nomes.map(n => [chaveNome(n), n]))
}

/** RRs da janela: as de piloto viram unidade da trilha SDR; as outras, "não pontuou". */
export function separarRrs(
  rrs: readonly RawRr[],
  pilotos: readonly string[],
  janelas?: readonly Janela[],
): { unidades: RrUnidade[]; fora: ForaCorrida[] } {
  const lookup = lookupPilotos(pilotos)
  const unidades: RrUnidade[] = []
  const fora: ForaCorrida[] = []
  for (const r of rrs) {
    if (!r.data_reuniao_realizada || !emJanelas(r.data_reuniao_realizada, janelas)) continue
    const nome = lookup.get(chaveNome(r.nome_sdr ?? ''))
    if (!nome) {
      fora.push({
        trilha: 'sdr', idLead: r.id_lead, ciclo: r.ciclo, negociacao: r.nome_negociacao, marca: r.marca,
        nome: r.nome_sdr?.trim() || null, data: r.data_reuniao_realizada, unidades: 1,
      })
      continue
    }
    unidades.push({
      nome,
      idLead: r.id_lead,
      ciclo: r.ciclo,
      negociacao: r.nome_negociacao,
      fonte: r.fonte_macro,
      marca: r.marca,
      dataMql: r.data_novo_mql,
      dataAgendamento: r.data_agendamento_reuniao_sql,
      dataRr: r.data_reuniao_realizada,
    })
  }
  return { unidades, fora }
}

/** Vendas da janela: as de piloto viram unidade da trilha Closer; as outras, "não pontuou". */
export function separarVendas(
  vendas: readonly RawVenda[],
  pilotos: readonly string[],
  janelas?: readonly Janela[],
): { unidades: VendaUnidade[]; fora: ForaCorrida[] } {
  const lookup = lookupPilotos(pilotos)
  const unidades: VendaUnidade[] = []
  const fora: ForaCorrida[] = []
  for (const v of vendas) {
    if (!v.data_venda || !emJanelas(v.data_venda, janelas)) continue
    const nome = lookup.get(chaveNome(v.nome_closer ?? ''))
    if (!nome) {
      fora.push({
        trilha: 'closer', idLead: v.id_lead, ciclo: v.ciclo, negociacao: v.nome_negociacao, marca: v.marca,
        nome: v.nome_closer?.trim() || null, data: v.data_venda, unidades: saleUnits(v),
      })
      continue
    }
    unidades.push({
      nome,
      idLead: v.id_lead,
      ciclo: v.ciclo,
      negociacao: v.nome_negociacao,
      fonte: v.fonte_macro,
      marca: v.marca,
      dataRr: v.data_reuniao_realizada,
      dataVenda: v.data_venda,
      unidades: saleUnits(v),
    })
  }
  return { unidades, fora }
}

/**
 * Limites do mês em Brasília pra consulta no banco (as colunas são
 * timestamptz). Sem o fuso, o mês da consulta seria o de UTC: uma RR às 22h
 * do dia 30 (Brasília) cairia no mês seguinte — e a volta 4 (recortada por
 * dia de Brasília) não a veria em mês nenhum.
 */
export function limitesDoMes(mesRef: string): { inicio: string; fim: string } {
  const [ano, mes] = mesRef.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  const mm = String(mes).padStart(2, '0')
  return {
    inicio: `${ano}-${mm}-01T00:00:00-03:00`,
    fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}T23:59:59.999-03:00`,
  }
}
