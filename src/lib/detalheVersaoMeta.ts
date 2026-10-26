/**
 * Leitura de uma versão publicada das metas, pra conferir sem abrir uma revisão.
 *
 * Funil por marca: reconstruído da configuração gravada (vendas, taxa de
 * franquia, conversões e números fixos) pelo mesmo cálculo da montagem.
 * Metas por pessoa: as linhas congeladas do espelho (`linhas_espelho`), que é
 * exatamente o que a versão grava em `DB_Metas_Performance` ao ser ativada.
 */
import type { EstadoMes, VersaoMeta } from '@/hooks/useMetaMes'
import type { DiaSemana, LinhaEspelho, Semana } from '@/lib/metasEngine'
import {
  ETAPAS_COM_META, ETAPA_ABAIXO, arredondarMeta, calcularFunil, ordenarMarcas, rascunhoDeVersao,
  type EtapaMetaConfig,
} from '@/lib/configMetas'

export interface DetalheEtapa {
  meta: number | null
  /** Conversão desta etapa pra de baixo (MQL e Ligações: pro SQL). Vendas não tem. */
  taxa: number | null
  /** Número digitado à mão, em vez de calculado pela conversão. */
  fixo: boolean
}

export interface DetalheMarca {
  marca: string
  vendas: number | null
  ticketMedio: number | null
  faturamento: number | null
  etapas: Record<EtapaMetaConfig, DetalheEtapa>
}

export interface DetalhePessoa {
  nome: string
  funcao: 'SDR' | 'Closer'
  /** Peso da pessoa em cada marca. Nulo em versão importada da planilha (a divisão veio pronta). */
  marcas: { marca: string; peso: number | null }[]
  /** Somado entre as marcas e arredondado pra cima, como a Performance mostra. */
  valores: Partial<Record<EtapaMetaConfig, number>>
  faturamento: number | null
}

export interface DetalheVersao {
  marcas: DetalheMarca[]
  total: DetalheMarca
  sdrs: DetalhePessoa[]
  closers: DetalhePessoa[]
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  /** Só as marcas com vendas distribuídas por semana. */
  vendasPorSemana: { marca: string; porSemana: number[]; total: number }[]
}

const ABAIXO_DE = ETAPA_ABAIXO as Partial<Record<EtapaMetaConfig, EtapaMetaConfig>>

function somaOuNulo(valores: (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v != null)
  return presentes.length ? presentes.reduce((a, b) => a + b, 0) : null
}

/** Totais do mês. A conversão do total só usa as marcas que têm as duas pontas. */
function totalDasMarcas(marcas: DetalheMarca[]): DetalheMarca {
  const etapas = {} as Record<EtapaMetaConfig, DetalheEtapa>
  for (const e of ETAPAS_COM_META) {
    const abaixo = ABAIXO_DE[e]
    let num = 0
    let den = 0
    if (abaixo) {
      for (const m of marcas) {
        const v = m.etapas[e].meta
        const b = m.etapas[abaixo].meta
        if (v != null && v > 0 && b != null) { den += v; num += b }
      }
    }
    etapas[e] = { meta: somaOuNulo(marcas.map(m => m.etapas[e].meta)), taxa: den > 0 ? num / den : null, fixo: false }
  }
  const vendas = somaOuNulo(marcas.map(m => m.vendas))
  const faturamento = somaOuNulo(marcas.map(m => m.faturamento))
  return {
    marca: 'Total', vendas, faturamento, etapas,
    ticketMedio: vendas != null && vendas > 0 && faturamento != null ? faturamento / vendas : null,
  }
}

