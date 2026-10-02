import { describe, expect, it } from 'vitest'
import { ALL_BRANDS, FOLLOW_PAGE, MQL_CHART_BRANDS, buildMqlVolume, resolveMqlChartBrands } from './mqlVolume'
import { filterMediaByMarca, isComunidadeRow, rowBucket } from './visaoGeralMedia'
import type { Lead, MediaDailyRaw } from './types'

const range = { start: '2026-09-21', end: '2026-09-23' }
const today = '2026-10-01'
function lead(id: string, patch: Partial<Lead> = {}): Lead {
  return { id, dia: range.start, marca: 'Viva', nome: null, email: `${id}@example.test`, telefone: null,
    uf: null, cidade: null, utm_source: null, utm_medium: null, utm_campaign: null, formulario: null,
    dados_extras: { lead_type: 'MQL' }, row_hash: null, criado_em: '', ...patch }
}
function media(spend: number, patch: Partial<MediaDailyRaw> = {}): MediaDailyRaw {
  return { id: '', dia: range.start, marca: 'Viva', canal: 'meta', campanha: null, conjunto: null,
    anuncio: null, spend_brl: spend, impressoes: 0, cliques_link: 0, lpv: 0, cpm: null, cpc: null,
    leads: 0, video_p50: null, video_thruplay: null, criado_em: '', ...patch }
}

describe('Gráfico único: seleção e permissões', () => {
  const allowed = ['viva', 'inpot']
  it('acompanha consolidado, uma marca e múltiplas marcas da página', () => {
    expect(resolveMqlChartBrands(FOLLOW_PAGE, [], allowed).sort()).toEqual([...allowed].sort())
    expect(resolveMqlChartBrands(FOLLOW_PAGE, ['viva'], allowed)).toEqual(['viva'])
    expect(resolveMqlChartBrands(FOLLOW_PAGE, allowed, allowed).sort()).toEqual([...allowed].sort())
  })
  it('permite escolher outra marca ou todas apenas dentro do acesso permitido', () => {
    expect(resolveMqlChartBrands('inpot', ['viva'], allowed)).toEqual(['inpot'])
    expect(resolveMqlChartBrands(ALL_BRANDS, ['viva'], ['viva'])).toEqual(['viva'])
    expect(resolveMqlChartBrands('oral-unic', [], allowed)).toEqual([])
    expect(resolveMqlChartBrands(FOLLOW_PAGE, ['oral-unic'], allowed)).toEqual([])
  })
  it('nenhuma permissão não vira consolidado e marcas só de vendas ficam fora', () => {
    expect(resolveMqlChartBrands(ALL_BRANDS, [], [])).toEqual([])
    expect(resolveMqlChartBrands(FOLLOW_PAGE, [], ['instituto-autismo'])).toEqual([])
    expect(MQL_CHART_BRANDS.some(b => b.vendasOnly)).toBe(false)
  })
})

