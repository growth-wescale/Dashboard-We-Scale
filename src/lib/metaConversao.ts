import type { RawMetaRow } from '@/hooks/useMetasPerformance'
import { META_NO_SHOW_MAX } from '@/constants/metasVendas'

/**
 * Meta de conversão por etapa, derivada das metas de VOLUME de
 * `DB_Metas_Performance` (pessoa × marca × mês) — a mesma tabela que alimenta os
 * cards de meta da aba Performance.
 *
 *     meta de conversão = Σ meta(etapa destino) ÷ Σ meta(etapa origem)
 *
 * Não existe tabela de "meta de conversão" viva: `DB_Metas_Conversao` foi
 * cadastrada em 02/07/2026 com valores idênticos nas 7 marcas, nunca foi
 * consumida e contradiz as metas do mês (ela diz SQL→Diagnóstico 90%, as metas
 * de set/26 dão 59%). Derivar do volume mantém uma fonte única: quando o Hub de
 * metas publica um mês novo, a meta de conversão acompanha sozinha.
 */

export type ConvKey =
  | 'sql_diag'   // Reunião Agendada SQL → Diagnóstico (RR)
  | 'diag_sal'   // Diagnóstico → SAL
  | 'sql_sal'    // Reunião Agendada SQL → SAL
  | 'sal_cof'    // SAL → Oportunidade · COF
  | 'cof_fech'   // Oportunidade · COF → Fechamento
  | 'sal_fech'   // SAL → Fechamento
  | 'no_show'    // SQL → No-show (teto fixo, não derivado)

/** `null` = sem meta pra esse recorte (etapa sem número cadastrado). */
export type MetasConversao = Record<ConvKey, number | null>

export interface EscopoMetaConversao {
  /** Marcas reais selecionadas na barra de filtros. Vazio = recorte vazio. */
  marcas: string[]
  /** SDRs selecionados. Vazio = todos. */
  sdrs?: string[]
  /** Closers selecionados. Vazio = todos. */
  closers?: string[]
}

// Linhas agregadas/categorias especiais da tabela — fora da conta pra não contar
// duas vezes (mesma exclusão de `useMetasPerformance`/`useMetasTimeResumo`).
const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])

const VAZIO: MetasConversao = {
  sql_diag: null, diag_sal: null, sql_sal: null,
  sal_cof: null, cof_fech: null, sal_fech: null,
  no_show: META_NO_SHOW_MAX,
}

interface EtapasSdr { sql: number; rr: number; sal: number }
interface EtapasCloser { cof: number; vendas: number }

const num = (v: number | string | null | undefined): number => Number(v) || 0

/**
 * Soma as duas pontas marca a marca e devolve a razão do conjunto, em %.
 *
 * Uma marca só entra quando as DUAS pontas têm meta > 0 — senão uma marca com
 * meta de venda mas sem meta de COF (Odonto Scale em set/26: 5 vendas, zero COF)
 * faria o COF→Fechamento estourar, somando o numerador sem o denominador
 * correspondente. Meta ausente e meta zerada são indistinguíveis depois da soma,
 * então as duas caem fora: é a leitura conservadora.
 */
function razao(
  marcas: string[],
  pontas: (marca: string) => { destino: number; origem: number } | null | undefined,
): number | null {
  let somaDestino = 0
  let somaOrigem = 0
  for (const marca of marcas) {
    const p = pontas(marca)
    if (!p || p.destino <= 0 || p.origem <= 0) continue
    somaDestino += p.destino
    somaOrigem += p.origem
  }
  return somaOrigem > 0 ? (somaDestino / somaOrigem) * 100 : null
}