function valoresDaLinha(l: LinhaEspelho): { valores: Partial<Record<EtapaMetaConfig, number>>; faturamento: number | null } {
  const n = (v: number | string | null | undefined) => (v == null || v === '' ? undefined : Number(v))
  const brutos: Partial<Record<EtapaMetaConfig, number | undefined>> = l.funcao === 'SDR'
    ? { MQL: n(l.meta_mql), 'Reunião Agendada SQL': n(l.meta_sql), 'Reunião Realizada': n(l.meta_reuniao_realizada), SAL: n(l.meta_volume_sal) }
    : { 'Oportunidade COF': n(l.meta_cof), Fechamento: n(l.meta_qtd_vendas) }
  const valores: Partial<Record<EtapaMetaConfig, number>> = {}
  for (const [e, v] of Object.entries(brutos) as [EtapaMetaConfig, number | undefined][]) {
    if (v != null && Number.isFinite(v)) valores[e] = v
  }
  return { valores, faturamento: l.funcao === 'Closer' ? n(l.meta_financeira) ?? null : null }
}

function pessoasDoEspelho(versao: Pick<VersaoMeta, 'origem' | 'linhasEspelho'>, estado: EstadoMes): DetalhePessoa[] {
  const porChave = new Map<string, DetalhePessoa>()
  for (const l of versao.linhasEspelho) {
    const chave = `${l.funcao}|${l.nome_colaborador}`
    const atual = porChave.get(chave) ?? { nome: l.nome_colaborador, funcao: l.funcao, marcas: [], valores: {}, faturamento: null }
    const pessoa = estado.marcas.find(m => m.marca === l.marca)?.pessoas.find(p => p.nome === l.nome_colaborador && p.funcao === l.funcao)
    atual.marcas.push({ marca: l.marca, peso: versao.origem === 'importado' ? null : pessoa?.peso ?? null })
    const { valores, faturamento } = valoresDaLinha(l)
    for (const [e, v] of Object.entries(valores) as [EtapaMetaConfig, number][]) atual.valores[e] = (atual.valores[e] ?? 0) + v
    if (faturamento != null) atual.faturamento = (atual.faturamento ?? 0) + faturamento
    porChave.set(chave, atual)
  }
  return [...porChave.values()]
    .map(p => ({
      ...p,
      marcas: ordenarMarcas(p.marcas),
      valores: Object.fromEntries(Object.entries(p.valores).map(([e, v]) => [e, arredondarMeta(v)])) as DetalhePessoa['valores'],
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function detalharVersao(
  mesReferencia: string,
  versao: Pick<VersaoMeta, 'id' | 'numero' | 'rotulo' | 'origem' | 'linhasEspelho'>,
  estado: EstadoMes,
): DetalheVersao {
  const rascunho = rascunhoDeVersao(mesReferencia, versao, estado)

  const marcas = rascunho.marcas.map((m): DetalheMarca => {
    const funil = calcularFunil(m)
    const etapas = {} as Record<EtapaMetaConfig, DetalheEtapa>
    for (const e of ETAPAS_COM_META) {
      const c = funil.etapas[e]
      etapas[e] = { meta: c.meta, taxa: c.meta != null ? c.taxa : null, fixo: c.origem === 'manual' }
    }
    return { marca: m.marca, vendas: m.vendas, ticketMedio: m.ticketMedio, faturamento: funil.faturamento, etapas }
  })

  const pessoas = pessoasDoEspelho(versao, estado)

  const vendasPorSemana = marcas.flatMap(m => {
    const porSemana = rascunho.semanas.map(s => rascunho.vendasPorSemana.find(v => v.marca === m.marca && v.semanaNumero === s.numero)?.valor ?? 0)
    const total = porSemana.reduce((a, b) => a + b, 0)
    return total > 0 ? [{ marca: m.marca, porSemana, total }] : []
  })

  return {
    marcas,
    total: totalDasMarcas(marcas),
    sdrs: pessoas.filter(p => p.funcao === 'SDR'),
    closers: pessoas.filter(p => p.funcao === 'Closer'),
    diaViradaSemana: rascunho.diaViradaSemana,
    semanas: rascunho.semanas,
    vendasPorSemana,
  }
}

/** Etapa logo abaixo, pra rotular a conversão ("→ SQL"). */
export function etapaAbaixo(e: EtapaMetaConfig): EtapaMetaConfig | null {
  return ABAIXO_DE[e] ?? null
}
