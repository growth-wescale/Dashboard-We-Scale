# Aba "Performance" — Migração para o stack da Visão Macro · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar a aba "Performance Detalhada" (renomeada para "Performance") para a mesma base de dados e os mesmos filtros da Visão Macro, com cards SDR/Closer novos, metas com leitura diária, e tabelas por pessoa retrabalhadas.

**Architecture:** A página deixa de ler `vw_funil_compat`/`usePerformanceEquipe` e passa a consumir `useSharedFilters` + `useFunilVendas` + `useFunilEventos`, exatamente como `FunilVendas.tsx` (Visão Macro) e `FunilCompletoSection.tsx`. Mantém as duas seções (SDR e Closer), cada uma com strip de cards contados por evento (batendo com a Visão Macro), um card de meta com barra de ritmo acumulado + "meta do dia" (meta mensal ÷ dias úteis seg–sáb), e uma tabela por pessoa somada por `nome_sdr`/`nome_closer` da linha. Lógica pura nova é extraída para `src/lib/` e testada com vitest; a fiação de componente é verificada por `npm run build` + `npx vitest run` (o app exige login, não há teste de render).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Supabase (projeto de Expansão `cygxmduuwlwfbodfrlkr`) + vitest. Build/teste feitos na cópia local `~/ws-dashboard-build` (o OneDrive trava o build in loco).

**Spec:** `docs/superpowers/specs/2026-09-03-performance-migracao-visao-macro-design.md`

## Global Constraints

- Commits em pt-BR, Conventional Commits (`feat(vendas): ...`, `refactor(vendas): ...`, `docs(vendas): ...`, `test(vendas): ...`).
- `main` é protegida — todo o trabalho nesta branch `feat/performance-migracao-visao-macro`, merge via PR.
- Build de produção usa `tsc -b` (mais estrito que `tsc --noEmit`) — validar sempre com `npm run build`, não só `tsc --noEmit`.
- Rodar build e testes na cópia local: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build && npx vitest run`.
- **Não** mudar a rota `/performance-vendas`, o nome do arquivo `PerformanceVendas.tsx`, nem o nome do componente `PerformanceVendas`.
- **Não** tocar em `vw_funil_compat` no banco, nem migrar Análise de Perda.
- **Não** criar meta para MQL nem SAL (não existe no banco).
- `marca` NUNCA é filtrada no servidor em `vw_funil_etapas_v2` (coluna denormalizada, nula em ~17%). O recorte por marca sai de `idsEscopo` (ids de `vw_funil_vendas` já filtrados).
- "Reunião Agendada SQL" só conta no funil do Closer — já embutido em `countStageEvents`/`vw_funil_etapas_v2` via `STAGE_ID_OBRIGATORIO`; não reimplementar.
- Trava de venda: só é venda com `status_atual === 'Ganho'` — usar `countSales`/`sumRevenue`, nunca procurar etapa "Fechamento" nos eventos.
- Período em curso termina hoje (`ranges` já trunca) — não usar `range` (caixa delimitadora) para filtrar linhas, só `ranges`.

---

## File Structure

**Criados:**
- `src/lib/funilFilterOptions.ts` — função pura que cruza Marca × Fonte × Sub-fonte × janela para as opções dos dropdowns. Extraída de `FunilVendas.tsx` para ser compartilhada.
- `src/lib/funilFilterOptions.test.ts` — testes da função acima.
- `src/lib/metaRitmo.ts` — `computeRitmo(...)`: barra de ritmo acumulado + meta do dia. Pura.
- `src/lib/metaRitmo.test.ts` — testes.
- `src/lib/performanceRows.ts` — `buildSdrRows` / `buildCloserRows` sobre `FunnelRow[]`, mais os tipos `SdrRow`/`CloserRow`. Puras.
- `src/lib/performanceRows.test.ts` — testes.
- `src/hooks/useMetasTimeResumo.ts` — meta do time por marca (SDR: sql/reunião; Closer: cof/financeira/qtd_vendas), somável pelas marcas selecionadas. Inclui o reducer puro `resumirTimePorMarca`.
- `src/hooks/useMetasTimeResumo.test.ts` — testes do reducer.
- `src/components/ui/MetaRitmoCard.tsx` — card de métrica com barra de ritmo + meta do dia (usa `computeRitmo`).

**Modificados:**
- `src/lib/dateUtils.ts` — nova função `businessDaysInMonth`.
- `src/lib/dateUtils.test.ts` — testes da nova função.
- `src/pages/FunilVendas.tsx` — passa a importar `funilFilterOptions` no lugar do bloco `opcoesFiltro` inline (refactor sem mudança de comportamento).
- `src/pages/PerformanceVendas.tsx` — reescrita do corpo: shared filters, nova base de dados, strips novos, `MetaRitmoCard`, tabelas via `performanceRows`, `PageTop` + `FilterBar`, `<h1>` = "Performance".
- `src/components/AppLayout.tsx` — label do menu `Performance Detalhada` → `Performance`.
- `src/components/ui/FunilCompletoSection.tsx` — só o comentário de cabeçalho (a página inteira passa a estar migrada).
- `CLAUDE.md` — §1 tabela de abas, §5 menções, §8 pendência, §9 novo histórico.

**Deletado:**
- `src/hooks/usePerformanceEquipe.ts` — depois que `PerformanceVendas.tsx` para de importá-lo. Confirmar antes que nenhum outro arquivo importa `usePerformanceEquipe`/`FunilCompatRow`.

---

## Task 1: Helper `businessDaysInMonth`

**Files:**
- Modify: `src/lib/dateUtils.ts` (adicionar função ao fim, perto de `daysInMonth`)
- Test: `src/lib/dateUtils.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: nada.
- Produces: `businessDaysInMonth(monthKey: string): number` — `monthKey` no formato `'YYYY-MM'`. Conta os dias do mês que caem de **segunda a sábado** (exclui só domingo). Sem calendário de feriados.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `src/lib/dateUtils.test.ts`:

```ts
import { businessDaysInMonth } from '@/lib/dateUtils'

describe('businessDaysInMonth', () => {
  it('conta segunda a sábado, exclui domingo (fev/2026: começa domingo, 28 dias, 4 domingos)', () => {
    // 2026-02-01 é domingo; domingos em 1, 8, 15, 22 → 28 - 4 = 24
    expect(businessDaysInMonth('2026-02')).toBe(24)
  })

  it('mês de 31 dias começando quinta (jan/2026: domingos em 4,11,18,25)', () => {
    // 2026-01-01 é quinta; 4 domingos → 31 - 4 = 27
    expect(businessDaysInMonth('2026-01')).toBe(27)
  })

  it('mês de 31 dias começando domingo (mar/2026: domingos em 1,8,15,22,29)', () => {
    // 2026-03-01 é domingo; 5 domingos → 31 - 5 = 26
    expect(businessDaysInMonth('2026-03')).toBe(26)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npx vitest run src/lib/dateUtils.test.ts`
Expected: FAIL — `businessDaysInMonth is not a function` / import não resolve.

- [ ] **Step 3: Implementar**

Adicionar em `src/lib/dateUtils.ts`, logo abaixo de `daysInMonth`:

```ts
/** Dias de segunda a sábado no mês da chave 'YYYY-MM'. Exclui só domingo; sem feriados. */
export function businessDaysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  const total = new Date(y, m, 0).getDate() // dia 0 do mês seguinte = último dia de m
  let count = 0
  for (let d = 1; d <= total; d++) {
    if (new Date(y, m - 1, d).getDay() !== 0) count++ // 0 = domingo
  }
  return count
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/dateUtils.test.ts`
Expected: PASS (3 novos casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dateUtils.ts src/lib/dateUtils.test.ts
git commit -m "feat(vendas): helper businessDaysInMonth (seg-sáb, sem feriados)"
```

---

## Task 2: Extrair `funilFilterOptions` e religar a Visão Macro

**Files:**
- Create: `src/lib/funilFilterOptions.ts`
- Create: `src/lib/funilFilterOptions.test.ts`
- Modify: `src/pages/FunilVendas.tsx` (substituir o `useMemo` de `opcoesFiltro`, linhas ~462–488, e remover imports que ficarem órfãos)

**Interfaces:**
- Consumes: `FunnelRow` (`@/lib/funnelTypes`), `PeriodWindow` + `STAGE_ORDER` + `STAGE_DATE_FIELD` + `isInWindow` (`@/lib/metrics`), `normalizeFonteMacro` + `normalizeSubFonte` (`@/lib/fonteMapping`).
- Produces:
  ```ts
  export interface FunilFilterOptionsInput {
    rows: FunnelRow[]
    win: PeriodWindow
    marcasParaEscopo: string[]
    fontes: string[]
    subFontes: string[]
    cohort: boolean
  }
  export function funilFilterOptions(input: FunilFilterOptionsInput): {
    marcas: string[]     // valores de FunnelRow.marca
    fontes: string[]     // valores já normalizados (normalizeFonteMacro)
    subFontes: string[]  // valores já normalizados (normalizeSubFonte)
  }
  ```

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/funilFilterOptions.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npx vitest run src/lib/funilFilterOptions.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a função**

Criar `src/lib/funilFilterOptions.ts` (lógica copiada 1:1 do `useMemo` `opcoesFiltro` de `FunilVendas.tsx`):

```ts
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow } from '@/lib/metrics'
import { STAGE_DATE_FIELD, STAGE_ORDER, isInWindow } from '@/lib/metrics'
import { normalizeFonteMacro, normalizeSubFonte } from '@/lib/fonteMapping'

