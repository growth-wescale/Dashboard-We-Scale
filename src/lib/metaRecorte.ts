import type { RawMetaRow } from '@/hooks/useMetasPerformance'

/**
 * Meta mensal dos cards de ritmo da aba Performance, somada sobre o recorte da
 * barra de filtros: marcas selecionadas e, quando há filtro de pessoa, só as
 * linhas dela.
 *
 * Cada lado segue o próprio filtro: SQL, Diagnóstico e SAL vêm das linhas de
 * SDR (estreitadas por `sdrs`); COF, vendas e receita das linhas de Closer
 * (estreitadas por `closers`). Antes a meta era sempre a do time inteiro por
 * marca — com SDR = Xayane o card mostrava 246 SQL de meta (o time) enquanto a
 * tabela logo abaixo mostrava 72 (ela).
 */
export interface MetaRecorte {
  metaSql: number
  metaReuniao: number
  metaSal: number
  metaCof: number
  metaQtdVendas: number
  metaFinanceira: number
}

export interface EscopoMetaRecorte {
  marcas: string[]
  sdrs?: string[]
  closers?: string[]
}

const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])
const chave = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const num = (v: number | string | null | undefined) => Number(v) || 0

export function metaDoRecorte(rows: RawMetaRow[], escopo: EscopoMetaRecorte): MetaRecorte {
  const acc: MetaRecorte = { metaSql: 0, metaReuniao: 0, metaSal: 0, metaCof: 0, metaQtdVendas: 0, metaFinanceira: 0 }
  const marcas = new Set(escopo.marcas)
  const sdrs = new Set((escopo.sdrs ?? []).map(chave))
  const closers = new Set((escopo.closers ?? []).map(chave))

  for (const r of rows) {
    if (!r.nome_colaborador || !r.marca || MARCAS_EXCLUIR.has(r.marca) || !marcas.has(r.marca)) continue
    const nome = chave(r.nome_colaborador)
    if (r.funcao === 'SDR') {
      if (sdrs.size > 0 && !sdrs.has(nome)) continue
      acc.metaSql += num(r.meta_sql)
      acc.metaReuniao += num(r.meta_reuniao_realizada)
      acc.metaSal += num(r.meta_volume_sal)
    } else if (r.funcao === 'Closer') {
      if (closers.size > 0 && !closers.has(nome)) continue
      acc.metaCof += num(r.meta_cof)
      acc.metaQtdVendas += num(r.meta_qtd_vendas)
      acc.metaFinanceira += num(r.meta_financeira)
    }
  }
  return acc
}
