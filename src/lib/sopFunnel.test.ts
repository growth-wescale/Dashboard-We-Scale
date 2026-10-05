import { describe, expect, it } from 'vitest'
import type { VwMarketingFunil } from '@/hooks/useVendasFunil'
import type { FunnelEventRow } from '@/lib/metrics'
import { countSopSqlDeals } from '@/lib/sopFunnel'

const row = (id: string, dataSql: string | null): VwMarketingFunil => ({
  id_lead: id,
  marca: 'Lisô Laser',
  data_criacao_negociacao: null,
  data_mql: null,
  data_tentando_contato: null,
  data_contato_efetivo: null,
  data_sql: dataSql,
  data_diagnostico: null,
  data_sal: null,
  data_oportunidade: null,
  data_venda: null,
  data_perdido: null,
  data_no_show: null,
  status_atual: 'Em andamento',
  motivo_perda: null,
  valor_contrato: null,
  quantidade_unidades: null,
  fonte: null,
  fonte_macro: null,
  sub_fonte: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  funil: 'Closer',
  etapa_funil: null,
})

const sqlEvent = (id: string): FunnelEventRow => ({
  id_deal: id,
  dia: '2026-09-21',
  etapa_canonica: 'Reunião Agendada SQL',
  id_etapa: '69b1badfe1def700137f1b89',
  nome_funil: 'Closer',
  ciclo: 1,
  marca_deal: 'Lisô Laser',
})

const sqlEventSdr = (id: string): FunnelEventRow => ({
  ...sqlEvent(id),
  id_etapa: '69380917e00ed10014daaa68',
  nome_funil: 'SDR',
})

describe('countSopSqlDeals', () => {
  it('usa o histórico quando a coluna legada está vazia', () => {
    expect(countSopSqlDeals([row('deal-1', null)], [sqlEventSdr('deal-1')], '2026-09-01', '2026-09-30')).toBe(1)
  })

  it('não duplica o mesmo negócio presente nas duas fontes', () => {
    expect(countSopSqlDeals([row('deal-1', '2026-09-21')], [sqlEvent('deal-1')], '2026-09-01', '2026-09-30')).toBe(1)
  })

  it('não inclui evento de negócio fora do recorte filtrado', () => {
    expect(countSopSqlDeals([row('deal-1', null)], [sqlEvent('deal-2')], '2026-09-01', '2026-09-30')).toBe(0)
  })
})
