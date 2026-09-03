import { describe, it, expect } from 'vitest'
import { funilFilterOptions } from '@/lib/funilFilterOptions'
import { toWindow } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

function row(p: Partial<FunnelRow>): FunnelRow {
  return {
    id_lead: 'x', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Oral Unic', nome_funil: 'SDR', origem_comercial: 'Inbound',
    etapa_funil: 'Novo MQL', id_etapa_atual: null, status_atual: 'Em andamento',
    nome_negociacao: null, nome_sdr: null, nome_closer: null,
    fonte_macro: 'Inbound', sub_fonte: null, utm_source: 'meta', sub_fonte_crm: null,
    valor_contrato: null, quantidade_unidades: null, motivo_perda: null,
    data_novo_mql: '2026-08-10', data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    ...p,
  }
}

const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])

describe('funilFilterOptions', () => {
  it('só lista valores com deal na janela', () => {
    const rows = [
      row({ marca: 'Oral Unic', data_novo_mql: '2026-08-10' }),
      row({ marca: 'Viva', data_novo_mql: '2026-07-01', data_contato_efetivo: '2026-07-05' }),
    ]
    const out = funilFilterOptions({ rows, win, marcasParaEscopo: [], fontes: [], subFontes: [], cohort: false })
    expect(out.marcas).toEqual(['Oral Unic'])
  })

  it('cruza com os demais filtros: marca some quando um filtro de fonte incompatível está ativo', () => {
    const rows = [
      row({ marca: 'Oral Unic', fonte_macro: 'Inbound', data_novo_mql: '2026-08-10' }),
      row({ marca: 'Viva', fonte_macro: 'Resgate', data_novo_mql: '2026-08-12' }),
    ]
    const out = funilFilterOptions({ rows, win, marcasParaEscopo: [], fontes: ['Resgate'], subFontes: [], cohort: false })
    expect(out.marcas).toEqual(['Viva'])
  })

  it('modo cohort olha só data_novo_mql', () => {
    const rows = [
      // MQL fora da janela, mas etapa dentro: entra em stageDate, NÃO entra em cohort
      row({ marca: 'B2Case', data_novo_mql: '2026-07-01', data_sal: '2026-08-15' }),
    ]
    const semCohort = funilFilterOptions({ rows, win, marcasParaEscopo: [], fontes: [], subFontes: [], cohort: false })
    const comCohort = funilFilterOptions({ rows, win, marcasParaEscopo: [], fontes: [], subFontes: [], cohort: true })
    expect(semCohort.marcas).toEqual(['B2Case'])
    expect(comCohort.marcas).toEqual([])
  })
})
