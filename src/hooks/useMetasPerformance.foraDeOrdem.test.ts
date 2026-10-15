import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawMetaRow } from './useMetasPerformance'

// Hooks de produção num ciclo de React controlado, sem DOM (mesmo esquema de
// useConsultaFiltrada.test.ts). Cada consulta ao Supabase fica pendente até o
// teste responder, na ordem que ele escolher — como a rede faz quando o usuário
// troca o período várias vezes seguidas e as respostas chegam fora de ordem.
const h = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void }
  type Instancia = { slots: Slot[]; cursor: number; efeitos: Array<() => void> }
  type Resposta = {
    data: unknown[] | null
    error: { message: string; details: string; hint: string; code: string } | null
    count: null
    status: number
    statusText: string
  }
  type Pedido = { tabela: string; chamadas: Array<[string, unknown[]]>; responder: (r: Resposta) => void }
  const h = {
    ativa: null as Instancia | null,
    instancias: [] as Instancia[],
    pedidos: [] as Pedido[],
    instancia(): Instancia {
      const i: Instancia = { slots: [], cursor: 0, efeitos: [] }
      h.instancias.push(i)
      return i
    },
    slot(): Slot {
      const i = h.ativa!
      const n = i.cursor++
      return i.slots[n] ?? (i.slots[n] = {})
    },
    iguais(a?: unknown[], b?: unknown[]) {
      return !!a && !!b && a.length === b.length && a.every((v, n) => Object.is(v, b[n]))
    },
  }
  return h
})

vi.mock('react', () => ({
  useState(inicial: unknown) {
    const s = h.slot()
    if (!('value' in s)) s.value = inicial
    return [s.value, (v: unknown) => { s.value = typeof v === 'function' ? v(s.value) : v }]
  },
  useRef(inicial: unknown) {
    const s = h.slot()
    if (!('value' in s)) s.value = { current: inicial }
    return s.value
  },
  useCallback(fn: unknown, deps: unknown[]) {
    const s = h.slot()
    if (!h.iguais(s.deps, deps)) { s.value = fn; s.deps = deps }
    return s.value
  },
  useMemo(fn: () => unknown, deps: unknown[]) {
    const s = h.slot()
    if (!h.iguais(s.deps, deps)) { s.value = fn(); s.deps = deps }
    return s.value
  },
  useEffect(efeito: () => (() => void) | void, deps: unknown[]) {
    const s = h.slot()
    if (!h.iguais(s.deps, deps)) {
      s.deps = deps
      h.ativa!.efeitos.push(() => { s.cleanup?.(); s.cleanup = efeito() || undefined })
    }
  },
}))

vi.mock('@/lib/supabaseVendas', () => ({
  supabaseVendas: {
    from(tabela: string) {
      const pedido: (typeof h.pedidos)[number] = { tabela, chamadas: [], responder: () => {} }
      const promessa = new Promise(resolve => { pedido.responder = resolve })
      const consulta: Record<string, unknown> = { then: promessa.then.bind(promessa) }
      for (const metodo of ['select', 'eq', 'in']) {
        consulta[metodo] = (...args: unknown[]) => { pedido.chamadas.push([metodo, args]); return consulta }
      }
      h.pedidos.push(pedido)
      return consulta
    },
  },
}))

import { useMetaResumo, useMetasPerformance } from './useMetasPerformance'

type Instancia = ReturnType<typeof h.instancia>

function render<T>(i: Instancia, hook: () => T): T {
  h.ativa = i
  i.cursor = 0
  const resultado = hook()
  h.ativa = null
  i.efeitos.splice(0).forEach(efeito => efeito())
  return resultado
}
function desmontar(i: Instancia) { i.slots.forEach(s => { s.cleanup?.(); s.cleanup = undefined }) }
async function flush() { for (let n = 0; n < 20; n++) await Promise.resolve() }

function responder(n: number, linhas: RawMetaRow[]) {
  h.pedidos[n].responder({ data: linhas, error: null, count: null, status: 200, statusText: 'OK' })
}
function falhar(n: number, mensagem: string) {
  h.pedidos[n].responder({
    data: null, error: { message: mensagem, details: '', hint: '', code: '57014' },
    count: null, status: 500, statusText: 'Internal Server Error',
  })
}
/** Valor do filtro de `mes_referencia` de cada consulta, na ordem em que saíram. */
function mesesPedidos(): unknown[] {
  return h.pedidos.map(p => p.chamadas.find(([metodo, [coluna]]) =>
    (metodo === 'in' || metodo === 'eq') && coluna === 'mes_referencia')?.[1][1])
}

function linha(campos: Partial<RawMetaRow>): RawMetaRow {
  return {
    nome_colaborador: null, marca: null, mes_referencia: null, funcao: null,
    meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null, meta_cof: null,
    meta_financeira: null, meta_qtd_vendas: null, meta_volume_sal: null, meta_mql: null,
    ...campos,
  }
}
const closer = (nome: string, marca: string, mes: string, financeira: number, vendas: number) =>
  linha({ nome_colaborador: nome, marca, mes_referencia: mes, funcao: 'Closer', meta_financeira: financeira, meta_qtd_vendas: vendas })

