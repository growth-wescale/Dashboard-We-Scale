# Análise de Perda — migração para o stack da Visão Macro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `src/pages/AnalisePerda.tsx` do stack antigo (`usePerdas`/`vw_perdas` + `usePerformanceEquipe`/`vw_funil_compat`, filtros locais) para o stack compartilhado de Vendas (`useFunilVendas`/`vw_funil_vendas`, `SharedFiltersContext`, `FilterBar`), com um KPI novo de Receita Perdida, popups de deals em quase todo elemento clicável, e normalização de acento/case em `motivosPerda.ts`.

**Architecture:** Toda a lógica de agregação (hoje inline no `.tsx`, sem teste) migra para um módulo puro `src/lib/perdaRows.ts`, testado, construído sobre `isLoss`/`rowsInLoss` e `currentStage` que já existem em `metrics.ts` — a mesma trava de perda que a Visão Macro já usa para o card de leadtime. Nenhuma view do banco é tocada: `vw_funil_vendas` já tem todos os campos necessários (`motivo_perda`, `data_perdido`, `valor_contrato`, `fonte_macro`, `sub_fonte`, `nome_sdr`/`nome_closer`, `origem_comercial`).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Supabase (Expansão) + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-analise-perda-migracao-visao-macro-design.md`

## Global Constraints

- **Nenhuma migration/view de banco.** `vw_funil_vendas` já tem tudo — zero SQL neste plano.
- **Não deletar** `src/hooks/usePerdas.ts` nem `src/hooks/usePerformanceEquipe.ts` — ficam órfãos (`AnalisePerda.tsx` para de importá-los), mesmo padrão que `usePerformanceEquipe` já ficou depois da migração da Performance.
- **Não mudar** rota (`/analise-perda`), nome do arquivo (`AnalisePerda.tsx`) nem nome do componente exportado (`AnalisePerda`).
- **Build local trava no OneDrive.** Todo `npm run build`/`npx vitest run` deste plano roda em `~/ws-dashboard-build` (já existe, com `node_modules` instalado), nunca direto na pasta do projeto:
  ```bash
  rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
  cd ~/ws-dashboard-build && npm run build && npx vitest run
  ```
- **`tsc --noEmit` é mais permissivo que `tsc -b`** (usado por `npm run build`) — só `npm run build` pega import não usado. Sempre validar com ele, nunca só `--noEmit`.
- **Sem testes de componente/página neste projeto** (confirmado: zero dependência de `@testing-library`/jsdom, `vitest.config.ts` roda só `environment: 'node'` sobre `src/**/*.test.ts`). Só `src/lib/*.ts` e `src/constants/*.ts` recebem TDD com teste real; componentes React (`FilterBar.tsx`, `PerdaDealsDrawer.tsx`, `AnalisePerda.tsx`) são verificados por `npm run build` (checagem de tipos) — não invente teste de render que não existe no resto do repo.
- **Commits em pt-BR, Conventional Commits**, terminando com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Branch:** `feat/analise-perda-migracao` (já criada a partir de `main`, com o spec já commitado). Todo o trabalho deste plano é commitado nela.
- **`FunnelRow`** (`src/lib/funnelTypes.ts`) é o tipo de linha único em todas as tarefas de dado — não inventar um tipo próprio para "linha de perda".

---

### Task 1: `motivosPerda.ts` — normalizar acento, caixa e espaçamento de barra

**Files:**
- Modify: `src/constants/motivosPerda.ts`
- Test: `src/constants/motivosPerda.test.ts` (novo)

**Interfaces:**
- Consumes: nada de outra tarefa.
- Produces: `classificarMotivo(motivo: string | null | undefined): CategoriaMotivo | null` — assinatura e comportamento externo INALTERADOS (mesmas 3 categorias); só o algoritmo interno de comparação muda. Tarefas 3 e 4 (`computeMotivos`/`computeEvitavel`/`computeCruzamentos` em `perdaRows.ts`) importam `classificarMotivo` e o tipo `CategoriaMotivo` deste arquivo.

- [ ] **Step 1: Escrever o teste (vai falhar contra a versão atual do arquivo)**

Criar `src/constants/motivosPerda.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classificarMotivo } from '@/constants/motivosPerda'

describe('classificarMotivo', () => {
  it('classifica motivo de processo, ignorando acento e caixa', () => {
    expect(classificarMotivo('Atingiu o fim da cadência')).toBe('processo')
    expect(classificarMotivo('atingiu o fim da cadencia')).toBe('processo')
    expect(classificarMotivo('ATINGIU O FIM DA CADÊNCIA')).toBe('processo')
  })

  it('classifica motivo de mercado mesmo com espaçamento diferente ao redor da barra', () => {
    expect(classificarMotivo('Sem budget / momento')).toBe('mercado')
    expect(classificarMotivo('Sem budget/momento')).toBe('mercado')
  })

  it('remove o prefixo [NOVO] (com ou sem espaço extra) antes de classificar', () => {
    expect(classificarMotivo('[NOVO] Sem perfil (fora do ICP)')).toBe('mercado')
    expect(classificarMotivo('[novo]   Teste')).toBe('ignorar')
  })

  it('motivo não catalogado retorna null, não quebra em entrada vazia', () => {
    expect(classificarMotivo('Registro de teste - apagar')).toBeNull()
    expect(classificarMotivo(null)).toBeNull()
    expect(classificarMotivo(undefined)).toBeNull()
    expect(classificarMotivo('')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/constants/motivosPerda.test.ts
```

Esperado: falha nos casos de caixa/acento variando e no espaçamento de barra — a versão atual de `classificarMotivo` faz `Set.has()` de string exata (só normaliza o prefixo `[NOVO]`), então `'atingiu o fim da cadencia'` (minúsculo, sem acento) não bate com a entrada `'Atingiu o fim da cadência'` do `Set`.

- [ ] **Step 3: Reescrever `src/constants/motivosPerda.ts`**

```ts
// Classificação Processo × Mercado dos motivos de perda (P5).
// Regra: "perda evitável" = motivos_processo / total_com_motivo.
// PROCESSO = endereçável pelo time (falha operacional/execução).
// MERCADO  = não endereçável (perfil, momento, decisão do lead).

export type CategoriaMotivo = 'processo' | 'mercado' | 'ignorar'

// Entradas já normalizadas (sem acento, minúsculas, sem espaço ao redor de "/")
// — normalize() abaixo aplica a mesma transformação no motivo recebido antes
// do lookup, então aqui não precisa mais duplicar variante de grafia.
const PROCESSO = new Set<string>([
  'atingiu o fim da cadencia',
  'parou de responder',
  'sem contato apos cadencia sdr',
  'sem contato apos cadencia',
  'no-show sem retorno apos reagendamento',
  'sem resposta',
  'dados invalidos',
])

const MERCADO = new Set<string>([
  'sem perfil (fora do icp)',
  'sem interesse/nao quis conversa',
  'momento atual ate 6 meses',
  'nossa solucao nao atende',
  'optou por outro investimento',
  'escolheu concorrente',
  'sem budget/momento',
  'desqualificado (lixo)',
  'desqualificado',
])

const IGNORAR = new Set<string>([
  'duplicado/teste',
  'teste',
])

/**
 * Normaliza pra comparação: remove prefixo "[NOVO]", remove acento (NFD +
 * strip de diacríticos), colapsa espaço ao redor de "/" e espaços repetidos,
 * e passa pra minúsculo. Sem isso, cada variação de digitação do RD (motivo
 * é campo livre) vira uma entrada nova nos Sets acima — já aconteceu 3x com
 * "Sem interesse / não quis conversa" e 2x com o espaçamento de "Sem
 * budget/momento".
 */