/**
 * Metas de conversão do recorte atual (marca + pessoa).
 *
 * As etapas de SDR (SQL, Diagnóstico, SAL) saem das linhas de SDR; as de Closer
 * (COF, Fechamento) das linhas de Closer. Quando um Closer precisa de uma etapa
 * de SDR no denominador — `SAL → COF`, `SAL → Fechamento` — usa a meta da MARCA
 * (soma dos SDRs dela), porque a linha do Closer em `DB_Metas_Performance` só
 * traz COF, vendas e receita.
 *
 * Filtrar uma pessoa estreita o universo de marcas às marcas dela: selecionar o
 * Douglas (só Inpot) faz até o `Diagnóstico → SAL` do card virar o da Inpot, em
 * vez de continuar mostrando o consolidado ao lado de números que já são só dele.
 */
export function metasConversao(rows: RawMetaRow[], escopo: EscopoMetaConversao): MetasConversao {
  const marcasSel = new Set(escopo.marcas)
  if (marcasSel.size === 0) return { ...VAZIO }

  const sdrsSel = new Set(escopo.sdrs ?? [])
  const closersSel = new Set(escopo.closers ?? [])

  const sdrPorMarca = new Map<string, EtapasSdr>()
  const closerPorMarca = new Map<string, EtapasCloser>()
  const marcasComSdrFiltrado = new Set<string>()
  const marcasComCloserFiltrado = new Set<string>()

  for (const r of rows) {
    const marca = r.marca
    if (!marca || MARCAS_EXCLUIR.has(marca) || !marcasSel.has(marca)) continue
    if (!r.nome_colaborador) continue

    if (r.funcao === 'SDR') {
      if (sdrsSel.size > 0 && !sdrsSel.has(r.nome_colaborador)) continue
      marcasComSdrFiltrado.add(marca)
      const cur = sdrPorMarca.get(marca) ?? { sql: 0, rr: 0, sal: 0 }
      cur.sql += num(r.meta_sql)
      cur.rr  += num(r.meta_reuniao_realizada)
      cur.sal += num(r.meta_volume_sal)
      sdrPorMarca.set(marca, cur)
    } else if (r.funcao === 'Closer') {
      if (closersSel.size > 0 && !closersSel.has(r.nome_colaborador)) continue
      marcasComCloserFiltrado.add(marca)
      const cur = closerPorMarca.get(marca) ?? { cof: 0, vendas: 0 }
      cur.cof    += num(r.meta_cof)
      cur.vendas += num(r.meta_qtd_vendas)
      closerPorMarca.set(marca, cur)
    }
  }

  // Universo de marcas do recorte: marcas selecionadas, estreitadas pelas marcas
  // de cada pessoa filtrada. Sem filtro de pessoa daquele lado, não estreita.
  let marcas = [...marcasSel]
  if (sdrsSel.size > 0) marcas = marcas.filter(m => marcasComSdrFiltrado.has(m))
  if (closersSel.size > 0) marcas = marcas.filter(m => marcasComCloserFiltrado.has(m))
  if (marcas.length === 0) return { ...VAZIO }

  const sdr = (m: string) => sdrPorMarca.get(m)
  const clo = (m: string) => closerPorMarca.get(m)

  return {
    sql_diag: razao(marcas, m => { const s = sdr(m); return s && { destino: s.rr, origem: s.sql } }),
    diag_sal: razao(marcas, m => { const s = sdr(m); return s && { destino: s.sal, origem: s.rr } }),
    sql_sal:  razao(marcas, m => { const s = sdr(m); return s && { destino: s.sal, origem: s.sql } }),
    sal_cof:  razao(marcas, m => { const c = clo(m), s = sdr(m); return c && s && { destino: c.cof, origem: s.sal } }),
    cof_fech: razao(marcas, m => { const c = clo(m); return c && { destino: c.vendas, origem: c.cof } }),
    sal_fech: razao(marcas, m => { const c = clo(m), s = sdr(m); return c && s && { destino: c.vendas, origem: s.sal } }),
    // Teto definido pelo Junior (16/09/2026), não derivado de meta de volume:
    // não existe meta de no-show em lugar nenhum do banco de Expansão.
    no_show: META_NO_SHOW_MAX,
  }
}