describe('Gráfico único: volumes e custo', () => {
  it('preenche dias sem MQL, soma mídia e calcula razão dos totais (não média)', () => {
    const result = buildMqlVolume([media(100), media(20, { canal: 'google' }), media(300, { dia: range.end })],
      [lead('a'), lead('b'), lead('c', { dia: range.end })], ['viva'], range, today)
    expect(result.days.map(d => [d.date, d.mql, d.cpmql])).toEqual([
      ['2026-09-21', 2, 60], ['2026-09-22', 0, null], ['2026-09-23', 1, 300],
    ])
    expect(result).toMatchObject({ mql: 3, investment: 420, cpmql: 140 })
  })
  it('mantém investimento de dias sem MQL no custo total e não desenha custo zero falso', () => {
    const result = buildMqlVolume([media(100), media(50, { dia: range.end })], [lead('a')], ['viva'], range, today)
    expect(result.days[2]).toMatchObject({ mql: 0, investment: 50, cpmql: null })
    expect(result.cpmql).toBe(150)
    expect(buildMqlVolume([media(100)], [], ['viva'], range, today).cpmql).toBeNull()
  })
  it('aceita MQL sem mídia e não confunde custo zero legítimo com ausência de MQL', () => {
    const result = buildMqlVolume([], [lead('a')], ['viva'], range, today)
    expect(result.days[0].cpmql).toBe(0)
    expect(result.cpmql).toBe(0)
  })
  it('preserva dedupe do KPI antes de classificar e inclui MQLs de formulários nativos', () => {
    const result = buildMqlVolume([], [
      lead('a', { formulario: 'meta_instant_form' }), lead('a'),
      lead('b', { dados_extras: { lead_type: 'Lead' } }), lead('b'),
      lead('c', { dados_extras: { lead_type_original: 'mql' } }),
    ], ['viva'], range, today)
    expect(result.mql).toBe(2)
  })
  it('preserva eventos que burlam dedupe e fallback por telefone', () => {
    const result = buildMqlVolume([], [lead('a', { email: null, telefone: 'test' }), lead('b', { email: null, telefone: 'test' }),
      lead('c', { dados_extras: { lead_type: 'MQL', evento: 'teste' } }), lead('c', { dados_extras: { lead_type: 'MQL', evento: 'teste' } })], ['viva'], range, today)
    expect(result.mql).toBe(3)
  })
  it('filtra marca antes de deduplicar, sem mudar a deduplicação cruzada do consolidado', () => {
    const rows = [lead('a', { marca: 'Inpot' }), lead('a'), lead('b')]
    expect(buildMqlVolume([], rows, ['viva'], range, today).mql).toBe(2)
    expect(buildMqlVolume([], rows, ['viva', 'inpot'], range, today).mql).toBe(2)
  })
  it('isola escopo e custo e jamais libera todas as marcas por lista vazia', () => {
    const rows = [lead('a'), lead('b', { marca: 'Inpot' })]
    const spend = [media(20), media(80, { marca: 'Inpot' })]
    expect(buildMqlVolume(spend, rows, ['viva'], range, today)).toMatchObject({ mql: 1, investment: 20, cpmql: 20 })
    expect(buildMqlVolume(spend, rows, [], range, today)).toMatchObject({ mql: 0, investment: 0, cpmql: null })
    expect(buildMqlVolume(spend, rows, ['viva', 'inpot'], range, today)).toMatchObject({ mql: 2, investment: 100, cpmql: 50 })
  })
})

describe('Gráfico único: calendário', () => {
  it('usa a janela exata, sem deslocamento para o dia anterior ou inclusão fora do período', () => {
    const result = buildMqlVolume([media(500, { dia: '2026-09-20' }), media(30)],
      [lead('a', { dia: '2026-09-20' }), lead('a'), lead('c', { dia: '2026-09-24' })], ['viva'], range, today)
    expect(result.days[0]).toMatchObject({ date: '2026-09-21', mql: 1, investment: 30 })
    expect(result.mql).toBe(1)
  })
  it('suporta intervalo entre meses e ano bissexto', () => {
    const result = buildMqlVolume([], [], ['viva'], { start: '2024-02-28', end: '2024-03-01' }, today)
    expect(result.days.map(d => d.date)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
  })
  it('suporta um único dia e corta o futuro em hoje', () => {
    const result = buildMqlVolume([], [lead('a', { dia: today }), lead('b', { dia: '2026-10-02' })], ['viva'],
      { start: today, end: '2026-10-31' }, today)
    expect(result.days).toHaveLength(1)
    expect(result.mql).toBe(1)
  })
  it.each([
    { start: '', end: '2026-09-21' }, { start: '2026-09-22', end: '2026-09-21' },
    { start: '2026-02-30', end: '2026-03-01' }, { start: '2026-10-02', end: '2026-10-31' },
  ])('não fabrica dados em janela inválida/futura: %j', invalid => {
    expect(buildMqlVolume([], [], ['viva'], invalid, today).days).toEqual([])
  })
})

describe('Segregação de mídia existente da Visão Geral', () => {
  it('separa Franquia, Consultoria e Comunidade sem alterar as regras anteriores', () => {
    const rows = [media(100, { marca: 'Oral Unic', campanha: '[V4] Franquia' }),
      media(200, { marca: 'Oral Unic', campanha: '[ODL] Consultoria' }),
      media(50, { marca: 'Odonto Scale' }), media(900, { marca: 'Oral Unic', campanha: '[CMD] Comunidade' })]
    expect(rows.map(rowBucket)).toEqual(['Oral Unic', 'Odonto Scale', 'Odonto Scale', null])
    expect(isComunidadeRow(rows[3])).toBe(true)
    expect(filterMediaByMarca(rows, 'Odonto Scale')).toHaveLength(2)
    expect(buildMqlVolume(rows, [], ['oral-unic', 'odonto-scale'], range, today).investment).toBe(350)
    expect(buildMqlVolume(rows, [], ['oral-unic'], range, today).investment).toBe(100)
    expect(buildMqlVolume(rows, [], ['odonto-scale'], range, today).investment).toBe(250)
  })
})
