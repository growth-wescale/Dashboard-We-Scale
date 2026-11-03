import { useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { fracoesSemanaisCloser, type SemanaCampanha } from '@/constants/metasCampanhaF1'

/**
 * Semanas e distribuição semanal das vendas da versão ATIVA do mês, na
 * Configuração das Metas — a Campanha de Metas usa as semanas como voltas e a
 * distribuição das vendas por Closer como o peso de cada volta na meta dele.
 *
 * `fracoesCloser`: por Closer, a fração das vendas do mês em cada semana
 * (índice 0 = semana 1), somando 1. `fracoesFatCloser`: o mesmo para a meta em
 * R$, com cada venda pesando o ticket da marca dela. Ausentes quando o mês não
 * distribuiu.
 */
export function useSemanasCampanha(mes: string): {
  semanas: SemanaCampanha[] | null
  fracoesCloser: Map<string, number[]> | null
  fracoesFatCloser: Map<string, number[]> | null
  loading: boolean
} {
  type Fracoes = Map<string, number[]> | null
  const [estado, setEstado] = useState<{ mes: string; semanas: SemanaCampanha[] | null; fracoesCloser: Fracoes; fracoesFatCloser: Fracoes } | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: versao } = await supabaseVendas
        .from('meta_versao').select('id').eq('mes_referencia', mes).eq('ativa', true).maybeSingle()
      if (!versao) {
        if (!cancelado) setEstado({ mes, semanas: null, fracoesCloser: null, fracoesFatCloser: null })
        return
      }
      const [{ data: semanasRows }, { data: vendasRows }] = await Promise.all([
        supabaseVendas.from('meta_semana').select('numero, data_inicio, data_fim').eq('meta_versao_id', versao.id).order('numero'),
        supabaseVendas
          .from('meta_pessoa_semana')
          .select('valor, meta_pessoa!inner(nome, funcao, meta_marca!inner(ticket_medio)), meta_semana!inner(numero, meta_versao_id)')
          .eq('etapa', 'Fechamento')
          .eq('meta_semana.meta_versao_id', versao.id),
      ])
      const semanas = (semanasRows ?? []).map(s => ({ numero: s.numero, inicio: s.data_inicio, fim: s.data_fim }))

      type Linha = { valor: number; meta_pessoa: { nome: string; funcao: string; meta_marca: { ticket_medio: number | null } }; meta_semana: { numero: number } }
      const linhas = ((vendasRows ?? []) as unknown as Linha[])
        .filter(r => r.meta_pessoa.funcao === 'Closer')
        .map(r => ({
          nome: r.meta_pessoa.nome,
          semana: r.meta_semana.numero,
          vendas: Number(r.valor) || 0,
          ticket: r.meta_pessoa.meta_marca?.ticket_medio != null ? Number(r.meta_pessoa.meta_marca.ticket_medio) : null,
        }))
      const { unidades, faturamento } = fracoesSemanaisCloser(linhas, semanas.length)
      if (!cancelado) setEstado({ mes, semanas, fracoesCloser: unidades.size > 0 ? unidades : null, fracoesFatCloser: faturamento.size > 0 ? faturamento : null })
    })().catch(() => { if (!cancelado) setEstado({ mes, semanas: null, fracoesCloser: null, fracoesFatCloser: null }) })
    return () => { cancelado = true }
  }, [mes])

  const atual = estado?.mes === mes ? estado : null
  return { semanas: atual?.semanas ?? null, fracoesCloser: atual?.fracoesCloser ?? null, fracoesFatCloser: atual?.fracoesFatCloser ?? null, loading: atual == null }
}