// Metas de Inpot e Eletrovias em jul, ago e set/26 (DB_Metas_Performance).
const JUL = [closer('Douglas', 'Inpot', '2026-07-01', 224_700, 3), closer('Jéssica', 'Eletrovias', '2026-07-01', 119_700, 3)]
const AGO = [closer('Douglas', 'Inpot', '2026-08-01', 374_500, 5), closer('Jéssica', 'Eletrovias', '2026-08-01', 119_700, 3)]
const SET = [closer('Douglas', 'Inpot', '2026-09-01', 374_500, 5), closer('Jéssica', 'Eletrovias', '2026-09-01', 239_400, 6)]
const META_SET = new Map([
  ['Inpot', { metaFinanceira: 374_500, metaQtdVendas: 5 }],
  ['Eletrovias', { metaFinanceira: 239_400, metaQtdVendas: 6 }],
])
const TIMEOUT = 'canceling statement due to statement timeout'

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  h.pedidos.length = 0
})
afterEach(() => {
  h.instancias.splice(0).forEach(desmontar)
  vi.unstubAllGlobals()
})

describe('useMetaResumo (card "Meta do período" da Visão Macro)', () => {
  const usar = (mesesKeys: string[]) => () => useMetaResumo({ mesesKeys })

  it('resposta atrasada de uma seleção intermediária não sobrescreve a meta da seleção final', async () => {
    // Caso de 15/10/2026: Setembro → marca Julho → desmarca Julho. A consulta de
    // Jul+Set chegou por último e o card ficou com a soma dos dois meses.
    const card = h.instancia()
    render(card, usar(['2026-09'])); await flush()
    responder(0, SET); await flush()
    render(card, usar(['2026-07', '2026-09'])); await flush()
    render(card, usar(['2026-09'])); await flush()
    expect(mesesPedidos()).toEqual([['2026-09-01'], ['2026-07-01', '2026-09-01'], ['2026-09-01']])

    responder(2, SET); await flush()
    responder(1, [...JUL, ...SET]); await flush()
    const r = render(card, usar(['2026-09']))
    expect(r.porMarca).toEqual(META_SET)
    expect(r.loading).toBe(false)
  })

  it('resposta da seleção anterior não encerra o carregamento nem aparece na seleção nova', async () => {
    const card = h.instancia()
    render(card, usar(['2026-08'])); await flush()
    render(card, usar(['2026-09'])); await flush()

    responder(0, AGO); await flush()
    const antes = render(card, usar(['2026-09']))
    expect(antes.porMarca).toEqual(new Map())
    expect(antes.loading).toBe(true)

    responder(1, SET); await flush()
    const depois = render(card, usar(['2026-09']))
    expect(depois.porMarca).toEqual(META_SET)
    expect(depois.loading).toBe(false)
  })

  it('erro atrasado da seleção anterior não aparece na seleção nova', async () => {
    const card = h.instancia()
    render(card, usar(['2026-08'])); await flush()
    render(card, usar(['2026-09'])); await flush()

    responder(1, SET); await flush()
    falhar(0, TIMEOUT); await flush()
    expect(render(card, usar(['2026-09']))).toEqual({ porMarca: META_SET, loading: false, error: null })
  })
})

describe('useMetasPerformance (metas por pessoa da Performance)', () => {
  const usar = (mesKey: string) => () => useMetasPerformance({ mesKey })

  it('troca de mês: resposta atrasada do mês anterior não sobrescreve as metas do mês novo', async () => {
    const tela = h.instancia()
    render(tela, usar('2026-08')); await flush()
    render(tela, usar('2026-09')); await flush()
    expect(mesesPedidos()).toEqual(['2026-08-01', '2026-09-01'])

    responder(1, SET); await flush()
    responder(0, AGO); await flush()
    const r = render(tela, usar('2026-09'))
    expect(r.rows).toEqual(SET)
    expect(r.data.map(m => [m.nome, m.metaFinanceira, m.metaQtdVendas])).toEqual([
      ['Douglas', 374_500, 5],
      ['Jéssica', 239_400, 6],
    ])
    expect(r.loading).toBe(false)
  })

  it('erro atrasado do mês anterior não aparece no mês novo', async () => {
    const tela = h.instancia()
    render(tela, usar('2026-08')); await flush()
    render(tela, usar('2026-09')); await flush()

    responder(1, SET); await flush()
    falhar(0, TIMEOUT); await flush()
    const r = render(tela, usar('2026-09'))
    expect(r.rows).toEqual(SET)
    expect(r.error).toBeNull()
    expect(r.loading).toBe(false)
  })
})
