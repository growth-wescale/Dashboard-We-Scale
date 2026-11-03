import { useCallback } from 'react'
import type { Lead } from '@/lib/types'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { consultarInbound } from '@/lib/mqlInbound'
import { marketingMqlRows } from '@/lib/leadUtils'
import { funilInversoMissao, projecaoMqlMidia } from '@/lib/missaoMetas'
import { useConsultaFiltrada } from './useConsultaFiltrada'

export function useSopMqlMetas(marca: string, inicio: string, fim: string, leads: Lead[], enabled: boolean) {
  const ler = useCallback(async (signal: AbortSignal) => {
    const rows = leads.filter(r => r.marca === marca && r.dia >= inicio && r.dia <= fim)
    const metas = await supabaseVendas.from('DB_Metas_Performance')
      .select('mes_referencia,marca,funcao,nome_colaborador,meta_financeira,meta_qtd_vendas,meta_sql,meta_volume_sal')
      .eq('mes_referencia', inicio).eq('marca', marca).eq('funcao', 'Closer').limit(201).abortSignal(signal)
    if (metas.error || !metas.data || metas.data.length > 200) throw new Error('Não foi possível consultar a meta mensal.')
    const cobertura = (await consultarInbound(supabaseVendas, rows, [marca], signal))[marca]
    return [{ mql: marketingMqlRows(rows).length, metaMql: funilInversoMissao(metas.data, marca, inicio).mql,
      cobertura, metaInbound: projecaoMqlMidia(marca, inicio)?.mql ?? null }]
  }, [marca, inicio, fim, leads])
  return useConsultaFiltrada(JSON.stringify(['sop:mql-metas', marca, inicio, fim]), ler, enabled)
}
