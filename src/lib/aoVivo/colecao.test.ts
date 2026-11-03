import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aplicarMudancas, colecaoDaBase, montarLinhas, paraArrays, type PacoteBase } from './colecao'
import { COLUNAS_ETAPAS, COLUNAS_VENDAS, DEFINICAO_ETAPAS, DEFINICAO_VENDAS, porOrigem } from './definicoes'
import { DEFAULT_VIEW_MODES, eventsInStage, type PeriodWindow } from '@/lib/metrics'

/** Linha de vendas no formato do banco (array na ordem de `cols`). */
function vendaArr(p: Record<string, unknown>, cols: readonly string[] = COLUNAS_VENDAS): unknown[] {
  return cols.map(c => p[c] ?? null)
}

function baseVendas(linhas: Record<string, unknown>[], extra: Partial<PacoteBase> = {}): PacoteBase {
  return { base: 'vendas', epoca: 1, versao: 1, cols: [...COLUNAS_VENDAS], linhas: linhas.map(l => vendaArr(l)), ...extra }
}

function eventoArr(p: Record<string, unknown>): unknown[] {
  return COLUNAS_ETAPAS.map(c => p[c] ?? null)
}

describe('montarLinhas', () => {
  it('mapeia pelo nome da coluna, não pela posição', () => {
    const cols = [...COLUNAS_VENDAS].reverse()
    const [linha] = montarLinhas(DEFINICAO_VENDAS, cols, [vendaArr({ id_lead: 'a', ciclo: 2, marca: 'Inpot' }, cols)])
    expect(linha.id_lead).toBe('a')
    expect(linha.ciclo).toBe(2)
    expect(linha.marca).toBe('Inpot')
    expect(linha.data_venda).toBeNull()
  })

  it('coluna a mais do banco é ignorada: toda linha tem as mesmas chaves', () => {
    const cols = [...COLUNAS_VENDAS, 'coluna_nova']
    const [linha] = montarLinhas(DEFINICAO_VENDAS, cols, [[...vendaArr({ id_lead: 'a', ciclo: 1 }), 'x']])
    expect(Object.keys(linha)).toEqual([...COLUNAS_VENDAS])
  })

  it('falha alto se o banco não mandar uma coluna que o dashboard usa', () => {
    const cols = COLUNAS_VENDAS.filter(c => c !== 'valor_produto')
    expect(() => montarLinhas(DEFINICAO_VENDAS, cols, [])).toThrow(/valor_produto/)
  })

  it('aplica o alias de marca, como o hook antigo', () => {
    const [linha] = montarLinhas(DEFINICAO_VENDAS, COLUNAS_VENDAS, [vendaArr({ id_lead: 'a', ciclo: 1, marca: 'Odonto Legacy' })])
    expect(linha.marca).toBe('Odonto Scale')
  })
})

describe('ordem das listas (a mesma das consultas às views)', () => {
  it('vendas: data de criação desc (nulas primeiro), depois id_lead e ciclo', () => {
    const c = colecaoDaBase(DEFINICAO_VENDAS, baseVendas([
      { id_lead: 'b', ciclo: 1, data_criacao_negociacao: '2026-08-01T10:00:00+00:00' },
      { id_lead: 'a', ciclo: 2, data_criacao_negociacao: '2026-09-01T10:00:00.5+00:00' },
      { id_lead: 'a', ciclo: 1, data_criacao_negociacao: '2026-09-01T10:00:00.5+00:00' },
      { id_lead: 'c', ciclo: 1, data_criacao_negociacao: null },
      { id_lead: 'd', ciclo: 1, data_criacao_negociacao: '2026-09-01T10:00:00+00:00' },
      { id_lead: 'e', ciclo: 1, data_criacao_negociacao: '2026-09-01T10:00:00.25+00:00' },
    ]))
    expect(c.linhas.map(l => `${l.id_lead}${l.ciclo}`)).toEqual(['c1', 'a1', 'a2', 'e1', 'd1', 'b1'])
  })

  it('etapas: dia desc, depois deal e etapa — em "Deals únicos" fica a passagem mais recente do mês', () => {
    const c = colecaoDaBase(DEFINICAO_ETAPAS, {
      base: 'etapas', epoca: 1, versao: 1, cols: [...COLUNAS_ETAPAS],
      linhas: [
        eventoArr({ id_evento: 1, id_deal: 'd1', dia: '2026-10-03', etapa_canonica: 'Diagnóstico', id_etapa: 'x', ciclo: 1, rn_deal_etapa_mes: 1 }),
        eventoArr({ id_evento: 2, id_deal: 'd1', dia: '2026-10-20', etapa_canonica: 'Diagnóstico', id_etapa: 'x', ciclo: 1, rn_deal_etapa_mes: 2 }),
        eventoArr({ id_evento: 3, id_deal: 'd0', dia: '2026-10-20', etapa_canonica: 'Diagnóstico', id_etapa: 'x', ciclo: 1, rn_deal_etapa_mes: 1 }),
      ],
    })
    expect(c.linhas.map(e => e.id_evento)).toEqual([3, 2, 1])
    const outubro: PeriodWindow = { activePeriods: new Set(), dateRange: { from: '2026-10-01', to: '2026-10-31' }, ranges: null }
    const unicos = eventsInStage([...c.linhas], 'Diagnóstico', outubro, DEFAULT_VIEW_MODES)
    expect(unicos.filter(e => e.id_deal === 'd1').map(e => e.dia)).toEqual(['2026-10-20'])
  })
})

