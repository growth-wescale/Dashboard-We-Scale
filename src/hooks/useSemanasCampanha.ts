import { useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { SemanaCampanha } from '@/constants/metasCampanhaF1'

/**
 * Semanas e distribuição semanal das vendas da versão ATIVA do mês, na
 * Configuração das Metas — a Campanha de Metas usa as semanas como voltas e a
 * distribuição das vendas por Closer como o peso de cada volta na meta dele.
 *
 * `fracoesCloser`: por Closer, a fração das vendas do mês em cada semana
 * (índice 0 = semana 1), somando 1. Ausente quando o mês não distribuiu.
 */
export function useSemanasCampanha(mes: string): {
  semanas: SemanaCampanha[] | null
  fracoesCloser: Map<string, number[]> | null
  loading: boolean
} {
  const [estado, setEstado] = useState<{ mes: string; semanas: SemanaCampanha[] | null; fracoesCloser: Map<string, number[]> | null } | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: versao } = await supabaseVendas
        .from('meta_versao').select('id').eq('mes_referencia', mes).eq('ativa', true).maybeSingle()
      if (!versao) {
        if (!cancelado) setEstado({ mes, semanas: null, fracoesCloser: null })
        return
      }
      const [{ data: semanasRows }, { data: vendasRows }] = await Promise.all([
        supabaseVendas.from('meta_semana').select('numero, data_inicio, data_fim').eq('meta_versao_id', versao.id).order('numero'),
        supabaseVendas
          .from('meta_pessoa_semana')
          .select('valor, meta_pessoa!inner(nome, funcao), meta_semana!inner(numero, meta_versao_id)')
          .eq('etapa', 'Fechamento')
          .eq('meta_semana.meta_versao_id', versao.id),
      ])
      const semanas = (semanasRows ?? []).map(s => ({ numero: s.numero, inicio: s.data_inicio, fim: s.data_fim }))

      const porCloser = new Map<string, number[]>()
      for (const r of (vendasRows ?? []) as unknown as Array<{ valor: number; meta_pessoa: { nome: string; funcao: string }; meta_semana: { numero: number } }>) {
        if (r.meta_pessoa.funcao !== 'Closer') continue
        const nome = r.meta_pessoa.nome.trim()
        const arr = porCloser.get(nome) ?? semanas.map(() => 0)
        const i = r.meta_semana.numero - 1
        if (i >= 0 && i < arr.length) arr[i] += Number(r.valor) || 0
        porCloser.set(nome, arr)
      }
      const fracoes = new Map<string, number[]>()
      for (const [nome, arr] of porCloser) {
        const total = arr.reduce((a, b) => a + b, 0)
        if (total > 0) fracoes.set(nome, arr.map(v => v / total))
      }
      if (!cancelado) setEstado({ mes, semanas, fracoesCloser: fracoes.size > 0 ? fracoes : null })
    })().catch(() => { if (!cancelado) setEstado({ mes, semanas: null, fracoesCloser: null }) })
    return () => { cancelado = true }
  }, [mes])

  const atual = estado?.mes === mes ? estado : null
  return { semanas: atual?.semanas ?? null, fracoesCloser: atual?.fracoesCloser ?? null, loading: atual == null }
}