function normalize(s: string): string {
  return s
    .replace(/^\[NOVO\]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function classificarMotivo(motivo: string | null | undefined): CategoriaMotivo | null {
  if (!motivo) return null
  const n = normalize(motivo)
  if (!n) return null
  if (PROCESSO.has(n)) return 'processo'
  if (MERCADO.has(n))  return 'mercado'
  if (IGNORAR.has(n))  return 'ignorar'
  return null // motivo não catalogado — cai fora do cálculo de perda evitável
}
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/constants/motivosPerda.test.ts
```

Esperado: PASS nos 4 testes.

- [ ] **Step 5: Rodar a suíte inteira (garantir que nada mais quebrou) e commitar**

```bash
cd ~/ws-dashboard-build && npx vitest run
```

Esperado: todos os testes passam (o resto do repo não depende de `motivosPerda.ts`).

```bash
git add src/constants/motivosPerda.ts src/constants/motivosPerda.test.ts
git commit -m "fix(vendas): motivosPerda.ts deixa de ser frágil a acento/caixa/espaçamento

classificarMotivo normaliza (NFD + strip de diacríticos, colapsa espaço
ao redor de \"/\", lowercase) antes do lookup. As 3 variantes de \"Sem
interesse / não quis conversa\" e os 2 espaçamentos de \"Sem
budget/momento\" (hoje 2 entradas separadas por causa disso) viram 1
entrada só. Assinatura e retorno de classificarMotivo não mudam.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/lib/perdaRows.ts` — núcleo (`perdidos`, `dealsReceitaPerdida`, `computeKpis`)

**Files:**
- Create: `src/lib/perdaRows.ts`
- Create: `src/lib/perdaRows.test.ts`

**Interfaces:**
- Consumes: `rowsInLoss`, `countStage`, `currentStage` (`src/lib/metrics.ts`, já existem, não tocados); `businessDaysBetween` (`src/lib/businessHours.ts`, já existe); `FunnelRow` (`src/lib/funnelTypes.ts`).
- Produces: `perdidos(rows, win, modes): FunnelRow[]`, `dealsReceitaPerdida(perdas: FunnelRow[]): FunnelRow[]`, `computeKpis(scoped: FunnelRow[], win, modes): KpisPerda` com `KpisPerda { perdidasDeals, mqlsPeriodo, taxaPerda, emAberto, leadtimeDias, etapaTop: StageKey | null, receitaPerdida }`. Tasks 3-5 (mesmo arquivo) e Task 8 (`AnalisePerda.tsx`) consomem essas exatas assinaturas.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/perdaRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { perdidos, dealsReceitaPerdida, computeKpis } from '@/lib/perdaRows'
import { toWindow, DEFAULT_VIEW_MODES } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])
const modes = DEFAULT_VIEW_MODES

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

describe('perdidos', () => {
  it('só conta deals com status atual Perdido e data_perdido na janela', () => {
    const rows = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-10' }),
      r({ id_lead: 'b', status_atual: 'Em andamento', data_perdido: null }),
      r({ id_lead: 'c', status_atual: 'Perdido', data_perdido: '2026-07-10' }), // fora da janela
    ]
    expect(perdidos(rows, win, modes).map(x => x.id_lead)).toEqual(['a'])
  })
})

describe('dealsReceitaPerdida', () => {
  it('só inclui perdidos que chegaram em Oportunidade ou depois', () => {
    const perdas = [
      r({ id_lead: 'a', data_oportunidade: '2026-08-01', valor_contrato: 1000 }),
      r({ id_lead: 'b', data_oportunidade: null, valor_contrato: 2000 }),
    ]
    expect(dealsReceitaPerdida(perdas).map(x => x.id_lead)).toEqual(['a'])
  })
})

describe('computeKpis', () => {
  it('calcula taxa de perda sobre o MQL do período, e conta em aberto no ciclo atual', () => {
    const scoped = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_novo_mql: '2026-08-01', data_perdido: '2026-08-05' }),
      r({ id_lead: 'b', status_atual: 'Em andamento', data_novo_mql: '2026-08-02' }),
      r({ id_lead: 'c', status_atual: 'Em andamento', data_novo_mql: '2026-08-03' }),
    ]
    const kpis = computeKpis(scoped, win, modes)
    expect(kpis.perdidasDeals).toBe(1)
    expect(kpis.mqlsPeriodo).toBe(3)
    expect(kpis.taxaPerda).toBeCloseTo(100 / 3, 5)
    expect(kpis.emAberto).toBe(2)
  })

  it('leadtime médio em dias úteis entre MQL e perda', () => {
    const scoped = [
      // segunda 09:00 -> quarta 09:00 = 2 dias úteis (9h seg + 9h ter, 0h qua antes das 9h)
      r({ id_lead: 'a', status_atual: 'Perdido', data_novo_mql: '2026-08-03T09:00:00-03:00', data_perdido: '2026-08-05T09:00:00-03:00' }),
    ]
    expect(computeKpis(scoped, win, modes).leadtimeDias).toBeCloseTo(2, 5)
  })

  it('etapa que mais perde respeita a trava "Reunião Agendada SQL só no Closer"', () => {
    const scoped = [
      // Perdido parado em "Reunião Agendada SQL" do funil do SDR (id errado)
      // — currentStage() descarta, não deve virar a etapa-top.
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-05', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: 'id-sdr' }),
      r({ id_lead: 'b', status_atual: 'Perdido', data_perdido: '2026-08-06', etapa_funil: 'Diagnóstico' }),
      r({ id_lead: 'c', status_atual: 'Perdido', data_perdido: '2026-08-07', etapa_funil: 'Diagnóstico' }),
    ]
    expect(computeKpis(scoped, win, modes).etapaTop).toBe('Diagnóstico')
  })

  it('receita perdida soma valor_contrato só de quem chegou em Oportunidade ou depois', () => {
    const scoped = [
      r({ id_lead: 'a', status_atual: 'Perdido', data_perdido: '2026-08-05', data_oportunidade: '2026-08-01', valor_contrato: 5000 }),
      r({ id_lead: 'b', status_atual: 'Perdido', data_perdido: '2026-08-06', data_oportunidade: null, valor_contrato: 9999 }),
    ]
    expect(computeKpis(scoped, win, modes).receitaPerdida).toBe(5000)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (módulo ainda não existe)**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/perdaRows'`.

- [ ] **Step 3: Criar `src/lib/perdaRows.ts`**

```ts
/**
 * perdaRows.ts — agregações da aba Análise de Perda.
 *
 * Grão: vw_funil_vendas (via FunnelRow), mesma base de Visão Macro e
 * Performance — não vw_perdas (evento). "Perda" usa a mesma trava de
 * snapshot que Fechamento usa pra venda: isLoss/rowsInLoss em metrics.ts,
 * status_atual === 'Perdido'. Um deal perdido e depois reciclado em outro
 * ciclo não conta aqui pro ciclo antigo — mesma regra de negócio do
 * Fechamento (não existe "perda" que reabriu).
 */

import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow, ViewModes, StageKey } from '@/lib/metrics'
import { rowsInLoss, countStage, currentStage } from '@/lib/metrics'
import { businessDaysBetween } from '@/lib/businessHours'

/** Deals perdidos na janela — ponto único de entrada da aba sobre rowsInLoss (metrics.ts). */
export function perdidos(rows: FunnelRow[], win: PeriodWindow, modes: ViewModes): FunnelRow[] {
  return rowsInLoss(rows, win, modes)
}

/**
 * Perdidos que chegaram em "Oportunidade" ou depois — só esses entram na
 * receita perdida. Um deal perdido em etapa anterior (ex.: Diagnóstico)
 * normalmente não tem proposta de valor real ainda, mesmo que
 * `valor_contrato` esteja preenchido.
 */
export function dealsReceitaPerdida(perdas: FunnelRow[]): FunnelRow[] {
  return perdas.filter(r => !!r.data_oportunidade)
}

export interface KpisPerda {
  perdidasDeals: number
  mqlsPeriodo: number
  taxaPerda: number
  emAberto: number
  leadtimeDias: number
  etapaTop: StageKey | null
  receitaPerdida: number
}

export function computeKpis(scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes): KpisPerda {
  const perdas = perdidos(scoped, win, modes)
  const mqlsPeriodo = countStage(scoped, 'MQL', win, modes)
  const perdidasDeals = perdas.length
  const taxaPerda = mqlsPeriodo > 0 ? (perdidasDeals / mqlsPeriodo) * 100 : 0

  const emAberto = scoped.filter(r => r.status_atual === 'Em andamento' && r.eh_ciclo_atual).length

  const leadtimes: number[] = []
  const etapaCount = new Map<StageKey, number>()
  for (const p of perdas) {
    if (p.data_novo_mql && p.data_perdido) {
      const d = businessDaysBetween(p.data_novo_mql, p.data_perdido)
      if (d > 0) leadtimes.push(d)
    }
    const stage = currentStage(p)
    if (stage) etapaCount.set(stage, (etapaCount.get(stage) ?? 0) + 1)
  }
  const leadtimeDias = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
  const etapaTop = [...etapaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const receitaPerdida = dealsReceitaPerdida(perdas).reduce((s, r) => s + (r.valor_contrato ?? 0), 0)

  return { perdidasDeals, mqlsPeriodo, taxaPerda, emAberto, leadtimeDias, etapaTop, receitaPerdida }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: PASS nos 6 testes.

- [ ] **Step 5: Commitar**

```bash
git add src/lib/perdaRows.ts src/lib/perdaRows.test.ts
git commit -m "feat(vendas): perdaRows.ts — núcleo (perdidos/dealsReceitaPerdida/computeKpis)

Primeira peça do módulo puro que extrai a lógica de agregação de
AnalisePerda.tsx (hoje inline, sem teste). Trava de perda reusa
isLoss/rowsInLoss de metrics.ts — a mesma que o card de leadtime da
Visão Macro já usa. Receita Perdida é KPI novo: só deals perdidos que
chegaram em Oportunidade ou depois.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `perdaRows.ts` — motivos (`computeMotivos`, `computeEvitavel`)

**Files:**
- Modify: `src/lib/perdaRows.ts`
- Modify: `src/lib/perdaRows.test.ts`

**Interfaces:**
- Consumes: `classificarMotivo`, `CategoriaMotivo` (`src/constants/motivosPerda.ts`, Task 1).
- Produces: `MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null; deals: FunnelRow[] }`, `computeMotivos(perdas: FunnelRow[]): MotivoRow[]`, `EvitavelStats { pctEvitavel; qtdProcesso; qtdMercado }`, `computeEvitavel(perdas: FunnelRow[]): EvitavelStats`. Task 8 consome ambos.

- [ ] **Step 1: Adicionar os testes ao final de `src/lib/perdaRows.test.ts`**

```ts
import { computeMotivos, computeEvitavel } from '@/lib/perdaRows'

describe('computeMotivos', () => {
  it('agrupa por motivo (limpando o prefixo [NOVO]), calcula % e classifica', () => {
    const perdas = [
      r({ id_lead: 'a', motivo_perda: '[NOVO] Sem perfil (fora do ICP)' }),
      r({ id_lead: 'b', motivo_perda: 'Sem perfil (fora do ICP)' }),
      r({ id_lead: 'c', motivo_perda: 'Parou de responder' }),
      r({ id_lead: 'd', motivo_perda: null }), // sem motivo, fora do total
    ]
    const motivos = computeMotivos(perdas)
    expect(motivos[0]).toMatchObject({ motivo: 'Sem perfil (fora do ICP)', qtd: 2, categoria: 'mercado' })
    expect(motivos[0].deals.map(d => d.id_lead).sort()).toEqual(['a', 'b'])
    expect(motivos[0].pct).toBeCloseTo((2 / 3) * 100, 5) // total = 3 (só quem tem motivo)
    expect(motivos[1]).toMatchObject({ motivo: 'Parou de responder', qtd: 1, categoria: 'processo' })
  })
})

describe('computeEvitavel', () => {
  it('soma processo/mercado e calcula % evitável, ignorando categoria ignorar/não-classificado', () => {
    const perdas = [
      r({ id_lead: 'a', motivo_perda: 'Parou de responder' }),      // processo
      r({ id_lead: 'b', motivo_perda: 'Sem perfil (fora do ICP)' }), // mercado
      r({ id_lead: 'c', motivo_perda: '[NOVO] Teste' }),             // ignorar
      r({ id_lead: 'd', motivo_perda: 'Registro de teste - apagar' }), // não classificado
    ]
    const ev = computeEvitavel(perdas)
    expect(ev.qtdProcesso).toBe(1)
    expect(ev.qtdMercado).toBe(1)
    expect(ev.pctEvitavel).toBeCloseTo(50, 5) // 1 / (1+1), sem contar os 2 de fora
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: FAIL — `computeMotivos`/`computeEvitavel` não exportados ainda.

- [ ] **Step 3: Editar o import no topo de `src/lib/perdaRows.ts`**

Trocar:

```ts
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow, ViewModes, StageKey } from '@/lib/metrics'
import { rowsInLoss, countStage, currentStage } from '@/lib/metrics'
import { businessDaysBetween } from '@/lib/businessHours'
```

por:

```ts
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodWindow, ViewModes, StageKey } from '@/lib/metrics'
import { rowsInLoss, countStage, currentStage } from '@/lib/metrics'
import { businessDaysBetween } from '@/lib/businessHours'
import { classificarMotivo } from '@/constants/motivosPerda'
import type { CategoriaMotivo } from '@/constants/motivosPerda'
```

- [ ] **Step 4: Adicionar ao final de `src/lib/perdaRows.ts`**

```ts
/** Limpa o prefixo "[NOVO]" que o RD antepõe a alguns motivos, pra exibição/agrupamento. */
function limparMotivo(motivo: string): string {
  return motivo.replace(/^\[NOVO\]\s*/i, '').trim()
}

export interface MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null; deals: FunnelRow[] }