export interface FunilFilterOptionsInput {
  rows: FunnelRow[]
  win: PeriodWindow
  marcasParaEscopo: string[]
  fontes: string[]
  subFontes: string[]
  /** true no modo "Deals criados no período" (safra) — só o MQL conta como "na janela". */
  cohort: boolean
}

export interface FunilFilterOptions {
  marcas: string[]
  fontes: string[]
  subFontes: string[]
}

/**
 * Opções "estilo Excel" dos filtros de Marca, Fonte e Sub-fonte: cada lista
 * reflete os DEMAIS filtros já ativos + a janela de período, menos o próprio
 * filtro. "Deal na janela" = tem alguma data de etapa dentro de `win` (ou só
 * o MQL, no modo safra) — a mesma regra que popula o funil. Compartilhado
 * entre Visão Macro e Performance.
 */
export function funilFilterOptions(input: FunilFilterOptionsInput): FunilFilterOptions {
  const { rows, win, marcasParaEscopo, fontes, subFontes, cohort } = input
  const camposJanela = cohort
    ? (['data_novo_mql'] as const)
    : STAGE_ORDER.map(s => STAGE_DATE_FIELD[s])

  const subFonteDe = (r: FunnelRow) => normalizeSubFonte(r.utm_source, r.sub_fonte_crm)
  const fonteDe = (r: FunnelRow) => normalizeFonteMacro(r.fonte_macro)
  const naJanela = rows.filter(r => camposJanela.some(c => isInWindow(r[c] as string | null, win)))
  const okMarca = (r: FunnelRow) => !marcasParaEscopo.length || marcasParaEscopo.includes(r.marca ?? '')
  const okFonte = (r: FunnelRow) => !fontes.length || fontes.includes(fonteDe(r))
  const okSub = (r: FunnelRow) => !subFontes.length || subFontes.includes(subFonteDe(r))
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

  return {
    marcas: uniq(naJanela.filter(r => okFonte(r) && okSub(r)).map(r => r.marca ?? '')),
    fontes: uniq(naJanela.filter(r => okMarca(r) && okSub(r)).map(fonteDe)),
    subFontes: uniq(naJanela.filter(r => okMarca(r) && okFonte(r)).map(subFonteDe)),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/funilFilterOptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Religar a Visão Macro na função extraída**

Em `src/pages/FunilVendas.tsx`:

1. Adicionar no bloco de imports:
   ```ts
   import { funilFilterOptions } from '@/lib/funilFilterOptions'
   ```
2. Substituir o `useMemo` de `opcoesFiltro` (o bloco que começa em `const opcoesFiltro = useMemo(() => {` e termina em `}, [rows, camposJanela, win, marcasParaEscopo, fontes, subFontes])`) por:
   ```ts
   const opcoesFiltro = useMemo(
     () => funilFilterOptions({
       rows, win,
       marcasParaEscopo,
       fontes, subFontes,
       cohort: viewModes.funnelView === 'cohort',
     }),
     [rows, win, marcasParaEscopo, fontes, subFontes, viewModes.funnelView],
   )
   ```
3. Remover o `const camposJanela = useMemo(...)` que ficou sem uso, e o import de `normalizeFonteMacro` **apenas se** não houver outro uso no arquivo (há: `normalizeFonteMacro` é usado em `ganhosPorFonte` e nas KPIs — manter). `normalizeSubFonte` idem (usado em `opcoesFiltro` só; conferir com grep — se sobrar uso, manter). `STAGE_DATE_FIELD`/`STAGE_ORDER`/`isInWindow` continuam usados em outros pontos — manter.
4. `grep -n "camposJanela\|normalizeSubFonte" src/pages/FunilVendas.tsx` para confirmar que não sobrou referência quebrada.

- [ ] **Step 6: Verificar build + suíte inteira (nada regrediu na Visão Macro)**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build && npx vitest run`
Expected: build OK; todos os testes que já passavam continuam passando + os novos de `funilFilterOptions`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/funilFilterOptions.ts src/lib/funilFilterOptions.test.ts src/pages/FunilVendas.tsx
git commit -m "refactor(vendas): extrai funilFilterOptions p/ compartilhar entre Visão Macro e Performance"
```

---

## Task 3: `computeRitmo` (barra de ritmo + meta do dia)

**Files:**
- Create: `src/lib/metaRitmo.ts`
- Create: `src/lib/metaRitmo.test.ts`

**Interfaces:**
- Consumes: `daysInMonth`, `dayOfMonth`, `businessDaysInMonth` (`@/lib/dateUtils`).
- Produces:
  ```ts
  export interface Ritmo {
    esperado: number       // meta acumulada esperada até `fimJanela`
    metaDia: number        // metaMensal / dias úteis (seg-sáb) do mês
    pctRealizado: number   // 0..100 (capado em 100)
    pctEsperado: number    // 0..100 (capado em 100)
    deltaPct: number       // (realizado - esperado) / esperado * 100 ; 0 se esperado 0
    noRitmo: boolean       // deltaPct >= -2
  }
  export function computeRitmo(args: {
    realizado: number
    metaMensal: number
    mesKey: string    // 'YYYY-MM'
    fimJanela: string // ISO 'YYYY-MM-DD' — normalmente ranges[0].end
  }): Ritmo
  ```

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/metaRitmo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeRitmo } from '@/lib/metaRitmo'

describe('computeRitmo', () => {
  it('esperado é proporcional ao dia corrido do mês', () => {
    // ago/2026: 31 dias. Dia 15 → esperado = 100 * 15/31
    const r = computeRitmo({ realizado: 40, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-15' })
    expect(r.esperado).toBeCloseTo(100 * 15 / 31, 5)
    expect(r.pctRealizado).toBeCloseTo(40, 5)
    expect(r.pctEsperado).toBeCloseTo(100 * 15 / 31, 5)
  })

  it('meta do dia divide pela contagem de dias úteis seg-sáb', () => {
    // ago/2026 tem 26 dias úteis (seg-sáb). 100/26
    const r = computeRitmo({ realizado: 0, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-15' })
    expect(r.metaDia).toBeCloseTo(100 / 26, 5)
  })

  it('no ritmo quando realizado >= esperado - 2%', () => {
    const r = computeRitmo({ realizado: 49, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-08-16' })
    // esperado = 100*16/31 ≈ 51.61; delta = (49-51.61)/51.61 ≈ -5% → abaixo
    expect(r.noRitmo).toBe(false)
  })

  it('meta zero não quebra (sem divisão por zero)', () => {
    const r = computeRitmo({ realizado: 5, metaMensal: 0, mesKey: '2026-08', fimJanela: '2026-08-16' })
    expect(r.esperado).toBe(0)
    expect(r.metaDia).toBe(0)
    expect(r.pctRealizado).toBe(0)
    expect(r.deltaPct).toBe(0)
    expect(r.noRitmo).toBe(true) // delta 0 >= -2
  })

  it('dia da janela além do fim do mês satura no último dia', () => {
    const r = computeRitmo({ realizado: 100, metaMensal: 100, mesKey: '2026-08', fimJanela: '2026-09-10' })
    expect(r.esperado).toBeCloseTo(100, 5) // 31/31
  })
})
```

Nota para o implementador: confirme que `businessDaysInMonth('2026-08') === 26` antes de fixar o número (ago/2026 começa numa sexta; domingos em 2,9,16,23,30 = 5; 31 - 5 = 26).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npx vitest run src/lib/metaRitmo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/metaRitmo.ts`:

```ts
import { businessDaysInMonth, dayOfMonth, daysInMonth } from '@/lib/dateUtils'

export interface Ritmo {
  esperado: number
  metaDia: number
  pctRealizado: number
  pctEsperado: number
  deltaPct: number
  noRitmo: boolean
}

/**
 * Leitura diária de uma meta mensal:
 *  - `esperado`: a fração da meta que já deveria estar batida a esta altura do
 *    mês (dias corridos: dia atual / total de dias do mês).
 *  - `metaDia`: quanto precisa sair por dia útil (segunda a sábado) para
 *    fechar o mês.
 * `noRitmo` tolera 2% abaixo do esperado antes de acender o alerta.
 */
export function computeRitmo(args: {
  realizado: number
  metaMensal: number
  mesKey: string
  fimJanela: string
}): Ritmo {
  const dim = daysInMonth(args.mesKey)
  const diaN = Math.min(dim, dayOfMonth(args.fimJanela))
  const uteis = businessDaysInMonth(args.mesKey)

  const esperado = args.metaMensal * (diaN / dim)
  const metaDia = uteis > 0 ? args.metaMensal / uteis : 0
  const pctRealizado = args.metaMensal > 0 ? Math.min(100, (args.realizado / args.metaMensal) * 100) : 0
  const pctEsperado = args.metaMensal > 0 ? Math.min(100, (esperado / args.metaMensal) * 100) : 0
  const deltaPct = esperado > 0 ? ((args.realizado - esperado) / esperado) * 100 : 0

  return { esperado, metaDia, pctRealizado, pctEsperado, deltaPct, noRitmo: deltaPct >= -2 }
}
```

Atenção: `daysInMonth` aceita `'YYYY-MM'` direto (`daysInMonth('2026-08')` → 31). `dayOfMonth('2026-09-10')` → 10.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metaRitmo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metaRitmo.ts src/lib/metaRitmo.test.ts
git commit -m "feat(vendas): computeRitmo — barra de ritmo acumulado + meta do dia"
```

---

## Task 4: Hook `useMetasTimeResumo`

**Files:**
- Create: `src/hooks/useMetasTimeResumo.ts`
- Create: `src/hooks/useMetasTimeResumo.test.ts`

**Interfaces:**
- Consumes: `supabaseVendas` (`@/lib/supabaseVendas`).
- Produces:
  ```ts
  export interface MetaTime {
    metaSql: number
    metaReuniao: number
    metaCof: number
    metaFinanceira: number
    metaQtdVendas: number
  }
  export function resumirTimePorMarca(rows: RawMetaTimeRow[]): Map<string, MetaTime>
  export function useMetasTimeResumo(args: { mesesKeys: string[] }): {
    porMarca: Map<string, MetaTime>
    loading: boolean
    error: string | null
  }
  // RawMetaTimeRow: { nome_colaborador, marca, funcao, meta_sql, meta_agendamento,
  //   meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas } — todos nuláveis
  ```
- Regra: exclui linhas com `funcao` fora de `('SDR','Closer')`, `nome_colaborador` nulo, ou `marca` em `{'Geral','Outbound','Repasse'}` / nula. Soma por `marca`.

- [ ] **Step 1: Escrever o teste que falha (só o reducer puro)**

Criar `src/hooks/useMetasTimeResumo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resumirTimePorMarca } from '@/hooks/useMetasTimeResumo'
import type { RawMetaTimeRow } from '@/hooks/useMetasTimeResumo'

const base: RawMetaTimeRow = {
  nome_colaborador: 'Fulano', marca: 'Oral Unic', funcao: 'SDR',
  meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null,
  meta_cof: null, meta_financeira: null, meta_qtd_vendas: null,
}

describe('resumirTimePorMarca', () => {
  it('soma SDR e Closer da mesma marca', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, funcao: 'SDR', meta_sql: 30, meta_reuniao_realizada: 20 },
      { ...base, funcao: 'Closer', meta_cof: 10, meta_financeira: 500_000, meta_qtd_vendas: 8 },
    ]
    const m = resumirTimePorMarca(rows)
    expect(m.get('Oral Unic')).toEqual({
      metaSql: 30, metaReuniao: 20, metaCof: 10, metaFinanceira: 500_000, metaQtdVendas: 8,
    })
  })

  it('exclui marcas agregadas (Geral/Outbound/Repasse) e marca nula', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, marca: 'Geral', meta_sql: 99 },
      { ...base, marca: null, meta_sql: 99 },
      { ...base, marca: 'Viva', meta_sql: 5 },
    ]
    const m = resumirTimePorMarca(rows)
    expect([...m.keys()]).toEqual(['Viva'])
    expect(m.get('Viva')!.metaSql).toBe(5)
  })

  it('ignora funcao Repasse e nome nulo', () => {
    const rows: RawMetaTimeRow[] = [
      { ...base, funcao: 'Repasse' as unknown as 'SDR', meta_sql: 7 },
      { ...base, nome_colaborador: null, meta_sql: 7 },
    ]
    expect(resumirTimePorMarca(rows).size).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npx vitest run src/hooks/useMetasTimeResumo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar hook + reducer**

Criar `src/hooks/useMetasTimeResumo.ts` (espelha o padrão de `useMetaResumo` em `useMetasPerformance.ts`):

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'

export interface RawMetaTimeRow {
  nome_colaborador: string | null
  marca: string | null
  funcao: 'SDR' | 'Closer' | 'Repasse' | null
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
  meta_cof: number | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

export interface MetaTime {
  metaSql: number
  metaReuniao: number
  metaCof: number
  metaFinanceira: number
  metaQtdVendas: number
}

const MARCAS_EXCLUIR = new Set(['Geral', 'Outbound', 'Repasse'])
const VAZIO: MetaTime = { metaSql: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0 }

/** Soma meta de SDR + Closer por marca real. Chamador filtra as marcas que precisa. */
export function resumirTimePorMarca(rows: RawMetaTimeRow[]): Map<string, MetaTime> {
  const map = new Map<string, MetaTime>()
  for (const r of rows) {
    if (!r.nome_colaborador || !r.funcao || r.funcao === 'Repasse') continue
    if (!r.marca || MARCAS_EXCLUIR.has(r.marca)) continue
    const cur = map.get(r.marca) ?? { ...VAZIO }
    cur.metaSql += r.meta_sql ?? 0
    cur.metaReuniao += r.meta_reuniao_realizada ?? 0
    cur.metaCof += r.meta_cof ?? 0
    cur.metaFinanceira += r.meta_financeira ?? 0
    cur.metaQtdVendas += r.meta_qtd_vendas ?? 0
    map.set(r.marca, cur)
  }
  return map
}

async function fetchMetas(mesesKeys: string[]): Promise<{ rows: RawMetaTimeRow[]; error: string | null }> {
  if (mesesKeys.length === 0) return { rows: [], error: null }
  const mesesInicio = mesesKeys.map(k => `${k}-01`)
  const { data, error } = await supabaseVendas
    .from('DB_Metas_Performance')
    .select('nome_colaborador, marca, funcao, meta_sql, meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira, meta_qtd_vendas')
    .in('mes_referencia', mesesInicio)
    .in('funcao', ['SDR', 'Closer'])
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as RawMetaTimeRow[], error: null }
}

export function useMetasTimeResumo({ mesesKeys }: { mesesKeys: string[] }) {
  const chave = mesesKeys.join(',')
  const [porMarca, setPorMarca] = useState<Map<string, MetaTime>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { rows, error: err } = await fetchMetas(chave ? chave.split(',') : [])
    if (err) { setError(err); setLoading(false); return }
    setPorMarca(resumirTimePorMarca(rows))
    setLoading(false)
  }, [chave])

  useEffect(() => {
    let cancelled = false
    fetchAll(true).catch(() => {})
    const onRefresh = () => { if (!cancelled) fetchAll(false) }
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => { if (!cancelled) fetchAll(false) }, 300000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [fetchAll])

  return { porMarca, loading, error }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/ws-dashboard-build && npx vitest run src/hooks/useMetasTimeResumo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMetasTimeResumo.ts src/hooks/useMetasTimeResumo.test.ts
git commit -m "feat(vendas): useMetasTimeResumo — meta do time (SDR+Closer) por marca"
```

---

## Task 5: `buildSdrRows` / `buildCloserRows` sobre `FunnelRow`

**Files:**
- Create: `src/lib/performanceRows.ts`
- Create: `src/lib/performanceRows.test.ts`

**Interfaces:**
- Consumes: `FunnelRow` (`@/lib/funnelTypes`), `PeriodWindow` + `isInWindow` (`@/lib/metrics`), `MembroRoster` (`@/hooks/useRosterVendas`), `MetaAgregada` + `findMeta` (`@/hooks/useMetasPerformance`).
- Produces:
  ```ts
  export interface SdrRow {
    nome: string
    mql: number; sql: number; rr: number; sal: number
    metaSql: number
    pctAting: number        // sql / metaSql * 100 ; 0 se sem meta
    mqlToSql: number        // sql / mql * 100 ; 0 se mql 0
  }
  export interface CloserRow {
    nome: string
    rr: number; sal: number; cof: number
    ganhos: number; faturamento: number
    metaFinanceira: number
    pctAting: number        // faturamento / metaFinanceira * 100 ; 0 se sem meta
    winRate: number         // ganhos / rr * 100 ; 0 se rr 0
  }
  export function buildSdrRows(rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[]): SdrRow[]
  export function buildCloserRows(rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[]): CloserRow[]
  ```
- Regras:
  - Ignorar `status_atual === 'Excluído'`.
  - Creditar a etapa à pessoa (`nome_sdr` para SDR, `nome_closer` para Closer) quando a `data_<etapa>` da linha cai em `win` (`isInWindow`).
  - `nome` tem que estar no roster (`cargo` `'SDR'`/`'SDR/Closer'` para SDR; `'Closer'`/`'SDR/Closer'` para Closer), comparado por `trim().toLowerCase()`.
  - SDR: `mql`←`data_novo_mql`, `sql`←`data_agendamento_reuniao_sql`, `rr`←`data_reuniao_realizada`, `sal`←`data_sal`.
  - Closer: `rr`←`data_reuniao_realizada`, `sal`←`data_sal`, `cof`←`data_oportunidade`; `ganhos`/`faturamento` quando `status_atual === 'Ganho'` e `data_venda` em `win` (`valor_contrato ?? 0`).
  - Ordenar por `pctAting` desc.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/performanceRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSdrRows, buildCloserRows } from '@/lib/performanceRows'
import { toWindow } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import type { MembroRoster } from '@/hooks/useRosterVendas'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'

const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])

const roster: MembroRoster[] = [
  { nome: 'Xayane', cargo: 'SDR', foto: null },
  { nome: 'Douglas', cargo: 'Closer', foto: null },
]

const metasSdr: MetaAgregada[] = [
  { nome: 'Xayane', funcao: 'SDR', metaSql: 20, metaAgendamento: 0, metaReuniao: 10, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0 },
]
const metasCloser: MetaAgregada[] = [
  { nome: 'Douglas', funcao: 'Closer', metaSql: 0, metaAgendamento: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 100_000, metaQtdVendas: 0 },
]

function r(p: Partial<FunnelRow>): FunnelRow {
  return {
    id_lead: 'x', ciclo: 1, eh_reciclagem: false, eh_ciclo_atual: true,
    marca: 'Oral Unic', nome_funil: 'SDR', origem_comercial: 'Inbound',
    etapa_funil: null, id_etapa_atual: null, status_atual: 'Em andamento',
    nome_negociacao: null, nome_sdr: null, nome_closer: null,
    fonte_macro: null, sub_fonte: null, utm_source: null, sub_fonte_crm: null,
    valor_contrato: null, quantidade_unidades: null, motivo_perda: null,
    data_novo_mql: null, data_tentando_contato: null, data_contato_efetivo: null,
    data_interesse_reuniao: null, data_conexao: null, data_agendamento_reuniao_sql: null,
    data_reuniao_realizada: null, data_no_show: null, data_sal: null, data_oportunidade: null,
    data_comite: null, data_pre_contrato: null, data_venda: null, data_perdido: null,
    ...p,
  }
}

describe('buildSdrRows', () => {
  it('credita etapas na janela ao nome_sdr e calcula % da meta de SQL', () => {
    const rows = [
      r({ nome_sdr: 'Xayane', data_novo_mql: '2026-08-05', data_agendamento_reuniao_sql: '2026-08-10' }),
      r({ nome_sdr: 'Xayane', data_agendamento_reuniao_sql: '2026-08-12', data_reuniao_realizada: '2026-08-20' }),
      r({ nome_sdr: 'Xayane', data_agendamento_reuniao_sql: '2026-07-30' }), // fora da janela
    ]
    const [row] = buildSdrRows(rows, win, metasSdr, roster)
    expect(row.nome).toBe('Xayane')
    expect(row.mql).toBe(1)
    expect(row.sql).toBe(2)
    expect(row.rr).toBe(1)
    expect(row.metaSql).toBe(20)
    expect(row.pctAting).toBeCloseTo(10, 5) // 2/20
    expect(row.mqlToSql).toBeCloseTo(200, 5) // 2/1
  })

  it('ignora quem não está no roster de SDR e status Excluído', () => {
    const rows = [
      r({ nome_sdr: 'Fantasma', data_agendamento_reuniao_sql: '2026-08-10' }),
      r({ nome_sdr: 'Xayane', status_atual: 'Excluído', data_agendamento_reuniao_sql: '2026-08-10' }),
    ]
    expect(buildSdrRows(rows, win, metasSdr, roster)).toEqual([])
  })
})

describe('buildCloserRows', () => {
  it('conta ganhos/faturamento só com status Ganho e data_venda na janela', () => {
    const rows = [
      r({ nome_closer: 'Douglas', data_reuniao_realizada: '2026-08-03', status_atual: 'Ganho', data_venda: '2026-08-15', valor_contrato: 60_000 }),
      r({ nome_closer: 'Douglas', status_atual: 'Ganho', data_venda: '2026-07-15', valor_contrato: 999 }), // fora da janela
      r({ nome_closer: 'Douglas', data_venda: '2026-08-20', valor_contrato: 999, status_atual: 'Perdido' }), // não é Ganho
    ]
    const [row] = buildCloserRows(rows, win, metasCloser, roster)
    expect(row.rr).toBe(1)
    expect(row.ganhos).toBe(1)
    expect(row.faturamento).toBe(60_000)
    expect(row.pctAting).toBeCloseTo(60, 5) // 60000/100000
    expect(row.winRate).toBeCloseTo(100, 5) // 1 ganho / 1 rr
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npx vitest run src/lib/performanceRows.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/lib/performanceRows.ts`:

```ts
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow } from '@/lib/metrics'
import { isInWindow } from '@/lib/metrics'
import type { MembroRoster } from '@/hooks/useRosterVendas'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'
import { findMeta } from '@/hooks/useMetasPerformance'

export interface SdrRow {
  nome: string
  mql: number; sql: number; rr: number; sal: number
  metaSql: number
  pctAting: number
  mqlToSql: number
}

export interface CloserRow {
  nome: string
  rr: number; sal: number; cof: number
  ganhos: number; faturamento: number
  metaFinanceira: number
  pctAting: number
  winRate: number
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function rosterSet(roster: MembroRoster[], cargos: MembroRoster['cargo'][]): Set<string> {
  return new Set(roster.filter(r => cargos.includes(r.cargo)).map(r => key(r.nome)))
}

export function buildSdrRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
): SdrRow[] {
  const valid = rosterSet(roster, ['SDR', 'SDR/Closer'])
  const bucket = new Map<string, { mql: number; sql: number; rr: number; sal: number }>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_sdr?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const cur = bucket.get(nome) ?? { mql: 0, sql: 0, rr: 0, sal: 0 }
    if (isInWindow(r.data_novo_mql, win)) cur.mql++
    if (isInWindow(r.data_agendamento_reuniao_sql, win)) cur.sql++
    if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
    if (isInWindow(r.data_sal, win)) cur.sal++
    bucket.set(nome, cur)
  }

  return Array.from(bucket.entries()).map(([nome, v]) => {
    const metaSql = findMeta(metas, nome, 'SDR')?.metaSql ?? 0
    return {
      nome, ...v,
      metaSql,
      pctAting: metaSql > 0 ? (v.sql / metaSql) * 100 : 0,
      mqlToSql: v.mql > 0 ? (v.sql / v.mql) * 100 : 0,
    }
  }).sort((a, b) => b.pctAting - a.pctAting)
}

export function buildCloserRows(
  rows: FunnelRow[], win: PeriodWindow, metas: MetaAgregada[], roster: MembroRoster[],
): CloserRow[] {
  const valid = rosterSet(roster, ['Closer', 'SDR/Closer'])
  const bucket = new Map<string, { rr: number; sal: number; cof: number; ganhos: number; faturamento: number }>()

  for (const r of rows) {
    if (r.status_atual === 'Excluído') continue
    const nome = r.nome_closer?.trim()
    if (!nome || !valid.has(key(nome))) continue
    const cur = bucket.get(nome) ?? { rr: 0, sal: 0, cof: 0, ganhos: 0, faturamento: 0 }
    if (isInWindow(r.data_reuniao_realizada, win)) cur.rr++
    if (isInWindow(r.data_sal, win)) cur.sal++
    if (isInWindow(r.data_oportunidade, win)) cur.cof++
    if (r.status_atual === 'Ganho' && isInWindow(r.data_venda, win)) {
      cur.ganhos++
      cur.faturamento += r.valor_contrato ?? 0
    }
    bucket.set(nome, cur)
  }

  return Array.from(bucket.entries()).map(([nome, v]) => {
    const metaFinanceira = findMeta(metas, nome, 'Closer')?.metaFinanceira ?? 0
    return {
      nome, ...v,
      metaFinanceira,
      pctAting: metaFinanceira > 0 ? (v.faturamento / metaFinanceira) * 100 : 0,
      winRate: v.rr > 0 ? (v.ganhos / v.rr) * 100 : 0,
    }
  }).sort((a, b) => b.pctAting - a.pctAting)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/performanceRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/performanceRows.ts src/lib/performanceRows.test.ts
git commit -m "feat(vendas): buildSdrRows/buildCloserRows sobre vw_funil_vendas (grão FunnelRow)"
```

---

## Task 6: Componente `MetaRitmoCard`

**Files:**
- Create: `src/components/ui/MetaRitmoCard.tsx`

**Interfaces:**
- Consumes: `computeRitmo` (`@/lib/metaRitmo`), `SCard` (`@/components/ui/v2`).
- Produces:
  ```ts
  export interface MetaRitmoCardProps {
    label: string
    realizado: number
    metaMensal: number         // 0 = sem meta cadastrada → renderiza só volume
    mesKey: string             // 'YYYY-MM'
    fimJanela: string          // ISO 'YYYY-MM-DD'
    formatter: (n: number) => string
    accent: string
  }
  export function MetaRitmoCard(props: MetaRitmoCardProps): JSX.Element
  ```
- Comportamento: se `metaMensal <= 0`, mostra só `label` + `formatter(realizado)` (mesmo peso visual de um `KTile`). Senão, mostra: valor realizado, barra (preenchida em `pctRealizado`, marcador vertical em `pctEsperado`), selo `no ritmo`/`abaixo do ritmo`, linha "Meta do dia: `formatter(metaDia)`", e a linha "`+X.X%` vs. esperado até hoje" (só quando `esperado > 0`).

- [ ] **Step 1: Implementar o componente**

Criar `src/components/ui/MetaRitmoCard.tsx`. Reaproveitar o visual do `GoalTracker` que está hoje em `PerformanceVendas.tsx` (linhas ~188–244), trocando a matemática inline pelo `computeRitmo` e adicionando a linha "Meta do dia":

```tsx
import { SCard } from '@/components/ui/v2'
import { computeRitmo } from '@/lib/metaRitmo'

const OK = '#2ABCB5'
const RUIM = '#E4585B'

export interface MetaRitmoCardProps {
  label: string
  realizado: number
  metaMensal: number
  mesKey: string
  fimJanela: string
  formatter: (n: number) => string
  accent: string
}

export function MetaRitmoCard({ label, realizado, metaMensal, mesKey, fimJanela, formatter, accent }: MetaRitmoCardProps) {
  if (metaMensal <= 0) {
    return (
      <SCard style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 26, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatter(realizado)}
        </div>
      </SCard>
    )
  }

  const r = computeRitmo({ realizado, metaMensal, mesKey, fimJanela })
  const fill = r.noRitmo ? OK : RUIM

  return (
    <SCard style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</div>
        <span style={{
          alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
          background: r.noRitmo ? '#E4F6F5' : '#FCE4E4', color: r.noRitmo ? '#0A7A68' : '#9B2C2C',
        }}>{r.noRitmo ? 'no ritmo' : 'abaixo do ritmo'}</span>
      </div>

      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 26, color: 'var(--ws-text-primary)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {formatter(realizado)}
      </div>

      <div style={{ position: 'relative', height: 16, marginTop: 12, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${r.pctRealizado}%`, background: fill, borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: `calc(${r.pctEsperado}% - 1px)`, top: -2, bottom: -2, width: 2, background: 'var(--ws-text-primary)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>Meta do dia <b style={{ color: 'var(--ws-text-primary)' }}>{formatter(r.metaDia)}</b></span>
        <span>Meta do mês <b style={{ color: 'var(--ws-text-primary)' }}>{formatter(metaMensal)}</b></span>
      </div>

      {r.esperado > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 500, color: r.noRitmo ? '#0A7A68' : '#9B2C2C' }}>
          {r.deltaPct >= 0 ? '+' : ''}{r.deltaPct.toFixed(1)}% vs. esperado até hoje
        </div>
      )}

      <div aria-hidden style={{ height: 2, marginTop: 10, background: `color-mix(in srgb, ${accent} 25%, transparent)`, borderRadius: 2 }} />
    </SCard>
  )
}
```

- [ ] **Step 2: Verificar build (componente compila, sem consumidores ainda)**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build`
Expected: build OK (tsc -b sem erros de tipo/import não usado).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MetaRitmoCard.tsx
git commit -m "feat(vendas): MetaRitmoCard — card de métrica com ritmo acumulado + meta do dia"
```

---

## Task 7: Reescrever `PerformanceVendas.tsx`

Esta é a tarefa central. Substitui todo o miolo de dados e cabeçalho da página, mantendo as duas seções (SDR / Closer), os cards de conversão, e `FunilCompletoSection` no fim.

**Files:**
- Modify: `src/pages/PerformanceVendas.tsx` (reescrita ampla)

**Interfaces:**
- Consumes: `useSharedFilters` (`@/contexts/SharedFiltersContext`), `useFunilVendas` (`@/hooks/useFunilVendas`), `useFunilEventos` (`@/hooks/useFunilEventos`), `useMetasPerformance` (`@/hooks/useMetasPerformance`), `useMetasTimeResumo` (Task 4), `useRosterVendas` (`@/hooks/useRosterVendas`), `buildSdrRows`/`buildCloserRows` (Task 5), `MetaRitmoCard` (Task 6), `funilFilterOptions` (Task 2), `PageTop`, `FilterBar`, `OrigemToggle`, `QueryErrorBanner`, `FunilCompletoSection`, e de `@/lib/metrics`: `buildScopeFilter`, `toWindow`, `countStage`, `countStageEvents`, `countSales`, `sumRevenue`, `cohortKeys`, `STAGE_ORDER`, `STAGE_DATE_FIELD`, `isInWindow`. De `@/constants/brands`: `BRAND_LIST`, `BRAND_OVERVIEW`. De `@/lib/format`: `nf`, `pct`, `money`, `moneyK`. De `@/lib/dateUtils`: `shortMonth`.
- Produces: componente `PerformanceVendas` (nome inalterado, export nomeado inalterado).

- [ ] **Step 1: Trocar imports e o esqueleto do componente**

No topo de `src/pages/PerformanceVendas.tsx`, remover:
```ts
import { usePerformanceEquipe } from '@/hooks/usePerformanceEquipe'
import type { FunilCompatRow } from '@/hooks/usePerformanceEquipe'
import { useMetasPerformance, findMeta, metaTimeSdr, metaTimeCloserFat } from '@/hooks/useMetasPerformance'
import { inPeriod } from '@/lib/vendasUtils'
import { BRANDS_WITH_OVERVIEW } from '@/constants/brands'
import { currentMonthRange, monthLabelLong as monthLabel, fmtBR, daysInMonth, dayOfMonth } from '@/lib/dateUtils'
import type { MetaAgregada } from '@/hooks/useMetasPerformance'
import type { MembroRoster } from '@/hooks/useRosterVendas'
```
e adicionar:
```ts
import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FunilCompletoSection } from '@/components/ui/FunilCompletoSection'
import { MetaRitmoCard } from '@/components/ui/MetaRitmoCard'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { useFunilEventos } from '@/hooks/useFunilEventos'
import { useMetasPerformance } from '@/hooks/useMetasPerformance'
import { useMetasTimeResumo } from '@/hooks/useMetasTimeResumo'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { buildSdrRows, buildCloserRows } from '@/lib/performanceRows'
import type { SdrRow, CloserRow } from '@/lib/performanceRows'
import { funilFilterOptions } from '@/lib/funilFilterOptions'
import {
  buildScopeFilter, cohortKeys, countالسales as _unused, // ver nota abaixo
} from '@/lib/metrics'
```
> Nota: não importe nada que não usar (o `tsc -b` reprova import órfão). A lista real de `@/lib/metrics` para importar é: `buildScopeFilter, cohortKeys, countStage, countStageEvents, countSales, sumRevenue, toWindow, STAGE_DATE_FIELD` — e `STAGE_ORDER`/`isInWindow` só se você os usar diretamente aqui (o cálculo de janela por pessoa já está dentro de `buildSdrRows`). Remova a linha `countالسales as _unused` — foi só um lembrete de revisar a lista.

Manter os componentes visuais locais que continuam servindo: `SectionBadge`, `Avatar`, `RankNum`, `ConversionBar`, `SectionHeader`, e o `SCard`/`KTile` de `@/components/ui/v2`. **Remover** `GoalTracker` (substituído por `MetaRitmoCard`) e `computeKpis` / `activeRows` (substituídos por contagem por evento). **Remover** `SdrTable`/`CloserTable` atuais — serão reescritos no Step 4.

- [ ] **Step 2: Montar filtros compartilhados, escopo e janela (corpo do componente)**

Substituir o início de `export function PerformanceVendas()` por (mesma montagem de `FunilVendas.tsx`):

```tsx
export function PerformanceVendas() {
  const { origem, brandKeys, periodMode, periodValues, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()

  const marcasSelecionadas = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is typeof BRAND_LIST[number] => !!b),
    [brandKeys],
  )
  const todasSelecionadas = marcasSelecionadas.length === BRAND_LIST.length
  const { accent } = marcasSelecionadas.length === 1 ? marcasSelecionadas[0] : BRAND_OVERVIEW
  const scopeLabel = todasSelecionadas
    ? 'Consolidado'
    : marcasSelecionadas.length === 1
      ? marcasSelecionadas[0].label
      : marcasSelecionadas.length <= 3
        ? marcasSelecionadas.map(b => b.label).join(', ')
        : `${marcasSelecionadas.length} marcas selecionadas`
  const marcaFetch = marcasSelecionadas.length === 1 ? marcasSelecionadas[0].marca : undefined
  const marcasParaEscopo = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is string => !!m),
    [marcasSelecionadas],
  )

  const { data: rows, error: rowsError } = useFunilVendas(origem, marcaFetch)
  const { data: eventos } = useFunilEventos({
    enabled: true,
    origem,
    inicio: range.start,
    fim: viewModes.funnelView === 'cohort' ? undefined : range.end,
  })
  const { data: roster } = useRosterVendas()

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes }),
    [origem, marcasParaEscopo, fontes, subFontes],
  )
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )
  const idsEscopo = useMemo(() => new Set(scoped.map(r => String(r.id_lead))), [scoped])
  const safra = useMemo(
    () => (viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null),
    [scoped, win, viewModes.funnelView],
  )

  const opcoes = useMemo(
    () => funilFilterOptions({
      rows, win, marcasParaEscopo, fontes, subFontes,
      cohort: viewModes.funnelView === 'cohort',
    }),
    [rows, win, marcasParaEscopo, fontes, subFontes, viewModes.funnelView],
  )
  const marcasDisponiveis = useMemo(
    () => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key),
    [opcoes.marcas],
  )
