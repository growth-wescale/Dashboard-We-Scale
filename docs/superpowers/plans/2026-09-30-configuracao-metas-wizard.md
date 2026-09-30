# Configuração das Metas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os Passos 0–6 do Hub de Metas por um fluxo "painel de marcas + editor por marca" em que o gestor informa vendas e taxa de franquia e o funil reverso (SQL → Diagnóstico → SAL → COF → Vendas, + Ligações) se calcula pelas conversões de referência, com rascunho salvo no navegador.

**Architecture:** Um módulo puro (`src/lib/configMetas.ts`) guarda o modelo do rascunho e todas as regras (referência a partir de uma versão, resolução arredondada sem cascata, pendências/status, conversão ↔ `ConfigEtapa[]`, espelho). A página `HubMetas` vira tela inicial + casca de 3 passos; os componentes de `src/components/metas/` só desenham e chamam o módulo. Publicação continua por `publicarVersao` (Edge Function `gravar-meta`), sem mudança de banco.

**Tech Stack:** React 19 + TypeScript (tsc -b), Vite, Vitest, lucide-react, estilos inline com tokens `--ws-*`/`--status-*`/`--brand-accent`.

**Spec:** `docs/superpowers/specs/2026-09-30-configuracao-metas-wizard-design.md`

## Global Constraints

- Nenhuma mudança de banco, de Edge Function ou de `metasEngine.ts`.
- Rótulos: SQL, Diagnóstico, SAL, COF, Vendas, Ligações (nunca "Reunião Realizada"/"Fechamento" na tela).
- Metas da marca: `ceil(exato - 1e-9)`, calculadas a partir do valor EXATO da etapa de baixo (sem cascata).
- Meta por pessoa: `meta da marca × peso/100`, sem arredondar.
- `taxa_origem` só aceita `'mes_anterior' | 'historico_crm' | 'manual'`.
- Textos em pt-BR, sentence case. Build com `npm run build` (tsc -b) e testes com `npx vitest run`, no worktree `~/ws-dashboard-worktree-config-metas` (fora do OneDrive).
- Nada de publicar versão de teste (versão publicada não pode ser apagada).

---

### Task 1: Módulo `configMetas` — modelo, referência e cálculo do funil

**Files:**
- Create: `src/lib/configMetas.ts`
- Test: `src/lib/configMetas.test.ts`

**Interfaces:**
- Consumes: `resolverFunilMarca`, `gerarLinhasEspelho`, `gerarSemanas`, tipos de `@/lib/metasEngine`; tipos `EstadoMes`, `EstadoMesMarca`, `DistribuicaoSemanalItem`, `VersaoMeta` de `@/hooks/useMetaMes` (import type — não carrega Supabase); `BRAND_LIST` de `@/constants/brands`.
- Produces (usado pelas Tasks 3–7):
  - `ETAPAS_FUNIL`, `ETAPAS_CONFIGURAVEIS`, `ETAPA_ABAIXO`, `ROTULO_ETAPA`, `ETAPAS_SDR`, `ETAPAS_CLOSER`, `ETAPAS_SEMANAIS`
  - tipos `EtapaFunil`, `EtapaConfiguravel`, `EtapaMetaConfig`, `ModoEtapaConfig`, `ReferenciaMarca`, `MarcaConfig`, `OrigemRascunho`, `RascunhoConfig`, `EtapaCalculada`, `FunilCalculado`, `Pendencia`, `StatusMarca`, `MetaPessoa`, `Publicacao`
  - `arredondarMeta(x)`, `mesAnterior(mes)`, `referenciaDeVersao(estado, rotulo)`, `marcaDoMesAnterior(estado, rotulo)`, `marcaDeVersao(estado, rotulo, importada)`, `marcaEmBranco(marca)`, `rascunhoDoMesAnterior(mes, anterior, rotulo)`, `rascunhoDeVersao(mes, versao, estado)`, `rascunhoEmBranco(mes, marcas)`, `calcularFunil(m)`, `pendenciasMarca(m, funil?)`, `statusMarca(m, pendencias?)`, `definirModoEtapa(m, etapa, modo)`, `dividirIgualmente(pessoas, funcao)`, `metasPorPessoa(m, funil?)`, `paraConfigEtapas(m)`, `resolucaoArredondada(m, funil?)`, `montarPublicacao(r)`, `diasDaSemana(s)`, `distribuirProporcional(total, semanas)`, `funcaoDaEtapaSemanal(etapa)`, `resumoRascunho(r)`, `ordenarMarcas(lista)`, `marcasDisponiveis(r)`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts file=src/lib/configMetas.test.ts
import { describe, expect, it } from 'vitest'
import { gerarSemanas, resolverFunilMarca, type ConfigEtapa } from '@/lib/metasEngine'
import type { EstadoMes, EstadoMesMarca } from '@/hooks/useMetaMes'
import {
  arredondarMeta, calcularFunil, definirModoEtapa, distribuirProporcional, dividirIgualmente,
  marcaDeVersao, marcaDoMesAnterior, marcaEmBranco, marcasDisponiveis, mesAnterior, metasPorPessoa,
  montarPublicacao, ordenarMarcas, paraConfigEtapas, pendenciasMarca, rascunhoDeVersao,
  rascunhoDoMesAnterior, rascunhoEmBranco, referenciaDeVersao, resumoRascunho, statusMarca,
  type MarcaConfig,
} from '@/lib/configMetas'

// V1 real de setembro/2026 (importada: tudo `fixo`), conferida no banco em 30/09.
function fixo(etapa: ConfigEtapa['etapa'], valorFixo: number): ConfigEtapa {
  return { etapa, modo: 'fixo', valorFixo }
}
const INPOT_SET: EstadoMesMarca = {
  marca: 'Inpot',
  ticketMedio: 74900,
  etapas: [
    fixo('Ligações', 1557.6), fixo('Reunião Agendada SQL', 67.1), fixo('Reunião Realizada', 42.9),
    fixo('SAL', 28), fixo('Oportunidade COF', 10.6), fixo('Fechamento', 5),
  ],
  pessoas: [
    { nome: 'Douglas', funcao: 'Closer', peso: 100 },
    { nome: 'Thiago', funcao: 'SDR', peso: 50 },
    { nome: 'Xayane', funcao: 'SDR', peso: 50 },
  ],
}
const ODONTO_SET: EstadoMesMarca = {
  marca: 'Odonto Scale',
  ticketMedio: 5597,
  etapas: [fixo('Fechamento', 5)],
  pessoas: [{ nome: 'Aurélio Briano', funcao: 'Closer', peso: 100 }],
}
const SETEMBRO: EstadoMes = {
  status: 'publicado', diaViradaSemana: 'terca', semanas: gerarSemanas('2026-09-01', 'terca'),
  marcas: [ODONTO_SET, INPOT_SET], distribuicaoSemanal: [],
}

function inpotOutubro(vendas: number | null = 6): MarcaConfig {
  return { ...marcaDoMesAnterior(INPOT_SET, 'setembro'), vendas }
}

describe('arredondarMeta', () => {
  it('arredonda pra cima e ignora ruído de ponto flutuante', () => {
    expect(arredondarMeta(10.6)).toBe(11)
    expect(arredondarMeta(28.000000000000004)).toBe(28)
    expect(arredondarMeta(0)).toBe(0)
    expect(arredondarMeta(-3)).toBe(0)
  })
})

describe('mesAnterior', () => {
  it('volta um mês, virando o ano', () => {
    expect(mesAnterior('2026-10-01')).toBe('2026-09-01')
    expect(mesAnterior('2027-01-01')).toBe('2026-12-01')
  })
})

describe('referenciaDeVersao', () => {
  it('tira a conversão implícita dos números fixos da V1 importada', () => {
    const ref = referenciaDeVersao(INPOT_SET, 'setembro')
    expect(ref.rotulo).toBe('setembro')
    expect(ref.vendas).toBe(5)
    expect(ref.ticketMedio).toBe(74900)
    expect(ref.taxas['Oportunidade COF']).toBeCloseTo(5 / 10.6, 6)
    expect(ref.taxas.SAL).toBeCloseTo(10.6 / 28, 6)
    expect(ref.taxas['Reunião Realizada']).toBeCloseTo(28 / 42.9, 6)
    expect(ref.taxas['Reunião Agendada SQL']).toBeCloseTo(42.9 / 67.1, 6)
    expect(ref.taxas['Ligações']).toBeCloseTo(67.1 / 1557.6, 6)
    expect(ref.valores).toMatchObject({ Fechamento: 5, 'Oportunidade COF': 11, SAL: 28, 'Reunião Realizada': 43, 'Reunião Agendada SQL': 68, 'Ligações': 1558 })
  })

  it('prefere a taxa gravada quando a etapa derivava da de baixo', () => {
    const estado: EstadoMesMarca = {
      ...INPOT_SET,
      etapas: [fixo('Fechamento', 5), { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'Fechamento', taxa: 0.5, taxaOrigem: 'manual' }],
    }
    expect(referenciaDeVersao(estado, 'V1').taxas['Oportunidade COF']).toBe(0.5)
  })

  it('marca sem etapas acima de Vendas não tem taxa nenhuma', () => {
    expect(referenciaDeVersao(ODONTO_SET, 'setembro').taxas).toEqual({})
  })
})

describe('marcaDoMesAnterior', () => {
  it('traz ticket, conversões e pessoas, mas deixa as vendas em branco', () => {
    const m = marcaDoMesAnterior(INPOT_SET, 'setembro')
    expect(m.vendas).toBeNull()
    expect(m.ticketMedio).toBe(74900)
    expect(Object.values(m.etapas).every(e => e.tipo === 'referencia')).toBe(true)
    expect(m.pessoas).toHaveLength(3)
    expect(m.pessoas).not.toBe(INPOT_SET.pessoas)
    expect(statusMarca(m)).toBe('nao_configurada')
  })

  it('etapa que não existia no mês anterior começa sem meta', () => {
    const m = marcaDoMesAnterior(ODONTO_SET, 'setembro')
    expect(Object.values(m.etapas).every(e => e.tipo === 'sem_meta')).toBe(true)
  })
})

describe('calcularFunil', () => {
  it('com as vendas de setembro reproduz setembro, arredondado pra cima', () => {
    const f = calcularFunil(inpotOutubro(5))
    expect(f.etapas['Oportunidade COF'].meta).toBe(11)
    expect(f.etapas.SAL.meta).toBe(28)
    expect(f.etapas['Reunião Realizada'].meta).toBe(43)
    expect(f.etapas['Reunião Agendada SQL'].meta).toBe(68)
    expect(f.etapas['Ligações'].meta).toBe(1558)
    expect(f.etapas.Fechamento.meta).toBe(5)
    expect(f.faturamento).toBe(374500)
  })

  it('arredonda sem cascata: cada etapa sobe do valor EXATO da de baixo', () => {
    const m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    const f = calcularFunil(m)
    // COF exato = 12,72 → 13. SAL = 12,72 / 0,4 = 31,8 → 32 (em cascata daria 13/0,4 = 32,5 → 33)
    expect(f.etapas['Oportunidade COF'].meta).toBe(13)
    expect(f.etapas.SAL.exato).toBeCloseTo(31.8, 6)
    expect(f.etapas.SAL.meta).toBe(32)
    expect(f.etapas.SAL.alterada).toBe(true)
    expect(f.etapas['Reunião Realizada'].meta).toBe(49)
    expect(f.etapas['Reunião Agendada SQL'].meta).toBe(77)
    expect(f.etapas['Ligações'].meta).toBe(1769)
    expect(f.faturamento).toBe(449400)
  })

  it('número manual vira ponto de partida pras etapas de cima', () => {
    const m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'manual', valor: 40 })
    const f = calcularFunil(m)
    expect(f.etapas.SAL.meta).toBe(40)
    expect(f.etapas.SAL.origem).toBe('manual')
    expect(f.etapas.SAL.taxa).toBeCloseTo(12.72 / 40, 6)
    expect(f.etapas['Reunião Realizada'].meta).toBe(arredondarMeta(40 / (28 / 42.9)))
    expect(f.etapas['Oportunidade COF'].meta).toBe(13)
  })

  it('nova conversão igual à de referência não conta como alterada', () => {
    const ref = referenciaDeVersao(INPOT_SET, 'setembro').taxas['Oportunidade COF']!
    const f = calcularFunil(definirModoEtapa(inpotOutubro(6), 'Oportunidade COF', { tipo: 'conversao', taxa: ref }))
    expect(f.etapas['Oportunidade COF'].alterada).toBe(false)
  })

  it('sem vendas, nada é calculado e nenhuma etapa reclama', () => {
    const f = calcularFunil(inpotOutubro(null))
    expect(f.etapas.SAL.meta).toBeNull()
    expect(f.etapas.SAL.problema).toBeNull()
    expect(f.faturamento).toBeNull()
  })

  it('etapa por conversão acima de etapa sem meta aponta o problema', () => {
    const m: MarcaConfig = { ...inpotOutubro(6), etapas: { ...inpotOutubro(6).etapas, 'Oportunidade COF': { tipo: 'sem_meta' } } }
    const f = calcularFunil(m)
    expect(f.etapas.SAL.meta).toBeNull()
    expect(f.etapas.SAL.problema).toMatch(/COF está sem meta/)
  })

  it('conversão em branco é problema', () => {
    const f = calcularFunil(definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: null }))
    expect(f.etapas.SAL.problema).toMatch(/conversão/)
  })
})

describe('definirModoEtapa', () => {
  it('sem meta leva junto as etapas de cima até a primeira manual', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    m = definirModoEtapa(m, 'Oportunidade COF', { tipo: 'sem_meta' })
    expect(m.etapas.SAL.tipo).toBe('sem_meta')
    expect(m.etapas['Reunião Realizada'].tipo).toBe('manual')
    expect(m.etapas['Reunião Agendada SQL'].tipo).toBe('referencia')
  })
})

describe('pendenciasMarca e statusMarca', () => {
  it('Inpot com vendas e time completo está configurada', () => {
    const m = inpotOutubro(6)
    expect(pendenciasMarca(m)).toEqual([])
    expect(statusMarca(m)).toBe('configurada')
  })

  it('aponta ticket, pesos e Closer faltando', () => {
    const m: MarcaConfig = {
      ...inpotOutubro(6),
      ticketMedio: null,
      pessoas: [{ nome: 'Thiago', funcao: 'SDR', peso: 60 }, { nome: 'Xayane', funcao: 'SDR', peso: 30 }],
    }
    const textos = pendenciasMarca(m).map(p => p.texto)
    expect(textos).toContain('Informe a taxa de franquia média')
    expect(textos).toContain('Adicione pelo menos um Closer')
    expect(textos.some(t => t.includes('SDRs somam 90%'))).toBe(true)
    expect(statusMarca(m)).toBe('em_configuracao')
  })

  it('marca só com Closer não precisa de SDR quando as etapas de SDR estão sem meta', () => {
    const m = { ...marcaDoMesAnterior(ODONTO_SET, 'setembro'), vendas: 5 }
    expect(pendenciasMarca(m)).toEqual([])
    expect(statusMarca(m)).toBe('configurada')
  })

  it('marca em branco lista as conversões que faltam', () => {
    const m = { ...marcaEmBranco('Viva'), vendas: 2, ticketMedio: 69900 }
    const funil = pendenciasMarca(m).filter(p => p.secao === 'funil')
    expect(funil).toHaveLength(5)
  })
})

describe('dividirIgualmente', () => {
  it('reparte 100% entre as pessoas da função e fecha a soma na última', () => {
    const r = dividirIgualmente([
      { nome: 'A', funcao: 'SDR', peso: 10 }, { nome: 'B', funcao: 'SDR', peso: 10 },
      { nome: 'C', funcao: 'SDR', peso: 10 }, { nome: 'D', funcao: 'Closer', peso: 100 },
    ], 'SDR')
    expect(r.map(p => p.peso)).toEqual([33.33, 33.33, 33.34, 100])
  })
})

