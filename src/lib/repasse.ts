import { normalizeMarcaRaw } from '@/constants/brands'
import { toLocalDate } from '@/lib/dateUtils'

/**
 * Repasse da taxa de franquia: quanto de cada venda fica com a We Scale e quanto
 * vai pra marca. As percentagens vivem em versões imutáveis com data de vigência
 * (`vw_repasse_taxa`, Supabase de Expansão). Cada venda usa a versão vigente NA
 * DATA DA VENDA — publicar uma versão nova nunca muda o que já foi vendido antes.
 *
 * Marca sem percentual cadastrado na versão conta 100% We Scale.
 */

export interface RepasseLinha {
  versao_id: number
  numero: number
  vigente_desde: string // YYYY-MM-DD
  motivo: string | null
  criado_por: string | null
  criado_em: string
  marca: string
  pct_we_scale: number
}

export interface VersaoRepasse {
  id: number
  numero: number
  vigenteDesde: string
  motivo: string | null
  criadoPor: string | null
  criadoEm: string
  /** marca canônica (a de FunnelRow.marca) → % que fica com a We Scale */
  pctPorMarca: Map<string, number>
}

/** Agrupa as linhas da view em versões, da mais antiga pra mais nova. */
export function montarVersoes(linhas: readonly RepasseLinha[]): VersaoRepasse[] {
  const porId = new Map<number, VersaoRepasse>()
  for (const l of linhas) {
    let v = porId.get(l.versao_id)
    if (!v) {
      v = {
        id: l.versao_id, numero: l.numero, vigenteDesde: l.vigente_desde, motivo: l.motivo,
        criadoPor: l.criado_por, criadoEm: l.criado_em, pctPorMarca: new Map(),
      }
      porId.set(l.versao_id, v)
    }
    const marca = normalizeMarcaRaw(l.marca) ?? l.marca
    v.pctPorMarca.set(marca, Number(l.pct_we_scale))
  }
  return [...porId.values()].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
}

/**
 * Versão que vale num dia (YYYY-MM-DD): a de maior vigência ≤ dia. Venda antes da
 * 1ª versão usa a 1ª — não existe regra mais antiga pra ela.
 */
export function versaoNoDia(versoes: readonly VersaoRepasse[], dia: string | null): VersaoRepasse | null {
  if (versoes.length === 0) return null
  if (!dia) return versoes[versoes.length - 1]
  let escolhida = versoes[0]
  for (const v of versoes) if (v.vigenteDesde <= dia) escolhida = v
  return escolhida
}

/** % da venda que fica com a We Scale (0–100). Sem cadastro = 100. */
export function pctWeScale(versoes: readonly VersaoRepasse[], marca: string | null | undefined, dataVenda: string | null | undefined): number {
  const v = versaoNoDia(versoes, toLocalDate(dataVenda))
  if (!v || !marca) return 100
  return v.pctPorMarca.get(normalizeMarcaRaw(marca) ?? marca) ?? 100
}

export interface DivisaoReceita {
  total: number
  weScale: number
  marca: number
}

export const DIVISAO_VAZIA: DivisaoReceita = { total: 0, weScale: 0, marca: 0 }

/** Divide o valor de uma venda entre We Scale e marca. */
export function dividirVenda(
  versoes: readonly VersaoRepasse[],
  venda: { marca: string | null; data_venda: string | null; valor_contrato: number | null },
): DivisaoReceita {
  const total = Number(venda.valor_contrato ?? 0) || 0
  const weScale = total * pctWeScale(versoes, venda.marca, venda.data_venda) / 100
  return { total, weScale, marca: total - weScale }
}

/** Soma a divisão de várias vendas (já filtradas: só ganhos no período). */
export function dividirReceita(
  versoes: readonly VersaoRepasse[],
  vendas: readonly { marca: string | null; data_venda: string | null; valor_contrato: number | null }[],
): DivisaoReceita {
  let total = 0, weScale = 0
  for (const v of vendas) {
    const d = dividirVenda(versoes, v)
    total += d.total
    weScale += d.weScale
  }
  return { total, weScale, marca: total - weScale }
}

/** Marcas que mudaram de % entre duas versões (pra mostrar o que cada versão trocou). */
export function diffVersoes(anterior: VersaoRepasse | null, atual: VersaoRepasse): { marca: string; de: number; para: number }[] {
  const marcas = new Set([...atual.pctPorMarca.keys(), ...(anterior?.pctPorMarca.keys() ?? [])])
  const out: { marca: string; de: number; para: number }[] = []
  for (const m of marcas) {
    const de = anterior?.pctPorMarca.get(m) ?? 100
    const para = atual.pctPorMarca.get(m) ?? 100
    if (de !== para) out.push({ marca: m, de, para })
  }
  return out.sort((a, b) => a.marca.localeCompare(b.marca))
}