export function computeMotivos(perdas: FunnelRow[]): MotivoRow[] {
  const comMotivo = perdas.filter(p => p.motivo_perda)
  const total = comMotivo.length || 1
  const bucket = new Map<string, FunnelRow[]>()
  for (const p of comMotivo) {
    const m = limparMotivo(p.motivo_perda!)
    const cur = bucket.get(m) ?? []
    cur.push(p)
    bucket.set(m, cur)
  }
  return [...bucket.entries()]
    .map(([motivo, deals]) => ({
      motivo, qtd: deals.length, pct: (deals.length / total) * 100,
      categoria: classificarMotivo(motivo), deals,
    }))
    .sort((a, b) => b.qtd - a.qtd)
}

export interface EvitavelStats { pctEvitavel: number; qtdProcesso: number; qtdMercado: number }

export function computeEvitavel(perdas: FunnelRow[]): EvitavelStats {
  let qtdProcesso = 0, qtdMercado = 0
  for (const p of perdas) {
    const c = classificarMotivo(p.motivo_perda)
    if (c === 'processo') qtdProcesso += 1
    else if (c === 'mercado') qtdMercado += 1
  }
  const total = qtdProcesso + qtdMercado
  const pctEvitavel = total > 0 ? (qtdProcesso / total) * 100 : 0
  return { pctEvitavel, qtdProcesso, qtdMercado }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: PASS em todos.

- [ ] **Step 6: Commitar**

```bash
git add src/lib/perdaRows.ts src/lib/perdaRows.test.ts
git commit -m "feat(vendas): perdaRows.ts — computeMotivos e computeEvitavel

Agrupa por motivo_perda (vw_funil_vendas), classificado via
classificarMotivo (Task anterior, já normalizado). Cada MotivoRow
carrega os FunnelRow que o compõem, pro popup de deals não recomputar
o filtro na hora do clique.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `perdaRows.ts` — etapas e cruzamento (`computeEtapas`, `computeCruzamentos`)

**Files:**
- Modify: `src/lib/perdaRows.ts`
- Modify: `src/lib/perdaRows.test.ts`

**Interfaces:**
- Consumes: `STAGE_ORDER` (`src/lib/metrics.ts`); `limparMotivo` (privada, definida na Task 3, mesmo arquivo); `computeMotivos` (Task 3, mesmo arquivo).
- Produces: `EtapaRow { etapa: StageKey; ordem: number; qtd: number; leadtime: number; deals: FunnelRow[] }`, `computeEtapas(perdas): EtapaRow[]`; `EtapaMeta { etapa: StageKey; ordem: number }`, `CruzCel { motivo: string; etapa: StageKey; qtd: number; deals: FunnelRow[] }`, `computeCruzamentos(perdas): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] }`. Task 8 consome `EtapaRow`, `EtapaMeta`, `CruzCel` (tipos) e as duas funções.

- [ ] **Step 1: Adicionar os testes ao final de `src/lib/perdaRows.test.ts`**

```ts
import { computeEtapas, computeCruzamentos } from '@/lib/perdaRows'

describe('computeEtapas', () => {
  it('agrupa por etapa corrente (respeitando a trava do Closer), com leadtime médio em dias úteis', () => {
    const perdas = [
      r({
        id_lead: 'a', status_atual: 'Perdido', etapa_funil: 'Diagnóstico',
        data_novo_mql: '2026-08-03T09:00:00-03:00', data_perdido: '2026-08-03T18:00:00-03:00', // 1 dia útil
      }),
      r({
        id_lead: 'b', status_atual: 'Perdido', etapa_funil: 'Diagnóstico',
        data_novo_mql: '2026-08-04T09:00:00-03:00', data_perdido: '2026-08-05T09:00:00-03:00', // 1 dia útil
      }),
      // "Reunião Agendada SQL" do SDR (id errado) — currentStage() descarta.
      r({ id_lead: 'c', status_atual: 'Perdido', etapa_funil: 'Reunião Agendada SQL', id_etapa_atual: 'id-sdr' }),
    ]
    const etapas = computeEtapas(perdas)
    expect(etapas).toHaveLength(1)
    expect(etapas[0].etapa).toBe('Diagnóstico')
    expect(etapas[0].qtd).toBe(2)
    expect(etapas[0].leadtime).toBeCloseTo(1, 5)
    expect(etapas[0].deals.map(d => d.id_lead).sort()).toEqual(['a', 'b'])
  })
})