```

- [ ] **Step 3: Contagens por evento (strips) e metas**

Adicionar ao corpo:

```tsx
  const evOpts = useMemo(
    () => ({ cohortIds: safra, extra: (e: { id_deal: unknown }) => idsEscopo.has(String(e.id_deal)) }),
    [safra, idsEscopo],
  )

  const strip = useMemo(() => ({
    mql: countStage(scoped, 'MQL', win, viewModes),
    sql: countStageEvents(eventos, 'Reunião Agendada SQL', win, viewModes, evOpts),
    rr:  countStageEvents(eventos, 'Diagnóstico', win, viewModes, evOpts),
    sal: countStageEvents(eventos, 'SAL', win, viewModes, evOpts),
    cof: countStageEvents(eventos, 'Oportunidade COF', win, viewModes, evOpts),
    fechamentos: countSales(scoped, win, viewModes),
    receita: sumRevenue(scoped, win, viewModes),
    contatoEfetivo: countStageEvents(eventos, 'Contato Efetivo', win, viewModes, evOpts),
    tentando: countStageEvents(eventos, 'Tentando Contato', win, viewModes, evOpts),
  }), [scoped, eventos, win, viewModes, evOpts])

  // Meta só quando o período resolve para exatamente 1 mês.
  const mesUnico = periodMode === 'mes' && periodValues.length === 1 ? periodValues[0] : null
  const fimJanela = ranges[0]?.end ?? range.end

  const { porMarca: metaTime } = useMetasTimeResumo({ mesesKeys: mesUnico ? [mesUnico] : [] })
  const metaTimeSel = useMemo(() => {
    const acc = { metaSql: 0, metaReuniao: 0, metaCof: 0, metaFinanceira: 0, metaQtdVendas: 0 }
    for (const b of marcasSelecionadas) {
      const m = b.marca ? metaTime.get(b.marca) : undefined
      if (!m) continue
      acc.metaSql += m.metaSql; acc.metaReuniao += m.metaReuniao; acc.metaCof += m.metaCof
      acc.metaFinanceira += m.metaFinanceira; acc.metaQtdVendas += m.metaQtdVendas
    }
    return acc
  }, [marcasSelecionadas, metaTime])

  // Metas por pessoa (para a coluna % das tabelas).
  const { data: metasPessoa, error: metasError } = useMetasPerformance({
    mesKey: mesUnico ?? range.start.slice(0, 7),
    marca: marcaFetch,
  })
  const sdrRows: SdrRow[] = useMemo(
    () => buildSdrRows(scoped, win, metasPessoa, roster),
    [scoped, win, metasPessoa, roster],
  )
  const closerRows: CloserRow[] = useMemo(
    () => buildCloserRows(scoped, win, metasPessoa, roster),
    [scoped, win, metasPessoa, roster],
  )

  const convTopo = useMemo(() => [
    { label: 'MQL → Tentando contato', val: strip.mql > 0 ? (strip.tentando / strip.mql) * 100 : 0 },
    { label: 'Tentando contato → Contato efetivo', val: strip.tentando > 0 ? (strip.contatoEfetivo / strip.tentando) * 100 : 0 },
    { label: 'Contato efetivo → SQL · Reunião agendada', val: strip.contatoEfetivo > 0 ? (strip.sql / strip.contatoEfetivo) * 100 : 0 },
  ], [strip])
  const convFundo = useMemo(() => [
    { label: 'SQL · Reunião agendada → Diagnóstico', val: strip.sql > 0 ? (strip.rr / strip.sql) * 100 : 0 },
    { label: 'Diagnóstico → SAL', val: strip.rr > 0 ? (strip.sal / strip.rr) * 100 : 0 },
    { label: 'SAL → Oportunidade · COF', val: strip.sal > 0 ? (strip.cof / strip.sal) * 100 : 0 },
    { label: 'Oportunidade · COF → Fechamento', val: strip.cof > 0 ? (strip.fechamentos / strip.cof) * 100 : 0 },
  ], [strip])

  const subtitlePeriodo = periodMode !== 'dia' && periodValues.length > 1
    ? `${periodValues.length} períodos selecionados`
    : `${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`
