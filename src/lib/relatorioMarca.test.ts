import { describe, expect, it } from 'vitest'
import {
  canalUtm, ehDuplicado, leiturasRelatorio, montarRelatorio, normalizarPeriodo, periodoComparacao,
  periodoPadrao, rotuloPeriodo, situacaoPeriodo, somarMeses, tituloPeriodo,
} from './relatorioMarca'
import type { FunnelRow } from '@/lib/funnelTypes'
import type { FunnelEventRow } from '@/lib/metrics'

describe('período', () => {
  it('padrão é do dia 1 até hoje', () => {
    expect(periodoPadrao('2026-11-12')).toEqual({ de: '2026-11-01', ate: '2026-11-12' })
  })

  it('valida e corrige o que vem da URL', () => {
    expect(normalizarPeriodo(null, null, '2026-11-12')).toEqual({ de: '2026-11-01', ate: '2026-11-12' })
    expect(normalizarPeriodo('2026-10-01', '2026-10-31', '2026-11-12')).toEqual({ de: '2026-10-01', ate: '2026-10-31' })
    // até depois de hoje encosta em hoje
    expect(normalizarPeriodo('2026-11-01', '2026-11-30', '2026-11-12')).toEqual({ de: '2026-11-01', ate: '2026-11-12' })
    // invertido troca de lugar
    expect(normalizarPeriodo('2026-10-31', '2026-10-01', '2026-11-12')).toEqual({ de: '2026-10-01', ate: '2026-10-31' })
    // data inválida cai no padrão
    expect(normalizarPeriodo('2026-02-30', 'xx', '2026-11-12')).toEqual({ de: '2026-11-01', ate: '2026-11-12' })
    // só o "de": vai até hoje
    expect(normalizarPeriodo('2026-11-05', null, '2026-11-12')).toEqual({ de: '2026-11-05', ate: '2026-11-12' })
  })

  it('soma meses encostando no último dia', () => {
    expect(somarMeses('2026-03-31', -1)).toBe('2026-02-28')
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('compara mês inteiro com o mês inteiro anterior', () => {
    expect(periodoComparacao({ de: '2026-10-01', ate: '2026-10-31' })).toEqual({ de: '2026-09-01', ate: '2026-09-30' })
    expect(periodoComparacao({ de: '2026-03-01', ate: '2026-03-31' })).toEqual({ de: '2026-02-01', ate: '2026-02-28' })
    expect(periodoComparacao({ de: '2026-09-01', ate: '2026-10-31' })).toEqual({ de: '2026-07-01', ate: '2026-08-31' })
  })

  it('compara pedaço de mês com as mesmas datas um mês antes', () => {
    expect(periodoComparacao({ de: '2026-11-01', ate: '2026-11-12' })).toEqual({ de: '2026-10-01', ate: '2026-10-12' })
    expect(periodoComparacao({ de: '2026-10-28', ate: '2026-11-05' })).toEqual({ de: '2026-09-28', ate: '2026-10-05' })
  })

  it('período longo e quebrado compara com o mesmo número de dias logo antes', () => {
    expect(periodoComparacao({ de: '2026-09-15', ate: '2026-11-12' })).toEqual({ de: '2026-07-18', ate: '2026-09-14' })
  })

  it('rótulos', () => {
    expect(rotuloPeriodo({ de: '2026-11-01', ate: '2026-11-12' })).toBe('01 a 12/11/2026')
    expect(rotuloPeriodo({ de: '2026-10-28', ate: '2026-11-05' })).toBe('28/10 a 05/11/2026')
    expect(rotuloPeriodo({ de: '2025-12-20', ate: '2026-01-05' })).toBe('20/12/2025 a 05/01/2026')
    expect(rotuloPeriodo({ de: '2026-11-03', ate: '2026-11-03' })).toBe('03/11/2026')
    expect(tituloPeriodo({ de: '2026-11-01', ate: '2026-11-12' })).toBe('Novembro 2026')
    expect(tituloPeriodo({ de: '2026-10-28', ate: '2026-11-05' })).toBe('28/10 a 05/11/2026')
    expect(situacaoPeriodo({ de: '2026-10-01', ate: '2026-10-31' }, '2026-11-12')).toBe('mês fechado')
    expect(situacaoPeriodo({ de: '2026-11-01', ate: '2026-11-12' }, '2026-11-12')).toBe('mês em curso')
    expect(situacaoPeriodo({ de: '2026-11-03', ate: '2026-11-12' }, '2026-11-12')).toBeNull()
  })
})

describe('regras', () => {
  it('duplicado é perda com motivo Duplicado', () => {
    expect(ehDuplicado({ status_atual: 'Perdido', motivo_perda: 'Duplicado' })).toBe(true)
    expect(ehDuplicado({ status_atual: 'Perdido', motivo_perda: '[NOVO] Duplicado' })).toBe(true)
    expect(ehDuplicado({ status_atual: 'Em andamento', motivo_perda: 'Duplicado' })).toBe(false)
    expect(ehDuplicado({ status_atual: 'Perdido', motivo_perda: 'Fora do perfil (ICP)' })).toBe(false)
  })

  it('canal separa Facebook, Instagram e Audience Network', () => {
    expect(canalUtm('facebook')).toBe('Facebook')
    expect(canalUtm('IG')).toBe('Instagram')
    expect(canalUtm('audience_network')).toBe('Audience Network')
    expect(canalUtm('')).toBe('Sem UTM')
    expect(canalUtm(null)).toBe('Sem UTM')
    expect(canalUtm('google')).toBe('Google')
    expect(canalUtm('manychat')).toBe('Outros')
  })
})

/* ── Montagem com dados de exemplo ─────────────────────────────────────── */

let seq = 0
function linha(p: Partial<FunnelRow>): FunnelRow {
  seq += 1
  return {
    id_lead: `d${seq}`, ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Odonto Scale', nome_funil: 'SDR', etapa_funil: 'Tentando Contato', id_etapa_atual: 'x',
    status_atual: 'Em andamento', nome_sdr: null, nome_closer: null, nome_negociacao: `Lead ${seq}`,
    fonte_macro: 'Inbound', sub_fonte: null, sub_fonte_crm: null, utm_source: 'facebook', utm_medium: null, utm_campaign: null,
    valor_contrato: null, quantidade_unidades: 0, valor_produto: null, motivo_perda: null,
    data_criacao_negociacao: null, data_criacao_original: null,
    data_novo_mql: null, data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    origem_comercial: 'Inbound',
    ...p,
  } as FunnelRow
}

const ev = (r: FunnelRow, etapa: string, dia: string, idEtapa = 'e'): FunnelEventRow =>
  ({ id_deal: r.id_lead, ciclo: r.ciclo, dia, etapa_canonica: etapa, id_etapa: idEtapa, nome_funil: 'SDR', marca_deal: r.marca } as FunnelEventRow)

describe('montarRelatorio', () => {
  const agora = new Date('2026-11-12T19:00:00Z').getTime()
  const aberto = linha({ data_novo_mql: '2026-11-03T12:00:00Z', data_tentando_contato: '2026-11-03T12:05:00Z', utm_source: 'instagram' })
  const dup = linha({ status_atual: 'Perdido', motivo_perda: 'Duplicado', etapa_funil: 'Novo MQL', data_novo_mql: '2026-11-09T14:00:00Z', data_perdido: '2026-11-09T21:00:00Z' })
  const perdidoOut = linha({ status_atual: 'Perdido', motivo_perda: 'Fora do perfil (ICP)', etapa_funil: 'Tentando Contato', data_novo_mql: '2026-10-02T12:00:00Z', data_perdido: '2026-10-05T12:00:00Z' })
  const venda = linha({ status_atual: 'Ganho', etapa_funil: 'Oportunidade COF (7 dias)', data_venda: '2026-11-10T15:00:00Z', valor_contrato: 34997, data_novo_mql: null })
  const outraMarca = linha({ marca: 'Inpot', data_novo_mql: '2026-11-04T12:00:00Z' })
  const prospeccao = linha({ origem_comercial: 'Prospecção Ativa', data_novo_mql: '2026-11-04T12:00:00Z' })
  const rows = [aberto, dup, perdidoOut, venda, outraMarca, prospeccao]
  const eventos = [
    ev(aberto, 'Novo MQL', '2026-11-03'), ev(aberto, 'Tentando Contato', '2026-11-03'),
    ev(dup, 'Novo MQL', '2026-11-09'),
    ev(perdidoOut, 'Novo MQL', '2026-10-02'), ev(perdidoOut, 'Tentando Contato', '2026-10-02'),
    ev(outraMarca, 'Novo MQL', '2026-11-04'), ev(prospeccao, 'Novo MQL', '2026-11-04'),
  ]
  const d = montarRelatorio({ rows, eventos, marca: 'Odonto Scale', periodo: { de: '2026-11-01', ate: '2026-11-12' }, agora })
  const etapa = (s: string) => d.performance.linhas.find(l => l.etapa === s)!

  it('compara com as mesmas datas do mês anterior', () => {
    expect(d.comparacao).toEqual({ de: '2026-10-01', ate: '2026-10-12' })
  })

  it('MQL sem duplicados, só da marca e do Inbound', () => {
    expect(etapa('MQL')).toMatchObject({ atual: 1, anterior: 1 })
    expect(d.kpis.mql).toBe(1)
    expect(d.kpis.mqlComDuplicados).toBe(2)
    expect(etapa('Tentando Contato')).toMatchObject({ atual: 1, anterior: 1, conv: 1 })
  })

  it('vendas pela trava de Ganho, com valor', () => {
    expect(d.kpis.vendas).toBe(1)
    expect(d.kpis.receita).toBe(34997)
    expect(d.performance.vendasSemMql).toBe(1)
  })

  it('perdas do período, contando o duplicado à parte', () => {
    expect(d.kpis.perdidos).toBe(1)
    expect(d.kpis.perdidosDuplicados).toBe(1)
    expect(d.perdas.anterior.total).toBe(1)
    expect(d.perdas.motivos.map(m => [m.motivo, m.atual, m.anterior])).toEqual([
      ['Duplicado', 1, 0], ['Fora do perfil (ICP)', 0, 1],
    ])
  })

  it('funil atual: só os abertos da marca', () => {
    expect(d.atual.abertos).toBe(1)
    expect(d.atual.linhas.find(l => l.etapa === 'Tentando Contato')!.deals).toBe(1)
    expect(d.atual.totalTabela).toBe(1)
  })

  it('safra sem duplicados', () => {
    expect(d.safra.atual).toMatchObject({ mql: 1, totalAbertos: 1, totalPerdidos: 0 })
    expect(d.safra.anterior).toMatchObject({ mql: 1, totalAbertos: 0, totalPerdidos: 1 })
  })

  it('canal pelo utm do negócio', () => {
    expect(d.canais.find(c => c.canal === 'Instagram')).toMatchObject({ mqlAtual: 1, mqlAnterior: 0 })
    expect(d.canais.find(c => c.canal === 'Facebook')).toMatchObject({ mqlAtual: 0, mqlAnterior: 1 })
  })

  it('leituras citam os duplicados e a venda', () => {
    const l = leiturasRelatorio(d)
    expect(l).toHaveLength(4)
    expect(l[0].texto).toContain('O dashboard mostra 2')
    expect(l[2].titulo).toBe('1 venda no período, R$ 34.997.')
  })
})