describe('metasPorPessoa', () => {
  it('SDR leva Ligações/SQL/Diagnóstico/SAL, Closer leva COF/Vendas/faturamento, pelo peso', () => {
    const r = metasPorPessoa(definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 }))
    const thiago = r.find(p => p.nome === 'Thiago')!
    expect(thiago.valores['Reunião Agendada SQL']).toBe(38.5)
    expect(thiago.valores.SAL).toBe(16)
    expect(thiago.valores['Oportunidade COF']).toBeUndefined()
    const douglas = r.find(p => p.nome === 'Douglas')!
    expect(douglas.valores['Oportunidade COF']).toBe(13)
    expect(douglas.valores.Fechamento).toBe(6)
    expect(douglas.faturamento).toBe(449400)
  })
})

describe('paraConfigEtapas e ida-e-volta', () => {
  it('grava vendas fixa, referência/nova como derivada da de baixo, manual como fixa', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    m = definirModoEtapa(m, 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    const cfgs = paraConfigEtapas(m)
    expect(cfgs.find(c => c.etapa === 'Fechamento')).toEqual({ etapa: 'Fechamento', modo: 'fixo', valorFixo: 6 })
    expect(cfgs.find(c => c.etapa === 'SAL')).toEqual({ etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Oportunidade COF', taxa: 0.4, taxaOrigem: 'manual' })
    expect(cfgs.find(c => c.etapa === 'Oportunidade COF')).toMatchObject({ modo: 'derivado', etapaOrigem: 'Fechamento', taxaOrigem: 'mes_anterior' })
    expect(cfgs.find(c => c.etapa === 'Reunião Realizada')).toEqual({ etapa: 'Reunião Realizada', modo: 'fixo', valorFixo: 50 })
    expect(cfgs.find(c => c.etapa === 'Ligações')).toMatchObject({ modo: 'derivado', etapaOrigem: 'Reunião Agendada SQL' })
    // o motor antigo chega nos mesmos valores exatos
    expect(resolverFunilMarca(cfgs, 74900).valores.SAL).toBeCloseTo(31.8, 6)
  })

  it('republicar a versão (hub) dá as mesmas metas', () => {
    let m = definirModoEtapa(inpotOutubro(6), 'SAL', { tipo: 'conversao', taxa: 0.4 })
    m = definirModoEtapa(m, 'Reunião Realizada', { tipo: 'manual', valor: 50 })
    const volta = marcaDeVersao({ marca: m.marca, ticketMedio: 74900, etapas: paraConfigEtapas(m), pessoas: m.pessoas }, 'V1', false)
    expect(volta.vendas).toBe(6)
    expect(volta.etapas['Reunião Realizada']).toEqual({ tipo: 'manual', valor: 50 })
    expect(volta.etapas.SAL.tipo).toBe('referencia')
    const a = calcularFunil(m).etapas
    const b = calcularFunil(volta).etapas
    for (const e of ['Ligações', 'Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF', 'Fechamento'] as const) {
      expect(b[e].meta).toBe(a[e].meta)
    }
  })

  it('revisão de versão importada trata os fixos como conversão de referência', () => {
    const m = marcaDeVersao(INPOT_SET, 'V1', true)
    expect(m.vendas).toBe(5)
    expect(Object.values(m.etapas).every(e => e.tipo === 'referencia')).toBe(true)
    const h = marcaDeVersao(INPOT_SET, 'V1', false)
    expect(h.etapas.SAL).toEqual({ tipo: 'manual', valor: 28 })
  })
})

describe('montarPublicacao', () => {
  it('gera o espelho com as metas arredondadas, rateadas por peso', () => {
    const r = { ...rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro') }
    r.marcas = r.marcas.map(m => m.marca === 'Inpot'
      ? definirModoEtapa({ ...m, vendas: 6 }, 'SAL', { tipo: 'conversao', taxa: 0.4 })
      : { ...m, vendas: 5 })
    const pub = montarPublicacao(r)
    const thiago = pub.linhasEspelho.find(l => l.nome_colaborador === 'Thiago')!
    expect(thiago).toMatchObject({ marca: 'Inpot', funcao: 'SDR', meta_sql: 38.5, meta_agendamento: 38.5, meta_reuniao_realizada: 24.5, meta_volume_sal: '16' })
    const douglas = pub.linhasEspelho.find(l => l.nome_colaborador === 'Douglas')!
    expect(douglas).toMatchObject({ meta_cof: 13, meta_qtd_vendas: 6, meta_financeira: 449400 })
    const aurelio = pub.linhasEspelho.find(l => l.nome_colaborador === 'Aurélio Briano')!
    expect(aurelio).toMatchObject({ marca: 'Odonto Scale', meta_qtd_vendas: 5, meta_cof: null })
    expect(pub.marcas.find(m => m.marca === 'Inpot')!.ticketMedio).toBe(74900)
  })

  it('descarta distribuição semanal de pessoa, marca ou semana que não existem mais', () => {
    const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
    r.distribuicaoSemanal = [
      { marca: 'Inpot', nomePessoa: 'Thiago', semanaNumero: 1, etapa: 'Reunião Agendada SQL', valor: 8 },
      { marca: 'Inpot', nomePessoa: 'Fulano', semanaNumero: 1, etapa: 'Reunião Agendada SQL', valor: 8 },
      { marca: 'Inpot', nomePessoa: 'Thiago', semanaNumero: 9, etapa: 'Reunião Agendada SQL', valor: 8 },
      { marca: 'Inpot', nomePessoa: 'Thiago', semanaNumero: 2, etapa: 'Oportunidade COF', valor: 8 },
      { marca: 'Viva', nomePessoa: 'Thiago', semanaNumero: 1, etapa: 'Reunião Agendada SQL', valor: 8 },
    ]
    expect(montarPublicacao(r).distribuicaoSemanal).toEqual([r.distribuicaoSemanal[0]])
  })
})

describe('rascunhos', () => {
  it('do mês anterior: semanas do mês novo, marcas ordenadas, sem distribuição', () => {
    const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
    expect(r.origem).toEqual({ tipo: 'mes_anterior', mes: '2026-09-01', rotulo: 'setembro' })
    expect(r.semanas[0]).toEqual({ numero: 1, inicio: '2026-10-01', fim: '2026-10-05' })
    expect(r.marcas.map(m => m.marca)).toEqual(['Odonto Scale', 'Inpot'])
    expect(r.distribuicaoSemanal).toEqual([])
  })

  it('de versão: mantém semanas e distribuição da versão', () => {
    const estado: EstadoMes = { ...SETEMBRO, distribuicaoSemanal: [{ marca: 'Inpot', nomePessoa: 'Thiago', semanaNumero: 1, etapa: 'Ligações', valor: 100 }] }
    const r = rascunhoDeVersao('2026-09-01', { id: 7, numero: 1, rotulo: 'Lançamento', origem: 'importado' }, estado)
    expect(r.origem).toEqual({ tipo: 'versao', versaoId: 7, numero: 1, rotulo: 'Lançamento' })
    expect(r.semanas).toBe(estado.semanas)
    expect(r.distribuicaoSemanal).toHaveLength(1)
    expect(r.marcas.find(m => m.marca === 'Inpot')!.referencia!.rotulo).toBe('V1')
  })

  it('em branco: marcas sem referência', () => {
    const r = rascunhoEmBranco('2026-10-01', ['Viva'])
    expect(r.origem).toEqual({ tipo: 'branco' })
    expect(r.marcas[0].referencia).toBeNull()
  })

  it('resumo soma vendas/faturamento e conta as prontas', () => {
    const r = rascunhoDoMesAnterior('2026-10-01', SETEMBRO, 'setembro')
    r.marcas = r.marcas.map(m => m.marca === 'Inpot' ? { ...m, vendas: 6 } : m)
    expect(resumoRascunho(r)).toEqual({ vendas: 6, faturamento: 449400, prontas: 1, total: 2 })
  })
})

describe('marcas', () => {
  it('ordena pela ordem do BRAND_LIST', () => {
    expect(ordenarMarcas([{ marca: 'Viva' }, { marca: 'Oral Unic' }, { marca: 'Inpot' }]).map(m => m.marca)).toEqual(['Oral Unic', 'Inpot', 'Viva'])
  })

  it('lista as marcas que ainda não estão no rascunho', () => {
    const r = rascunhoEmBranco('2026-10-01', ['Viva', 'Inpot'])
    const d = marcasDisponiveis(r)
    expect(d).toContain('Oral Unic')
    expect(d).not.toContain('Viva')
  })
})

describe('distribuirProporcional', () => {
  it('reparte o total inteiro pelos dias de cada semana e fecha a soma', () => {
    const semanas = gerarSemanas('2026-10-01', 'terca') // 5, 7, 7, 7, 5 dias
    expect(distribuirProporcional(41, semanas)).toEqual([7, 9, 9, 9, 7])
    expect(distribuirProporcional(40.5, semanas).reduce((a, b) => a + b, 0)).toBe(41)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ~/ws-dashboard-worktree-config-metas && npx vitest run src/lib/configMetas.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/configMetas"`.

- [ ] **Step 3: Implementar o módulo**

```ts file=src/lib/configMetas.ts
/**
 * Configuração das Metas — modelo do rascunho e regras do funil reverso.
 * Spec: docs/superpowers/specs/2026-09-30-configuracao-metas-wizard-design.md
 *
 * Puro (sem React nem Supabase): a tela monta um `RascunhoConfig`, este módulo
 * calcula o funil de cada marca, diz o que falta e converte pro formato que
 * `publicar_meta_versao` já grava (`ConfigEtapa[]` + linhas do espelho).
 */
import { BRAND_LIST } from '@/constants/brands'
import {
  gerarLinhasEspelho, gerarSemanas, resolverFunilMarca,
  type ConfigEtapa, type DiaSemana, type EtapaMeta, type LinhaEspelho,
  type PessoaComFuncao, type ResolucaoFunil, type Semana,
} from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMes, EstadoMesMarca, VersaoMeta } from '@/hooks/useMetaMes'

// ── Etapas ───────────────────────────────────────────────────────────────

/** Funil de cima pra baixo, na ordem em que a tela desenha. Vendas (Fechamento) é a âncora. */
export const ETAPAS_FUNIL = ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF', 'Fechamento'] as const
export type EtapaFunil = typeof ETAPAS_FUNIL[number]

/** Etapas que o gestor configura, na ordem em que o cálculo sobe (de baixo pra
 *  cima). Ligações fica fora da cadeia, pendurada no SQL. */
export const ETAPAS_CONFIGURAVEIS = ['Oportunidade COF', 'SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'Ligações'] as const
export type EtapaConfiguravel = typeof ETAPAS_CONFIGURAVEIS[number]

export type EtapaMetaConfig = EtapaFunil | 'Ligações'

export const ROTULO_ETAPA: Record<EtapaMetaConfig, string> = {
  'Ligações': 'Ligações',
  'Reunião Agendada SQL': 'SQL',
  'Reunião Realizada': 'Diagnóstico',
  SAL: 'SAL',
  'Oportunidade COF': 'COF',
  Fechamento: 'Vendas',
}

/** A conversão de uma etapa é sempre dela pra de baixo: taxa = valor(baixo) ÷ valor(etapa). */
export const ETAPA_ABAIXO: Record<EtapaConfiguravel, EtapaFunil> = {
  'Ligações': 'Reunião Agendada SQL',
  'Reunião Agendada SQL': 'Reunião Realizada',
  'Reunião Realizada': 'SAL',
  SAL: 'Oportunidade COF',
  'Oportunidade COF': 'Fechamento',
}

/** Quem leva a meta de cada etapa — mesma partição de `gerarLinhasEspelho`. */
export const ETAPAS_SDR: readonly EtapaMetaConfig[] = ['Ligações', 'Reunião Agendada SQL', 'Reunião Realizada', 'SAL']
export const ETAPAS_CLOSER: readonly EtapaMetaConfig[] = ['Oportunidade COF', 'Fechamento']

/** Etapas da distribuição semanal manual (as mesmas do Hub antigo). */
export const ETAPAS_SEMANAIS: Record<'SDR' | 'Closer', readonly EtapaMeta[]> = {
  SDR: ['Ligações', 'Reunião Agendada SQL'],
  Closer: ['Oportunidade COF', 'Fechamento'],
}

export function funcaoDaEtapaSemanal(etapa: EtapaMeta): 'SDR' | 'Closer' {
  return etapa === 'Oportunidade COF' || etapa === 'Fechamento' ? 'Closer' : 'SDR'
}

// ── Modelo ───────────────────────────────────────────────────────────────

export type ModoEtapaConfig =
  | { tipo: 'referencia' }
  | { tipo: 'conversao'; taxa: number | null }
  | { tipo: 'manual'; valor: number | null }
  | { tipo: 'sem_meta' }

/** O que a marca tinha na versão de onde o rascunho partiu (mês anterior ou versão base). */
export interface ReferenciaMarca {
  /** 'setembro', 'V1'… — só rótulo pra tela. */
  rotulo: string
  vendas: number | null
  ticketMedio: number | null
  /** Conversão etapa → etapa de baixo. */
  taxas: Partial<Record<EtapaConfiguravel, number>>
  /** Meta de cada etapa na referência, já arredondada. */
  valores: Partial<Record<EtapaMetaConfig, number>>
}

export interface MarcaConfig {
  marca: string
  vendas: number | null
  ticketMedio: number | null
  etapas: Record<EtapaConfiguravel, ModoEtapaConfig>
  pessoas: PessoaComFuncao[]
  referencia: ReferenciaMarca | null
}

export type OrigemRascunho =
  | { tipo: 'mes_anterior'; mes: string; rotulo: string }
  | { tipo: 'versao'; versaoId: number; numero: number; rotulo: string }
  | { tipo: 'branco' }

export interface RascunhoConfig {
  mesReferencia: string
  origem: OrigemRascunho
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: MarcaConfig[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  atualizadoEm: string
}

/** Meta inteira pra cima. O -1e-9 evita que 28,000000000000004 vire 29. */
export function arredondarMeta(x: number): number {
  return Math.max(0, Math.ceil(x - 1e-9))
}

export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(ano, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Referência e rascunhos ───────────────────────────────────────────────

/**
 * Lê uma versão publicada como referência. A taxa de cada etapa é a gravada,
 * quando a etapa derivava da de baixo; senão, a implícita dos valores exatos
 * (`exato(baixo) / exato(etapa)`) — é o caso de toda a V1 de setembro, que foi
 * importada com números fixos.
 */
export function referenciaDeVersao(estado: EstadoMesMarca, rotulo: string): ReferenciaMarca {
  const exato = resolverFunilMarca(estado.etapas, estado.ticketMedio).valores
  const porEtapa = new Map(estado.etapas.map(e => [e.etapa, e]))
  const taxas: Partial<Record<EtapaConfiguravel, number>> = {}
  for (const x of ETAPAS_CONFIGURAVEIS) {
    const abaixo = ETAPA_ABAIXO[x]
    const cfg = porEtapa.get(x)
    if (cfg?.modo === 'derivado' && cfg.etapaOrigem === abaixo && cfg.taxa != null && cfg.taxa > 0) {
      taxas[x] = cfg.taxa
      continue
    }
    const vx = exato[x]
    const vb = exato[abaixo]
    if (vx != null && vx > 0 && vb != null && vb > 0) taxas[x] = vb / vx
  }
  const valores: Partial<Record<EtapaMetaConfig, number>> = {}
  for (const e of [...ETAPAS_FUNIL, 'Ligações'] as EtapaMetaConfig[]) {
    const v = exato[e]
    if (v != null) valores[e] = arredondarMeta(v)
  }
  return {
    rotulo,
    vendas: exato['Fechamento'] ?? null,
    ticketMedio: estado.ticketMedio > 0 ? estado.ticketMedio : null,
    taxas,
    valores,
  }
}

function etapasPadrao(fn: (x: EtapaConfiguravel) => ModoEtapaConfig): Record<EtapaConfiguravel, ModoEtapaConfig> {
  return Object.fromEntries(ETAPAS_CONFIGURAVEIS.map(x => [x, fn(x)])) as Record<EtapaConfiguravel, ModoEtapaConfig>
}

/** Marca de um mês novo a partir do mês anterior: tudo preenchido menos as vendas. */
export function marcaDoMesAnterior(estado: EstadoMesMarca, rotulo: string): MarcaConfig {
  const referencia = referenciaDeVersao(estado, rotulo)
  return {
    marca: estado.marca,
    vendas: null,
    ticketMedio: referencia.ticketMedio,
    etapas: etapasPadrao(x => {
      if (referencia.taxas[x] != null) return { tipo: 'referencia' }
      const v = referencia.valores[x]
      return v != null && v > 0 ? { tipo: 'manual', valor: v } : { tipo: 'sem_meta' }
    }),
    pessoas: estado.pessoas.map(p => ({ ...p })),
    referencia,
  }
}

/**
 * Marca de uma revisão (V2 a partir de V{k}). Etapa fixa de versão montada no
 * Hub volta como manual (foi escolha do gestor); de versão importada, como
 * referência (o fixo era só o jeito de importar a planilha).
 */
export function marcaDeVersao(estado: EstadoMesMarca, rotulo: string, importada: boolean): MarcaConfig {
  const referencia = referenciaDeVersao(estado, rotulo)
  const porEtapa = new Map(estado.etapas.map(e => [e.etapa, e]))
  return {
    marca: estado.marca,
    vendas: referencia.vendas,
    ticketMedio: referencia.ticketMedio,
    etapas: etapasPadrao(x => {
      const cfg = porEtapa.get(x)
      if (!cfg || cfg.modo === 'desligado') return { tipo: 'sem_meta' }
      if (cfg.modo === 'derivado' || importada) {
        if (referencia.taxas[x] != null) return { tipo: 'referencia' }
        const v = referencia.valores[x]
        return v != null ? { tipo: 'manual', valor: v } : { tipo: 'sem_meta' }
      }
      return { tipo: 'manual', valor: cfg.valorFixo ?? null }
    }),
    pessoas: estado.pessoas.map(p => ({ ...p })),
    referencia,
  }
}

export function marcaEmBranco(marca: string): MarcaConfig {
  return {
    marca,
    vendas: null,
    ticketMedio: null,
    etapas: etapasPadrao(() => ({ tipo: 'conversao', taxa: null })),
    pessoas: [],
    referencia: null,
  }
}

const ORDEM_MARCA = new Map(BRAND_LIST.flatMap((b, i) => (b.marca ? [[b.marca as string, i] as const] : [])))

export function ordenarMarcas<T extends { marca: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    (ORDEM_MARCA.get(a.marca) ?? 99) - (ORDEM_MARCA.get(b.marca) ?? 99) || a.marca.localeCompare(b.marca, 'pt-BR'))
}

export function marcasDisponiveis(r: RascunhoConfig): string[] {
  const presentes = new Set(r.marcas.map(m => m.marca))
  return BRAND_LIST.flatMap(b => (b.marca && !presentes.has(b.marca) ? [b.marca as string] : []))
}

export function rascunhoDoMesAnterior(mesReferencia: string, anterior: EstadoMes, rotulo: string, agora = new Date()): RascunhoConfig {
  return {
    mesReferencia,
    origem: { tipo: 'mes_anterior', mes: mesAnterior(mesReferencia), rotulo },
    diaViradaSemana: anterior.diaViradaSemana,
    semanas: gerarSemanas(mesReferencia, anterior.diaViradaSemana),
    marcas: ordenarMarcas(anterior.marcas.map(m => marcaDoMesAnterior(m, rotulo))),
    distribuicaoSemanal: [],
    atualizadoEm: agora.toISOString(),
  }
}

export function rascunhoDeVersao(
  mesReferencia: string,
  versao: Pick<VersaoMeta, 'id' | 'numero' | 'rotulo' | 'origem'>,
  estado: EstadoMes,
  agora = new Date(),
): RascunhoConfig {
  const rotulo = `V${versao.numero}`
  return {
    mesReferencia,
    origem: { tipo: 'versao', versaoId: versao.id, numero: versao.numero, rotulo: versao.rotulo },
    diaViradaSemana: estado.diaViradaSemana,
    semanas: estado.semanas,
    marcas: ordenarMarcas(estado.marcas.map(m => marcaDeVersao(m, rotulo, versao.origem === 'importado'))),
    distribuicaoSemanal: estado.distribuicaoSemanal,
    atualizadoEm: agora.toISOString(),
  }
}

export function rascunhoEmBranco(mesReferencia: string, marcas: string[], agora = new Date()): RascunhoConfig {
  return {
    mesReferencia,
    origem: { tipo: 'branco' },
    diaViradaSemana: 'terca',
    semanas: gerarSemanas(mesReferencia, 'terca'),
    marcas: ordenarMarcas(marcas.map(marcaEmBranco)),
    distribuicaoSemanal: [],
    atualizadoEm: agora.toISOString(),
  }
}

// ── Cálculo do funil ─────────────────────────────────────────────────────

export type OrigemValor = 'ancora' | 'referencia' | 'conversao' | 'manual' | 'sem_meta'

export interface EtapaCalculada {
  etapa: EtapaMetaConfig
  exato: number | null
  meta: number | null
  /** Conversão etapa → de baixo usada no cálculo (implícita, se manual). */
  taxa: number | null
  origem: OrigemValor
  /** Nova conversão diferente da de referência. */
  alterada: boolean
  problema: string | null
}

export interface FunilCalculado {
  etapas: Record<EtapaMetaConfig, EtapaCalculada>
  faturamento: number | null
}

/**
 * Resolve o funil de baixo pra cima. Cada etapa parte do valor EXATO da de
 * baixo e só o resultado é arredondado (sem cascata). Etapa cuja de baixo
 * ainda não tem valor (vendas em branco, conversão faltando) fica sem valor e
 * sem reclamar — o problema já está apontado na etapa de baixo.
 */
export function calcularFunil(m: MarcaConfig): FunilCalculado {
  const etapas = {} as Record<EtapaMetaConfig, EtapaCalculada>
  etapas.Fechamento = {
    etapa: 'Fechamento', exato: m.vendas, meta: m.vendas, taxa: null,
    origem: 'ancora', alterada: false, problema: null,
  }

  for (const x of ETAPAS_CONFIGURAVEIS) {
    const modo = m.etapas[x]
    const abaixo = etapas[ETAPA_ABAIXO[x]]
    const refTaxa = m.referencia?.taxas[x] ?? null
    let exato: number | null = null
    let taxa: number | null = null
    let problema: string | null = null
    let alterada = false
    let origem: OrigemValor = 'sem_meta'

    if (modo.tipo === 'manual') {
      origem = 'manual'
      if (modo.valor == null || !(modo.valor >= 0)) {
        problema = `Informe o número de ${ROTULO_ETAPA[x]}`
      } else {
        exato = modo.valor
        if (abaixo.exato != null && modo.valor > 0) taxa = abaixo.exato / modo.valor
      }
    } else if (modo.tipo === 'referencia' || modo.tipo === 'conversao') {
      origem = modo.tipo
      taxa = modo.tipo === 'referencia' ? refTaxa : modo.taxa
      if (modo.tipo === 'conversao') {
        alterada = refTaxa == null || taxa == null || Math.abs(taxa - refTaxa) > 0.0005
      }
      if (taxa == null || !(taxa > 0)) {
        problema = modo.tipo === 'referencia'
          ? `${ROTULO_ETAPA[x]} não tem conversão de referência — informe uma nova`
          : `Informe a conversão ${ROTULO_ETAPA[x]} → ${ROTULO_ETAPA[abaixo.etapa]}`
        taxa = null
      } else if (abaixo.origem === 'sem_meta') {
        problema = `${ROTULO_ETAPA[abaixo.etapa]} está sem meta — informe ${ROTULO_ETAPA[x]} como número manual ou marque sem meta`
      } else if (abaixo.exato != null) {
        exato = abaixo.exato / taxa
      }
    }

    etapas[x] = {
      etapa: x, exato, meta: exato != null ? arredondarMeta(exato) : null,
      taxa, origem, alterada, problema,
    }
  }

  const faturamento = m.vendas != null && m.ticketMedio != null ? m.vendas * m.ticketMedio : null
  return { etapas, faturamento }
}

/** Troca o modo de uma etapa. "Sem meta" leva junto as de cima até a primeira manual. */
export function definirModoEtapa(m: MarcaConfig, etapa: EtapaConfiguravel, modo: ModoEtapaConfig): MarcaConfig {
  const etapas = { ...m.etapas, [etapa]: modo }
  if (modo.tipo === 'sem_meta') {
    for (const acima of ETAPAS_CONFIGURAVEIS.slice(ETAPAS_CONFIGURAVEIS.indexOf(etapa) + 1)) {
      if (etapas[acima].tipo === 'manual') break
      etapas[acima] = { tipo: 'sem_meta' }
    }
  }
  return { ...m, etapas }
}

// ── Pendências e status ──────────────────────────────────────────────────

export interface Pendencia {
  secao: 'base' | 'funil' | 'time'
  texto: string
}

export type StatusMarca = 'nao_configurada' | 'em_configuracao' | 'configurada'

function fmtPeso(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('pt-BR')
}

export function pendenciasMarca(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): Pendencia[] {
  const p: Pendencia[] = []
  if (m.vendas == null) p.push({ secao: 'base', texto: 'Informe as vendas previstas do mês' })
  if (m.ticketMedio == null || !(m.ticketMedio > 0)) p.push({ secao: 'base', texto: 'Informe a taxa de franquia média' })

  for (const x of [...ETAPAS_CONFIGURAVEIS].reverse()) {
    const problema = funil.etapas[x].problema
    if (problema) p.push({ secao: 'funil', texto: problema })
  }

  const sdrs = m.pessoas.filter(x => x.funcao === 'SDR')
  const closers = m.pessoas.filter(x => x.funcao === 'Closer')
  const sdrComMeta = ETAPAS_SDR.some(e => funil.etapas[e].origem !== 'sem_meta')
  if (closers.length === 0) p.push({ secao: 'time', texto: 'Adicione pelo menos um Closer' })
  if (sdrComMeta && sdrs.length === 0) p.push({ secao: 'time', texto: 'Adicione pelo menos um SDR — ou marque as etapas de SDR como sem meta' })
  const somaSdr = sdrs.reduce((s, x) => s + x.peso, 0)
  if (sdrs.length > 0 && Math.abs(somaSdr - 100) > 0.01) p.push({ secao: 'time', texto: `Os pesos dos SDRs somam ${fmtPeso(somaSdr)}% — precisam somar 100%` })
  const somaCloser = closers.reduce((s, x) => s + x.peso, 0)
  if (closers.length > 0 && Math.abs(somaCloser - 100) > 0.01) p.push({ secao: 'time', texto: `Os pesos dos Closers somam ${fmtPeso(somaCloser)}% — precisam somar 100%` })
  return p
}

export function statusMarca(m: MarcaConfig, pendencias: Pendencia[] = pendenciasMarca(m)): StatusMarca {
  if (m.vendas == null) return 'nao_configurada'
  return pendencias.length > 0 ? 'em_configuracao' : 'configurada'
}

// ── Pessoas ──────────────────────────────────────────────────────────────

/** 100% repartido igualmente entre as pessoas da função; a última fecha a soma. */
export function dividirIgualmente(pessoas: PessoaComFuncao[], funcao: 'SDR' | 'Closer'): PessoaComFuncao[] {
  const n = pessoas.filter(p => p.funcao === funcao).length
  if (n === 0) return pessoas
  const base = Math.floor((100 / n) * 100) / 100
  const ultima = Math.round((100 - base * (n - 1)) * 100) / 100
  let i = 0
  return pessoas.map(p => {
    if (p.funcao !== funcao) return p
    i += 1
    return { ...p, peso: i === n ? ultima : base }
  })
}

export interface MetaPessoa {
  nome: string
  funcao: 'SDR' | 'Closer'
  peso: number
  valores: Partial<Record<EtapaMetaConfig, number>>
  faturamento: number | null
}

export function metasPorPessoa(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): MetaPessoa[] {
  return m.pessoas.map(p => {
    const fracao = p.peso / 100
    const valores: Partial<Record<EtapaMetaConfig, number>> = {}
    for (const e of p.funcao === 'SDR' ? ETAPAS_SDR : ETAPAS_CLOSER) {
      const meta = funil.etapas[e].meta
      if (meta != null) valores[e] = meta * fracao
    }
    return {
      nome: p.nome, funcao: p.funcao, peso: p.peso, valores,
      faturamento: p.funcao === 'Closer' && funil.faturamento != null ? funil.faturamento * fracao : null,
    }
  })
}

// ── Persistência ─────────────────────────────────────────────────────────

/** Rascunho → formato de `meta_marca_etapa` (spec §5). */
export function paraConfigEtapas(m: MarcaConfig): ConfigEtapa[] {
  const cfgs: ConfigEtapa[] = [{ etapa: 'Fechamento', modo: 'fixo', valorFixo: m.vendas ?? 0 }]
  for (const x of ETAPAS_CONFIGURAVEIS) {
    const modo = m.etapas[x]
    const etapaOrigem = ETAPA_ABAIXO[x]
    if (modo.tipo === 'referencia' && m.referencia?.taxas[x] != null) {
      cfgs.push({ etapa: x, modo: 'derivado', etapaOrigem, taxa: m.referencia.taxas[x], taxaOrigem: 'mes_anterior' })
    } else if (modo.tipo === 'conversao' && modo.taxa != null) {
      cfgs.push({ etapa: x, modo: 'derivado', etapaOrigem, taxa: modo.taxa, taxaOrigem: 'manual' })
    } else if (modo.tipo === 'manual' && modo.valor != null) {
      cfgs.push({ etapa: x, modo: 'fixo', valorFixo: modo.valor })
    } else {
      cfgs.push({ etapa: x, modo: 'desligado' })
    }
  }
  return cfgs
}

/** Metas arredondadas no formato que `gerarLinhasEspelho` consome. */
export function resolucaoArredondada(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): ResolucaoFunil {
  const valores: Partial<Record<EtapaMeta, number>> = {}
  for (const e of [...ETAPAS_FUNIL, 'Ligações'] as EtapaMetaConfig[]) {
    const meta = funil.etapas[e].meta
    if (meta != null) valores[e] = meta
  }
  return { valores, faturamento: funil.faturamento, erros: [] }
}

export interface Publicacao {
  marcas: EstadoMesMarca[]
  linhasEspelho: LinhaEspelho[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

export function montarPublicacao(r: RascunhoConfig): Publicacao {
  const semanas = new Set(r.semanas.map(s => s.numero))
  const existe = (d: DistribuicaoSemanalItem) => r.marcas.some(m => m.marca === d.marca
    && m.pessoas.some(p => p.nome === d.nomePessoa && p.funcao === funcaoDaEtapaSemanal(d.etapa)))
  return {
    marcas: r.marcas.map(m => ({ marca: m.marca, ticketMedio: m.ticketMedio ?? 0, etapas: paraConfigEtapas(m), pessoas: m.pessoas })),
    linhasEspelho: gerarLinhasEspelho(r.mesReferencia, r.marcas.map(m => ({ marca: m.marca, resolucao: resolucaoArredondada(m), pessoas: m.pessoas }))),
    distribuicaoSemanal: r.distribuicaoSemanal.filter(d => d.valor > 0 && semanas.has(d.semanaNumero) && existe(d)),
  }
}

// ── Semanas ──────────────────────────────────────────────────────────────

export function diasDaSemana(s: Semana): number {
  const [a1, m1, d1] = s.inicio.split('-').map(Number)
  const [a2, m2, d2] = s.fim.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000) + 1
}

/** Reparte o total (arredondado pra cima) pelos dias de cada semana, em inteiros que somam o total. */
export function distribuirProporcional(total: number, semanas: Semana[]): number[] {
  const inteiro = arredondarMeta(total)
  const dias = semanas.map(diasDaSemana)
  const somaDias = dias.reduce((a, b) => a + b, 0)
  if (somaDias === 0) return semanas.map(() => 0)
  const brutos = dias.map(d => (inteiro * d) / somaDias)
  const base = brutos.map(Math.floor)
  let resto = inteiro - base.reduce((a, b) => a + b, 0)
  const ordem = brutos.map((b, i) => ({ i, frac: b - Math.floor(b) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i] += 1
    resto -= 1
  }
  return base
}

// ── Resumo ───────────────────────────────────────────────────────────────

export function resumoRascunho(r: RascunhoConfig): { vendas: number; faturamento: number; prontas: number; total: number } {
  let vendas = 0
  let faturamento = 0
  let prontas = 0
  for (const m of r.marcas) {
    const funil = calcularFunil(m)
    vendas += m.vendas ?? 0
    faturamento += funil.faturamento ?? 0
    if (statusMarca(m, pendenciasMarca(m, funil)) === 'configurada') prontas += 1
  }
  return { vendas, faturamento, prontas, total: r.marcas.length }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/configMetas.test.ts`
Expected: PASS (todos). Se um valor literal divergir por arredondamento, recalcular à mão a partir da regra e corrigir o literal — nunca mudar a regra pra casar com o teste.

- [ ] **Step 5: Commit**

```bash
git add src/lib/configMetas.ts src/lib/configMetas.test.ts
git commit -m "feat(vendas): motor da Configuração das Metas — funil reverso por conversão"
```

---

### Task 2: Rascunho no navegador

**Files:**
- Create: `src/lib/rascunhoMetas.ts`
- Test: `src/lib/rascunhoMetas.test.ts`

**Interfaces:**
- Consumes: `RascunhoConfig`, `rascunhoEmBranco` (Task 1).
- Produces: `carregarRascunho(mes): RascunhoConfig | null`, `salvarRascunho(r): boolean`, `descartarRascunho(mes): void`.

- [ ] **Step 1: Teste (falhando)**

```ts file=src/lib/rascunhoMetas.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rascunhoEmBranco } from '@/lib/configMetas'
import { carregarRascunho, descartarRascunho, salvarRascunho } from '@/lib/rascunhoMetas'

class MemoriaStorage {
  private dados = new Map<string, string>()
  getItem(k: string) { return this.dados.get(k) ?? null }
  setItem(k: string, v: string) { this.dados.set(k, v) }
  removeItem(k: string) { this.dados.delete(k) }
}

afterEach(() => vi.unstubAllGlobals())

describe('rascunhoMetas', () => {
  it('salva, carrega e descarta por mês', () => {
    vi.stubGlobal('localStorage', new MemoriaStorage())
    const r = rascunhoEmBranco('2026-10-01', ['Viva'])
    expect(salvarRascunho(r)).toBe(true)
    expect(carregarRascunho('2026-10-01')).toEqual(r)
    expect(carregarRascunho('2026-11-01')).toBeNull()
    descartarRascunho('2026-10-01')
    expect(carregarRascunho('2026-10-01')).toBeNull()
  })

  it('ignora conteúdo quebrado ou de outro formato', () => {
    const s = new MemoriaStorage()
    vi.stubGlobal('localStorage', s)
    s.setItem('ws-config-metas:v1:2026-10-01', '{quebrado')
    expect(carregarRascunho('2026-10-01')).toBeNull()
    s.setItem('ws-config-metas:v1:2026-10-01', JSON.stringify({ mesReferencia: '2026-10-01' }))
    expect(carregarRascunho('2026-10-01')).toBeNull()
  })

  it('sem localStorage não quebra', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(salvarRascunho(rascunhoEmBranco('2026-10-01', []))).toBe(false)
    expect(carregarRascunho('2026-10-01')).toBeNull()
    expect(() => descartarRascunho('2026-10-01')).not.toThrow()
  })
})
```

- [ ] **Step 2: Ver falhar** — `npx vitest run src/lib/rascunhoMetas.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts file=src/lib/rascunhoMetas.ts
import type { RascunhoConfig } from '@/lib/configMetas'

/**
 * Rascunho da Configuração das Metas salvo no navegador (decisão C8 do spec):
 * sobrevive a recarregar a página, só vale neste computador/navegador. Toda
 * leitura/escrita em try/catch — janela anônima, armazenamento bloqueado ou
 * cheio simplesmente não persistem.
 */
const PREFIXO = 'ws-config-metas:v1:'

function armazenamento(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null ? null : globalThis.localStorage
  } catch {
    return null
  }
}

export function carregarRascunho(mesReferencia: string): RascunhoConfig | null {
  try {
    const bruto = armazenamento()?.getItem(PREFIXO + mesReferencia)
    if (!bruto) return null
    const r = JSON.parse(bruto) as Partial<RascunhoConfig> | null
    if (!r || r.mesReferencia !== mesReferencia || !r.origem || !Array.isArray(r.marcas) || !Array.isArray(r.semanas)) return null
    return { ...r, distribuicaoSemanal: Array.isArray(r.distribuicaoSemanal) ? r.distribuicaoSemanal : [] } as RascunhoConfig
  } catch {
    return null
  }
}

export function salvarRascunho(r: RascunhoConfig): boolean {
  try {
    const s = armazenamento()
    if (!s) return false
    s.setItem(PREFIXO + r.mesReferencia, JSON.stringify(r))
    return true
  } catch {
    return false
  }
}

export function descartarRascunho(mesReferencia: string): void {
  try {
    armazenamento()?.removeItem(PREFIXO + mesReferencia)
  } catch {
    // sem armazenamento: nada a apagar
  }
}
```

- [ ] **Step 4: Ver passar** — `npx vitest run src/lib/rascunhoMetas.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/rascunhoMetas.* && git commit -m "feat(vendas): rascunho da Configuração das Metas salvo no navegador"`

---

### Task 3: Peças visuais compartilhadas

**Files:**
- Modify: `src/components/metas/metasUi.ts` (acrescentar ao fim)
- Create: `src/components/metas/metas.css`
- Create: `src/components/metas/CampoNumero.tsx`

**Interfaces:**
- Consumes: `StatusMarca` (Task 1).
- Produces: `MESES_LABEL`, `nomeMes(mes)`, `nomeMesMinusculo(mes)`, `capitalizar(s)`, `fmtInt`, `fmtDec`, `fmtBRL`, `fmtPct`, `PillKind`, `pillStyle(kind)`, `STATUS_MARCA_UI`, `ghostButtonStyle`, `smallButtonStyle`, `infoBoxStyle`; classe CSS `cm-flash` e `cm-card-marca`; componente `CampoNumero`.

- [ ] **Step 1: Acrescentar a `metasUi.ts`**

```ts file=src/components/metas/metasUi.ts#append
import type { StatusMarca } from '@/lib/configMetas'

export const MESES_LABEL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** '2026-10-01' → 'Outubro 2026' */
export function nomeMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return `${MESES_LABEL[m - 1]} ${ano}`
}

/** '2026-10-01' → 'outubro' */
export function nomeMesMinusculo(mes: string): string {
  const [, m] = mes.split('-').map(Number)
  return MESES_LABEL[m - 1].toLowerCase()
}

export function capitalizar(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

export function fmtDec(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR')
}

export function fmtBRL(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
}

/** 0,4717 → '47,2%' */
export function fmtPct(taxa: number): string {
  return `${(taxa * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export type PillKind = 'neutro' | 'sucesso' | 'atencao' | 'erro' | 'destaque'

const PILL_CORES: Record<PillKind, { bg: string; fg: string }> = {
  neutro: { bg: 'var(--ws-bg)', fg: 'var(--ws-text-secondary)' },
  sucesso: { bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
  atencao: { bg: 'var(--status-atencao-bg)', fg: 'var(--status-atencao)' },
  erro: { bg: 'var(--status-risco-bg)', fg: 'var(--status-risco)' },
  destaque: { bg: 'color-mix(in srgb, var(--brand-accent) 12%, var(--ws-surface))', fg: 'var(--brand-accent)' },
}

export function pillStyle(kind: PillKind): CSSProperties {
  const c = PILL_CORES[kind]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
    padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.fg, whiteSpace: 'nowrap',
  }
}

export const STATUS_MARCA_UI: Record<StatusMarca, { rotulo: string; kind: PillKind }> = {
  nao_configurada: { rotulo: 'Não configurada', kind: 'neutro' },
  em_configuracao: { rotulo: 'Em configuração', kind: 'atencao' },
  configurada: { rotulo: 'Configurada', kind: 'sucesso' },
}

export const ghostButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none',
  padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ws-text-secondary)', cursor: 'pointer',
}

export const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: '7px 12px', fontSize: 13 }

/** Caixa de orientação ("o que fazer agora") — neutra, não é alerta. */
export const infoBoxStyle: CSSProperties = {
  padding: '12px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, lineHeight: 1.5,
  background: 'var(--ws-bg)', border: '1px dashed var(--ws-border-strong)', color: 'var(--ws-text-primary)',
}
```

- [ ] **Step 2: CSS**

```css file=src/components/metas/metas.css
/* Configuração das Metas — o que inline style não alcança (animação e hover). */
@keyframes cm-flash {
  0% { background: var(--status-atencao-bg); }
  100% { background: transparent; }
}
.cm-flash { animation: cm-flash 0.9s ease-out; }

.cm-card-marca { transition: border-color 0.15s, box-shadow 0.15s; }
.cm-card-marca:hover { border-color: var(--ws-border-strong) !important; box-shadow: var(--shadow-md) !important; }

.cm-seg button:focus-visible,
.cm-card-marca:focus-visible { outline: 2px solid var(--brand-accent); outline-offset: 2px; }
```

- [ ] **Step 3: CampoNumero**

```tsx file=src/components/metas/CampoNumero.tsx
import { useEffect, useRef, useState } from 'react'
import { inputStyle } from './metasUi'

function formatar(v: number | null, casas: number): string {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
}

/** Aceita "74.900", "47,2", "1.557,6". Inteiro (casas = 0) ignora tudo que não é dígito. */
function interpretar(texto: string, casas: number): number | null {
  const t = texto.trim()
  if (!t) return null
  if (casas === 0) {
    const digitos = t.replace(/\D/g, '')
    return digitos ? Number(digitos) : null
  }
  const n = Number(t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Campo numérico em pt-BR. Enquanto focado mostra o que foi digitado; fora de
 * foco, o número formatado. Devolve `null` quando vazio.
 */
export function CampoNumero({
  valor, onMudar, casas = 0, prefixo, sufixo, largura = 110, destaque = false, rotulo, placeholder, autoFocus,
}: {
  valor: number | null
  onMudar: (v: number | null) => void
  casas?: number
  prefixo?: string
  sufixo?: string
  largura?: number
  destaque?: boolean
  rotulo?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [texto, setTexto] = useState(() => formatar(valor, casas))
  const focado = useRef(false)

  useEffect(() => {
    if (!focado.current) setTexto(formatar(valor, casas))
  }, [valor, casas])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {prefixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{prefixo}</span>}
      <input
        value={texto}
        inputMode={casas > 0 ? 'decimal' : 'numeric'}
        aria-label={rotulo}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => { focado.current = true }}
        onBlur={() => { focado.current = false; setTexto(formatar(valor, casas)) }}
        onChange={e => { setTexto(e.target.value); onMudar(interpretar(e.target.value, casas)) }}
        style={{
          ...inputStyle,
          width: largura,
          textAlign: 'right',
          fontSize: destaque ? 20 : 14,
          fontWeight: destaque ? 600 : 500,
          padding: destaque ? '8px 12px' : '6px 10px',
        }}
      />
      {sufixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{sufixo}</span>}
    </span>
  )
}
```

- [ ] **Step 4: Build** — `npm run build` → sem erro (os novos exports ainda sem uso não quebram `tsc -b`, que só reclama de import/local não usado).

- [ ] **Step 5: Commit** — `git add src/components/metas && git commit -m "feat(vendas): peças visuais da Configuração das Metas"`

---

### Task 4: Editor da marca (base, funil reverso, time)

**Files:**
- Create: `src/components/metas/FunilReverso.tsx`
- Create: `src/components/metas/TimeMarca.tsx`
- Create: `src/components/metas/EditorMarca.tsx`

**Interfaces:**
- Consumes: Task 1 (`calcularFunil`, `pendenciasMarca`, `statusMarca`, `definirModoEtapa`, `dividirIgualmente`, `metasPorPessoa`, `ETAPA_ABAIXO`, `ETAPAS_FUNIL`, `ROTULO_ETAPA`, tipos), Task 3 (UI), `useRosterVendas`, `marcaLabel`/`BRAND_ACCENT`.
- Produces: `EditorMarca({ marca, mesReferencia, proximaMarca, onMudar, onVoltar, onProxima, onRemover })`.

- [ ] **Step 1: FunilReverso**

```tsx file=src/components/metas/FunilReverso.tsx
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Flag, Phone } from 'lucide-react'
import {
  ETAPA_ABAIXO, ETAPAS_FUNIL, ROTULO_ETAPA, definirModoEtapa,
  type EtapaCalculada, type EtapaConfiguravel, type EtapaMetaConfig, type FunilCalculado,
  type MarcaConfig, type ModoEtapaConfig, type ReferenciaMarca,
} from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { capitalizar, fmtDec, fmtInt, fmtPct, pillStyle, type PillKind } from './metasUi'

const DONO: Record<EtapaMetaConfig, string> = {
  'Ligações': 'SDR', 'Reunião Agendada SQL': 'SDR', 'Reunião Realizada': 'SDR', SAL: 'SDR',
  'Oportunidade COF': 'Closer', Fechamento: 'Closer',
}

const SELO: Record<EtapaCalculada['origem'], { texto: string; kind: PillKind }> = {
  ancora: { texto: 'ponto de partida', kind: 'destaque' },
  referencia: { texto: 'calculado', kind: 'neutro' },
  conversao: { texto: 'calculado', kind: 'neutro' },
  manual: { texto: 'manual', kind: 'destaque' },
  sem_meta: { texto: 'sem meta', kind: 'neutro' },
}

/** Pisca o fundo quando o valor muda — deixa claro o que foi recalculado. */
function ValorAnimado({ valor, children }: { valor: number | null; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const anterior = useRef(valor)
  useEffect(() => {
    if (anterior.current === valor) return
    anterior.current = valor
    const el = ref.current
    if (!el) return
    el.classList.remove('cm-flash')
    void el.offsetWidth
    el.classList.add('cm-flash')
  }, [valor])
  return <span ref={ref} style={{ borderRadius: 6, padding: '0 6px' }}>{children}</span>
}

export function FunilReverso({ marca, funil, onMudar }: {
  marca: MarcaConfig
  funil: FunilCalculado
  onMudar: (m: MarcaConfig) => void
}) {
  const mudarModo = (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => onMudar(definirModoEtapa(marca, etapa, modo))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <LinhaEtapa etapa="Ligações" calc={funil.etapas['Ligações']} modo={marca.etapas['Ligações']} onMudarModo={mudarModo} />
      <Conector etapa="Ligações" calc={funil.etapas['Ligações']} modo={marca.etapas['Ligações']} referencia={marca.referencia} onMudarModo={mudarModo} />
      {ETAPAS_FUNIL.map(etapa => (
        <Fragment key={etapa}>
          <LinhaEtapa
            etapa={etapa}
            calc={funil.etapas[etapa]}
            modo={etapa === 'Fechamento' ? undefined : marca.etapas[etapa]}
            onMudarModo={mudarModo}
          />
          {etapa !== 'Fechamento' && (
            <Conector etapa={etapa} calc={funil.etapas[etapa]} modo={marca.etapas[etapa]} referencia={marca.referencia} onMudarModo={mudarModo} />
          )}
        </Fragment>
      ))}
    </div>
  )
}

function LinhaEtapa({ etapa, calc, modo, onMudarModo }: {
  etapa: EtapaMetaConfig
  calc: EtapaCalculada
  modo: ModoEtapaConfig | undefined
  onMudarModo: (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => void
}) {
  const ancora = etapa === 'Fechamento'
  const ligacoes = etapa === 'Ligações'
  const semMeta = calc.origem === 'sem_meta'
  const selo = SELO[calc.origem]
  const detalhe = ancora ? ' · vem da Base do mês' : ligacoes ? ' · atividade, fora da cadeia de conversão' : ''

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        border: ancora ? '1.5px solid var(--brand-accent)' : ligacoes ? '1px dashed var(--ws-border-strong)' : '1px solid var(--ws-border)',
        background: semMeta ? 'var(--ws-bg)' : 'var(--ws-surface)',
      }}>
        {ancora && <Flag size={16} color="var(--brand-accent)" aria-hidden />}
        {ligacoes && <Phone size={16} color="var(--ws-text-secondary)" aria-hidden />}
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: semMeta ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
            {ROTULO_ETAPA[etapa]}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>meta do {DONO[etapa]}{detalhe}</div>
        </div>
        <span style={pillStyle(selo.kind)}>{selo.texto}</span>
        {modo?.tipo === 'manual' ? (
          <CampoNumero
            valor={modo.valor}
            onMudar={v => onMudarModo(etapa as EtapaConfiguravel, { tipo: 'manual', valor: v })}
            largura={100}
            destaque
            rotulo={`Número de ${ROTULO_ETAPA[etapa]}`}
          />
        ) : (
          <span style={{ fontSize: 22, fontWeight: 600, minWidth: 80, textAlign: 'right', color: semMeta ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
            <ValorAnimado valor={calc.meta}>{calc.meta != null ? fmtInt(calc.meta) : '—'}</ValorAnimado>
          </span>
        )}
      </div>
      {calc.problema && (
        <div style={{ fontSize: 12, color: 'var(--status-risco)', padding: '4px 16px 0' }}>{calc.problema}</div>
      )}
    </div>
  )
}

function Conector({ etapa, calc, modo, referencia, onMudarModo }: {
  etapa: EtapaConfiguravel
  calc: EtapaCalculada
  modo: ModoEtapaConfig
  referencia: ReferenciaMarca | null
  onMudarModo: (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => void
}) {
  const [focarTaxa, setFocarTaxa] = useState(false)
  const abaixo = ETAPA_ABAIXO[etapa]
  const refTaxa = referencia?.taxas[etapa] ?? null

  let texto: string
  if (modo.tipo === 'sem_meta') texto = 'sem meta nesta etapa'
  else if (calc.taxa == null) texto = `${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}: sem conversão`
  else {
    texto = `${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}: ${fmtPct(calc.taxa)}`
    if (etapa === 'Ligações') texto += ` · 1 SQL a cada ${fmtDec(1 / calc.taxa)} ligações`
    if (modo.tipo === 'manual') texto = `resultante — ${texto}`
  }

  const opcoes: { tipo: ModoEtapaConfig['tipo']; rotulo: string; desabilitada: boolean }[] = [
    {
      tipo: 'referencia',
      rotulo: refTaxa != null && referencia ? `${capitalizar(referencia.rotulo)} ${fmtPct(refTaxa)}` : 'Sem referência',
      desabilitada: refTaxa == null,
    },
    { tipo: 'conversao', rotulo: 'Nova conversão', desabilitada: false },
    { tipo: 'manual', rotulo: 'Número manual', desabilitada: false },
    { tipo: 'sem_meta', rotulo: 'Sem meta', desabilitada: false },
  ]

  function escolher(tipo: ModoEtapaConfig['tipo']) {
    if (tipo === modo.tipo) return
    setFocarTaxa(tipo === 'conversao')
    if (tipo === 'referencia') onMudarModo(etapa, { tipo: 'referencia' })
    else if (tipo === 'conversao') onMudarModo(etapa, { tipo: 'conversao', taxa: calc.taxa ?? refTaxa })
    else if (tipo === 'manual') onMudarModo(etapa, { tipo: 'manual', valor: calc.meta })
    else onMudarModo(etapa, { tipo: 'sem_meta' })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap',
      margin: '0 0 0 26px', padding: '10px 0 10px 18px', borderLeft: '2px solid var(--ws-border)',
    }}>
      <ArrowUp size={14} color="var(--ws-text-secondary)" aria-hidden />
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', flex: '1 1 200px', minWidth: 0 }}>{texto}</span>
      <div className="cm-seg" role="group" aria-label={`Como definir ${ROTULO_ETAPA[etapa]}`} style={{
        display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--ws-border-strong)',
        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
      }}>
        {opcoes.map((o, i) => {
          const ativo = modo.tipo === o.tipo
          return (
            <button
              key={o.tipo}
              type="button"
              aria-pressed={ativo}
              disabled={o.desabilitada}
              onClick={() => escolher(o.tipo)}
              style={{
                border: 'none', borderRight: i < opcoes.length - 1 ? '1px solid var(--ws-border)' : 'none',
                padding: '5px 10px', fontSize: 12, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                cursor: o.desabilitada ? 'not-allowed' : 'pointer',
                background: ativo ? 'color-mix(in srgb, var(--brand-accent) 12%, var(--ws-surface))' : 'var(--ws-surface)',
                color: ativo ? 'var(--brand-accent)' : o.desabilitada ? 'var(--ws-border-strong)' : 'var(--ws-text-primary)',
                fontWeight: ativo ? 600 : 400,
              }}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
      {modo.tipo === 'conversao' && (
        <CampoNumero
          casas={1}
          sufixo="%"
          largura={76}
          autoFocus={focarTaxa}
          valor={modo.taxa != null ? modo.taxa * 100 : null}
          onMudar={v => onMudarModo(etapa, { tipo: 'conversao', taxa: v == null ? null : v / 100 })}
          rotulo={`Conversão ${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}`}
        />
      )}
      {calc.alterada && refTaxa != null && (
        <span style={pillStyle('atencao')}>alterada · era {fmtPct(refTaxa)}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TimeMarca**

```tsx file=src/components/metas/TimeMarca.tsx
import { X } from 'lucide-react'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { dividirIgualmente, metasPorPessoa, ROTULO_ETAPA, type EtapaMetaConfig, type FunilCalculado, type MarcaConfig, type MetaPessoa } from '@/lib/configMetas'
import type { PessoaComFuncao } from '@/lib/metasEngine'
import { CampoNumero } from './CampoNumero'
import { fmtBRL, fmtDec, ghostButtonStyle, inputStyle, pillStyle } from './metasUi'

const FUNCOES = [
  { funcao: 'SDR' as const, titulo: 'SDRs', leva: 'Ligações, SQL, Diagnóstico e SAL' },
  { funcao: 'Closer' as const, titulo: 'Closers', leva: 'COF, Vendas e faturamento' },
]

const ORDEM_SDR: EtapaMetaConfig[] = ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Ligações']

function resumoPessoa(meta: MetaPessoa | undefined): string {
  if (!meta) return ''
  if (meta.funcao === 'SDR') {
    return ORDEM_SDR.filter(e => meta.valores[e] != null).map(e => `${ROTULO_ETAPA[e]} ${fmtDec(meta.valores[e]!)}`).join(' · ') || 'sem metas de SDR'
  }
  const partes: string[] = []
  if (meta.valores['Oportunidade COF'] != null) partes.push(`COF ${fmtDec(meta.valores['Oportunidade COF'])}`)
  if (meta.valores.Fechamento != null) partes.push(`Vendas ${fmtDec(meta.valores.Fechamento)}`)
  if (meta.faturamento != null) partes.push(fmtBRL(meta.faturamento))
  return partes.join(' · ')
}

export function TimeMarca({ marca, funil, onMudarPessoas }: {
  marca: MarcaConfig
  funil: FunilCalculado
  onMudarPessoas: (pessoas: PessoaComFuncao[]) => void
}) {
  const { data: roster } = useRosterVendas()
  const previa = metasPorPessoa(marca, funil)

  return (
    <div className="rs-grid rs-cols-2" style={{ gap: 16 }}>
      {FUNCOES.map(({ funcao, titulo, leva }) => {
        const dessa = marca.pessoas.filter(p => p.funcao === funcao)
        const soma = dessa.reduce((s, p) => s + p.peso, 0)
        const somaOk = Math.abs(soma - 100) <= 0.01
        const disponiveis = (roster ?? []).filter(r => (r.cargo === funcao || r.cargo === 'SDR/Closer') && !dessa.some(d => d.nome === r.nome))
        const adicionar = (nome: string) => onMudarPessoas(dividirIgualmente([...marca.pessoas, { nome, funcao, peso: 0 }], funcao))
        const remover = (nome: string) => onMudarPessoas(dividirIgualmente(marca.pessoas.filter(p => !(p.nome === nome && p.funcao === funcao)), funcao))
        const mudarPeso = (nome: string, peso: number | null) =>
          onMudarPessoas(marca.pessoas.map(p => (p.nome === nome && p.funcao === funcao ? { ...p, peso: peso ?? 0 } : p)))

        return (
          <div key={funcao} style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 16, background: 'var(--ws-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>levam {leva}</div>
              </div>
              {dessa.length > 0 && (
                <span style={pillStyle(somaOk ? 'sucesso' : 'erro')}>soma {fmtDec(soma)}%</span>
              )}
            </div>

            {dessa.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', padding: '6px 0 10px' }}>
                Ninguém ainda — adicione abaixo.
              </div>
            )}

            {dessa.map(p => (
              <div key={p.nome} style={{ padding: '8px 0', borderTop: '1px solid var(--ws-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0 }}>{p.nome}</span>
                  <CampoNumero valor={p.peso} onMudar={v => mudarPeso(p.nome, v)} casas={2} sufixo="%" largura={70} rotulo={`Peso de ${p.nome}`} />
                  <button type="button" onClick={() => remover(p.nome)} aria-label={`Remover ${p.nome}`} style={{ ...ghostButtonStyle, padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
                  {resumoPessoa(previa.find(x => x.nome === p.nome && x.funcao === funcao))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <select
                value=""
                onChange={e => { if (e.target.value) adicionar(e.target.value) }}
                style={{ ...inputStyle, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
                aria-label={`Adicionar ${funcao}`}
              >
                <option value="">+ adicionar {funcao}…</option>
                {disponiveis.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
              </select>
              {dessa.length > 1 && (
                <button type="button" onClick={() => onMudarPessoas(dividirIgualmente(marca.pessoas, funcao))} style={{ ...ghostButtonStyle, fontSize: 12 }}>
                  Dividir igualmente
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: EditorMarca**

```tsx file=src/components/metas/EditorMarca.tsx
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { calcularFunil, pendenciasMarca, statusMarca, type MarcaConfig } from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { FunilReverso } from './FunilReverso'
import { TimeMarca } from './TimeMarca'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, fmtBRL, fmtDec, ghostButtonStyle, infoBoxStyle,
  nomeMesMinusculo, pillStyle, primaryButtonStyle, secondaryButtonStyle,
} from './metasUi'
import './metas.css'

export function EditorMarca({ marca, mesReferencia, proximaMarca, onMudar, onVoltar, onProxima, onRemover }: {
  marca: MarcaConfig
  mesReferencia: string
  /** Rótulo da próxima marca da lista, ou null se esta é a última. */
  proximaMarca: string | null
  onMudar: (m: MarcaConfig) => void
  onVoltar: () => void
  onProxima: () => void
  onRemover: () => void
}) {
  const funil = calcularFunil(marca)
  const pendencias = pendenciasMarca(marca, funil)
  const status = statusMarca(marca, pendencias)
  const ref = marca.referencia
  const nome = marcaLabel(marca.marca)
  const mes = nomeMesMinusculo(mesReferencia)

  let orientacao: string | null = null
  if (marca.vendas == null) {
    orientacao = ref
      ? `Comece informando quantas vendas ${nome} deve fazer em ${mes}. A taxa de franquia, as conversões e o time já vêm de ${ref.rotulo} — o funil se calcula sozinho a partir das vendas.`
      : `${nome} não tem referência anterior. Informe as vendas e a taxa de franquia, depois a conversão de cada etapa e o time.`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={ghostButtonStyle}><ArrowLeft size={14} /> Marcas</button>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: BRAND_ACCENT[marca.marca] ?? 'var(--ws-border-strong)' }} aria-hidden />
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22 }}>{nome}</h2>
        <span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => { if (window.confirm(`Tirar ${nome} da meta de ${mes}? Dá pra adicionar de novo depois, mas a configuração dela será perdida.`)) onRemover() }}
          style={{ ...ghostButtonStyle, fontSize: 12 }}
        >
          <Trash2 size={14} /> Remover do mês
        </button>
      </div>

      {orientacao && <div style={infoBoxStyle}>{orientacao}</div>}

      <Secao numero={1} titulo="Base do mês" descricao="O ponto de partida. Todo o funil é calculado a partir das vendas.">
        <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
          <Bloco rotulo="Vendas previstas">
            <CampoNumero valor={marca.vendas} onMudar={v => onMudar({ ...marca, vendas: v })} destaque largura={110} sufixo="unid." rotulo="Vendas previstas" autoFocus={marca.vendas == null} />
            {ref?.vendas != null && (
              <Sugestao igual={marca.vendas === ref.vendas} texto={`${ref.rotulo}: ${fmtDec(ref.vendas)}`} onUsar={() => onMudar({ ...marca, vendas: ref.vendas })} />
            )}
          </Bloco>
          <Bloco rotulo="Taxa de franquia média por unidade">
            <CampoNumero valor={marca.ticketMedio} onMudar={v => onMudar({ ...marca, ticketMedio: v })} destaque largura={140} prefixo="R$" rotulo="Taxa de franquia média" />
            {ref?.ticketMedio != null && (
              <Sugestao igual={marca.ticketMedio === ref.ticketMedio} texto={`${ref.rotulo}: ${fmtBRL(ref.ticketMedio)}`} onUsar={() => onMudar({ ...marca, ticketMedio: ref.ticketMedio })} />
            )}
          </Bloco>
          <Bloco rotulo="Faturamento previsto">
            <div style={{ fontSize: 22, fontWeight: 600, padding: '6px 0' }}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>vendas × taxa de franquia</div>
          </Bloco>
        </div>
      </Secao>

      <Secao
        numero={2}
        titulo="Funil de metas"
        descricao={`Calculado de baixo pra cima a partir das vendas. Em cada etapa, use a conversão de ${ref?.rotulo ?? 'referência'}, informe uma nova conversão ou digite o número direto.`}
      >
        <FunilReverso marca={marca} funil={funil} onMudar={onMudar} />
      </Secao>

      <Secao numero={3} titulo="Time da marca" descricao="Quem trabalha a marca no mês. A meta de cada pessoa é a meta da marca × o peso dela.">
        <TimeMarca marca={marca} funil={funil} onMudarPessoas={pessoas => onMudar({ ...marca, pessoas })} />
      </Secao>

      {marca.vendas != null && pendencias.length > 0 && (
        <div style={bannerStyle('atencao')}>
          <b>Falta para concluir {nome}:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {pendencias.map(p => <li key={p.texto}>{p.texto}</li>)}
          </ul>
        </div>
      )}
      {status === 'configurada' && <div style={bannerStyle('sucesso')}>{nome} está configurada.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={secondaryButtonStyle}>Voltar para marcas</button>
        <button type="button" onClick={onProxima} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {proximaMarca ? <>Próxima marca: {proximaMarca}</> : <>Concluir e ver todas as marcas</>} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function Secao({ numero, titulo, descricao, children }: { numero: number; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 600,
          background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
        }}>{numero}</span>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{titulo}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ws-text-secondary)' }}>{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Bloco({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</span>
      {children}
    </div>
  )
}

function Sugestao({ igual, texto, onUsar }: { igual: boolean; texto: string; onUsar: () => void }) {
  if (igual) return <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>igual a {texto.split(':')[0]}</span>
  return (
    <button type="button" onClick={onUsar} style={{ ...ghostButtonStyle, padding: 0, fontSize: 11, alignSelf: 'flex-start' }}>
      {texto} · usar
    </button>
  )
}
```

- [ ] **Step 4: Build** — `npm run build` → sem erro.

- [ ] **Step 5: Commit** — `git add src/components/metas && git commit -m "feat(vendas): editor da marca com funil reverso e time"`

---

### Task 5: Painel de marcas

**Files:**
- Create: `src/components/metas/PainelMarcas.tsx`

**Interfaces:**
- Consumes: Task 1 (`calcularFunil`, `pendenciasMarca`, `statusMarca`, `resumoRascunho`, `marcasDisponiveis`, `RascunhoConfig`), Task 3.
- Produces: `PainelMarcas({ rascunho, onAbrirMarca, onAdicionarMarcas, onAvancar })`.

- [ ] **Step 1: Componente**

```tsx file=src/components/metas/PainelMarcas.tsx
import { useState } from 'react'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { calcularFunil, marcasDisponiveis, pendenciasMarca, resumoRascunho, statusMarca, type RascunhoConfig } from '@/lib/configMetas'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, fmtBRL, fmtInt, infoBoxStyle, inputStyle,
  nomeMesMinusculo, pillStyle, primaryButtonStyle, smallButtonStyle,
} from './metasUi'
import './metas.css'

export function PainelMarcas({ rascunho, onAbrirMarca, onAdicionarMarcas, onAvancar }: {
  rascunho: RascunhoConfig
  onAbrirMarca: (marca: string) => void
  onAdicionarMarcas: (marcas: string[]) => void
  onAvancar: () => void
}) {
  const itens = rascunho.marcas.map(m => {
    const funil = calcularFunil(m)
    const pendencias = pendenciasMarca(m, funil)
    return { m, funil, pendencias, status: statusMarca(m, pendencias) }
  })
  const resumo = resumoRascunho(rascunho)
  const disponiveis = marcasDisponiveis(rascunho)
  const proxima = itens.find(i => i.status !== 'configurada')
  const mes = nomeMesMinusculo(rascunho.mesReferencia)

  if (itens.length === 0) {
    return <EscolherMarcas mes={mes} disponiveis={disponiveis} onAdicionar={onAdicionarMarcas} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
        <Numero rotulo="Vendas previstas" valor={fmtInt(resumo.vendas)} />
        <Numero rotulo="Faturamento previsto" valor={fmtBRL(resumo.faturamento)} />
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Marcas prontas</div>
          <div style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 8px' }}>{resumo.prontas} de {resumo.total}</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--ws-bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(resumo.prontas / resumo.total) * 100}%`, background: 'var(--status-positivo)', transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      {proxima ? (
        <div style={{ ...infoBoxStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            Entre em cada marca e informe as vendas de {mes} — o resto já vem calculado. Marca pronta fica verde.
          </span>
          <button type="button" onClick={() => onAbrirMarca(proxima.m.marca)} style={{ ...smallButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Configurar {marcaLabel(proxima.m.marca)} <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div style={bannerStyle('sucesso')}>Todas as marcas estão configuradas. Siga para Semanas ou direto para Revisar e publicar.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
        {itens.map(({ m, funil, pendencias, status }) => {
          const sql = funil.etapas['Reunião Agendada SQL'].meta
          return (
            <button
              key={m.marca}
              type="button"
              className="cm-card-marca"
              onClick={() => onAbrirMarca(m.marca)}
              style={{ ...cardStyle, padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-body)', color: 'var(--ws-text-primary)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: BRAND_ACCENT[m.marca] ?? 'var(--ws-border-strong)' }} aria-hidden />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{marcaLabel(m.marca)}</span>
                <span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span>
              </div>
              {m.vendas == null ? (
                <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
                  Vendas de {mes} ainda não informadas{m.referencia?.vendas != null ? ` · ${m.referencia.rotulo}: ${fmtInt(m.referencia.vendas)}` : ''}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
                  <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{fmtInt(m.vendas)}</b> vendas</span>
                  <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</b></span>
                  {sql != null && <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{fmtInt(sql)}</b> SQL</span>}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: 12 }}>
                <span style={{ color: status === 'em_configuracao' ? 'var(--status-atencao)' : 'var(--ws-text-secondary)' }}>
                  {status === 'configurada' ? 'Tudo certo' : status === 'em_configuracao' ? `${pendencias.length} ${pendencias.length === 1 ? 'pendência' : 'pendências'}` : 'Comece pelas vendas'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--brand-accent)', fontWeight: 600 }}>
                  {status === 'nao_configurada' ? 'Configurar' : 'Editar'} <ChevronRight size={14} />
                </span>
              </div>
            </button>
          )
        })}
        {disponiveis.length > 0 && <AdicionarMarca disponiveis={disponiveis} onAdicionar={nome => onAdicionarMarcas([nome])} />}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAvancar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Continuar para Semanas <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function AdicionarMarca({ disponiveis, onAdicionar }: { disponiveis: string[]; onAdicionar: (marca: string) => void }) {
  return (
    <div style={{
      border: '1.5px dashed var(--ws-border-strong)', borderRadius: 'var(--radius-md)', padding: 16,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, minHeight: 120,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Plus size={14} /> Adicionar marca
      </span>
      <select value="" onChange={e => { if (e.target.value) onAdicionar(e.target.value) }} style={{ ...inputStyle, cursor: 'pointer' }} aria-label="Adicionar marca">
        <option value="">Escolha a marca…</option>
        {disponiveis.map(m => <option key={m} value={m}>{marcaLabel(m)}</option>)}
      </select>
    </div>
  )
}

function EscolherMarcas({ mes, disponiveis, onAdicionar }: { mes: string; disponiveis: string[]; onAdicionar: (marcas: string[]) => void }) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const alternar = (m: string) => setMarcadas(atual => (atual.includes(m) ? atual.filter(x => x !== m) : [...atual, m]))
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Quais marcas terão meta em {mes}?</h3>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        Marque as marcas e depois configure cada uma. Dá pra adicionar ou tirar marcas a qualquer momento.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 8, marginBottom: 16 }}>
        {disponiveis.map(m => (
          <label key={m} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 13,
            border: '1px solid ' + (marcadas.includes(m) ? 'var(--brand-accent)' : 'var(--ws-border)'), borderRadius: 'var(--radius-sm)',
          }}>
            <input type="checkbox" checked={marcadas.includes(m)} onChange={() => alternar(m)} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND_ACCENT[m] ?? 'var(--ws-border-strong)' }} aria-hidden />
            {marcaLabel(m)}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAdicionar(marcadas)}
        disabled={marcadas.length === 0}
        style={{ ...primaryButtonStyle, opacity: marcadas.length === 0 ? 0.5 : 1, cursor: marcadas.length === 0 ? 'not-allowed' : 'pointer' }}
      >
        {marcadas.length === 0 ? 'Marque pelo menos uma marca' : `Adicionar ${marcadas.length} ${marcadas.length === 1 ? 'marca' : 'marcas'}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Build** — `npm run build`.
- [ ] **Step 3: Commit** — `git add src/components/metas/PainelMarcas.tsx && git commit -m "feat(vendas): painel de marcas da Configuração das Metas"`

---

### Task 6: Semanas e Revisar e publicar

**Files:**
- Modify (reescrever): `src/components/metas/PassoSemanas.tsx`
- Modify (reescrever): `src/components/metas/PassoRevisarPublicar.tsx`

**Interfaces:**
- Consumes: Task 1, Task 3, `publicarVersao` (`@/hooks/useSalvarMeta`), `useAcesso`, `VersaoMeta`.
- Produces: `PassoSemanas({ rascunho, onMudar, onVoltar, onAvancar })`, `PassoRevisarPublicar({ rascunho, proximoNumero, versaoAtiva, totaisMesAnterior, onAbrirMarca, onPublicado })`.

- [ ] **Step 1: PassoSemanas**

```tsx file=src/components/metas/PassoSemanas.tsx
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { marcaLabel } from '@/constants/brands'
import type { DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import { gerarSemanas, type DiaSemana, type EtapaMeta } from '@/lib/metasEngine'
import {
  ETAPAS_SEMANAIS, ROTULO_ETAPA, arredondarMeta, diasDaSemana, distribuirProporcional, metasPorPessoa,
  type EtapaMetaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { cardStyle, fmtInt, ghostButtonStyle, infoBoxStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle, smallButtonStyle } from './metasUi'

const DIAS: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
}

interface LinhaSemanal {
  marca: string
  nome: string
  etapa: EtapaMeta
  metaMes: number
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function PassoSemanas({ rascunho, onMudar, onVoltar, onAvancar }: {
  rascunho: RascunhoConfig
  onMudar: (r: RascunhoConfig) => void
  onVoltar: () => void
  onAvancar: () => void
}) {
  const { semanas } = rascunho
  const valores = new Map(rascunho.distribuicaoSemanal.map(d => [`${d.marca}|${d.nomePessoa}|${d.etapa}|${d.semanaNumero}`, d.valor]))

  const porMarca = rascunho.marcas.map(m => {
    const linhas: LinhaSemanal[] = []
    for (const p of metasPorPessoa(m)) {
      for (const etapa of ETAPAS_SEMANAIS[p.funcao]) {
        const v = p.valores[etapa as EtapaMetaConfig]
        if (v != null) linhas.push({ marca: m.marca, nome: p.nome, etapa, metaMes: arredondarMeta(v) })
      }
    }
    return { marca: m.marca, linhas }
  }).filter(g => g.linhas.length > 0)

  function comLinha(linha: LinhaSemanal, novos: (number | null)[]): DistribuicaoSemanalItem[] {
    const resto = rascunho.distribuicaoSemanal.filter(d => !(d.marca === linha.marca && d.nomePessoa === linha.nome && d.etapa === linha.etapa))
    const itens = novos.flatMap((v, i) => (v != null && v > 0
      ? [{ marca: linha.marca, nomePessoa: linha.nome, etapa: linha.etapa, semanaNumero: semanas[i].numero, valor: v }]
      : []))
    return [...resto, ...itens]
  }

  function mudarCelula(linha: LinhaSemanal, semanaNumero: number, valor: number | null) {
    const atuais = semanas.map(s => (s.numero === semanaNumero ? valor : valores.get(`${linha.marca}|${linha.nome}|${linha.etapa}|${s.numero}`) ?? null))
    onMudar({ ...rascunho, distribuicaoSemanal: comLinha(linha, atuais) })
  }

  function preencherTudo() {
    if (rascunho.distribuicaoSemanal.length > 0 && !window.confirm('Substituir tudo o que já foi distribuído pela divisão proporcional aos dias?')) return
    const itens: DistribuicaoSemanalItem[] = []
    for (const g of porMarca) {
      for (const l of g.linhas) {
        distribuirProporcional(l.metaMes, semanas).forEach((v, i) => {
          if (v > 0) itens.push({ marca: l.marca, nomePessoa: l.nome, etapa: l.etapa, semanaNumero: semanas[i].numero, valor: v })
        })
      }
    }
    onMudar({ ...rascunho, distribuicaoSemanal: itens })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>A semana começa na</span>
            <select
              value={rascunho.diaViradaSemana}
              onChange={e => {
                const dia = e.target.value as DiaSemana
                const novas = gerarSemanas(rascunho.mesReferencia, dia)
                onMudar({ ...rascunho, diaViradaSemana: dia, semanas: novas, distribuicaoSemanal: rascunho.distribuicaoSemanal.filter(d => d.semanaNumero <= novas.length) })
              }}
              style={{ ...inputStyle, padding: '8px 10px', cursor: 'pointer' }}
            >
              {DIAS.map(d => <option key={d} value={d}>{DIA_LABEL[d]}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {semanas.map(s => (
              <span key={s.numero} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--ws-bg)' }}>
                <b>S{s.numero}</b> {ddmm(s.inicio)}–{ddmm(s.fim)} · {diasDaSemana(s)} dias
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...infoBoxStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 240 }}>
          Opcional: distribua a meta do mês de cada pessoa pelas semanas. Não trava a publicação — pode deixar em branco.
        </span>
        {porMarca.length > 0 && <button type="button" onClick={preencherTudo} style={smallButtonStyle}>Preencher tudo proporcional aos dias</button>}
      </div>

      {porMarca.length === 0 && (
        <div style={{ ...cardStyle, color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhuma marca tem meta calculada ainda — configure as marcas primeiro.
        </div>
      )}

      {porMarca.map(g => (
        <div key={g.marca} style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{marcaLabel(g.marca)}</h3>
          <div className="rs-scroll-x">
            <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 180 + semanas.length * 72 + 220 }}>
              <thead>
                <tr style={{ color: 'var(--ws-text-secondary)', fontSize: 11, textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>Pessoa · etapa</th>
                  {semanas.map(s => <th key={s.numero} style={{ padding: '6px 4px', fontWeight: 600, whiteSpace: 'nowrap' }}>S{s.numero}</th>)}
                  <th style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>Distribuído</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {g.linhas.map(l => {
                  const doMes = semanas.map(s => valores.get(`${l.marca}|${l.nome}|${l.etapa}|${s.numero}`) ?? null)
                  const alocado = doMes.reduce<number>((a, v) => a + (v ?? 0), 0)
                  const cor = alocado === l.metaMes ? 'var(--status-positivo)' : alocado > l.metaMes ? 'var(--status-risco)' : 'var(--ws-text-secondary)'
                  return (
                    <tr key={`${l.nome}|${l.etapa}`} style={{ borderTop: '1px solid var(--ws-border)' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{l.nome} · {ROTULO_ETAPA[l.etapa as EtapaMetaConfig]}</td>
                      {semanas.map((s, i) => (
                        <td key={s.numero} style={{ padding: '4px' }}>
                          <CampoNumero valor={doMes[i]} onMudar={v => mudarCelula(l, s.numero, v)} largura={60} rotulo={`${l.nome} ${ROTULO_ETAPA[l.etapa as EtapaMetaConfig]} S${s.numero}`} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: cor, fontWeight: 600 }}>
                        {fmtInt(alocado)} de {fmtInt(l.metaMes)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          type="button"
                          onClick={() => onMudar({ ...rascunho, distribuicaoSemanal: comLinha(l, distribuirProporcional(l.metaMes, semanas)) })}
                          style={{ ...ghostButtonStyle, fontSize: 12, whiteSpace: 'nowrap' }}
                        >
                          proporcional
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ArrowLeft size={14} /> Marcas</button>
        <button type="button" onClick={onAvancar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Revisar e publicar <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: PassoRevisarPublicar**

```tsx file=src/components/metas/PassoRevisarPublicar.tsx
import { useState } from 'react'
import { marcaLabel } from '@/constants/brands'
import { useAcesso } from '@/contexts/AcessoContext'
import type { VersaoMeta } from '@/hooks/useMetaMes'
import { publicarVersao } from '@/hooks/useSalvarMeta'
import {
  ETAPAS_FUNIL, ROTULO_ETAPA, arredondarMeta, calcularFunil, metasPorPessoa, montarPublicacao,
  pendenciasMarca, resumoRascunho, statusMarca, type EtapaMetaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, disabledButtonStyle, fmtBRL, fmtInt, inputStyle,
  pillStyle, primaryButtonStyle, smallButtonStyle,
} from './metasUi'

const COLUNAS: EtapaMetaConfig[] = [...[...ETAPAS_FUNIL].reverse().slice(1), 'Ligações']

function delta(n: number, fmt: (v: number) => string): string {
  if (Math.abs(n) < 0.5) return 'igual'
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }

export function PassoRevisarPublicar({ rascunho, proximoNumero, versaoAtiva, totaisMesAnterior, onAbrirMarca, onPublicado }: {
  rascunho: RascunhoConfig
  proximoNumero: number
  versaoAtiva: VersaoMeta | null
  totaisMesAnterior: { rotulo: string; vendas: number; faturamento: number } | null
  onAbrirMarca: (marca: string) => void
  onPublicado: (mensagem: string) => void
}) {
  const { pode } = useAcesso()
  const [rotulo, setRotulo] = useState(proximoNumero === 1 ? 'Lançamento' : 'Forecast')
  const [motivo, setMotivo] = useState('')
  const [ativar, setAtivar] = useState(true)
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const itens = rascunho.marcas.map(m => {
    const funil = calcularFunil(m)
    const pendencias = pendenciasMarca(m, funil)
    return { m, funil, pendencias, status: statusMarca(m, pendencias) }
  })
  const resumo = resumoRascunho(rascunho)
  const incompletas = itens.filter(i => i.status !== 'configurada')

  const pessoas = new Map<string, { nome: string; funcao: 'SDR' | 'Closer'; marcas: string[]; valores: Partial<Record<EtapaMetaConfig, number>>; faturamento: number }>()
  for (const { m, funil } of itens) {
    for (const p of metasPorPessoa(m, funil)) {
      const chave = `${p.funcao}|${p.nome}`
      const atual = pessoas.get(chave) ?? { nome: p.nome, funcao: p.funcao, marcas: [], valores: {}, faturamento: 0 }
      atual.marcas.push(marcaLabel(m.marca))
      for (const [e, v] of Object.entries(p.valores) as [EtapaMetaConfig, number][]) atual.valores[e] = (atual.valores[e] ?? 0) + v
      atual.faturamento += p.faturamento ?? 0
      pessoas.set(chave, atual)
    }
  }
  const listaPessoas = [...pessoas.values()].sort((a, b) => a.funcao.localeCompare(b.funcao) || a.nome.localeCompare(b.nome, 'pt-BR'))

  const faltaMotivo = proximoNumero > 1 && motivo.trim() === ''
  const semPermissao = !pode('acao.metas-publicar')
  const bloqueado = incompletas.length > 0 || itens.length === 0 || faltaMotivo || semPermissao || rotulo.trim() === ''

  async function publicar() {
    setPublicando(true)
    setErro(null)
    const pub = montarPublicacao(rascunho)
    const r = await publicarVersao({
      mesReferencia: rascunho.mesReferencia,
      diaViradaSemana: rascunho.diaViradaSemana,
      semanas: rascunho.semanas,
      marcas: pub.marcas,
      distribuicaoSemanal: pub.distribuicaoSemanal,
      linhasEspelho: pub.linhasEspelho,
      rotulo: rotulo.trim(),
      motivo: motivo.trim(),
      ativar,
    })
    setPublicando(false)
    if (!r.ok) { setErro(`Não deu pra publicar: ${r.error}`); return }
    const n = r.numero ?? proximoNumero
    onPublicado(ativar
      ? `V${n} publicada e ativada — o dashboard já mede o time por ela.`
      : `V${n} publicada, sem ativar. Ative quando quiser na lista de versões.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {incompletas.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--status-risco)' }}>
            {incompletas.length === 1 ? 'Falta 1 marca' : `Faltam ${incompletas.length} marcas`} para publicar
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Conclua cada uma — ou tire do mês a marca que não terá meta.
          </p>
          {incompletas.map(({ m, pendencias }) => (
            <div key={m.marca} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ws-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{marcaLabel(m.marca)}</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{pendencias.map(p => p.texto).join(' · ')}</div>
              </div>
              <button type="button" onClick={() => onAbrirMarca(m.marca)} style={smallButtonStyle}>Abrir</button>
            </div>
          ))}
        </div>
      )}

      <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
        <Total rotulo="Vendas" valor={fmtInt(resumo.vendas)}
          comparacoes={[
            totaisMesAnterior && `${totaisMesAnterior.rotulo}: ${fmtInt(totaisMesAnterior.vendas)} (${delta(resumo.vendas - totaisMesAnterior.vendas, fmtInt)})`,
            versaoAtiva && `ativa V${versaoAtiva.numero}: ${fmtInt(versaoAtiva.totalVendas)} (${delta(resumo.vendas - versaoAtiva.totalVendas, fmtInt)})`,
          ]} />
        <Total rotulo="Faturamento" valor={fmtBRL(resumo.faturamento)}
          comparacoes={[
            totaisMesAnterior && `${totaisMesAnterior.rotulo}: ${fmtBRL(totaisMesAnterior.faturamento)}`,
            versaoAtiva && `ativa V${versaoAtiva.numero}: ${fmtBRL(versaoAtiva.totalFaturamento)}`,
          ]} />
        <Total rotulo="Marcas" valor={`${resumo.prontas} de ${resumo.total} prontas`} comparacoes={[]} />
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Metas por marca</h3>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Marca</th>
                <th style={th}>Vendas</th>
                <th style={th}>Faturamento</th>
                {COLUNAS.map(e => <th key={e} style={th}>{ROTULO_ETAPA[e]}</th>)}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {itens.map(({ m, funil, status }) => (
                <tr key={m.marca} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    <button type="button" onClick={() => onAbrirMarca(m.marca)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--ws-border-strong)' }}>
                      {marcaLabel(m.marca)}
                    </button>
                  </td>
                  <td style={td}>{m.vendas != null ? fmtInt(m.vendas) : '—'}</td>
                  <td style={td}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</td>
                  {COLUNAS.map(e => <td key={e} style={td}>{funil.etapas[e].meta != null ? fmtInt(funil.etapas[e].meta!) : '—'}</td>)}
                  <td style={td}><span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>O que cada pessoa vai ver no dashboard</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>Somado entre as marcas da pessoa e arredondado pra cima, como a aba Performance mostra.</p>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Pessoa</th>
                <th style={{ ...th, textAlign: 'left' }}>Marcas</th>
                <th style={th}>SQL</th><th style={th}>Diagnóstico</th><th style={th}>SAL</th>
                <th style={th}>COF</th><th style={th}>Vendas</th><th style={th}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {listaPessoas.map(p => {
                const v = (e: EtapaMetaConfig) => (p.valores[e] != null ? fmtInt(arredondarMeta(p.valores[e]!)) : '—')
                return (
                  <tr key={`${p.funcao}|${p.nome}`} style={{ borderTop: '1px solid var(--ws-border)' }}>
                    <td style={{ ...td, textAlign: 'left' }}><b>{p.nome}</b> <span style={{ color: 'var(--ws-text-secondary)', fontSize: 11 }}>{p.funcao}</span></td>
                    <td style={{ ...td, textAlign: 'left', color: 'var(--ws-text-secondary)', fontSize: 12 }}>{p.marcas.join(', ')}</td>
                    <td style={td}>{v('Reunião Agendada SQL')}</td><td style={td}>{v('Reunião Realizada')}</td><td style={td}>{v('SAL')}</td>
                    <td style={td}>{v('Oportunidade COF')}</td><td style={td}>{v('Fechamento')}</td>
                    <td style={td}>{p.funcao === 'Closer' ? fmtBRL(p.faturamento) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Publicar como V{proximoNumero}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Nome da versão
            <input value={rotulo} onChange={e => setRotulo(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Motivo {proximoNumero > 1 ? '(obrigatório numa revisão)' : '(opcional)'}
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              placeholder={proximoNumero > 1 ? 'Forecast pedido pela diretoria — Inpot de 5 para 4 vendas' : 'Lançamento do mês conforme planejamento'}
              style={{ ...inputStyle, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={ativar} onChange={e => setAtivar(e.target.checked)} />
          Ativar ao publicar (o dashboard passa a medir o time por esta versão)
        </label>
        {semPermissao && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Seu acesso permite montar a meta, mas não publicar. Peça a alguém com a permissão "Publicar e ativar metas".</div>}
        {faltaMotivo && !semPermissao && incompletas.length === 0 && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Escreva o motivo da revisão pra publicar.</div>}
        {erro && <div style={{ ...bannerStyle('erro'), marginBottom: 12 }}>{erro}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={publicar} disabled={publicando || bloqueado} style={publicando || bloqueado ? disabledButtonStyle : primaryButtonStyle}>
            {publicando ? 'Publicando…' : `Publicar como V${proximoNumero}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>As versões já publicadas continuam guardadas e podem ser reativadas.</span>
        </div>
      </div>
    </div>
  )
}

function Total({ rotulo, valor, comparacoes }: { rotulo: string; valor: string; comparacoes: (string | null | false)[] }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</div>
      <div style={{ fontSize: 24, fontWeight: 600, margin: '4px 0' }}>{valor}</div>
      {comparacoes.filter(Boolean).map(c => <div key={c as string} style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{c}</div>)}
    </div>
  )
}
```

- [ ] **Step 3: Build** — `npm run build` (vai falhar até a Task 7 porque `HubMetas.tsx` ainda usa a assinatura antiga dos dois passos — seguir direto pra Task 7 e fazer o build lá).

- [ ] **Step 4: Commit** — junto com a Task 7.

---

### Task 7: Página `HubMetas` reescrita + renome + limpeza

**Files:**
- Modify (reescrever): `src/pages/HubMetas.tsx`
- Delete: `src/components/metas/PassoTaxas.tsx`, `PassoFunilMarca.tsx`, `PassoPessoas.tsx`, `PassoDistribuicaoSemanal.tsx`
- Modify: `src/components/AppLayout.tsx:51` — `label: 'Metas'` → `label: 'Configuração das Metas'`
- Modify: `src/lib/permissoes.ts:35` — `label: 'Metas'` → `label: 'Configuração das Metas'`; `:41` descrição "No Hub de Metas" → "Na Configuração das Metas"

**Interfaces:**
- Consumes: tudo das Tasks 1–6; `useMetaMes`, `buscarEstadoVersao`, `ativarVersao`, `useAcesso`, `useMediaQuery`/`MQ_COMPACTO`, `PageTop`.
- Produces: `export function HubMetas()` (mesmo nome, rota `/metas` intacta).

- [ ] **Step 1: Reescrever a página**

```tsx file=src/pages/HubMetas.tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { marcaLabel } from '@/constants/brands'
import { useAcesso } from '@/contexts/AcessoContext'
import { buscarEstadoVersao, useMetaMes, type VersaoMeta } from '@/hooks/useMetaMes'
import { MQ_COMPACTO, useMediaQuery } from '@/hooks/useMediaQuery'
import { ativarVersao } from '@/hooks/useSalvarMeta'
import {
  marcaEmBranco, mesAnterior, ordenarMarcas, rascunhoDeVersao, rascunhoDoMesAnterior, rascunhoEmBranco,
  resumoRascunho, type MarcaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import { carregarRascunho, descartarRascunho, salvarRascunho } from '@/lib/rascunhoMetas'
import { EditorMarca } from '@/components/metas/EditorMarca'
import { PainelMarcas } from '@/components/metas/PainelMarcas'
import { PassoSemanas } from '@/components/metas/PassoSemanas'
import { PassoRevisarPublicar } from '@/components/metas/PassoRevisarPublicar'
import {
  MESES_LABEL, bannerStyle, cardStyle, fmtBRL, fmtDec, fmtInt, ghostButtonStyle, infoBoxStyle,
  nomeMes, nomeMesMinusculo, pillStyle, primaryButtonStyle, secondaryButtonStyle, smallButtonStyle,
} from '@/components/metas/metasUi'

type Passo = 'marcas' | 'semanas' | 'revisar'
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: 'marcas', rotulo: 'Marcas' },
  { id: 'semanas', rotulo: 'Semanas' },
  { id: 'revisar', rotulo: 'Revisar e publicar' },
]

/** A partir do dia 20, abre no mês seguinte — é quando a meta do próximo mês é montada. */
function mesPadrao(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() >= 20 ? 1 : 0), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function somarMeses(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(ano, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function HubMetas() {
  const [mes, setMes] = useState(mesPadrao)
  const [rascunho, setRascunho] = useState<RascunhoConfig | null>(() => carregarRascunho(mesPadrao()))
  const [montando, setMontando] = useState(false)
  const [passo, setPasso] = useState<Passo>('marcas')
  const [marcaAberta, setMarcaAberta] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const topoRef = useRef<HTMLDivElement>(null)

  const { versoes, versaoAtiva, loading, error, reload } = useMetaMes(mes)
  const anterior = useMetaMes(mesAnterior(mes))

  useEffect(() => {
    topoRef.current?.scrollIntoView({ block: 'start' })
  }, [passo, marcaAberta, montando])

  const rotuloAnterior = nomeMesMinusculo(mesAnterior(mes))
  const estadoAnterior = anterior.estado?.status === 'publicado' && anterior.estado.marcas.length > 0 ? anterior.estado : null
  const versaoAnterior = anterior.versaoAtiva ?? anterior.versaoExibida
  const proximoNumero = (versoes[versoes.length - 1]?.numero ?? 0) + 1

  function trocarMes(m: string) {
    setMes(m)
    setRascunho(carregarRascunho(m))
    setMontando(false)
    setPasso('marcas')
    setMarcaAberta(null)
    setAviso(null)
  }

  function atualizar(r: RascunhoConfig) {
    const novo = { ...r, atualizadoEm: new Date().toISOString() }
    setRascunho(novo)
    salvarRascunho(novo)
  }

  function iniciar(r: RascunhoConfig) {
    if (rascunho && !window.confirm(`Já existe uma configuração de ${nomeMesMinusculo(mes)} em andamento. Descartar e começar outra?`)) return
    atualizar(r)
    setMontando(true)
    setPasso('marcas')
    setMarcaAberta(null)
    setAviso(null)
  }

  async function iniciarDeVersao(v: VersaoMeta): Promise<string | null> {
    const r = await buscarEstadoVersao(v.id)
    if (r.error) return r.error
    iniciar(rascunhoDeVersao(mes, v, r.estado))
    return null
  }

  function descartar() {
    if (!window.confirm('Descartar a configuração em andamento? O que não foi publicado será perdido.')) return
    descartarRascunho(mes)
    setRascunho(null)
    setMontando(false)
  }

  return (
    <div ref={topoRef} style={{ padding: 'var(--page-pad-top) var(--page-pad-x) 48px', maxWidth: 1200, margin: '0 auto', scrollMarginTop: 80 }}>
      <PageTop
        title="Configuração das Metas"
        subtitle="Monte a meta do mês marca a marca: informe as vendas e o sistema calcula o funil e a meta de cada pessoa"
      />

      {montando && rascunho ? (
        <Montagem
          rascunho={rascunho}
          passo={passo}
          setPasso={p => { setPasso(p); setMarcaAberta(null) }}
          marcaAberta={marcaAberta}
          setMarcaAberta={setMarcaAberta}
          atualizar={atualizar}
          proximoNumero={proximoNumero}
          versaoAtiva={versaoAtiva}
          totaisMesAnterior={versaoAnterior ? { rotulo: rotuloAnterior, vendas: versaoAnterior.totalVendas, faturamento: versaoAnterior.totalFaturamento } : null}
          onSair={() => { setMontando(false); setMarcaAberta(null) }}
          onPublicado={msg => {
            descartarRascunho(mes)
            setRascunho(null)
            setMontando(false)
            setAviso(msg)
            reload()
          }}
        />
      ) : (
        <Inicio
          mes={mes}
          trocarMes={trocarMes}
          versoes={versoes}
          loading={loading}
          error={error}
          aviso={aviso}
          rascunho={rascunho}
          rotuloAnterior={rotuloAnterior}
          marcasAnteriores={estadoAnterior?.marcas.length ?? 0}
          onContinuar={() => setMontando(true)}
          onDescartar={descartar}
          onDoMesAnterior={() => { if (estadoAnterior) iniciar(rascunhoDoMesAnterior(mes, estadoAnterior, rotuloAnterior)) }}
          onEmBranco={() => iniciar(rascunhoEmBranco(mes, []))}
          onRevisao={iniciarDeVersao}
          onAtivar={async v => {
            const r = await ativarVersao(v.id)
            if (!r.ok) return r.error
            setAviso(`V${v.numero} (${v.rotulo}) ativada — o dashboard já mede o time por ela.`)
            reload()
            return null
          }}
        />
      )}
    </div>
  )
}

// ── Tela inicial ─────────────────────────────────────────────────────────

function Inicio({
  mes, trocarMes, versoes, loading, error, aviso, rascunho, rotuloAnterior, marcasAnteriores,
  onContinuar, onDescartar, onDoMesAnterior, onEmBranco, onRevisao, onAtivar,
}: {
  mes: string
  trocarMes: (m: string) => void
  versoes: VersaoMeta[]
  loading: boolean
  error: string | null
  aviso: string | null
  rascunho: RascunhoConfig | null
  rotuloAnterior: string
  marcasAnteriores: number
  onContinuar: () => void
  onDescartar: () => void
  onDoMesAnterior: () => void
  onEmBranco: () => void
  onRevisao: (v: VersaoMeta) => Promise<string | null>
  onAtivar: (v: VersaoMeta) => Promise<string | null>
}) {
  const [ocupadoId, setOcupadoId] = useState<number | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const nome = nomeMes(mes)
  const mesCurto = nomeMesMinusculo(mes)

  async function executar(v: VersaoMeta, fn: (v: VersaoMeta) => Promise<string | null>) {
    setOcupadoId(v.id)
    setErroAcao(null)
    const e = await fn(v)
    setOcupadoId(null)
    if (e) setErroAcao(e)
  }

  const resumo = rascunho ? resumoRascunho(rascunho) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SeletorMes mes={mes} onMudar={trocarMes} />

      {error && <div style={bannerStyle('erro')}>Não deu pra carregar as metas: {error}</div>}
      {aviso && <div style={bannerStyle('sucesso')}>{aviso}</div>}
      {erroAcao && <div style={bannerStyle('erro')}>{erroAcao}</div>}

      {rascunho && resumo && (
        <div style={{ ...cardStyle, borderColor: 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Configuração de {mesCurto} em andamento</div>
            <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
              {resumo.prontas} de {resumo.total} marcas prontas · {fmtInt(resumo.vendas)} vendas · {fmtBRL(resumo.faturamento)} · salva neste navegador em {fmtDataHora(rascunho.atualizadoEm)}
            </div>
          </div>
          <button type="button" onClick={onDescartar} style={secondaryButtonStyle}>Descartar</button>
          <button type="button" onClick={onContinuar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Continuar <ArrowRight size={14} />
          </button>
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</div>}

      {!loading && versoes.length === 0 && !rascunho && (
        <div style={{ ...cardStyle, padding: 'var(--sp-8)' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24 }}>{nome} ainda não tem meta</h2>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'var(--ws-text-secondary)', maxWidth: 680, lineHeight: 1.6 }}>
            {marcasAnteriores > 0
              ? `Comece a partir de ${rotuloAnterior}: as ${marcasAnteriores} marcas, a taxa de franquia, as conversões de cada etapa e o time já vêm preenchidos. Você informa as vendas de cada marca e ajusta só o que mudou.`
              : `Não há meta publicada em ${rotuloAnterior} pra aproveitar. Comece em branco: você escolhe as marcas e informa vendas, conversões e time de cada uma.`}
          </p>
          <div className="rs-grid rs-cols-3" style={{ gap: 12, marginBottom: 24 }}>
            {[
              ['1', 'Marcas', 'Em cada marca, informe as vendas e a taxa de franquia. O funil (SQL → Vendas) se calcula pelas conversões.'],
              ['2', 'Semanas', 'Opcional: distribua a meta de cada pessoa pelas semanas do mês.'],
              ['3', 'Revisar e publicar', 'Confira os números por marca e por pessoa e publique. O dashboard passa a usar a nova meta.'],
            ].map(([n, t, d]) => (
              <div key={n} style={{ background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n} · {t}</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {marcasAnteriores > 0 ? (
              <>
                <button type="button" onClick={onDoMesAnterior} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Configurar metas de {mesCurto} <ArrowRight size={14} />
                </button>
                <button type="button" onClick={onEmBranco} style={ghostButtonStyle}>Começar em branco</button>
              </>
            ) : (
              <button type="button" onClick={onEmBranco} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Começar em branco <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && versoes.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Versões de {nome}</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ws-text-secondary)', maxWidth: 720, lineHeight: 1.5 }}>
            Cada publicação vira uma versão congelada. O dashboard mede o time pela versão <b>ativa</b> — dá pra trocar a qualquer momento, inclusive voltar pra uma anterior.
            Pra mudar a meta, crie uma revisão a partir de uma versão.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...versoes].reverse().map(v => (
              <LinhaVersao
                key={v.id}
                versao={v}
                ocupado={ocupadoId === v.id}
                onAtivar={() => {
                  if (window.confirm(`Ativar a V${v.numero} (${v.rotulo})?\n\nO dashboard inteiro (Visão Macro, Performance, Campanha de Metas) passa a medir o time por ela.`)) {
                    void executar(v, onAtivar)
                  }
                }}
                onRevisao={() => void executar(v, onRevisao)}
              />
            ))}
          </div>
          <button type="button" onClick={onEmBranco} style={{ ...ghostButtonStyle, marginTop: 12, textDecoration: 'underline' }}>
            Começar uma versão em branco
          </button>
        </div>
      )}
    </div>
  )
}

function SeletorMes({ mes, onMudar }: { mes: string; onMudar: (m: string) => void }) {
  const [ano, m] = mes.split('-').map(Number)
  const anoAtual = new Date().getFullYear()
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]
  const select: CSSProperties = {
    padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 14, color: 'var(--ws-text-primary)', background: 'var(--ws-surface)', cursor: 'pointer',
  }
  return (
    <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginRight: 4 }}>Mês da meta</span>
      <button type="button" onClick={() => onMudar(somarMeses(mes, -1))} aria-label="Mês anterior" style={{ ...ghostButtonStyle, padding: 6 }}><ChevronLeft size={16} /></button>
      <select value={m} onChange={e => onMudar(`${ano}-${String(e.target.value).padStart(2, '0')}-01`)} style={select} aria-label="Mês">
        {MESES_LABEL.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
      </select>
      <select value={ano} onChange={e => onMudar(`${e.target.value}-${String(m).padStart(2, '0')}-01`)} style={select} aria-label="Ano">
        {anos.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <button type="button" onClick={() => onMudar(somarMeses(mes, 1))} aria-label="Próximo mês" style={{ ...ghostButtonStyle, padding: 6 }}><ChevronRight size={16} /></button>
    </div>
  )
}

function LinhaVersao({ versao: v, ocupado, onAtivar, onRevisao }: {
  versao: VersaoMeta
  ocupado: boolean
  onAtivar: () => void
  onRevisao: () => void
}) {
  const podeAtivar = useAcesso().pode('acao.metas-publicar')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 'var(--radius-sm)',
      border: '1px solid ' + (v.ativa ? 'var(--brand-accent)' : 'var(--ws-border)'),
      background: v.ativa ? 'color-mix(in srgb, var(--brand-accent) 6%, var(--ws-surface))' : 'var(--ws-surface)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
        fontSize: 13, fontWeight: 700,
        background: v.ativa ? 'var(--brand-accent)' : 'var(--ws-bg)',
        color: v.ativa ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
        border: v.ativa ? 'none' : '1px solid var(--ws-border)',
      }}>V{v.numero}</span>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{v.rotulo}</span>
          {v.ativa && <span style={pillStyle('sucesso')}><Check size={11} /> Ativa no dashboard</span>}
          {v.origem === 'importado' && <span style={pillStyle('neutro')}>importada da planilha</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
          Publicada em {fmtData(v.publicadoEm)}{v.publicadoPor ? ` · ${v.publicadoPor}` : ''}
          {v.ativa && v.ativadaEm && ` · ativada em ${fmtData(v.ativadaEm)}`}
        </div>
        {v.motivo && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>{v.motivo}</div>}
      </div>
      <div style={{ fontSize: 13, textAlign: 'right', minWidth: 130 }}>
        <div style={{ fontWeight: 600 }}>{fmtDec(v.totalVendas)} vendas</div>
        <div style={{ color: 'var(--ws-text-secondary)' }}>{fmtBRL(v.totalFaturamento)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!v.ativa && podeAtivar && <button type="button" disabled={ocupado} onClick={onAtivar} style={smallButtonStyle}>{ocupado ? 'Aguarde…' : 'Ativar'}</button>}
        <button type="button" disabled={ocupado} onClick={onRevisao} style={smallButtonStyle}>{ocupado ? 'Aguarde…' : 'Criar revisão a partir desta'}</button>
      </div>
    </div>
  )
}

// ── Montagem ─────────────────────────────────────────────────────────────

function Montagem({
  rascunho, passo, setPasso, marcaAberta, setMarcaAberta, atualizar, proximoNumero, versaoAtiva,
  totaisMesAnterior, onSair, onPublicado,
}: {
  rascunho: RascunhoConfig
  passo: Passo
  setPasso: (p: Passo) => void
  marcaAberta: string | null
  setMarcaAberta: (m: string | null) => void
  atualizar: (r: RascunhoConfig) => void
  proximoNumero: number
  versaoAtiva: VersaoMeta | null
  totaisMesAnterior: { rotulo: string; vendas: number; faturamento: number } | null
  onSair: () => void
  onPublicado: (msg: string) => void
}) {
  const compacto = useMediaQuery(MQ_COMPACTO)
  const resumo = resumoRascunho(rascunho)
  const origem = rascunho.origem
  const deOnde = origem.tipo === 'mes_anterior'
    ? `a partir de ${origem.rotulo}`
    : origem.tipo === 'versao' ? `a partir da V${origem.numero} (${origem.rotulo})` : 'em branco'

  const indice = marcaAberta ? rascunho.marcas.findIndex(m => m.marca === marcaAberta) : -1
  const marca = indice >= 0 ? rascunho.marcas[indice] : null
  const proxima = indice >= 0 && indice < rascunho.marcas.length - 1 ? rascunho.marcas[indice + 1] : null

  const mudarMarca = (m: MarcaConfig) => atualizar({ ...rascunho, marcas: rascunho.marcas.map(x => (x.marca === m.marca ? m : x)) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        ...cardStyle, padding: '14px 18px', position: 'sticky', top: compacto ? 56 : 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nomeMes(rascunho.mesReferencia)} · montando a V{proximoNumero}</div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{deOnde} · salva neste navegador a cada alteração</div>
        </div>
        <nav aria-label="Passos" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {PASSOS.map((p, i) => {
            const ativo = p.id === passo
            const detalhe = p.id === 'marcas' ? `${resumo.prontas}/${resumo.total}` : p.id === 'semanas' ? 'opcional' : null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPasso(p.id)}
                aria-current={ativo ? 'step' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: '1px solid ' + (ativo ? 'var(--brand-accent)' : 'transparent'),
                  background: ativo ? 'color-mix(in srgb, var(--brand-accent) 8%, var(--ws-surface))' : 'none',
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ws-text-primary)', fontWeight: ativo ? 600 : 400,
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                  background: ativo ? 'var(--brand-accent)' : 'var(--ws-bg)', color: ativo ? 'var(--brand-accent-contrast)' : 'var(--ws-text-secondary)',
                }}>{i + 1}</span>
                {p.rotulo}
                {detalhe && <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontWeight: 400 }}>{detalhe}</span>}
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={onSair} style={ghostButtonStyle}><LogOut size={14} /> Sair</button>
      </div>

      {passo === 'marcas' && marca && (
        <EditorMarca
          key={marca.marca}
          marca={marca}
          mesReferencia={rascunho.mesReferencia}
          proximaMarca={proxima ? marcaLabel(proxima.marca) : null}
          onMudar={mudarMarca}
          onVoltar={() => setMarcaAberta(null)}
          onProxima={() => setMarcaAberta(proxima ? proxima.marca : null)}
          onRemover={() => {
            atualizar({
              ...rascunho,
              marcas: rascunho.marcas.filter(x => x.marca !== marca.marca),
              distribuicaoSemanal: rascunho.distribuicaoSemanal.filter(d => d.marca !== marca.marca),
            })
            setMarcaAberta(null)
          }}
        />
      )}

      {passo === 'marcas' && !marca && (
        <PainelMarcas
          rascunho={rascunho}
          onAbrirMarca={setMarcaAberta}
          onAdicionarMarcas={nomes => atualizar({ ...rascunho, marcas: ordenarMarcas([...rascunho.marcas, ...nomes.map(marcaEmBranco)]) })}
          onAvancar={() => setPasso('semanas')}
        />
      )}

      {passo === 'semanas' && (
        <PassoSemanas rascunho={rascunho} onMudar={atualizar} onVoltar={() => setPasso('marcas')} onAvancar={() => setPasso('revisar')} />
      )}

      {passo === 'revisar' && (
        <PassoRevisarPublicar
          rascunho={rascunho}
          proximoNumero={proximoNumero}
          versaoAtiva={versaoAtiva}
          totaisMesAnterior={totaisMesAnterior}
          onAbrirMarca={m => { setPasso('marcas'); setMarcaAberta(m) }}
          onPublicado={onPublicado}
        />
      )}

      {passo === 'marcas' && !marca && rascunho.marcas.length > 0 && resumo.prontas === resumo.total && (
        <div style={infoBoxStyle}>Tudo pronto nas marcas. A distribuição semanal é opcional — dá pra ir direto pra Revisar e publicar.</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Renome e limpeza**

```bash
cd ~/ws-dashboard-worktree-config-metas
git rm -q src/components/metas/PassoTaxas.tsx src/components/metas/PassoFunilMarca.tsx src/components/metas/PassoPessoas.tsx src/components/metas/PassoDistribuicaoSemanal.tsx
```

`src/components/AppLayout.tsx:51`:
```ts
  { key: 'metas',               label: 'Configuração das Metas' },
```
`src/lib/permissoes.ts:35` e `:41`:
```ts
  { chave: 'aba.metas',            label: 'Configuração das Metas', rota: '/metas',              area: 'Vendas' },
  { chave: 'acao.metas-publicar', label: 'Publicar e ativar metas', descricao: 'Na Configuração das Metas: publicar uma versão nova e trocar a versão ativa do mês.' },
```

- [ ] **Step 3: Build + testes + lint**

Run: `npm run build && npx vitest run && npx oxlint src/lib/configMetas.ts src/lib/rascunhoMetas.ts src/components/metas src/pages/HubMetas.tsx`
Expected: build sem erro; todos os testes passando (480 antigos + os novos); oxlint sem avisos nos arquivos tocados. Se `permissoes.test.ts` checar o rótulo antigo, atualizar o literal do teste.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "feat(vendas): Configuração das Metas — painel de marcas e funil reverso no lugar dos 7 passos"
```

---

### Task 8: Ver funcionando, documentar e publicar

**Files:**
- Temporário (não commitar): rota sem login em `src/App.tsx`
- Modify: `CLAUDE.md` (seção 1 e Histórico)

- [ ] **Step 1: Rota temporária sem login** — em `src/App.tsx`, antes do bloco protegido, adicionar
  `<Route path="/dev-config-metas" element={<AcessoProvider><HubMetas /></AcessoProvider>} />` (ou o bypass equivalente que a árvore exigir para `useAcesso`). **Remover antes do commit.**
- [ ] **Step 2: Subir o dev server** (preview do Claude Browser, `npm run dev` no worktree) e abrir `/dev-config-metas`.
- [ ] **Step 3: Roteiro de verificação (dado real de setembro)**
  - Tela inicial em outubro: cartão "Outubro 2026 ainda não tem meta", botão "Configurar metas de outubro", 7 marcas de setembro.
  - Painel: 7 cards "Não configurada"; Inpot → informar 6 vendas → COF 13, SAL 28→… (confere com o teste), faturamento R$ 449.400; mudar SAL para "Nova conversão" 40% → SAL 32, pisca, selo "alterada · era 37,9%".
  - Número manual em Diagnóstico, "Sem meta" em COF (cascata), voltar pra referência.
  - Time: adicionar/remover SDR redivide pesos; soma ≠100 fica vermelha.
  - Recarregar a página: aviso "Configuração de outubro em andamento" → Continuar mantém tudo.
  - Semanas: "Preencher tudo proporcional" → linhas batem com a meta do mês.
  - Revisar: marcas incompletas listadas com "Abrir"; botão Publicar desabilitado enquanto houver pendência. **Não publicar.**
  - Setembro: lista com V1 → "Criar revisão a partir desta" → marcas já configuradas, vendas 5 Inpot.
  - Celular (375×812): editor e painel sem rolagem horizontal da página.
  - Console sem erros.
- [ ] **Step 4: Remover a rota temporária** e confirmar `git diff src/App.tsx` vazio.
- [ ] **Step 5: CLAUDE.md** — seção 1: aba "Metas" → "Configuração das Metas"; Histórico: entrada "2026-09-30 — Configuração das Metas: painel de marcas + funil reverso" com diagnóstico, decisões C1–C9, regra de arredondamento, onde mora a lógica e como foi verificado.
- [ ] **Step 6: Build + testes de novo**, commit do CLAUDE.md, push, `gh pr create --base main`, esperar CI, merge, conferir o deploy do SHA.