```

- [ ] **Step 4: JSX — cabeçalho, barra, seções, tabelas**

Substituir o `return (...)` inteiro. Estrutura:

```tsx
  return (
    <div style={{ padding: '32px 32px 48px', background: 'var(--ws-bg)', minHeight: '100vh' }}
      {...(marcasSelecionadas.length === 1 ? { 'data-brand': marcasSelecionadas[0].key } : {})}>

      <PageTop
        title="Performance"
        titleAside={<OrigemToggle />}
        subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
        actions={
          <button
            onClick={() => downloadCsv(scoped as unknown as Record<string, unknown>[], `performance-${marcasSelecionadas.map(b => b.key).join('-') || 'todas'}-${range.start}-${range.end}`)}
            disabled={!scoped.length}
            title={!scoped.length ? 'Sem dados no período' : 'Exportar deals do recorte em CSV'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', background: 'var(--ws-surface)', fontSize: 13, color: 'var(--ws-text-primary)', cursor: scoped.length ? 'pointer' : 'not-allowed', opacity: scoped.length ? 1 : 0.5 }}
          >
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar
        marcasDisponiveis={marcasDisponiveis}
        fontesDisponiveis={opcoes.fontes}
        subFontesDisponiveis={opcoes.subFontes}
      />

      <QueryErrorBanner errors={[rowsError, metasError]} scope="Performance" />

      {/* ── Seção 1 · SDR ─────────────────────────────────────────────── */}
      <SectionHeader n={1} accent={SDR_ACCENT} title="Executivos de Expansão (SDR)"
        sub="Do MQL à reunião agendada — cadência, contato efetivo e agendamento" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '12px 0 8px' }}>
        <MetaRitmoCard label="MQL no período" realizado={strip.mql} metaMensal={0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={SDR_ACCENT} />
        <MetaRitmoCard label="SQL (reuniões agendadas)" realizado={strip.sql}
          metaMensal={mesUnico ? metaTimeSel.metaSql : 0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={SDR_ACCENT} />
        <MetaRitmoCard label="RR (reuniões realizadas)" realizado={strip.rr}
          metaMensal={mesUnico ? metaTimeSel.metaReuniao : 0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={SDR_ACCENT} />
        <MetaRitmoCard label="SAL qualificados" realizado={strip.sal} metaMensal={0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={SDR_ACCENT} />
      </div>

      <p style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '0 0 16px' }}>
        Os cards usam a mesma contagem por evento da Visão Macro (a etapa “Reunião Agendada SQL” só conta no funil do Closer). A tabela abaixo soma pelo SDR atribuído ao negócio — negócios sem responsável não entram nela, então uma pequena diferença é esperada.
      </p>

      <SdrTable rows={sdrRows} />

      <div style={{ marginTop: 14 }}>
        <SCard>
          {/* Conversões — topo do funil: reaproveitar o bloco atual, trocando a fonte por convTopo */}
        </SCard>
      </div>

      {/* ── Seção 2 · Closer ──────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <SectionHeader n={2} accent={CLOSER_ACCENT} title="Closer"
          sub="Da reunião realizada ao fechamento — diagnóstico, SAL, oportunidade e receita" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, margin: '12px 0 8px' }}>
        <MetaRitmoCard label="Reuniões realizadas" realizado={strip.rr} metaMensal={0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
        <MetaRitmoCard label="SAL qualificados" realizado={strip.sal} metaMensal={0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
        <MetaRitmoCard label="Oportunidades (COF)" realizado={strip.cof}
          metaMensal={mesUnico ? metaTimeSel.metaCof : 0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
        <MetaRitmoCard label="Fechamentos" realizado={strip.fechamentos}
          metaMensal={mesUnico ? metaTimeSel.metaQtdVendas : 0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={nf} accent={CLOSER_ACCENT} />
        <MetaRitmoCard label="Receita gerada" realizado={strip.receita}
          metaMensal={mesUnico ? metaTimeSel.metaFinanceira : 0}
          mesKey={mesUnico ?? ''} fimJanela={fimJanela} formatter={moneyK} accent={CLOSER_ACCENT} />
      </div>

      <p style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '0 0 16px' }}>
        Mesma observação da seção de SDR: cards por evento (Visão Macro), tabela somada pelo Closer atribuído.
      </p>

      <CloserTable rows={closerRows} />

      <div style={{ marginTop: 14 }}>
        <SCard>
          {/* Conversões — fundo do funil: reaproveitar o bloco atual, trocando a fonte por convFundo */}
        </SCard>
      </div>

      <FunilCompletoSection />

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        {scopeLabel} · {subtitlePeriodo} · Fonte: <code>vw_funil_vendas</code> + <code>vw_funil_etapas_v2</code> + <code>DB_Metas_Performance</code>
      </div>
    </div>
  )
}
```

Para os dois blocos "Conversões — topo/fundo do funil": copiar o markup que já existe hoje em `PerformanceVendas.tsx` (a `SCard` com a legenda Gargalo/Melhor e o `.map(convTopo|convFundo ...)` renderizando `<ConversionBar>`), sem mudança visual — só passando os novos arrays `convTopo`/`convFundo`.

- [ ] **Step 5: Reescrever `SdrTable` e `CloserTable`**

Dentro de `PerformanceVendas.tsx`, substituir os dois componentes de tabela. Colunas novas:

**SdrTable** — grid `40px 1fr 70px 70px 70px 70px 90px 70px 90px`:
`# · NOME · MQL · SQL · RR · SAL · META SQL · % · MQL→SQL`

```tsx
function SdrTable({ rows }: { rows: SdrRow[] }) {
  const cols = '40px 1fr 70px 70px 70px 70px 90px 70px 90px'
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: SDR_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        PRÉ-VENDAS · EXECUTIVOS DE EXPANSÃO
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>MQL</span>
          <span style={{ textAlign: 'right' }}>SQL</span>
          <span style={{ textAlign: 'right' }}>RR</span>
          <span style={{ textAlign: 'right' }}>SAL</span>
          <span style={{ textAlign: 'right' }}>META SQL</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>MQL→SQL</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhum SDR com atividade no recorte.</div>
        )}
        {rows.map((r, i) => (
          <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: cols, padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums' }}>
            <RankNum i={i} accent={SDR_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={SDR_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right' }}>{nf(r.mql)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.sql)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.rr)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{nf(r.sal)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.metaSql > 0 ? nf(r.metaSql) : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.metaSql > 0 ? pct(r.pctAting) : '—'}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.mqlToSql)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}
```

**CloserTable** — grid `40px 1fr 70px 70px 70px 80px 120px 110px 70px 80px`:
`# · NOME · RR · SAL · COF · GANHOS · FATURAMENTO · META FAT. · % · WIN RATE`

```tsx
function CloserTable({ rows }: { rows: CloserRow[] }) {
  const cols = '40px 1fr 70px 70px 70px 80px 120px 110px 70px 80px'
  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: CLOSER_ACCENT, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        VENDAS · CLOSERS
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
          <span>#</span><span>NOME</span>
          <span style={{ textAlign: 'right' }}>RR</span>
          <span style={{ textAlign: 'right' }}>SAL</span>
          <span style={{ textAlign: 'right' }}>COF</span>
          <span style={{ textAlign: 'right' }}>GANHOS</span>
          <span style={{ textAlign: 'right' }}>FATURAMENTO</span>
          <span style={{ textAlign: 'right' }}>META FAT.</span>
          <span style={{ textAlign: 'right' }}>%</span>
          <span style={{ textAlign: 'right' }}>WIN RATE</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhum Closer com atividade no recorte.</div>
        )}
        {rows.map((r, i) => (
          <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: cols, padding: '14px 12px', alignItems: 'center', fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums' }}>
            <RankNum i={i} accent={CLOSER_ACCENT} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ws-text-primary)' }}>
              <Avatar nome={r.nome} accent={CLOSER_ACCENT} />{r.nome}
            </span>
            <span style={{ textAlign: 'right' }}>{nf(r.rr)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.sal)}</span>
            <span style={{ textAlign: 'right' }}>{nf(r.cof)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{nf(r.ganhos)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{moneyK(r.faturamento)}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{r.metaFinanceira > 0 ? moneyK(r.metaFinanceira) : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.metaFinanceira > 0 ? pct(r.pctAting) : '—'}</span>
            <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{pct(r.winRate)}</span>
          </div>
        ))}
      </div>
    </SCard>
  )
}
```

- [ ] **Step 6: Verificar build + suíte inteira**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build && npx vitest run`
Expected: build OK (sem imports órfãos, sem tipos quebrados); todos os testes passam. Se `tsc -b` apontar import não usado (ex.: `STAGE_DATE_FIELD`, `STAGE_ORDER`, `isInWindow`, `money`, `Filter`), removê-lo do import.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PerformanceVendas.tsx
git commit -m "feat(vendas): Performance migrada p/ stack da Visão Macro — filtros, cards SDR/Closer, metas diárias"
```

---

## Task 8: Renomear no menu + limpar código morto + docs

**Files:**
- Modify: `src/components/AppLayout.tsx:42`
- Modify: `src/components/ui/FunilCompletoSection.tsx` (comentário de cabeçalho)
- Delete: `src/hooks/usePerformanceEquipe.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada novo.

- [ ] **Step 1: Renomear item de menu**

Em `src/components/AppLayout.tsx`, linha ~42:
```ts
{ key: 'performance-vendas',  label: 'Performance Detalhada' },
```
→
```ts
{ key: 'performance-vendas',  label: 'Performance' },
```
Não mexer em nada mais nesse arquivo (rota, `sectionFor`, `navigate` continuam com `performance-vendas`).

- [ ] **Step 2: Confirmar que nada mais usa o hook antigo e deletá-lo**

Run: `grep -rn "usePerformanceEquipe\|FunilCompatRow\|vw_funil_compat" src/`
Expected: zero resultados em `src/` fora de `src/hooks/usePerformanceEquipe.ts`. (Se aparecer em Análise de Perda ou outro lugar, **não deletar o arquivo** — só remover o import de `PerformanceVendas.tsx` já foi feito na Task 7; registrar no PR que o hook ficou por ter outro consumidor.)

Se limpo:
```bash
git rm src/hooks/usePerformanceEquipe.ts
```

- [ ] **Step 3: Atualizar o comentário de `FunilCompletoSection.tsx`**

Trocar o bloco de comentário do topo (que diz que "o resto da página ainda lê a view antiga `vw_marketing_funil`") por algo como:

```tsx
/**
 * Funil completo (12 etapas) na aba Performance.
 *
 * Lê `vw_funil_vendas` + `SharedFiltersContext` — a mesma base e os mesmos
 * filtros do resto da página (migrada em 2026-09-03) e da Visão Macro, que só
 * mostra um subconjunto simplificado de etapas.
 */
```

- [ ] **Step 4: Atualizar `CLAUDE.md`**

1. **§1 tabela de abas:** trocar `Visão Macro, Performance Detalhada, Análise de Perda, ...` → `Visão Macro, Performance, Análise de Perda, ...` (as duas ocorrências na tabela e no texto logo abaixo, "não em Análise de Objeções").
2. **§5** e outras menções a "Performance Detalhada" no corpo: trocar por "Performance" onde se refere à aba (deixar história antiga em §9 intacta — é registro histórico).
3. **§8 pendências:** editar o item
   `- [ ] **Performance Detalhada e Análise de Perda** ainda leem vw_marketing_funil ...`
   para refletir que **só Análise de Perda** falta agora:
   `- [ ] **Análise de Perda** ainda lê vw_marketing_funil e tem filtros próprios. Migrar para vw_funil_vendas + SharedFiltersContext. (Performance foi migrada em 2026-09-03.)`
   e remover a menção "Performance Detalhada já ganhou um bloco novo (FunilCompletoSection)".
4. **§9 histórico:** adicionar entrada no topo da lista:

```markdown
### 2026-09-03 (2) — Performance Detalhada vira "Performance" e migra pro stack da Visão Macro

A aba saiu de `vw_funil_compat`/`usePerformanceEquipe` + filtros próprios e
passou a consumir `useSharedFilters` + `useFunilVendas` + `useFunilEventos`,
igual à Visão Macro e ao `FunilCompletoSection` que já vivia nela. Agora tem a
`FilterBar` compartilhada inteira (marca multi, período multi, fonte,
sub-fonte, toggles) + `OrigemToggle`, e os números batem com a Visão Macro
(contagem por evento, com a trava "Reunião Agendada SQL só no funil do
Closer").

**Estrutura mantida:** duas seções, SDR e Closer. Cada strip de cards:
- SDR: MQL · SQL · RR · SAL (MQL e SAL sem meta — não existe no banco).
- Closer: Reuniões realizadas · SAL · COF · Fechamentos · Receita.
Cards com meta (SQL, RR no SDR; COF, Fechamentos, Receita no Closer) usam o
novo `MetaRitmoCard`: barra de ritmo acumulado (esperado até hoje, dias
corridos) + "meta do dia" = meta mensal ÷ dias úteis (segunda a sábado, sem
feriados, via `businessDaysInMonth`). **Metas só aparecem quando o período
resolve para exatamente 1 mês** — em multi-mês / trimestre / ano / dia os
cards caem pra volume simples, mesma lógica da Visão Macro que esconde "vs.
período anterior" em multi-seleção.

**Tabelas por pessoa retrabalhadas** (`buildSdrRows`/`buildCloserRows` agora
em `src/lib/performanceRows.ts`, sobre `FunnelRow`): SDR mostra MQL · SQL · RR
· SAL + Meta SQL + % + MQL→SQL; Closer mostra RR · SAL · COF · Ganhos ·
Faturamento + Meta Fat. + % + Win rate. Contagem por pessoa é por data de
etapa na linha do deal, atribuída ao `nome_sdr`/`nome_closer` — pode dar um
pouco menos que o strip (deal sem responsável), explicado em nota de rodapé
em cada seção.

**Extraído p/ compartilhar:** `funilFilterOptions` (o cruzamento "estilo
Excel" Marca × Fonte × Sub-fonte × janela) saiu de dentro de `FunilVendas.tsx`
pra `src/lib/funilFilterOptions.ts`; as duas páginas usam a mesma função.
`usePerformanceEquipe.ts` foi deletado. `vw_funil_compat` continua no banco
(Análise de Perda ainda não migrou).

**Rota, arquivo e componente inalterados** (`/performance-vendas`,
`PerformanceVendas.tsx`, `export function PerformanceVendas`). Só o `<h1>` e o
label do menu viraram "Performance".

Verificado: `npm run build` (tsc -b) + `npx vitest run` via
`~/ws-dashboard-build`. App exige login — números conferidos por SQL contra a
base real (strip da Performance == Visão Macro no mesmo recorte).

Spec: `docs/superpowers/specs/2026-09-03-performance-migracao-visao-macro-design.md`
```

- [ ] **Step 5: Verificar build + suíte inteira uma última vez**

Run: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build && npx vitest run`
Expected: build OK; toda a suíte passa.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppLayout.tsx src/components/ui/FunilCompletoSection.tsx CLAUDE.md
git commit -m "chore(vendas): renomeia aba p/ 'Performance', remove usePerformanceEquipe, atualiza CLAUDE.md"
```

- [ ] **Step 7: Abrir o PR**

```bash
git push -u origin feat/performance-migracao-visao-macro
gh pr create --base main --title "feat(vendas): aba Performance migrada pro stack da Visão Macro" --body "$(cat <<'EOF'
## O que muda

- "Performance Detalhada" → **"Performance"** (só `<h1>` e menu; rota/arquivo/componente iguais).
- Página inteira sai de `vw_funil_compat`/`usePerformanceEquipe` + filtros próprios e passa a usar `useSharedFilters` + `useFunilVendas` + `useFunilEventos` — mesma base da Visão Macro, números batem.
- `FilterBar` compartilhada + `OrigemToggle`.
- Cards SDR: MQL · SQL · RR · SAL. Cards Closer: RR · SAL · COF · Fechamentos · Receita.
- `MetaRitmoCard` novo: barra de ritmo acumulado + "meta do dia" (meta ÷ dias úteis seg–sáb). Só com período = 1 mês.
- Tabelas por SDR/Closer retrabalhadas (`src/lib/performanceRows.ts`).
- `funilFilterOptions` extraído de `FunilVendas.tsx` p/ `src/lib/` e compartilhado.
- `usePerformanceEquipe.ts` deletado. `vw_funil_compat` intacta (Análise de Perda ainda usa).

## Verificação

`npm run build` (tsc -b) + `npx vitest run` via `~/ws-dashboard-build`. App exige login; números conferidos por SQL contra a base (strip Performance == Visão Macro no mesmo recorte).

Spec: `docs/superpowers/specs/2026-09-03-performance-migracao-visao-macro-design.md`
Plano: `docs/superpowers/plans/2026-09-03-performance-migracao-visao-macro.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Item do spec | Task |
|---|---|
| §3 renomear menu + `<h1>`; rota inalterada; rodapé | Task 7 (h1, rodapé), Task 8 (menu) |
| §3 CLAUDE.md §1/§5/§8/§9 | Task 8 Step 4 |
| §4.1 deletar `usePerformanceEquipe` / não tocar `vw_funil_compat` | Task 8 Step 2 |
| §4.2 consumir shared filters + `useFunilVendas` + `useFunilEventos` | Task 7 Steps 1–3 |
| §4.3 extrair `funilFilterOptions` (spec dizia hook; plano usa função pura em `src/lib/` — desvio registrado abaixo) | Task 2 |
| §4.4 `PageTop` + `FilterBar` + `OrigemToggle` + `QueryErrorBanner` | Task 7 Step 4 |
| §5.1 strip por evento (bate com Visão Macro) | Task 7 Step 3 |
| §5.2 metas em SQL, RR, COF, Fechamentos, Receita; MQL/SAL sem meta | Task 7 Step 4 |
| §5.3 `MetaRitmoCard` (ritmo + meta do dia) | Task 6, Task 3 |
| §5.4 meta só com período = 1 mês | Task 7 Step 3 (`mesUnico`) |
| §5.5 `useMetasTimeResumo` | Task 4 |
| §6 tabelas retrabalhadas + colunas + nota de rodapé | Task 5, Task 7 Steps 4–5 |
| §7 conversões religadas; `FunilCompletoSection` mantida + comentário | Task 7 Step 4, Task 8 Step 3 |
| §8 `businessDaysInMonth` (seg–sáb) testado | Task 1 |
| §9 testes: dateUtils, meta do time, funilFilterOptions; build+vitest | Tasks 1,2,4,5 + Steps de verificação |
| §10 fora de escopo (Análise de Perda, banco, MQL/SAL meta, rota) | respeitado em todas as tasks |

**Desvio registrado:** o spec §4.3 pediu um *hook* `useFunilFilterOptions` em `src/hooks/`. O plano implementa uma *função pura* `funilFilterOptions` em `src/lib/` — os dois chamadores já envolvem o resultado em `useMemo`, então um hook só adicionaria indireção, e função pura é testável sem `renderHook`. Mesmo comportamento e mesma responsabilidade. Se a revisão preferir o hook, é um wrapper de 3 linhas por cima da função.

**2. Placeholder scan:** o único trecho propositalmente não-literal é "reaproveitar o bloco atual de Conversões" (Task 7 Step 4) — é markup que já existe no arquivo, copiado com troca só da fonte de dados (`convTopo`/`convFundo`); o resto tem código completo. Sem "TODO"/"TBD"/"error handling apropriado".

**3. Type consistency:**
- `funilFilterOptions({ rows, win, marcasParaEscopo, fontes, subFontes, cohort })` — mesma assinatura na Task 2 (definição), Task 7 Step 2 e no refactor de `FunilVendas.tsx`.
- `computeRitmo({ realizado, metaMensal, mesKey, fimJanela })` → `Ritmo` — Task 3 define, Task 6 consome com as mesmas chaves.
- `MetaRitmoCard` props (`label, realizado, metaMensal, mesKey, fimJanela, formatter, accent`) — Task 6 define, Task 7 Step 4 consome idêntico.
- `buildSdrRows(rows, win, metas, roster)` / `buildCloserRows(...)` e os tipos `SdrRow`/`CloserRow` (campos `mql,sql,rr,sal,metaSql,pctAting,mqlToSql` / `rr,sal,cof,ganhos,faturamento,metaFinanceira,pctAting,winRate`) — Task 5 define, Task 7 Steps 3/5 consomem os mesmos nomes.
- `useMetasTimeResumo({ mesesKeys })` → `{ porMarca: Map<string, MetaTime>, ... }`, `MetaTime` = `{ metaSql, metaReuniao, metaCof, metaFinanceira, metaQtdVendas }` — Task 4 define, Task 7 Step 3 consome (`metaTime.get(b.marca)`, campos idênticos em `metaTimeSel`).
- `businessDaysInMonth(monthKey)` — Task 1 define, Task 3 (`computeRitmo`) consome.
- `MetaAgregada` / `findMeta` reusados de `useMetasPerformance.ts` sem alteração de assinatura.