describe('aplicarMudancas', () => {
  const inicial = () => colecaoDaBase(DEFINICAO_VENDAS, baseVendas([
    { id_lead: 'a', ciclo: 1, status_atual: 'Em andamento', data_criacao_negociacao: '2026-10-01T00:00:00+00:00' },
    { id_lead: 'b', ciclo: 1, status_atual: 'Em andamento', data_criacao_negociacao: '2026-10-02T00:00:00+00:00' },
  ]))

  it('atualiza, inclui e remove linhas, e mantém a ordem', () => {
    const c0 = inicial()
    const c1 = aplicarMudancas(DEFINICAO_VENDAS, c0, {
      base: 'vendas', epoca: 1, versao: 2, reset: false, cols: [...COLUNAS_VENDAS],
      linhas: [
        vendaArr({ id_lead: 'a', ciclo: 1, status_atual: 'Ganho', data_criacao_negociacao: '2026-10-01T00:00:00+00:00' }),
        vendaArr({ id_lead: 'c', ciclo: 1, status_atual: 'Em andamento', data_criacao_negociacao: '2026-10-03T00:00:00+00:00' }),
      ],
      removidos: [['b', 1]],
    })
    if (c1 === 'reset') throw new Error('não devia resetar')
    expect(c1.versao).toBe(2)
    expect(c1.linhas.map(l => `${l.id_lead}:${l.status_atual}`)).toEqual(['c:Em andamento', 'a:Ganho'])
    // A coleção antiga continua intacta (quem tinha a lista em mãos não vê nada mudar por baixo).
    expect(c0.linhas.map(l => `${l.id_lead}:${l.status_atual}`)).toEqual(['b:Em andamento', 'a:Em andamento'])
    expect(c0.versao).toBe(1)
  })

  it('sem nada novo devolve a mesma coleção (a página não recalcula)', () => {
    const c0 = inicial()
    expect(aplicarMudancas(DEFINICAO_VENDAS, c0, { base: 'vendas', epoca: 1, versao: 1, reset: false, linhas: [], removidos: [] })).toBe(c0)
  })

  it('reset do banco ou época trocada pedem a base inteira', () => {
    const c0 = inicial()
    expect(aplicarMudancas(DEFINICAO_VENDAS, c0, { base: 'vendas', epoca: 1, versao: 9, reset: true })).toBe('reset')
    expect(aplicarMudancas(DEFINICAO_VENDAS, c0, { base: 'vendas', epoca: 2, versao: 1, reset: false })).toBe('reset')
  })

  it('remove evento pela chave numérica', () => {
    const c0 = colecaoDaBase(DEFINICAO_ETAPAS, {
      base: 'etapas', epoca: 1, versao: 1, cols: [...COLUNAS_ETAPAS],
      linhas: [eventoArr({ id_evento: 10, id_deal: 'd', dia: '2026-10-01' }), eventoArr({ id_evento: 11, id_deal: 'd', dia: '2026-10-02' })],
    })
    const c1 = aplicarMudancas(DEFINICAO_ETAPAS, c0, { base: 'etapas', epoca: 1, versao: 2, reset: false, linhas: [], removidos: [10] })
    if (c1 === 'reset') throw new Error('não devia resetar')
    expect(c1.linhas.map(e => e.id_evento)).toEqual([11])
  })
})

describe('armazenamento local', () => {
  it('arrays de volta montam as mesmas linhas', () => {
    const c0 = colecaoDaBase(DEFINICAO_VENDAS, baseVendas([
      { id_lead: 'a', ciclo: 1, marca: 'Odonto Legacy', valor_contrato: 74900, eh_ciclo_atual: true },
      { id_lead: 'b', ciclo: 2, marca: 'Inpot', data_venda: '2026-10-10T12:00:00+00:00' },
    ]))
    const c1 = colecaoDaBase(DEFINICAO_VENDAS, { base: 'vendas', epoca: 1, versao: 1, cols: [...COLUNAS_VENDAS], linhas: paraArrays(c0, COLUNAS_VENDAS) })
    expect(c1.linhas).toEqual(c0.linhas)
  })
})

describe('porOrigem', () => {
  it('filtra e devolve a mesma referência enquanto a base não muda', () => {
    const linhas = [{ origem_comercial: 'Inbound' }, { origem_comercial: 'Prospecção Ativa' }, { origem_comercial: 'Inbound' }]
    const a = porOrigem(linhas, 'Inbound')
    expect(a).toHaveLength(2)
    expect(porOrigem(linhas, 'Inbound')).toBe(a)
    expect(porOrigem(linhas, 'Prospecção Ativa')).toHaveLength(1)
  })
})

describe('colunas do navegador = colunas do banco', () => {
  // `dash_colunas()` no SQL e as listas daqui têm que andar juntas.
  const sql = readFileSync(path.resolve(__dirname, '../../../docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql'), 'utf8')
  const lista = (base: string) => {
    const m = sql.match(new RegExp(`when '${base}' then array\\[([^\\]]+)\\]`))
    return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : []
  }
  it('vendas', () => expect(lista('vendas')).toEqual([...COLUNAS_VENDAS]))
  it('etapas', () => expect(lista('etapas')).toEqual([...COLUNAS_ETAPAS]))
})