describe('computeCruzamentos', () => {
  it('cruza motivo (top 10) com etapa corrente e carrega os deals de cada célula', () => {
    const perdas = [
      r({ id_lead: 'a', status_atual: 'Perdido', motivo_perda: 'Sem perfil (fora do ICP)', etapa_funil: 'Diagnóstico' }),
      r({ id_lead: 'b', status_atual: 'Perdido', motivo_perda: 'Sem perfil (fora do ICP)', etapa_funil: 'SAL' }),
      r({ id_lead: 'c', status_atual: 'Perdido', motivo_perda: 'Parou de responder', etapa_funil: 'Diagnóstico' }),
    ]
    const cruz = computeCruzamentos(perdas)
    expect(cruz.motivos).toEqual(['Sem perfil (fora do ICP)', 'Parou de responder'])
    expect(cruz.etapas.map(e => e.etapa)).toEqual(['Diagnóstico', 'SAL'])
    const celula = cruz.celulas.find(c => c.motivo === 'Sem perfil (fora do ICP)' && c.etapa === 'Diagnóstico')
    expect(celula?.qtd).toBe(1)
    expect(celula?.deals.map(d => d.id_lead)).toEqual(['a'])
    const vazia = cruz.celulas.find(c => c.motivo === 'Parou de responder' && c.etapa === 'SAL')
    expect(vazia?.qtd).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: FAIL — `computeEtapas`/`computeCruzamentos` não exportados ainda.

- [ ] **Step 3: Editar o import no topo de `src/lib/perdaRows.ts`**

Trocar:

```ts
import { rowsInLoss, countStage, currentStage } from '@/lib/metrics'
```

por:

```ts
import { rowsInLoss, countStage, currentStage, STAGE_ORDER } from '@/lib/metrics'
```

- [ ] **Step 4: Adicionar ao final de `src/lib/perdaRows.ts`**

```ts
export interface EtapaRow { etapa: StageKey; ordem: number; qtd: number; leadtime: number; deals: FunnelRow[] }

export function computeEtapas(perdas: FunnelRow[]): EtapaRow[] {
  const bucket = new Map<StageKey, FunnelRow[]>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (!stage) continue
    const cur = bucket.get(stage) ?? []
    cur.push(p)
    bucket.set(stage, cur)
  }
  return [...bucket.entries()]
    .map(([etapa, deals]) => {
      const leadtimes = deals
        .filter(d => d.data_novo_mql && d.data_perdido)
        .map(d => businessDaysBetween(d.data_novo_mql!, d.data_perdido!))
        .filter(d => d > 0)
      const leadtime = leadtimes.length > 0 ? leadtimes.reduce((s, v) => s + v, 0) / leadtimes.length : 0
      return { etapa, ordem: STAGE_ORDER.indexOf(etapa), qtd: deals.length, leadtime, deals }
    })
    .sort((a, b) => a.ordem - b.ordem)
}

export interface EtapaMeta { etapa: StageKey; ordem: number }
export interface CruzCel { motivo: string; etapa: StageKey; qtd: number; deals: FunnelRow[] }

export function computeCruzamentos(
  perdas: FunnelRow[],
): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] } {
  const motivos = computeMotivos(perdas).slice(0, 10).map(m => m.motivo)
  const motivosSet = new Set(motivos)

  const etapasMap = new Map<StageKey, number>()
  for (const p of perdas) {
    const stage = currentStage(p)
    if (stage) etapasMap.set(stage, STAGE_ORDER.indexOf(stage))
  }
  const etapas = [...etapasMap.entries()]
    .map(([etapa, ordem]) => ({ etapa, ordem }))
    .sort((a, b) => a.ordem - b.ordem)

  const cel = new Map<string, FunnelRow[]>()
  for (const p of perdas) {
    if (!p.motivo_perda) continue
    const m = limparMotivo(p.motivo_perda)
    if (!motivosSet.has(m)) continue
    const stage = currentStage(p)
    if (!stage) continue
    const key = `${m}|||${stage}`
    const cur = cel.get(key) ?? []
    cur.push(p)
    cel.set(key, cur)
  }

  const celulas: CruzCel[] = []
  for (const m of motivos) {
    for (const e of etapas) {
      const deals = cel.get(`${m}|||${e.etapa}`) ?? []
      celulas.push({ motivo: m, etapa: e.etapa, qtd: deals.length, deals })
    }
  }
  return { motivos, etapas, celulas }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: PASS em todos.

- [ ] **Step 6: Commitar**

```bash
git add src/lib/perdaRows.ts src/lib/perdaRows.test.ts
git commit -m "feat(vendas): perdaRows.ts — computeEtapas e computeCruzamentos

Etapa corrente via currentStage() (metrics.ts) — herda de graça a
trava \"Reunião Agendada SQL só no Closer\", que a lógica antiga
(vw_perdas.etapa_canonica) não aplicava.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `perdaRows.ts` — responsáveis e marcas (`computeResponsaveis`, `computeMarcas`)

**Files:**
- Modify: `src/lib/perdaRows.ts`
- Modify: `src/lib/perdaRows.test.ts`

**Interfaces:**
- Consumes: `stageOwnerRole` (`src/lib/metrics.ts`); `perdidos`, `currentStage`, `countStage` (já em uso no arquivo).
- Produces: `RespRow { nome: string; camada: 'SDR' | 'Closer' | '—'; qtd: number; deals: FunnelRow[] }`, `computeResponsaveis(perdas): RespRow[]`; `MarcaRow { marca: string; qtd: number; pctSobreMql: number; deals: FunnelRow[] }`, `computeMarcas(perdas, scoped, win, modes): MarcaRow[]`. Task 8 consome ambos.

- [ ] **Step 1: Adicionar os testes ao final de `src/lib/perdaRows.test.ts`**

```ts
import { computeResponsaveis, computeMarcas } from '@/lib/perdaRows'

describe('computeResponsaveis', () => {
  it('atribui pela camada da etapa onde foi perdido, mesmo com os 2 nomes preenchidos', () => {
    // Verificado no banco real (04/09): 578 de 4.757 deals perdidos têm
    // nome_sdr E nome_closer preenchidos ao mesmo tempo — não dá pra supor
    // que só um dos dois vem populado.
    const perdas = [
      r({ id_lead: 'a', status_atual: 'Perdido', etapa_funil: 'Diagnóstico', nome_sdr: 'Xayane', nome_closer: 'Douglas' }),
      r({ id_lead: 'b', status_atual: 'Perdido', etapa_funil: 'Contato Efetivo', nome_sdr: 'Xayane', nome_closer: 'Douglas' }),
    ]
    const resps = computeResponsaveis(perdas)
    const porNome = new Map(resps.map(x => [x.nome, x]))
    expect(porNome.get('Douglas')).toMatchObject({ camada: 'Closer', qtd: 1 })
    expect(porNome.get('Xayane')).toMatchObject({ camada: 'SDR', qtd: 1 })
  })

  it('ignora deal sem etapa corrente resolvível', () => {
    const perdas = [r({ id_lead: 'a', status_atual: 'Perdido', etapa_funil: 'Etapa Desconhecida', nome_sdr: 'Xayane' })]
    expect(computeResponsaveis(perdas)).toEqual([])
  })
})

describe('computeMarcas', () => {
  it('calcula % sobre o MQL da própria marca, não o MQL global', () => {
    const scoped = [
      r({ id_lead: 'a', marca: 'Oral Unic', status_atual: 'Perdido', data_perdido: '2026-08-05', data_novo_mql: '2026-08-01' }),
      r({ id_lead: 'b', marca: 'Oral Unic', status_atual: 'Em andamento', data_novo_mql: '2026-08-02' }),
      r({ id_lead: 'c', marca: 'Oral Unic', status_atual: 'Em andamento', data_novo_mql: '2026-08-03' }),
      r({ id_lead: 'd', marca: 'Inpot', status_atual: 'Perdido', data_perdido: '2026-08-06', data_novo_mql: '2026-08-01' }),
      r({ id_lead: 'e', marca: 'Inpot', status_atual: 'Em andamento', data_novo_mql: '2026-08-02' }),
    ]
    const perdas = perdidos(scoped, win, modes)
    const marcas = computeMarcas(perdas, scoped, win, modes)
    const oralUnic = marcas.find(m => m.marca === 'Oral Unic')!
    const inpot = marcas.find(m => m.marca === 'Inpot')!
    expect(oralUnic.qtd).toBe(1)
    expect(oralUnic.pctSobreMql).toBeCloseTo(100 / 3, 5) // 1 perdido / 3 MQL da Oral Unic
    expect(inpot.pctSobreMql).toBeCloseTo(50, 5) // 1 perdido / 2 MQL da Inpot
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: FAIL — `computeResponsaveis`/`computeMarcas` não exportados ainda.

- [ ] **Step 3: Editar o import no topo de `src/lib/perdaRows.ts`**

Trocar:

```ts
import { rowsInLoss, countStage, currentStage, STAGE_ORDER } from '@/lib/metrics'
```

por:

```ts
import { rowsInLoss, countStage, currentStage, STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
```

- [ ] **Step 4: Adicionar ao final de `src/lib/perdaRows.ts`**

```ts
export interface RespRow { nome: string; camada: 'SDR' | 'Closer' | '—'; qtd: number; deals: FunnelRow[] }

export function computeResponsaveis(perdas: FunnelRow[]): RespRow[] {
  const bucket = new Map<string, { camada: 'SDR' | 'Closer' | '—'; deals: FunnelRow[] }>()
  for (const p of perdas) {
    const stage = currentStage(p)
    const camada: 'SDR' | 'Closer' | '—' = stage ? (stageOwnerRole(stage) === 'sdr' ? 'SDR' : 'Closer') : '—'
    const nome = (camada === 'SDR' ? p.nome_sdr : camada === 'Closer' ? p.nome_closer : null)?.trim()
    if (!nome) continue
    const cur = bucket.get(nome) ?? { camada, deals: [] }
    cur.deals.push(p)
    bucket.set(nome, cur)
  }
  return [...bucket.entries()]
    .map(([nome, v]) => ({ nome, camada: v.camada, qtd: v.deals.length, deals: v.deals }))
    .sort((a, b) => b.qtd - a.qtd)
}

export interface MarcaRow { marca: string; qtd: number; pctSobreMql: number; deals: FunnelRow[] }

export function computeMarcas(
  perdas: FunnelRow[], scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes,
): MarcaRow[] {
  const porMarca = new Map<string, FunnelRow[]>()
  for (const p of perdas) {
    if (!p.marca) continue
    const cur = porMarca.get(p.marca) ?? []
    cur.push(p)
    porMarca.set(p.marca, cur)
  }
  return [...porMarca.entries()]
    .map(([marca, deals]) => {
      const mqlMarca = countStage(scoped, 'MQL', win, modes, r => r.marca === marca)
      return {
        marca, qtd: deals.length,
        pctSobreMql: mqlMarca > 0 ? (deals.length / mqlMarca) * 100 : 0,
        deals,
      }
    })
    .sort((a, b) => b.qtd - a.qtd)
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npx vitest run src/lib/perdaRows.test.ts
```

Esperado: PASS em todos (14 testes no arquivo, somando as Tasks 2-5).

- [ ] **Step 6: Rodar a suíte inteira do projeto e commitar**

```bash
cd ~/ws-dashboard-build && npx vitest run
```

Esperado: todos os testes do repo passam.

```bash
git add src/lib/perdaRows.ts src/lib/perdaRows.test.ts
git commit -m "feat(vendas): perdaRows.ts — computeResponsaveis e computeMarcas

Camada (SDR×Closer) por linha de responsável usa stageOwnerRole() da
etapa onde o deal foi perdido — não presume que só nome_sdr OU
nome_closer vem preenchido (578 de 4.757 deals perdidos têm os dois,
verificado no banco). % de computeMarcas usa o MQL da PRÓPRIA marca
como denominador, não o MQL global do recorte.

Módulo perdaRows.ts completo — próxima tarefa é a UI que o consome.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `FilterBar.tsx` — esconder toggles Vendas/Contagem quando não fazem sentido

**Files:**
- Modify: `src/components/ui/FilterBar.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: `FilterBarProps` ganha `hideVendasToggle?: boolean` e `hideContagemToggle?: boolean` (opcionais, `undefined`/`false` = comportamento atual, mostra os dois — Visão Macro e Performance não passam essas props e continuam idênticas). Task 8 (`AnalisePerda.tsx`) passa `hideVendasToggle hideContagemToggle`.

- [ ] **Step 1: Editar a interface `FilterBarProps` e a assinatura de `FilterBar`**

Em `src/components/ui/FilterBar.tsx`, trocar:

```tsx
interface FilterBarProps {
  extra?: ReactNode
  /** Chaves de BRAND_LIST presentes nos dados (ex.: dentro do toggle de origem). */
  marcasDisponiveis?: string[]
  /** Valores de fonte_macro presentes nos dados. Sem isso o filtro fica vazio. */
  fontesDisponiveis?: string[]
  /** Grupos de sub-fonte presentes nos dados. */
  subFontesDisponiveis?: string[]
  /** Nomes de SDR presentes nos dados. */
  sdrsDisponiveis?: string[]
  /** Nomes de Closer presentes nos dados. */
  closersDisponiveis?: string[]
}

export function FilterBar({ extra, marcasDisponiveis, fontesDisponiveis, subFontesDisponiveis, sdrsDisponiveis, closersDisponiveis }: FilterBarProps) {
```

por:

```tsx
interface FilterBarProps {
  extra?: ReactNode
  /** Chaves de BRAND_LIST presentes nos dados (ex.: dentro do toggle de origem). */
  marcasDisponiveis?: string[]
  /** Valores de fonte_macro presentes nos dados. Sem isso o filtro fica vazio. */
  fontesDisponiveis?: string[]
  /** Grupos de sub-fonte presentes nos dados. */
  subFontesDisponiveis?: string[]
  /** Nomes de SDR presentes nos dados. */
  sdrsDisponiveis?: string[]
  /** Nomes de Closer presentes nos dados. */
  closersDisponiveis?: string[]
  /** Esconde o toggle Negócios×Unidades — página sem conceito de venda fechada (ex.: Análise de Perda). */
  hideVendasToggle?: boolean
  /** Esconde o toggle Deals únicos×Passagens — página cujo evento é terminal único por natureza (ex.: Análise de Perda). */
  hideContagemToggle?: boolean
}

export function FilterBar({
  extra, marcasDisponiveis, fontesDisponiveis, subFontesDisponiveis, sdrsDisponiveis, closersDisponiveis,
  hideVendasToggle, hideContagemToggle,
}: FilterBarProps) {
```

- [ ] **Step 2: Envolver os dois campos condicionais**

Trocar:

```tsx
        <Field label="Vendas">
          <Segmented
            value={viewModes.salesMode}
            onChange={setSalesMode}
            options={[{ value: 'deals', label: 'Negócios' }, { value: 'units', label: 'Unidades' }]}
          />
        </Field>

        <Field label="Deals criados no período">
          <Segmented
            value={viewModes.funnelView}
            onChange={setFunnelView}
            options={[{ value: 'stageDate', label: 'Off' }, { value: 'cohort', label: 'On' }]}
          />
        </Field>

        <Field label="Contagem">
          <Segmented
            value={viewModes.eventSource}
            onChange={setEventSource}
            options={[{ value: 'unique', label: 'Deals únicos' }, { value: 'passages', label: 'Passagens' }]}
          />
        </Field>
```

por:

```tsx
        {!hideVendasToggle && (
          <Field label="Vendas">
            <Segmented
              value={viewModes.salesMode}
              onChange={setSalesMode}
              options={[{ value: 'deals', label: 'Negócios' }, { value: 'units', label: 'Unidades' }]}
            />
          </Field>
        )}

        <Field label="Deals criados no período">
          <Segmented
            value={viewModes.funnelView}
            onChange={setFunnelView}
            options={[{ value: 'stageDate', label: 'Off' }, { value: 'cohort', label: 'On' }]}
          />
        </Field>

        {!hideContagemToggle && (
          <Field label="Contagem">
            <Segmented
              value={viewModes.eventSource}
              onChange={setEventSource}
              options={[{ value: 'unique', label: 'Deals únicos' }, { value: 'passages', label: 'Passagens' }]}
            />
          </Field>
        )}
```

- [ ] **Step 3: Verificar com build (sem teste de componente neste projeto)**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

Esperado: build passa. Confirma também que `FunilVendas.tsx`/`PerformanceVendas.tsx` (que chamam `<FilterBar>` sem as 2 props novas) continuam compilando — props opcionais, comportamento inalterado pra elas.

- [ ] **Step 4: Commitar**

```bash
git add src/components/ui/FilterBar.tsx
git commit -m "feat(vendas): FilterBar ganha hideVendasToggle/hideContagemToggle

Opcionais, default mostra os dois (Visão Macro e Performance
inalteradas). Preparação pra Análise de Perda esconder os 2 toggles
que não se aplicam a ela: perda não tem 'unidades vendidas' nem
'passagem repetida' (é trava de snapshot, igual Fechamento).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `PerdaDealsDrawer.tsx` — popup de deals com colunas de perda

**Files:**
- Create: `src/components/ui/PerdaDealsDrawer.tsx`

**Interfaces:**
- Consumes: `FunnelRow` (`src/lib/funnelTypes.ts`); `rdDealUrl` (`src/lib/rd.ts`); `money` (`src/lib/format.ts`); `cell`, `fmtData` (`src/components/ui/dealDrawerShared.tsx`); `currentStage`, `stageOwnerRole`, `STAGE_LABEL` (`src/lib/metrics.ts`).
- Produces: `PerdaDealsDrawer({ open, onClose, title, subtitle, deals, accent })` — componente React. Task 8 monta um único `<PerdaDealsDrawer>` na página, alimentado por um `drawer` de estado local.

- [ ] **Step 1: Criar `src/components/ui/PerdaDealsDrawer.tsx`**

```tsx
/**
 * Pop-up de deals perdidos — mesmo padrão visual de SimpleDealsDrawer, com
 * colunas específicas de perda (Motivo, Etapa perdida, Responsável) em vez
 * das colunas de venda (Fonte, Unidades). Usado pela Análise de Perda em
 * quase todo elemento clicável: KPIs, linha de motivo/etapa/responsável/
 * marca, célula do heatmap.
 */

import { ExternalLink, X } from 'lucide-react'
import type { FunnelRow } from '@/lib/funnelTypes'
import { rdDealUrl } from '@/lib/rd'
import { money } from '@/lib/format'
import { cell, fmtData } from './dealDrawerShared'
import { currentStage, stageOwnerRole, STAGE_LABEL } from '@/lib/metrics'

interface PerdaDealsDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  deals: FunnelRow[]
  accent: string
}

function motivoLimpo(motivo: string | null): string {
  return cell(motivo?.replace(/^\[NOVO\]\s*/i, '').trim())
}

function responsavelDe(r: FunnelRow): string | null {
  const stage = currentStage(r)
  if (stage) return stageOwnerRole(stage) === 'sdr' ? r.nome_sdr : r.nome_closer
  return r.nome_sdr ?? r.nome_closer
}

export function PerdaDealsDrawer({ open, onClose, title, subtitle, deals, accent }: PerdaDealsDrawerProps) {
  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(760px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>
              {title}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {deals.length} deal{deals.length !== 1 ? 's' : ''} · {subtitle}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Negociação', 'Marca', 'Motivo', 'Etapa perdida', 'Responsável', 'Valor', 'Data'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum deal no recorte selecionado.
                  </td>
                </tr>
              ) : deals.map((r, i) => {
                const stage = currentStage(r)
                return (
                  <tr key={`${r.id_lead}::${r.ciclo}::${i}`} style={{
                    background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                    borderBottom: '1px solid var(--ws-border)',
                  }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      <a href={rdDealUrl(r.id_lead)} target="_blank" rel="noreferrer" style={{
                        color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                        {cell(r.nome_negociacao)}
                        <ExternalLink size={11} />
                      </a>
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(r.marca)}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{motivoLimpo(r.motivo_perda)}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{stage ? STAGE_LABEL[stage] : '—'}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(responsavelDe(r))}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {r.valor_contrato ? money(r.valor_contrato) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtData(r.data_perdido)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar com build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

Esperado: build passa (componente ainda não é importado por ninguém, mas precisa compilar sozinho sem erro de tipo).

- [ ] **Step 3: Commitar**

```bash
git add src/components/ui/PerdaDealsDrawer.tsx
git commit -m "feat(vendas): PerdaDealsDrawer — popup de deals com colunas de perda

Mesmo padrão visual de SimpleDealsDrawer (reaproveita cell/fmtData de
dealDrawerShared), trocando Fonte/Unidades por Motivo/Etapa
perdida/Responsável. Etapa e responsável usam currentStage()/
stageOwnerRole() — mesma trava do Closer que o resto do funil.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `AnalisePerda.tsx` — reescrever a página sobre o stack novo

**Files:**
- Modify: `src/pages/AnalisePerda.tsx` (reescrita completa do corpo do arquivo — rota, nome do arquivo e nome do componente exportado não mudam)

**Interfaces:**
- Consumes: tudo das Tasks 1-7 — `useSharedFilters` (`sdrs`/`closers` incluídos, já em `main`), `useFunilVendas`, `buildScopeFilter`/`toWindow`/`STAGE_LABEL`/`StageKey` (`metrics.ts`), `funilFilterOptions`, todas as funções/tipos de `perdaRows.ts`, `FilterBar` com `hideVendasToggle`/`hideContagemToggle`, `PerdaDealsDrawer`.
- Produces: `export function AnalisePerda()` — mesma assinatura pública (sem parâmetros, sem retorno tipado além de JSX). Nada além desta página consome os componentes locais deste arquivo (`DarkKpi`/`BarRow`/`Heatmap` continuam privados ao módulo).

- [ ] **Step 1: Substituir o conteúdo inteiro de `src/pages/AnalisePerda.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { PerdaDealsDrawer } from '@/components/ui/PerdaDealsDrawer'
import { SCard, KTile } from '@/components/ui/v2'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { buildScopeFilter, toWindow, STAGE_LABEL } from '@/lib/metrics'
import type { StageKey } from '@/lib/metrics'
import { funilFilterOptions } from '@/lib/funilFilterOptions'
import {
  perdidos, computeKpis, computeMotivos, computeEvitavel, computeEtapas,
  computeCruzamentos, computeResponsaveis, computeMarcas, dealsReceitaPerdida,
} from '@/lib/perdaRows'
import type { EtapaMeta, CruzCel } from '@/lib/perdaRows'
import { BRAND_LIST, BRAND_ACCENT } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import type { FunnelRow } from '@/lib/funnelTypes'
import type { PeriodMode } from '@/contexts/SharedFiltersContext'
import { nf, pct, money } from '@/lib/format'
import { shortMonth, fmtBR } from '@/lib/dateUtils'
import { downloadCsv } from '@/lib/csv'

// ─── Colors ──────────────────────────────────────────────────────────────

const DARK_ACCENT = '#3D0F3D'  // roxo escuro (header)
const TEAL        = '#2ABCB5'
const RED         = '#E4585B'
const AMBER       = '#F3B34B'

// Mesmo mapa que FunilVendas.tsx usa pro subtítulo de período (não é
// exportado de lá — cada página de Vendas mantém a própria cópia local).
const PERIOD_LABEL_PLURAL: Record<'mes' | 'trimestre' | 'ano', string> = {
  mes: 'meses', trimestre: 'trimestres', ano: 'anos',
}

// ─── UI blocks ────────────────────────────────────────────────────────────

function DarkKpi({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub?: string; tone?: 'amber' | 'muted'; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{ padding: '20px 26px', flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : undefined }}
    >
      <div style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#E9C5E3' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 40, color: '#fff', marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: tone === 'amber' ? '#F3C979' : '#D0AEC9' }}>{sub}</div>
      )}
    </div>
  )
}

function BarRow({ label, subLabel, value, max, color, right, onClick }: {
  label: string; subLabel?: string; value: number; max: number; color: string; right?: React.ReactNode; onClick?: () => void
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, alignItems: 'center', padding: '10px 0',
        borderBottom: '1px solid var(--ws-border)', cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{label}</span>
          {subLabel && <span style={{ fontSize: 10, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 6px', border: '1px solid var(--ws-border)', borderRadius: 4 }}>{subLabel}</span>}
        </div>
        <div style={{ marginTop: 6, height: 6, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ws-text-primary)', fontWeight: 600 }}>
        {right ?? nf(value)}
      </div>
    </div>
  )
}

function Heatmap({ motivos, etapas, celulas, onCellClick }: {
  motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[]
  onCellClick?: (motivo: string, etapa: StageKey) => void
}) {
  const maxQ = Math.max(1, ...celulas.map(c => c.qtd))
  const val = (m: string, e: StageKey) => celulas.find(c => c.motivo === m && c.etapa === e)?.qtd ?? 0

  function shade(v: number): string {
    if (v === 0) return 'transparent'
    const t = Math.max(0.15, v / maxQ)
    return `rgba(93, 24, 91, ${t.toFixed(3)})`
  }
  function color(v: number): string { return v / maxQ > 0.45 ? '#fff' : 'var(--ws-text-primary)' }

  const gridCols = `minmax(180px, 1fr) repeat(${etapas.length}, minmax(70px, 1fr))`

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, minWidth: 480 }}>
        <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', letterSpacing: '.05em', textTransform: 'uppercase' }}>MOTIVO</div>
        {etapas.map(e => (
          <div key={e.etapa} style={{ fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center', letterSpacing: '.03em' }}>{STAGE_LABEL[e.etapa]}</div>
        ))}
        {motivos.map(m => (
          <>
            <div key={m} style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>{m}</div>
            {etapas.map(e => {
              const v = val(m, e.etapa)
              const clickavel = !!onCellClick && v > 0
              return (
                <div key={`${m}-${e.etapa}`}
                  onClick={clickavel ? () => onCellClick!(m, e.etapa) : undefined}
                  style={{
                    background: shade(v), color: color(v),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: v === 0 ? 400 : 600, fontVariantNumeric: 'tabular-nums',
                    padding: '10px 6px', borderRadius: 6, border: v === 0 ? '1px solid var(--ws-border)' : 'none',
                    minHeight: 32, cursor: clickavel ? 'pointer' : undefined,
                  }}>{v === 0 ? '·' : v}</div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────

interface DrawerState { title: string; subtitle: string; deals: FunnelRow[] }

export function AnalisePerda() {
  const {
    origem, brandKeys, periodMode, periodValues, ranges, range,
    fontes, subFontes, sdrs, closers, viewModes,
  } = useSharedFilters()

  const marcasSelecionadas = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is BrandDef => !!b),
    [brandKeys],
  )
  const todasSelecionadas = marcasSelecionadas.length === BRAND_LIST.length
  const scopeLabel = todasSelecionadas
    ? 'Consolidado'
    : marcasSelecionadas.length === 1
      ? marcasSelecionadas[0].label
      : marcasSelecionadas.length <= 3
        ? marcasSelecionadas.map(b => b.label).join(', ')
        : `${marcasSelecionadas.length} marcas selecionadas`
  const marcaFetch = marcasSelecionadas.length === 1 ? marcasSelecionadas[0].marca : undefined
  const marcasParaEscopo = useMemo(
    () => marcasSelecionadas.map(b => b.marca).filter((m): m is Marca => !!m),
    [marcasSelecionadas],
  )

  const { data: rows, error: rowsError } = useFunilVendas(origem, marcaFetch)

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes, sdrs, closers }),
    [origem, marcasParaEscopo, fontes, subFontes, sdrs, closers],
  )
  const scoped = useMemo(() => rows.filter(scope), [rows, scope])
  const win = useMemo(
    () => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))),
    [ranges],
  )

  const opcoes = useMemo(
    () => funilFilterOptions({
      rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers,
      cohort: viewModes.funnelView === 'cohort',
    }),
    [rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, viewModes.funnelView],
  )
  const marcasDisponiveis = useMemo(
    () => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key),
    [opcoes.marcas],
  )

  const multiPeriodo = periodMode !== 'dia' && periodValues.length > 1
  const subtitlePeriodo = multiPeriodo
    ? `${periodValues.length} ${PERIOD_LABEL_PLURAL[periodMode as Exclude<PeriodMode, 'dia'>]} selecionados`
    : `${shortMonth(range.start)} ${new Date(range.start + 'T12:00:00').getFullYear()}`
  const drawerSubtitle = `${scopeLabel} · ${subtitlePeriodo}`

  const perdas = useMemo(() => perdidos(scoped, win, viewModes), [scoped, win, viewModes])
  const kpis = useMemo(() => computeKpis(scoped, win, viewModes), [scoped, win, viewModes])
  const receitaPerdidaDeals = useMemo(() => dealsReceitaPerdida(perdas), [perdas])
  const motivos = useMemo(() => computeMotivos(perdas), [perdas])
  const evitavel = useMemo(() => computeEvitavel(perdas), [perdas])
  const etapas = useMemo(() => computeEtapas(perdas), [perdas])
  const cruz = useMemo(() => computeCruzamentos(perdas), [perdas])
  const resps = useMemo(() => computeResponsaveis(perdas), [perdas])
  const marcas = useMemo(() => computeMarcas(perdas, scoped, win, viewModes), [perdas, scoped, win, viewModes])

  const [motivoTab, setMotivoTab] = useState<'todos' | 'processo' | 'mercado'>('todos')
  const [respTab, setRespTab] = useState<'todos' | 'SDR' | 'Closer'>('todos')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const motivosFiltrados = motivoTab === 'todos' ? motivos : motivos.filter(m => m.categoria === motivoTab)
  const respFiltrados = respTab === 'todos' ? resps : resps.filter(r => r.camada === respTab)

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <PageTop
        title="Análise de Perda"
        titleAside={<OrigemToggle />}
        subtitle={drawerSubtitle}
        actions={
          <button
            onClick={() => downloadCsv(perdas, `analise-perda-${scopeLabel}-${range.start}-${range.end}`)}
            disabled={!perdas.length}
            title={!perdas.length ? 'Sem dados no período' : 'Exportar perdas em CSV'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
              color: 'var(--ws-text-primary)', fontSize: 13, cursor: perdas.length ? 'pointer' : 'not-allowed',
              boxShadow: 'var(--shadow-sm)', opacity: perdas.length ? 1 : 0.5,
            }}>
            <Download size={14} /> Exportar
          </button>
        }
      />

      <FilterBar
        marcasDisponiveis={marcasDisponiveis}
        fontesDisponiveis={opcoes.fontes}
        subFontesDisponiveis={opcoes.subFontes}
        sdrsDisponiveis={opcoes.sdrs}
        closersDisponiveis={opcoes.closers}
        hideVendasToggle
        hideContagemToggle
      />

      <QueryErrorBanner errors={[rowsError]} scope="Análise de Perda" />

      {/* Card dark 3 KPIs ── */}
      <div style={{
        display: 'flex', background: DARK_ACCENT, borderRadius: 18,
        boxShadow: 'var(--shadow-md)', color: '#fff', overflow: 'hidden', flexWrap: 'wrap',
      }}>
        <DarkKpi
          label="Negociações Perdidas"
          value={nf(kpis.perdidasDeals)}
          sub={`Taxa de perda de ${pct(kpis.taxaPerda)} sobre os MQLs do período`}
          onClick={() => setDrawer({ title: 'Negociações Perdidas', subtitle: drawerSubtitle, deals: perdas })}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
        <DarkKpi
          label="Perda Evitável"
          value={evitavel.qtdProcesso + evitavel.qtdMercado > 0 ? pct(evitavel.pctEvitavel, 0) : '—'}
          sub={`${nf(evitavel.qtdProcesso)} por falha de processo · ${nf(evitavel.qtdMercado)} por fit ou momento`}
          tone="amber"
          onClick={() => setDrawer({ title: 'Perda Evitável', subtitle: drawerSubtitle, deals: perdas })}
        />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
        <DarkKpi
          label="Receita Perdida"
          value={receitaPerdidaDeals.length > 0 ? money(kpis.receitaPerdida) : '—'}
          sub="Só deals que chegaram em Oportunidade ou depois"
          onClick={() => setDrawer({ title: 'Receita Perdida', subtitle: drawerSubtitle, deals: receitaPerdidaDeals })}
        />
      </div>

      {/* 4 KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        <KTile label="Taxa de perda"            value={pct(kpis.taxaPerda)} />
        <KTile label="Em aberto (pipeline)"     value={nf(kpis.emAberto)} />
        <KTile label="Leadtime médio até perda" value={`${kpis.leadtimeDias.toFixed(1)}d`} />
        <KTile label="Etapa que mais perde"     value={kpis.etapaTop ? STAGE_LABEL[kpis.etapaTop] : '—'} />
      </div>

      {/* Por que se perde ── */}
      <div style={{ margin: '32px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>Por que se perde</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Motivos de perda</div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>PROCESSO = endereçável pelo time · MERCADO = perfil/momento</div>
            </div>
            <div style={{
              display: 'inline-flex', borderRadius: 999, background: 'var(--ws-border)', padding: 2,
            }}>
              {(['todos', 'processo', 'mercado'] as const).map(t => (
                <button key={t}
                  onClick={() => setMotivoTab(t)}
                  style={{
                    padding: '4px 12px', fontSize: 11, textTransform: 'capitalize',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    background: motivoTab === t ? TEAL : 'transparent',
                    color: motivoTab === t ? '#fff' : 'var(--ws-text-secondary)', fontWeight: 500,
                  }}>{t}</button>
              ))}
            </div>
          </div>
          {motivosFiltrados.slice(0, 10).map(m => (
            <BarRow key={m.motivo} label={m.motivo}
              subLabel={m.categoria === 'processo' ? 'PROCESSO' : m.categoria === 'mercado' ? 'MERCADO' : undefined}
              value={m.qtd}
              max={motivosFiltrados[0]?.qtd ?? 1}
              color={m.categoria === 'mercado' ? TEAL : m.categoria === 'processo' ? RED : '#94A3B8'}
              right={<span>{m.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{pct(m.pct)}</span></span>}
              onClick={() => setDrawer({ title: m.motivo, subtitle: drawerSubtitle, deals: m.deals })}
            />
          ))}
          {motivosFiltrados.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem motivos {motivoTab !== 'todos' ? `de ${motivoTab} ` : ''}no período.</div>
          )}
        </SCard>

        <SCard>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 4 }}>Onde e quando se perde</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Volume por etapa e leadtime médio até a perda</div>
          {etapas.map(e => (
            <BarRow key={e.etapa} label={STAGE_LABEL[e.etapa]} value={e.qtd}
              max={Math.max(...etapas.map(x => x.qtd), 1)} color={DARK_ACCENT}
              right={<span>{e.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{e.leadtime > 0 ? `${e.leadtime.toFixed(1)}d` : '—'}</span></span>}
              onClick={() => setDrawer({ title: STAGE_LABEL[e.etapa], subtitle: drawerSubtitle, deals: e.deals })}
            />
          ))}
          {etapas.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem etapas mapeadas no período.</div>
          )}
        </SCard>
      </div>

      {/* Cruzamentos ── */}
      <div style={{ margin: '32px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 22, color: 'var(--ws-text-primary)' }}>Cruzamentos</div>
      </div>
      <SCard>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Motivo × Etapa</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>Onde cada motivo derruba a negociação. Célula mais escura = mais perdas</div>
        </div>
        {cruz.motivos.length > 0 && cruz.etapas.length > 0
          ? <Heatmap
              motivos={cruz.motivos} etapas={cruz.etapas} celulas={cruz.celulas}
              onCellClick={(motivo, etapa) => {
                const celula = cruz.celulas.find(c => c.motivo === motivo && c.etapa === etapa)
                if (celula && celula.qtd > 0) {
                  setDrawer({ title: `${motivo} · ${STAGE_LABEL[etapa]}`, subtitle: drawerSubtitle, deals: celula.deals })
                }
              }}
            />
          : <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Dados insuficientes pra heatmap.</div>}
      </SCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <SCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)' }}>Perda por responsável</div>
            <div style={{ display: 'inline-flex', borderRadius: 999, background: 'var(--ws-border)', padding: 2 }}>
              {(['todos', 'SDR', 'Closer'] as const).map(t => (
                <button key={t}
                  onClick={() => setRespTab(t)}
                  style={{
                    padding: '4px 12px', fontSize: 11,
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    background: respTab === t ? TEAL : 'transparent',
                    color: respTab === t ? '#fff' : 'var(--ws-text-secondary)', fontWeight: 500,
                  }}>{t === 'todos' ? 'Todos' : t}</button>
              ))}
            </div>
          </div>
          {respFiltrados.slice(0, 10).map(r => (
            <BarRow key={r.nome}
              label={r.nome}
              subLabel={r.camada !== '—' ? r.camada : undefined}
              value={r.qtd}
              max={respFiltrados[0]?.qtd ?? 1}
              color={r.camada === 'SDR' ? AMBER : r.camada === 'Closer' ? TEAL : '#94A3B8'}
              onClick={() => setDrawer({ title: r.nome, subtitle: drawerSubtitle, deals: r.deals })}
            />
          ))}
          {respFiltrados.length === 0 && (
            <div style={{ padding: '20px 0', color: 'var(--ws-text-secondary)', fontSize: 13 }}>Sem responsáveis mapeados.</div>
          )}
        </SCard>

        <SCard>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--ws-text-primary)', marginBottom: 4 }}>Perda por marca</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Volume absoluto e taxa sobre os MQLs da própria marca</div>
          {marcas.map(m => (
            <BarRow key={m.marca}
              label={m.marca}
              value={m.qtd}
              max={marcas[0]?.qtd ?? 1}
              color={BRAND_ACCENT[m.marca] ?? '#7F0C72'}
              right={<span>{m.qtd} <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, marginLeft: 4 }}>{m.pctSobreMql > 0 ? pct(m.pctSobreMql) : '—'}</span></span>}
              onClick={() => setDrawer({ title: m.marca, subtitle: drawerSubtitle, deals: m.deals })}
            />
          ))}
        </SCard>
      </div>

      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--ws-text-secondary)', textAlign: 'center' }}>
        Período: {fmtBR(range.start)} – {fmtBR(range.end)} · Fonte: <code>vw_funil_vendas</code>
      </div>

      <PerdaDealsDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer?.title ?? ''}
        subtitle={drawer?.subtitle ?? ''}
        deals={drawer?.deals ?? []}
        accent={TEAL}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verificar com build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

Esperado: build passa sem erro de tipo nem import não usado. Se `tsc -b` acusar algo, é quase certo um import sobrando ou faltando — comparar contra a lista de símbolos realmente usados no JSX/lógica acima antes de adicionar nada novo.

- [ ] **Step 3: Rodar a suíte de testes inteira (nada de UI quebra lib)**

```bash
cd ~/ws-dashboard-build && npx vitest run
```

Esperado: todos os testes passam (esta tarefa não toca `src/lib/*.ts`).

- [ ] **Step 4: Conferir por SQL que `perdidasDeals` bate com a trava usada**

Rodar contra o Supabase de Expansão (mesma trava que `computeKpis` aplica: `status_atual='Perdido'` e `data_perdido` na janela), pro mês corrente, Consolidado, Inbound:

```sql
select count(*) from vw_funil_vendas
where origem_comercial = 'Inbound'
  and status_atual = 'Perdido'
  and data_perdido >= date_trunc('month', now())
  and data_perdido <= now();
```

Comparar esse número com o KPI "Negociações Perdidas" que apareceria na tela pro mesmo recorte (mês corrente, Consolidado, Inbound — os padrões de `SharedFiltersContext`). Devem bater exatamente — é a mesma trava (`isLoss`/`rowsInLoss`).

- [ ] **Step 5: Commitar**

```bash
git add src/pages/AnalisePerda.tsx
git commit -m "feat(vendas): Análise de Perda migra pro stack da Visão Macro

Troca usePerdas/vw_perdas + usePerformanceEquipe/vw_funil_compat (com
filtros locais) por useFunilVendas/vw_funil_vendas + SharedFiltersContext
+ FilterBar — mesma base de dados e mesmos filtros de Visão Macro/
Performance, incluindo o filtro de SDR/Closer (PR #72). Lógica de
agregação vem de perdaRows.ts (extraída e testada nas tasks
anteriores). KPI novo: Receita Perdida. Popup PerdaDealsDrawer em
quase todo elemento clicável: as 3 KPIs escuras, cada linha de
motivo/etapa/responsável/marca, e cada célula do heatmap. Preserva os
2 controles próprios da aba (Processo×Mercado, SDR×Closer por camada)
sem equivalente na FilterBar compartilhada.

Rota, arquivo e nome do componente inalterados.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Atualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada (documentação).
- Produces: nada consumido por outra tarefa — é o registro histórico exigido pelo próprio `CLAUDE.md` ("Ao terminar qualquer mudança... registre em 'Histórico de mudanças'").

- [ ] **Step 1: Remover as 2 pendências resolvidas da seção 8**

Em `CLAUDE.md`, na seção `## 8. Pendências conhecidas`, remover estas duas linhas (a lista continua com as demais pendências intactas):

```
- [ ] **Análise de Perda** ainda lê `vw_marketing_funil` (via `vw_funil_compat`/`usePerformanceEquipe`) e tem filtros próprios. Migrar para `vw_funil_vendas` + `SharedFiltersContext`. (Performance foi migrada em 2026-09-03.)
```

```
- [ ] **Motivos de perda hardcoded** em `src/constants/motivosPerda.ts` (listas de string, frágil a acento)
```

- [ ] **Step 2: Adicionar entrada no topo da seção 9 (Histórico de mudanças)**

Inserir logo após o cabeçalho `## 9. Histórico de mudanças`, antes da entrada mais recente existente:

```markdown
### 2026-09-04 (3) — Análise de Perda migra pro stack da Visão Macro; motivos de perda deixam de ser frágeis a acento

Última das 3 abas de Vendas ainda na base antiga (pendência da seção 8).
Pedido do Junior: validar se os números batem com Visão Macro/Performance,
trazer os mesmos filtros, e melhorar a aba com as ideias das outras duas
(popup de deals).

**Validação antes de mexer no código.** Cruzando `vw_perdas` (evento) com
`vw_funil_vendas` (`status_atual='Perdido'`) em agosto/2026 direto no banco:
947 deals distintos vs. 918 — a diferença é quase toda **deal de teste** que
`usePerdas.ts` não filtrava direito (só excluía `nome_negociacao ilike
%teste%`, não motivo de teste tipo `"[NOVO] Teste"`/`"Registro de teste -
apagar"`, nem funis legados fora de `SDR`/`Closer`/`Prospecção
Ativa`/`Odonto Scale`). `computeMotivos`/`computeKpis` da página antiga
também não excluíam a categoria `ignorar` (teste/duplicado) — contava cheio
em "Negociações Perdidas" e aparecia como barra cinza no ranking de motivos.

**Fonte de dados: `vw_funil_vendas`, não `vw_perdas`.** `metrics.ts` já
tinha `isLoss`/`rowsInLoss` (a mesma trava do Fechamento, por
`status_atual === 'Perdido'`) — usada até agora só pelo card "Tempo de
ciclo" da Visão Macro. Virou a base inteira da Análise de Perda. **Zero
mudança de banco**: `vw_funil_vendas` já tinha `motivo_perda`,
`data_perdido`, `valor_contrato`, `fonte_macro`, `sub_fonte`, `nome_sdr`/
`nome_closer`, `origem_comercial` — os mesmos campos que Visão Macro/
Performance já liam. `vw_perdas`/`usePerdas.ts` e `vw_funil_compat`/
`usePerformanceEquipe.ts` ficam órfãos (não deletados — mesmo padrão que
`usePerformanceEquipe` já tinha ficado após a migração da Performance em
03/09, pro caso de algo voltar a precisar deles).

**Lógica extraída pra `src/lib/perdaRows.ts`, testada.** As agregações
(`computeKpis`/`computeMotivos`/`computeEvitavel`/`computeEtapas`/
`computeCruzamentos`/`computeResponsaveis`/`computeMarcas`) viviam inline no
`.tsx`, sem nenhum teste. "Etapa que mais perde" e a etapa de cada linha do
card "Onde e quando se perde" usam `currentStage(row)` — de graça, herdam a
trava "Reunião Agendada SQL só conta no funil do Closer", que a lógica
antiga (baseada em `vw_perdas.etapa_canonica`) não aplicava. "Perda por
responsável" usa `stageOwnerRole` da etapa onde o deal foi perdido — não
presume que só `nome_sdr` OU `nome_closer` vem preenchido: verificado no
banco, 578 de 4.757 deals perdidos têm os dois campos preenchidos ao mesmo
tempo (passaram pelas duas camadas antes de perder).

**KPI novo: Receita Perdida.** Soma `valor_contrato` só dos perdidos com
`data_oportunidade` preenchida — por pedido do Junior, não faz sentido
contar como receita perdida um deal que nunca teve proposta de valor real
(ex.: perdido ainda em Diagnóstico, sem produto/valor definido).

**Filtros: `FilterBar` inteira.** Marca multi-seleção, Período multi +
granularidade, Fonte/Sub-fonte cruzados, SDR/Closer, "Deals criados no
período". Preservados os 2 controles que só existem nesta aba — Processo×
Mercado (motivo) e SDR×Closer por camada (responsável) — sem equivalente na
barra compartilhada. **Fora**: toggle Contagem (Passagens não se aplica a
evento terminal único — perda é trava de snapshot, igual Fechamento) e
toggle Vendas Negócios×Unidades (não migra como toggle; virou o KPI de
Receita Perdida). `FilterBar` ganhou `hideVendasToggle`/`hideContagemToggle`
(opcionais, default mostra — Visão Macro e Performance não mudam) pra
esconder os dois nesta página.

**Filtro de SDR/Closer herdado, sem trabalho extra de biblioteca.** Outra
sessão implementou e mergeou `sdrs`/`closers` em `SharedFiltersContext` +
`FilterBar` + `funilFilterOptions` (PR #72, mesmo dia) enquanto esta
migração estava em design, de propósito deixando Análise de Perda de fora
pra esta sessão absorver — só consumiu o que já existia em `main`.

**Popups em quase tudo.** Componente novo `PerdaDealsDrawer.tsx` (mesmo
padrão de `SimpleDealsDrawer`, colunas de perda: Negociação/Marca/Motivo/
Etapa perdida/Responsável/Valor/Data) — clicável nas 3 KPIs escuras, cada
linha de Motivo/Etapa/Responsável/Marca, e cada célula do heatmap Motivo×
Etapa.

**`motivosPerda.ts` deixa de ser frágil a acento** (pendência da seção 8
removida). `classificarMotivo` normaliza NFD (remove diacríticos), colapsa
espaço ao redor de "/" e lowercase antes do lookup — as 3 variantes de "Sem
interesse / não quis conversa" e os 2 espaçamentos de "Sem budget/momento"
(hoje 2 entradas separadas por causa disso) viram 1 entrada só.
Comportamento de `classificarMotivo` (assinatura, retorno) não muda.

Verificado: `npm run build` (tsc -b) + `npx vitest run` via
`~/ws-dashboard-build`. App exige login — não visto renderizado nesta
sessão; `perdidasDeals` conferido por SQL contra `vw_funil_vendas` real
(mesma trava `isLoss` da Visão Macro).

Spec: `docs/superpowers/specs/2026-09-04-analise-perda-migracao-visao-macro-design.md`
```

- [ ] **Step 2: Commitar**

```bash
git add CLAUDE.md
git commit -m "docs(vendas): registra migração da Análise de Perda no CLAUDE.md

Remove as 2 pendências resolvidas da seção 8 (migração da aba,
motivosPerda frágil a acento) e adiciona entrada no histórico da
seção 9 com o resumo da validação e das decisões.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Verificação final, PR e deploy

**Files:** nenhum (só verificação + git/gh).

**Interfaces:** N/A — última tarefa do plano.

- [ ] **Step 1: Build e suíte completa, do zero, uma última vez**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build && npx vitest run
```

Esperado: build limpo, todos os testes (os novos de `perdaRows.test.ts`/`motivosPerda.test.ts` + toda a suíte pré-existente) passam.

- [ ] **Step 2: Conferir `git status` e `git log` da branch antes de subir**

```bash
git status --short
git log --oneline main..HEAD
```

Esperado: nenhuma mudança não commitada; o log mostra o spec (já commitado antes deste plano) + as 9 tarefas acima (Tasks 1-9), cada uma seu próprio commit.

- [ ] **Step 3: Push e abertura do PR**

```bash
git push -u origin feat/analise-perda-migracao
gh pr create --base main --title "feat(vendas): Análise de Perda migra pro stack da Visão Macro" --body "$(cat <<'EOF'
## Resumo

- Migra a Análise de Perda de `usePerdas`/`vw_perdas` + `usePerformanceEquipe`/`vw_funil_compat` (filtros locais) para `useFunilVendas`/`vw_funil_vendas` + `SharedFiltersContext` + `FilterBar` — mesma base e mesmos filtros de Visão Macro/Performance.
- Lógica de agregação extraída para `src/lib/perdaRows.ts`, testada (zero cobertura antes).
- KPI novo: Receita Perdida (só deals que chegaram em Oportunidade ou depois).
- Popup de deals (`PerdaDealsDrawer`) em quase todo elemento clicável.
- `motivosPerda.ts` deixa de ser frágil a acento/caixa/espaçamento.
- Sem nenhuma mudança de banco.

## Validado

- Cruzamento `vw_perdas` × `vw_funil_vendas` direto no Supabase de Expansão (ver spec e entrada do CLAUDE.md) — a divergência hoje é quase toda deal de teste mal filtrado.
- `npm run build` (tsc -b) + `npx vitest run` via `~/ws-dashboard-build`.
- `perdidasDeals` conferido por SQL contra `vw_funil_vendas` real, mesma trava `isLoss`.

## Fora de escopo

- Nenhuma view/tabela do banco tocada.
- `usePerdas.ts`/`usePerformanceEquipe.ts` não deletados (ficam órfãos).
- Rota, arquivo e nome do componente inalterados.

Spec: `docs/superpowers/specs/2026-09-04-analise-perda-migracao-visao-macro-design.md`
Plano: `docs/superpowers/plans/2026-09-04-analise-perda-migracao-visao-macro.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Aguardar o CI e conferir o status**

```bash
gh pr checks --watch
```

Esperado: todos os checks passam. Se algum falhar, investigar a causa raiz (não usar `--no-verify` nem pular checagem) antes de seguir.

- [ ] **Step 5: Merge — dispara o deploy automático**

```bash
gh pr merge --squash --delete-branch
```

Esperado: merge feito na `main`; o deploy automático (build + rsync pra VPS) roda em seguida, ~45s conforme `CLAUDE.md` §6.

- [ ] **Step 6: Confirmar o deploy**

```bash
gh run list --branch main --limit 3
```

Esperado: o workflow de deploy mais recente (disparado pelo merge) aparece com status de sucesso. Reportar ao usuário o link do PR mergeado e a confirmação de que o deploy rodou.
