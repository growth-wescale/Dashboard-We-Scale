# Linha do Tempo do Deal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela nova nas abas de Vendas que mostra a história de um deal como uma "Pista" (chevrons por fase + nós por etapa + toques e reuniões), com zoom semântico Macro · Etapas · Micro, e uma "casa" com os filtros das outras abas pra achar o deal.

**Architecture:** Camada pura em `src/lib/timeline/` normaliza 3 fontes (`deal_eventos`, `db_tarefas_sdr`, `DB_Reunioes_MeetRox`) num modelo `Momento`, monta `Timeline` (ciclos, fases, trechos, desvios) e calcula o layout SVG (`layoutPista`) — tudo testado com vitest, sem React. Hooks buscam por `id_deal` (4 consultas em paralelo, falha parcial tolerada). Componentes em `src/components/timeline/` só desenham. A casa reaproveita `useSharedFilters` + `useFunilVendas` + `FilterBar` como Análise de Perda.

**Tech Stack:** React 19 + TypeScript + Vite + SVG à mão (sem d3) + `lucide-react` + Supabase de Expansão (`supabaseVendas`) + vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-linha-do-tempo-deal-design.md`

## Global Constraints

- Trabalhar **só no worktree** `~/ws-dashboard-worktree-timeline` (branch `feat/linha-do-tempo-deal`). A pasta do OneDrive tem outra sessão ativa; nunca `checkout` lá.
- Build de verdade é `npm run build` (`tsc -b`, com `noUnusedLocals`/`noUnusedParameters`) — `tsc --noEmit` não basta. Rodar `npx vitest run` e `npx oxlint` nos arquivos tocados antes de cada commit.
- Zero DDL no banco: índices em `deal_eventos.id_deal`, `db_tarefas_sdr.deal_id`, `DB_Reunioes_MeetRox.crm_deal_id`/`id_deal` já existem (conferido 15/09).
- Nunca selecionar `transcription`, `api_payload`, `associations_raw`, `phrase_trackers`, `evaluators` de `DB_Reunioes_MeetRox`.
- Reunião liga ao deal por `coalesce(id_deal, crm_deal_id)` — `id_deal` só existe em 8 de 1.550 linhas.
- Regras existentes que a camada **usa e nunca reimplementa**: `resolveStage`, `STAGE_ORDER`, `STAGE_LABEL`, `STAGE_DATE_FIELD`, `stageOwnerRole`, `buildScopeFilter`, `toWindow`/`isInWindow` (`src/lib/metrics.ts`); `toLocalDate`, `fmtBR` (`dateUtils.ts`); `fmtDuracao` (`dealDrawerShared.tsx`); `classificarMotivo` (`src/constants/motivosPerda.ts`); `normalizeMarcaRaw`, `findBrandByMarca`, `marcaLabel`, `BRAND_ACCENT` (`constants/brands.ts`); `rdDealUrl` (`lib/rd.ts`).
- Cores: MQL `#33032D`, SDR `#7E0E70`, Closer `#2ABCB5`, ganho `#E0A928`, perda `#E0506B`, no-show `#F2A93B`, etapa desconhecida `#9CA3AF`.
- Copy em pt-BR; commits em pt-BR, Conventional Commits, rodapé `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Aba nova precisa de linha em `ABAS` (`src/lib/permissoes.ts`) **e** de permissão nos papéis no Supabase de Marketing — DDL/DML lá é barrada pelo classificador: gerar script em `docs/sql/` e mandar pro Junior rodar no SQL Editor.
- Datas de tarefa/reunião/evento chegam como `timestamptz` ISO; agrupamento por dia sempre via `toLocalDate` (Brasília).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/timeline/tipos.ts` | tipos `Momento`, `MomentoBruto`, `Timeline`, `Fase`, `Trecho`, `Desfecho`, metas por tipo |
| `src/lib/timeline/eventos.ts` (+ `.test.ts`) | `momentosDeEventos(rows)` — `deal_eventos` → `MomentoBruto[]` |
| `src/lib/timeline/tarefas.ts` (+ `.test.ts`) | `momentosDeTarefas(rows)` — `db_tarefas_sdr` → `MomentoBruto[]` |
| `src/lib/timeline/reunioes.ts` (+ `.test.ts`) | `momentosDeReunioes(rows)` — `DB_Reunioes_MeetRox` → `MomentoBruto[]` |
| `src/lib/timeline/montar.ts` (+ `.test.ts`) | `montarTimeline(brutos, cabecalho, agora)` — ciclos, fusão de handoff, camadas, desvios, trechos, fases, desfecho |
| `src/lib/timeline/fasesDaLinha.ts` (+ `.test.ts`) | `fasesDaLinha(row, agora)` — fases só das datas de `vw_funil_vendas` (cartão Macro da casa) |
| `src/lib/timeline/layout.ts` (+ `.test.ts`) | `layoutPista(timeline, viewport, nivel)` — geometria pronta pro SVG |
| `src/lib/timeline/zoom.ts` (+ `.test.ts`) | `nivelDeZoom`, `kAjuste`, `clampX0`, constantes de zoom |
| `src/lib/funilFilterOptions.ts` (+ `.test.ts`) | ganha `dealNaJanela(row, win, cohort)` exportado |
| `src/lib/rd.ts` (+ `rd.test.ts`) | ganha `parseIdDeal(texto)` |
| `src/hooks/useDealTimeline.ts` | 4 consultas em paralelo por deal |
| `src/hooks/useZoomPan.ts` | estado `{k, x0}` + wheel/pinch/arrasto/botões |
| `src/components/timeline/iconesEtapa.tsx` | mapa etapa/tipo → ícone lucide |
| `src/components/timeline/PistaCanvas.tsx` | SVG |
| `src/components/timeline/MomentoPopover.tsx` | cartão do clique |
| `src/components/timeline/DealHeader.tsx` | cabeçalho + KPIs |
| `src/components/timeline/ZoomControls.tsx`, `TimelineLegend.tsx` | controles e legenda |
| `src/components/timeline/DealCardMacro.tsx` | cartão da lista da casa |
| `src/pages/LinhaDoTempo.tsx` | casa (filtros + busca + lista) |
| `src/pages/LinhaDoTempoDeal.tsx` | tela do deal |
| `src/App.tsx`, `src/components/AppLayout.tsx`, `src/lib/permissoes.ts` | rota, menu, permissão |
| 4 drawers em `src/components/ui/` | ícone de atalho |
| `docs/sql/2026-09-16-acesso-linha-do-tempo.sql` | permissão da aba nos papéis (Junior roda) |
| `CLAUDE.md` | seção 5 (arquitetura) + histórico |

---

### Task 1: Ambiente do worktree + tipos do modelo

**Files:**
- Create: `src/lib/timeline/tipos.ts`

**Interfaces:**
- Produces: todos os tipos abaixo; os demais tasks importam de `@/lib/timeline/tipos`.

- [ ] **Step 1: Preparar o worktree (fora do OneDrive)**

```bash
cp ~/ws-dashboard-build/.env ~/ws-dashboard-worktree-timeline/.env
cd ~/ws-dashboard-worktree-timeline && git status --short && git branch --show-current
npm install
npm run build && npx vitest run
```
Expected: branch `feat/linha-do-tempo-deal`, build OK, 317+ testes passando (baseline).

- [ ] **Step 2: Criar os tipos**

```ts
// src/lib/timeline/tipos.ts
import type { StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

export type TipoMomento =
  | 'etapa' | 'no_show' | 'perda' | 'ganho' | 'retomada'
  | 'troca_responsavel' | 'mudanca_funil' | 'mudanca_campo'
  | 'tarefa' | 'reuniao'

/** Fase do nível Macro. 'Reaberto' = intervalo entre perda e retomada (reciclagem). */
export type Camada = 'MQL' | 'SDR' | 'Closer' | 'Desfecho'
export type TipoFase = 'MQL' | 'SDR' | 'Closer' | 'Reaberto'

export type Desvio = 'voltou' | 'pulou' | 'no_show' | 'trocou_funil' | 'perdeu' | 'reciclou'

export type TipoTarefa = 'call' | 'whatsapp' | 'email' | 'task' | 'lunch' | 'meeting' | 'outro'
export type StatusTarefa = 'concluida_no_prazo' | 'concluida_atrasada' | 'atrasada' | 'em_aberto'

export interface MetaTarefa {
  kind: 'tarefa'
  tipoTarefa: TipoTarefa
  status: StatusTarefa
  concluida: boolean
  atrasada: boolean
  prazo: string | null
  feitaEm: string | null
  /** Dias de atraso (feitaEm − prazo, ou agora − prazo se aberta). null quando não atrasada. */
  atrasoDias: number | null
  assunto: string
  notas: string | null
}

export interface SecaoResumo { titulo: string; itens: string[] }
export interface RespostaScorecard { categoria: string; pergunta: string; resposta: string }

export interface MetaReuniao {
  kind: 'reuniao'
  duracaoMin: number | null
  /** ai_score (0–1) × 10, 1 casa. */
  notaIA: number | null
  scorecard: string | null
  tipoReuniao: string | null
  resumo: SecaoResumo[]
  respostas: RespostaScorecard[]
  url: string | null
  participantes: string[]
}

export interface MetaEtapa {
  kind: 'etapa'
  etapaAnterior: string | null
  funil: string | null
  idEtapa: string | null
}

export interface MetaCampo { kind: 'campo'; campo: string; de: string | null; para: string | null }
export interface MetaPerda { kind: 'perda'; motivo: string | null; anotacao: string | null }

export type MetaMomento = MetaTarefa | MetaReuniao | MetaEtapa | MetaCampo | MetaPerda

/** O que os normalizadores produzem — sem camada/ciclo/desvio, que só existem depois de montar. */
export interface MomentoBruto {
  id: string
  idDeal: string
  instante: Date
  tipo: TipoMomento
  etapa?: StageKey | null
  /** Nome cru da etapa quando `resolveStage` não a conhece. */
  etapaCrua?: string
  ator: string | null
  titulo: string
  detalhe?: string
  meta?: MetaMomento
}

export interface Momento extends MomentoBruto {
  camada: Camada
  ciclo: number
  desvio?: Desvio
}

export interface Fase {
  tipo: TipoFase
  inicio: Date
  fim: Date
  duracaoDias: number
  /** Nome de quem estava com o deal na fase (último `ator` de etapa dentro dela). */
  ator: string | null
  etapas: number
  toques: number
  atrasados: number
  noShows: number
  reunioes: number
}

/** Intervalo entre dois nós de etapa consecutivos (ou do último até o fim). */
export interface Trecho {
  deId: string
  ateId: string | null
  inicio: Date
  fim: Date
  duracaoDias: number
  camada: Camada
  ciclo: number
  toques: number
  atrasados: number
  reunioes: number
  /** ids dos momentos micro (tarefa/reunião/troca/mudança) dentro do trecho. */
  momentos: string[]
}

export interface Desfecho {
  tipo: 'ganho' | 'perda' | 'em_andamento'
  instante: Date
  momentoId: string | null
}

export interface DealCabecalho {
  row: FunnelRow
  /** Todas as linhas do deal (1 por ciclo), ordenadas por ciclo. */
  ciclos: FunnelRow[]
}

export interface Timeline {
  idDeal: string
  inicio: Date
  fim: Date
  momentos: Momento[]
  /** Só os nós que viram círculo na pista: etapa, no_show, perda, ganho, retomada. */
  nos: Momento[]
  trechos: Trecho[]
  fases: Fase[]
  desfecho: Desfecho
  totais: { toques: number; atrasados: number; reunioes: number; noShows: number; diasNoFunil: number }
}

export const NOS_DE_ETAPA: ReadonlySet<TipoMomento> = new Set(['etapa', 'no_show', 'perda', 'ganho', 'retomada'])
export const MICRO: ReadonlySet<TipoMomento> = new Set(['tarefa', 'reuniao', 'troca_responsavel', 'mudanca_funil', 'mudanca_campo'])

export const MS_DIA = 86_400_000
export const diasEntre = (a: Date, b: Date): number => Math.max(0, (b.getTime() - a.getTime()) / MS_DIA)
```

- [ ] **Step 3: Build e commit**

```bash
cd ~/ws-dashboard-worktree-timeline && npm run build && git add src/lib/timeline/tipos.ts && git commit -m "feat(vendas): tipos do modelo de momento da Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `momentosDeEventos` — `deal_eventos` → momentos

**Files:**
- Create: `src/lib/timeline/eventos.ts`, `src/lib/timeline/eventos.test.ts`

**Interfaces:**
- Consumes: `resolveStage`, `STAGE_LABEL` de `@/lib/metrics`; tipos do Task 1.
- Produces: `interface DealEventoRow`, `function momentosDeEventos(rows: DealEventoRow[]): MomentoBruto[]`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/eventos.test.ts
import { describe, it, expect } from 'vitest'
import { momentosDeEventos, type DealEventoRow } from '@/lib/timeline/eventos'

const ev = (over: Partial<DealEventoRow>): DealEventoRow => ({
  id_evento: 1, id_deal: 'd1', tipo_evento: 'mudanca_etapa', nome_funil: 'SDR',
  id_etapa: 'e1', nome_etapa: 'Novo MQL', nome_etapa_anterior: null, responsavel: 'Xayane',
  valor_anterior: null, valor_novo: null, data_evento: '2026-08-06T12:00:00Z',
  motivo_perda: null, anotacao_perda: null, ...over,
})

describe('momentosDeEventos', () => {
  it('mudança de etapa conhecida vira etapa resolvida com rótulo do catálogo', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'Negociação SAL (7 dias)' })])
    expect(m.tipo).toBe('etapa')
    expect(m.etapa).toBe('SAL')
    expect(m.titulo).toBe('SAL')
    expect(m.etapaCrua).toBeUndefined()
    expect(m.ator).toBe('Xayane')
    expect(m.id).toBe('evento:1')
  })

  it('etapa crua desconhecida não some: vira nó cinza com o nome cru', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'Pré-Contrato enviado' })])
    expect(m.tipo).toBe('etapa')
    expect(m.etapa).toBeNull()
    expect(m.etapaCrua).toBe('Pré-Contrato enviado')
    expect(m.titulo).toBe('Pré-Contrato enviado')
  })

  it('No Show vira tipo no_show', () => {
    const [m] = momentosDeEventos([ev({ nome_etapa: 'No Show' })])
    expect(m.tipo).toBe('no_show')
    expect(m.etapa).toBe('No Show')
  })

  it('perda, ganho, retomada, troca, funil e campo', () => {
    const ms = momentosDeEventos([
      ev({ id_evento: 2, tipo_evento: 'perda', motivo_perda: 'Sem budget', anotacao_perda: 'x' }),
      ev({ id_evento: 3, tipo_evento: 'ganho' }),
      ev({ id_evento: 4, tipo_evento: 'deal_retomado' }),
      ev({ id_evento: 5, tipo_evento: 'troca_responsavel', valor_anterior: 'Sarah', valor_novo: 'Thiago' }),
      ev({ id_evento: 6, tipo_evento: 'mudanca_funil', valor_anterior: 'SDR', valor_novo: 'Closer' }),
      ev({ id_evento: 7, tipo_evento: 'mudanca_fonte_macro', valor_anterior: null, valor_novo: 'Inbound' }),
    ])
    expect(ms.map(m => m.tipo)).toEqual(['perda', 'ganho', 'retomada', 'troca_responsavel', 'mudanca_funil', 'mudanca_campo'])
    expect(ms[0].meta).toEqual({ kind: 'perda', motivo: 'Sem budget', anotacao: 'x' })
    expect(ms[3].detalhe).toBe('Sarah → Thiago')
    expect(ms[5].titulo).toBe('Fonte Macro alterada')
    expect(ms[5].detalhe).toBe('— → Inbound')
  })

  it('descarta deal_deletado, tipo desconhecido e data inválida', () => {
    const ms = momentosDeEventos([
      ev({ id_evento: 8, tipo_evento: 'deal_deletado' }),
      ev({ id_evento: 9, tipo_evento: 'algo_novo' }),
      ev({ id_evento: 10, data_evento: 'não é data' }),
    ])
    expect(ms).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ~/ws-dashboard-worktree-timeline && npx vitest run src/lib/timeline/eventos.test.ts`
Expected: FAIL — módulo `@/lib/timeline/eventos` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/eventos.ts
import { resolveStage, STAGE_LABEL } from '@/lib/metrics'
import type { MomentoBruto } from './tipos'

/** Linha de `deal_eventos` (só as colunas que o hook seleciona). */
export interface DealEventoRow {
  id_evento: number
  id_deal: string
  tipo_evento: string
  nome_funil: string | null
  id_etapa: string | null
  nome_etapa: string | null
  nome_etapa_anterior: string | null
  responsavel: string | null
  valor_anterior: string | null
  valor_novo: string | null
  data_evento: string
  motivo_perda: string | null
  anotacao_perda: string | null
}

const CAMPO_LABEL: Record<string, string> = {
  mudanca_marca: 'Marca',
  mudanca_fonte_macro: 'Fonte Macro',
}

const seta = (de: string | null, para: string | null) => `${de ?? '—'} → ${para ?? '—'}`

/**
 * `deal_eventos` → momentos brutos. `deal_deletado` e tipos desconhecidos são
 * descartados. Etapa que `resolveStage` não conhece NÃO some — vira nó com o
 * nome cru (`etapaCrua`), pra história do deal não ter buraco.
 */
export function momentosDeEventos(rows: DealEventoRow[]): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const instante = new Date(r.data_evento)
    if (Number.isNaN(instante.getTime())) continue
    const base = { id: `evento:${r.id_evento}`, idDeal: r.id_deal, instante, ator: r.responsavel ?? null }
    const metaEtapa = { kind: 'etapa' as const, etapaAnterior: r.nome_etapa_anterior, funil: r.nome_funil, idEtapa: r.id_etapa }

    switch (r.tipo_evento) {
      case 'mudanca_etapa': {
        const etapa = resolveStage(r.nome_etapa)
        const crua = r.nome_etapa?.trim() || 'Etapa desconhecida'
        if (etapa === 'No Show') {
          out.push({ ...base, tipo: 'no_show', etapa, titulo: STAGE_LABEL['No Show'], detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        } else if (etapa) {
          out.push({ ...base, tipo: 'etapa', etapa, titulo: STAGE_LABEL[etapa], detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        } else {
          out.push({ ...base, tipo: 'etapa', etapa: null, etapaCrua: crua, titulo: crua, detalhe: r.nome_funil ?? undefined, meta: metaEtapa })
        }
        break
      }
      case 'perda':
        out.push({ ...base, tipo: 'perda', titulo: 'Perdido', detalhe: r.motivo_perda ?? undefined,
          meta: { kind: 'perda', motivo: r.motivo_perda, anotacao: r.anotacao_perda } })
        break
      case 'ganho':
        out.push({ ...base, tipo: 'ganho', titulo: 'Ganho' })
        break
      case 'deal_retomado':
        out.push({ ...base, tipo: 'retomada', titulo: 'Reaberto', detalhe: r.nome_etapa ?? undefined })
        break
      case 'troca_responsavel':
        out.push({ ...base, tipo: 'troca_responsavel', titulo: 'Troca de responsável', detalhe: seta(r.valor_anterior, r.valor_novo),
          meta: { kind: 'campo', campo: 'Responsável', de: r.valor_anterior, para: r.valor_novo } })
        break
      case 'mudanca_funil':
        out.push({ ...base, tipo: 'mudanca_funil', titulo: 'Mudou de funil', detalhe: seta(r.valor_anterior, r.valor_novo ?? r.nome_funil),
          meta: { kind: 'campo', campo: 'Funil', de: r.valor_anterior, para: r.valor_novo ?? r.nome_funil } })
        break
      case 'mudanca_marca':
      case 'mudanca_fonte_macro':
        out.push({ ...base, tipo: 'mudanca_campo', titulo: `${CAMPO_LABEL[r.tipo_evento]} alterada`, detalhe: seta(r.valor_anterior, r.valor_novo),
          meta: { kind: 'campo', campo: CAMPO_LABEL[r.tipo_evento], de: r.valor_anterior, para: r.valor_novo } })
        break
      default:
        break
    }
  }
  return out
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/timeline/eventos.test.ts` — Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/eventos.ts src/lib/timeline/eventos.test.ts
git commit -m "feat(vendas): normaliza deal_eventos em momentos da Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: `momentosDeTarefas` — `db_tarefas_sdr` → momentos

**Files:**
- Create: `src/lib/timeline/tarefas.ts`, `src/lib/timeline/tarefas.test.ts`

**Interfaces:**
- Produces: `interface TarefaRow`, `function momentosDeTarefas(rows: TarefaRow[], agora: Date): MomentoBruto[]`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/tarefas.test.ts
import { describe, it, expect } from 'vitest'
import { momentosDeTarefas, type TarefaRow } from '@/lib/timeline/tarefas'

const AGORA = new Date('2026-08-20T12:00:00Z')
const t = (over: Partial<TarefaRow>): TarefaRow => ({
  task_id: 't1', subject: 'Ligacao 2 - Viva', type: 'call', notes: 'Tarefa da cadencia', done: true,
  status_calc: 'concluida_no_prazo', prazo: '2026-08-08T18:00:00Z', done_date: '2026-08-08T10:22:00Z',
  user_name: 'Xayane', deal_id: 'd1', ...over,
})

describe('momentosDeTarefas', () => {
  it('tarefa concluída usa done_date como instante e não é atrasada', () => {
    const [m] = momentosDeTarefas([t({})], AGORA)
    expect(m.tipo).toBe('tarefa')
    expect(m.id).toBe('tarefa:t1')
    expect(m.instante.toISOString()).toBe('2026-08-08T10:22:00.000Z')
    expect(m.ator).toBe('Xayane')
    expect(m.titulo).toBe('Ligacao 2 - Viva')
    expect(m.meta).toMatchObject({ kind: 'tarefa', tipoTarefa: 'call', concluida: true, atrasada: false, atrasoDias: null })
  })

  it('concluída atrasada mede o atraso entre prazo e conclusão', () => {
    const [m] = momentosDeTarefas([t({ status_calc: 'concluida_atrasada', prazo: '2026-08-06T18:00:00Z', done_date: '2026-08-08T18:00:00Z' })], AGORA)
    expect(m.meta).toMatchObject({ atrasada: true, atrasoDias: 2 })
  })

  it('aberta e atrasada usa o prazo como instante e mede atraso até agora', () => {
    const [m] = momentosDeTarefas([t({ done: false, done_date: null, status_calc: 'atrasada', prazo: '2026-08-18T12:00:00Z' })], AGORA)
    expect(m.instante.toISOString()).toBe('2026-08-18T12:00:00.000Z')
    expect(m.meta).toMatchObject({ concluida: false, atrasada: true, atrasoDias: 2 })
  })

  it('tipo desconhecido vira outro; sem prazo nem conclusão é descartada', () => {
    const ms = momentosDeTarefas([
      t({ task_id: 'a', type: 'visita' }),
      t({ task_id: 'b', prazo: null, done_date: null }),
    ], AGORA)
    expect(ms).toHaveLength(1)
    expect(ms[0].meta).toMatchObject({ tipoTarefa: 'outro' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/timeline/tarefas.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/tarefas.ts
import { MS_DIA, type MomentoBruto, type StatusTarefa, type TipoTarefa } from './tipos'

/** Linha de `db_tarefas_sdr` (só as colunas que o hook seleciona). */
export interface TarefaRow {
  task_id: string
  subject: string | null
  type: string | null
  notes: string | null
  done: boolean | null
  status_calc: string | null
  prazo: string | null
  done_date: string | null
  user_name: string | null
  deal_id: string | null
}

const TIPOS: ReadonlySet<string> = new Set(['call', 'whatsapp', 'email', 'task', 'lunch', 'meeting'])
const STATUS: ReadonlySet<string> = new Set(['concluida_no_prazo', 'concluida_atrasada', 'atrasada', 'em_aberto'])

const parse = (s: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * `db_tarefas_sdr` → momentos. Instante = conclusão (se concluída) ou prazo.
 * Atraso em dias = conclusão − prazo (ou agora − prazo, se ainda aberta),
 * arredondado; null quando não está atrasada.
 */
export function momentosDeTarefas(rows: TarefaRow[], agora: Date): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const prazo = parse(r.prazo)
    const feita = parse(r.done_date)
    const instante = feita ?? prazo
    if (!instante) continue
    const status: StatusTarefa = STATUS.has(r.status_calc ?? '') ? (r.status_calc as StatusTarefa) : (r.done ? 'concluida_no_prazo' : 'em_aberto')
    const concluida = status === 'concluida_no_prazo' || status === 'concluida_atrasada' || r.done === true
    const atrasada = status === 'concluida_atrasada' || status === 'atrasada'
    const ref = feita ?? agora
    const atrasoDias = atrasada && prazo ? Math.max(0, Math.round((ref.getTime() - prazo.getTime()) / MS_DIA)) : null
    const tipoTarefa: TipoTarefa = TIPOS.has(r.type ?? '') ? (r.type as TipoTarefa) : 'outro'
    out.push({
      id: `tarefa:${r.task_id}`,
      idDeal: r.deal_id ?? '',
      instante,
      tipo: 'tarefa',
      ator: r.user_name ?? null,
      titulo: r.subject?.trim() || 'Tarefa',
      meta: {
        kind: 'tarefa', tipoTarefa, status, concluida, atrasada,
        prazo: r.prazo, feitaEm: r.done_date, atrasoDias,
        assunto: r.subject?.trim() || 'Tarefa', notas: r.notes?.trim() || null,
      },
    })
  }
  return out
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/timeline/tarefas.test.ts` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/tarefas.ts src/lib/timeline/tarefas.test.ts
git commit -m "feat(vendas): normaliza tarefas do SDR em momentos da Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `momentosDeReunioes` — `DB_Reunioes_MeetRox` → momentos

**Files:**
- Create: `src/lib/timeline/reunioes.ts`, `src/lib/timeline/reunioes.test.ts`

**Interfaces:**
- Produces: `interface ReuniaoRow`, `function momentosDeReunioes(rows: ReuniaoRow[]): MomentoBruto[]`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/reunioes.test.ts
import { describe, it, expect } from 'vitest'
import { momentosDeReunioes, type ReuniaoRow } from '@/lib/timeline/reunioes'

const r = (over: Partial<ReuniaoRow>): ReuniaoRow => ({
  id: 11202379, title: 'R3 Viva - William', url: 'https://app.meetrox.ai/721/calls/11202379',
  call_timestamp: '2026-09-15T20:00:00Z', call_type_name: '🟤 [Sales] - Geomarketing - R3',
  user_name: 'Douglas', duration_minutes: 76.2222, ai_score: 0.75, scorecard_name: 'R3',
  summary: { 'Objetivo da conversa': ['Apresentar o modelo.', 'Validar pontos.'], 'Vazia': [] },
  scorecard_answers: [{ answer: 'yes', category_name: 'Rapport', question_text: 'Tom positivo' }],
  attendees: ['a@x.com', 'b@y.com'], id_deal: null, crm_deal_id: 'd1', has_summary: true, has_scorecard: true,
  ...over,
})

describe('momentosDeReunioes', () => {
  it('reunião vira momento com nota ×10, duração inteira e resumo em seções (sem seção vazia)', () => {
    const [m] = momentosDeReunioes([r({})])
    expect(m.id).toBe('reuniao:11202379')
    expect(m.idDeal).toBe('d1')
    expect(m.tipo).toBe('reuniao')
    expect(m.titulo).toBe('R3 Viva - William')
    expect(m.meta).toMatchObject({ kind: 'reuniao', notaIA: 7.5, duracaoMin: 76, scorecard: 'R3', url: 'https://app.meetrox.ai/721/calls/11202379' })
    expect((m.meta as { resumo: unknown[] }).resumo).toEqual([{ titulo: 'Objetivo da conversa', itens: ['Apresentar o modelo.', 'Validar pontos.'] }])
    expect((m.meta as { respostas: unknown[] }).respostas).toEqual([{ categoria: 'Rapport', pergunta: 'Tom positivo', resposta: 'yes' }])
  })

  it('id_deal tem prioridade sobre crm_deal_id; sem os dois, descarta', () => {
    const ms = momentosDeReunioes([r({ id: 1, id_deal: 'x9', crm_deal_id: 'd1' }), r({ id: 2, id_deal: null, crm_deal_id: null })])
    expect(ms).toHaveLength(1)
    expect(ms[0].idDeal).toBe('x9')
  })

  it('sem nota, sem resumo e sem scorecard não quebra', () => {
    const [m] = momentosDeReunioes([r({ ai_score: null, summary: null, scorecard_answers: null, duration_minutes: null, attendees: null })])
    expect(m.meta).toMatchObject({ notaIA: null, duracaoMin: null, resumo: [], respostas: [], participantes: [] })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/timeline/reunioes.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/reunioes.ts
import type { MomentoBruto, RespostaScorecard, SecaoResumo } from './tipos'

/** Linha de `DB_Reunioes_MeetRox` — SEM transcription/api_payload/associations_raw. */
export interface ReuniaoRow {
  id: number
  title: string | null
  url: string | null
  call_timestamp: string | null
  call_type_name: string | null
  user_name: string | null
  duration_minutes: number | null
  ai_score: number | null
  scorecard_name: string | null
  summary: Record<string, unknown> | null
  scorecard_answers: Array<Record<string, unknown>> | null
  attendees: string[] | null
  id_deal: string | null
  crm_deal_id: string | null
  has_summary: boolean | null
  has_scorecard: boolean | null
}

function secoes(summary: Record<string, unknown> | null): SecaoResumo[] {
  if (!summary || typeof summary !== 'object') return []
  const out: SecaoResumo[] = []
  for (const [titulo, v] of Object.entries(summary)) {
    const itens = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : typeof v === 'string' && v.trim() ? [v] : []
    if (itens.length) out.push({ titulo, itens })
  }
  return out
}

function respostas(raw: Array<Record<string, unknown>> | null): RespostaScorecard[] {
  if (!Array.isArray(raw)) return []
  return raw.map(a => ({
    categoria: typeof a.category_name === 'string' ? a.category_name : '',
    pergunta: typeof a.question_text === 'string' ? a.question_text : '',
    resposta: typeof a.answer === 'string' ? a.answer : '',
  })).filter(a => a.pergunta)
}

/** `DB_Reunioes_MeetRox` → momentos. Liga ao deal por `id_deal ?? crm_deal_id`. */
export function momentosDeReunioes(rows: ReuniaoRow[]): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const idDeal = r.id_deal ?? r.crm_deal_id
    if (!idDeal || !r.call_timestamp) continue
    const instante = new Date(r.call_timestamp)
    if (Number.isNaN(instante.getTime())) continue
    out.push({
      id: `reuniao:${r.id}`,
      idDeal,
      instante,
      tipo: 'reuniao',
      ator: r.user_name ?? null,
      titulo: r.title?.trim() || 'Reunião',
      detalhe: r.call_type_name ?? undefined,
      meta: {
        kind: 'reuniao',
        duracaoMin: r.duration_minutes == null ? null : Math.round(r.duration_minutes),
        notaIA: r.ai_score == null ? null : Math.round(r.ai_score * 100) / 10,
        scorecard: r.scorecard_name ?? null,
        tipoReuniao: r.call_type_name ?? null,
        resumo: secoes(r.summary),
        respostas: respostas(r.scorecard_answers),
        url: r.url ?? null,
        participantes: Array.isArray(r.attendees) ? r.attendees.filter((x): x is string => typeof x === 'string') : [],
      },
    })
  }
  return out
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/timeline/reunioes.test.ts` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/reunioes.ts src/lib/timeline/reunioes.test.ts
git commit -m "feat(vendas): normaliza reuniões do MeetRox em momentos da Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: `montarTimeline` — ciclos, fusão de handoff, camadas, desvios, trechos, fases, desfecho

**Files:**
- Create: `src/lib/timeline/montar.ts`, `src/lib/timeline/montar.test.ts`

**Interfaces:**
- Consumes: `MomentoBruto`, `DealCabecalho`, `Timeline` etc. (Task 1); `STAGE_ORDER`, `stageOwnerRole` de `@/lib/metrics`.
- Produces: `function montarTimeline(brutos: MomentoBruto[], cabecalho: DealCabecalho | null, agora: Date): Timeline`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/montar.test.ts
import { describe, it, expect } from 'vitest'
import { montarTimeline } from '@/lib/timeline/montar'
import type { MomentoBruto, DealCabecalho } from '@/lib/timeline/tipos'
import type { StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-09-02T12:00:00Z')
const d = (iso: string) => new Date(iso)
let seq = 0
const etapa = (iso: string, e: StageKey | null, over: Partial<MomentoBruto> = {}): MomentoBruto => ({
  id: `evento:${++seq}`, idDeal: 'd1', instante: d(iso), tipo: e === 'No Show' ? 'no_show' : 'etapa',
  etapa: e, etapaCrua: e ? undefined : 'Etapa X', ator: 'Xayane', titulo: e ?? 'Etapa X',
  meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: null }, ...over,
})
const tarefa = (iso: string, atrasada = false): MomentoBruto => ({
  id: `tarefa:${++seq}`, idDeal: 'd1', instante: d(iso), tipo: 'tarefa', ator: 'Xayane', titulo: 'Ligação',
  meta: { kind: 'tarefa', tipoTarefa: 'call', status: atrasada ? 'concluida_atrasada' : 'concluida_no_prazo', concluida: true, atrasada, prazo: null, feitaEm: iso, atrasoDias: atrasada ? 1 : null, assunto: 'Ligação', notas: null },
})
const simples = (iso: string, tipo: MomentoBruto['tipo'], titulo: string, over: Partial<MomentoBruto> = {}): MomentoBruto =>
  ({ id: `evento:${++seq}`, idDeal: 'd1', instante: d(iso), tipo, ator: 'Jéssica', titulo, ...over })
const cab = (status: FunnelRow['status_atual'], over: Partial<FunnelRow> = {}): DealCabecalho => {
  const row = { id_lead: 'd1', ciclo: 1, status_atual: status, data_novo_mql: '2026-08-06T12:00:00Z', data_venda: null, ...over } as FunnelRow
  return { row, ciclos: [row] }
}

describe('montarTimeline', () => {
  it('ordena, monta nós, trechos com toques e fases por camada; em andamento termina agora', () => {
    const tl = montarTimeline([
      tarefa('2026-08-07T10:00:00Z'), tarefa('2026-08-08T10:00:00Z', true),
      etapa('2026-08-09T12:00:00Z', 'Contato Efetivo'),
      etapa('2026-08-06T12:00:00Z', 'MQL'),
      etapa('2026-08-07T09:00:00Z', 'Tentando Contato'),
      etapa('2026-08-18T12:00:00Z', 'Diagnóstico', { ator: 'Jéssica' }),
      tarefa('2026-08-20T10:00:00Z'),
    ], cab('Em andamento'), AGORA)

    expect(tl.nos.map(n => n.etapa)).toEqual(['MQL', 'Tentando Contato', 'Contato Efetivo', 'Diagnóstico'])
    expect(tl.nos.map(n => n.camada)).toEqual(['MQL', 'SDR', 'SDR', 'Closer'])
    expect(tl.desfecho.tipo).toBe('em_andamento')
    expect(tl.fim).toEqual(AGORA)
    // trechos: MQL→TC, TC→CE (2 toques, 1 atrasado), CE→Diag, Diag→fim (1 toque)
    expect(tl.trechos.map(t => [t.toques, t.atrasados])).toEqual([[0, 0], [2, 1], [0, 0], [1, 0]])
    expect(tl.trechos[3].ateId).toBeNull()
    expect(tl.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(tl.fases[1].ator).toBe('Xayane')
    expect(tl.fases[2].ator).toBe('Jéssica')
    expect(tl.fases[1].duracaoDias).toBeCloseTo(11.13, 1)
    expect(tl.totais).toMatchObject({ toques: 3, atrasados: 1, reunioes: 0 })
  })

  it('funde o handoff SDR→Closer em Reunião Agendada SQL num nó só', () => {
    const tl = montarTimeline([
      etapa('2026-08-11T11:05:00Z', 'Reunião Agendada SQL', { meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: 'sdr' } }),
      etapa('2026-08-11T11:05:20Z', 'Reunião Agendada SQL', { meta: { kind: 'etapa', etapaAnterior: null, funil: 'Closer', idEtapa: 'closer' } }),
      simples('2026-08-11T11:05:10Z', 'mudanca_funil', 'Mudou de funil', { meta: { kind: 'campo', campo: 'Funil', de: 'SDR', para: 'Closer' } }),
    ], cab('Em andamento'), AGORA)
    expect(tl.nos).toHaveLength(1)
    expect(tl.nos[0].detalhe).toBe('passou pro funil do Closer')
    // handoff normal não é desvio
    expect(tl.momentos.find(m => m.tipo === 'mudanca_funil')?.desvio).toBeUndefined()
  })

  it('marca desvios: voltou, pulou, no_show, trocou_funil, perdeu, reciclou; retomada abre ciclo 2 e fase Reaberto', () => {
    const tl = montarTimeline([
      etapa('2026-08-06T12:00:00Z', 'MQL'),
      etapa('2026-08-07T12:00:00Z', 'Reunião Agendada SQL'),          // pulou (de MQL direto pra SQL)
      etapa('2026-08-08T12:00:00Z', 'No Show'),
      etapa('2026-08-09T12:00:00Z', 'Tentando Contato'),              // voltou
      simples('2026-08-10T12:00:00Z', 'mudanca_funil', 'Mudou de funil', { meta: { kind: 'campo', campo: 'Funil', de: 'SDR', para: 'Prospecção Ativa' } }),
      simples('2026-08-11T12:00:00Z', 'perda', 'Perdido', { meta: { kind: 'perda', motivo: 'Sem interesse', anotacao: null } }),
      simples('2026-08-20T12:00:00Z', 'retomada', 'Reaberto'),
      etapa('2026-08-21T12:00:00Z', 'Contato Efetivo'),
    ], cab('Em andamento', { ciclo: 2 }), AGORA)
    const por = (tipoOuEtapa: string) => tl.momentos.find(m => m.etapa === tipoOuEtapa || m.tipo === tipoOuEtapa)
    expect(por('Reunião Agendada SQL')?.desvio).toBe('pulou')
    expect(por('no_show')?.desvio).toBe('no_show')
    expect(por('Tentando Contato')?.desvio).toBe('voltou')
    expect(por('mudanca_funil')?.desvio).toBe('trocou_funil')
    expect(por('perda')?.desvio).toBe('perdeu')
    expect(por('retomada')?.desvio).toBe('reciclou')
    expect(por('retomada')?.ciclo).toBe(2)
    expect(por('Contato Efetivo')?.ciclo).toBe(2)
    expect(tl.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Reaberto', 'SDR'])
    expect(tl.fases[2].duracaoDias).toBeCloseTo(9, 1)
    // trecho perda→retomada não existe (é a fase Reaberto)
    expect(tl.trechos.some(t => t.deId === por('perda')!.id)).toBe(false)
  })

  it('etapa crua desconhecida herda a camada do nó anterior', () => {
    const tl = montarTimeline([etapa('2026-08-18T12:00:00Z', 'SAL'), etapa('2026-08-19T12:00:00Z', null)], cab('Em andamento'), AGORA)
    expect(tl.nos[1].camada).toBe('Closer')
    expect(tl.nos[1].etapaCrua).toBe('Etapa X')
  })

  it('a trava de venda manda no desfecho: status Ganho usa o nó de ganho (ou data_venda)', () => {
    const ganho = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL'), simples('2026-09-01T12:00:00Z', 'ganho', 'Ganho')], cab('Ganho'), AGORA)
    expect(ganho.desfecho).toMatchObject({ tipo: 'ganho', instante: d('2026-09-01T12:00:00Z') })
    const semEvento = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL')], cab('Ganho', { data_venda: '2026-08-30T12:00:00Z' }), AGORA)
    expect(semEvento.desfecho).toMatchObject({ tipo: 'ganho', instante: d('2026-08-30T12:00:00Z'), momentoId: null })
    const perdido = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL'), simples('2026-08-10T12:00:00Z', 'perda', 'Perdido')], cab('Perdido'), AGORA)
    expect(perdido.desfecho.tipo).toBe('perda')
    expect(perdido.fim).toEqual(d('2026-08-10T12:00:00Z'))
  })

  it('deal só com MQL: 1 fase, 1 trecho aberto, sem quebrar', () => {
    const tl = montarTimeline([etapa('2026-08-06T12:00:00Z', 'MQL')], cab('Em andamento'), AGORA)
    expect(tl.fases).toHaveLength(1)
    expect(tl.trechos).toHaveLength(1)
    expect(tl.totais.diasNoFunil).toBeCloseTo(27, 0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/timeline/montar.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/montar.ts
import { STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
import type { StageKey } from '@/lib/metrics'
import {
  NOS_DE_ETAPA, MICRO, diasEntre,
  type Camada, type DealCabecalho, type Desfecho, type Fase, type Momento, type MomentoBruto,
  type Timeline, type TipoFase, type Trecho,
} from './tipos'

/** Empate de instante: nós de etapa antes de tarefas/reuniões. */
const PESO: Record<Momento['tipo'], number> = {
  retomada: 0, etapa: 1, no_show: 1, mudanca_funil: 2, troca_responsavel: 3, mudanca_campo: 3,
  tarefa: 4, reuniao: 4, perda: 5, ganho: 5,
}

function camadaDaEtapa(etapa: StageKey | null | undefined, anterior: Camada): Camada {
  if (!etapa) return anterior === 'Desfecho' ? 'SDR' : anterior
  if (etapa === 'MQL') return 'MQL'
  if (etapa === 'No Show') return 'SDR'
  return stageOwnerRole(etapa) === 'closer' ? 'Closer' : 'SDR'
}

const idxEtapa = (e: StageKey | null | undefined): number => (e && e !== 'No Show' ? STAGE_ORDER.indexOf(e) : -1)

/**
 * Momentos brutos (das 3 fontes) → Timeline pronta pra desenhar.
 * Regras de negócio aqui: ciclo por `retomada`; handoff SDR→Closer na mesma
 * etapa vira um nó só; camada pela etapa (herdada quando desconhecida);
 * desvio comparando com STAGE_ORDER; desfecho pela trava de venda
 * (`status_atual`), nunca só pelo evento.
 */
export function montarTimeline(brutos: MomentoBruto[], cabecalho: DealCabecalho | null, agora: Date): Timeline {
  const ordenados = [...brutos].sort((a, b) => a.instante.getTime() - b.instante.getTime() || PESO[a.tipo] - PESO[b.tipo])

  // 1) ciclo + fusão de handoff + camada + desvio
  const momentos: Momento[] = []
  let ciclo = 1
  let camada: Camada = 'MQL'
  let ultimoNo: Momento | null = null
  let ultimoIdx = -1
  for (const b of ordenados) {
    if (b.tipo === 'retomada') { ciclo += 1; ultimoIdx = -1 }
    if (b.tipo === 'etapa' && b.etapa && ultimoNo?.tipo === 'etapa' && ultimoNo.etapa === b.etapa && ultimoNo.ciclo === ciclo) {
      // mesmo StageKey duas vezes seguidas = handoff de funil, não passagem nova
      const funilNovo = b.meta?.kind === 'etapa' ? b.meta.funil : null
      const funilAntigo = ultimoNo.meta?.kind === 'etapa' ? ultimoNo.meta.funil : null
      if (funilNovo && funilNovo !== funilAntigo) ultimoNo.detalhe = `passou pro funil do ${funilNovo}`
      continue
    }
    const m: Momento = { ...b, ciclo, camada }
    switch (b.tipo) {
      case 'etapa': {
        m.camada = camadaDaEtapa(b.etapa, camada)
        const idx = idxEtapa(b.etapa)
        if (idx >= 0 && ultimoIdx >= 0) {
          if (idx < ultimoIdx) m.desvio = 'voltou'
          else if (idx > ultimoIdx + 1) m.desvio = 'pulou'
        }
        if (idx >= 0) ultimoIdx = idx
        break
      }
      case 'no_show': m.camada = 'SDR'; m.desvio = 'no_show'; break
      case 'perda': m.camada = 'Desfecho'; m.desvio = 'perdeu'; break
      case 'ganho': m.camada = 'Desfecho'; break
      case 'retomada': m.camada = 'SDR'; m.desvio = 'reciclou'; break
      case 'mudanca_funil': {
        const para = b.meta?.kind === 'campo' ? b.meta.para : null
        if (para && para !== 'Closer' && para !== 'SDR') m.desvio = 'trocou_funil'
        break
      }
      default: break
    }
    if (NOS_DE_ETAPA.has(m.tipo)) { ultimoNo = m; if (m.camada !== 'Desfecho') camada = m.camada }
    momentos.push(m)
  }
  // retomada assume a camada do primeiro nó de etapa depois dela
  momentos.forEach((m, i) => {
    if (m.tipo !== 'retomada') return
    const prox = momentos.slice(i + 1).find(x => x.tipo === 'etapa' || x.tipo === 'no_show')
    m.camada = prox?.camada ?? 'SDR'
  })

  const nos = momentos.filter(m => NOS_DE_ETAPA.has(m.tipo))
  const micro = momentos.filter(m => MICRO.has(m.tipo))

  // 2) desfecho pela trava de venda
  const status = cabecalho?.row.status_atual ?? null
  const noGanho = [...nos].reverse().find(n => n.tipo === 'ganho')
  const noPerda = [...nos].reverse().find(n => n.tipo === 'perda')
  const dataVenda = cabecalho?.row.data_venda ? new Date(cabecalho.row.data_venda) : null
  const dataPerdido = cabecalho?.row.data_perdido ? new Date(cabecalho.row.data_perdido) : null
  let desfecho: Desfecho
  if (status === 'Ganho') desfecho = { tipo: 'ganho', instante: noGanho?.instante ?? dataVenda ?? agora, momentoId: noGanho?.id ?? null }
  else if (status === 'Perdido') desfecho = { tipo: 'perda', instante: noPerda?.instante ?? dataPerdido ?? agora, momentoId: noPerda?.id ?? null }
  else if (!status && noGanho) desfecho = { tipo: 'ganho', instante: noGanho.instante, momentoId: noGanho.id }
  else if (!status && noPerda && nos[nos.length - 1]?.tipo === 'perda') desfecho = { tipo: 'perda', instante: noPerda.instante, momentoId: noPerda.id }
  else desfecho = { tipo: 'em_andamento', instante: agora, momentoId: null }

  const mql = cabecalho?.row.data_novo_mql ? new Date(cabecalho.row.data_novo_mql) : null
  const primeiro = momentos[0]?.instante ?? mql ?? agora
  const inicio = mql && mql < primeiro ? mql : primeiro
  const fim = desfecho.instante < inicio ? inicio : desfecho.instante

  // 3) trechos: entre nós consecutivos (pulando perda→retomada) + o último até o fim
  const trechos: Trecho[] = []
  for (let i = 0; i < nos.length; i++) {
    const de = nos[i]
    const ate = nos[i + 1] ?? null
    if (de.tipo === 'perda' && ate?.tipo === 'retomada') continue
    if (!ate && (de.tipo === 'perda' || de.tipo === 'ganho')) continue
    trechos.push({
      deId: de.id, ateId: ate?.id ?? null, inicio: de.instante, fim: ate?.instante ?? fim,
      duracaoDias: diasEntre(de.instante, ate?.instante ?? fim), camada: de.camada === 'Desfecho' ? camada : de.camada,
      ciclo: de.ciclo, toques: 0, atrasados: 0, reunioes: 0, momentos: [],
    })
  }
  if (trechos.length === 0 && nos.length === 0) {
    trechos.push({ deId: '', ateId: null, inicio, fim, duracaoDias: diasEntre(inicio, fim), camada: 'SDR', ciclo: 1, toques: 0, atrasados: 0, reunioes: 0, momentos: [] })
  }
  const trechoDe = (t: Date): Trecho | undefined => {
    if (trechos.length === 0) return undefined
    return trechos.find(x => t >= x.inicio && t < x.fim) ?? (t < trechos[0].inicio ? trechos[0] : trechos[trechos.length - 1])
  }
  for (const m of micro) {
    const tr = trechoDe(m.instante)
    if (!tr) continue
    tr.momentos.push(m.id)
    if (m.tipo === 'tarefa') { tr.toques += 1; if (m.meta?.kind === 'tarefa' && m.meta.atrasada) tr.atrasados += 1 }
    if (m.tipo === 'reuniao') tr.reunioes += 1
  }

  // 4) fases: muda quando a camada de um nó muda; perda→retomada vira 'Reaberto'
  const fases: Fase[] = []
  const abrir = (tipo: TipoFase, t: Date): Fase => ({ tipo, inicio: t, fim: t, duracaoDias: 0, ator: null, etapas: 0, toques: 0, atrasados: 0, noShows: 0, reunioes: 0 })
  let atual: Fase | null = null
  const fechar = (t: Date) => { if (atual) { atual.fim = t; atual.duracaoDias = diasEntre(atual.inicio, t); fases.push(atual); atual = null } }
  for (const n of nos) {
    if (n.tipo === 'perda' || n.tipo === 'ganho') { fechar(n.instante); if (n.tipo === 'perda') atual = abrir('Reaberto', n.instante); continue }
    if (n.tipo === 'retomada') { if (atual?.tipo === 'Reaberto') fechar(n.instante); atual = abrir(n.camada as TipoFase, n.instante); continue }
    const tipo = n.camada as TipoFase
    if (!atual || atual.tipo !== tipo) { fechar(n.instante); atual = abrir(tipo, n.instante) }
    atual.etapas += 1
    if (n.tipo === 'no_show') atual.noShows += 1
    if (n.ator) atual.ator = n.ator
  }
  if (atual && atual.tipo === 'Reaberto' && desfecho.tipo === 'perda') atual = null   // perdido e não reaberto: sem fase pendurada
  fechar(fim)
  if (fases.length === 0) fases.push({ ...abrir('MQL', inicio), fim, duracaoDias: diasEntre(inicio, fim) })
  for (const m of micro) {
    const f = fases.find(x => m.instante >= x.inicio && m.instante < x.fim) ?? fases[fases.length - 1]
    if (m.tipo === 'tarefa') { f.toques += 1; if (m.meta?.kind === 'tarefa' && m.meta.atrasada) f.atrasados += 1 }
    if (m.tipo === 'reuniao') f.reunioes += 1
  }

  const totais = {
    toques: micro.filter(m => m.tipo === 'tarefa').length,
    atrasados: micro.filter(m => m.tipo === 'tarefa' && m.meta?.kind === 'tarefa' && m.meta.atrasada).length,
    reunioes: micro.filter(m => m.tipo === 'reuniao').length,
    noShows: nos.filter(n => n.tipo === 'no_show').length,
    diasNoFunil: diasEntre(inicio, fim),
  }

  return { idDeal: cabecalho?.row.id_lead ?? brutos[0]?.idDeal ?? '', inicio, fim, momentos, nos, trechos, fases, desfecho, totais }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/timeline/montar.test.ts` → 6 passed. Se algum caso de fase divergir, ajuste a implementação (não o teste) — os cenários acima são os do spec.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/montar.ts src/lib/timeline/montar.test.ts
git commit -m "feat(vendas): monta a Timeline do deal (ciclos, handoff, camadas, desvios, trechos, fases)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: Helpers puros da casa — `dealNaJanela`, `fasesDaLinha`, `parseIdDeal`

**Files:**
- Modify: `src/lib/funilFilterOptions.ts` (extrair `dealNaJanela`), `src/lib/funilFilterOptions.test.ts`
- Create: `src/lib/timeline/fasesDaLinha.ts`, `src/lib/timeline/fasesDaLinha.test.ts`
- Modify: `src/lib/rd.ts`; Create: `src/lib/rd.test.ts`

**Interfaces:**
- Produces: `dealNaJanela(row: FunnelRow, win: PeriodWindow, cohort: boolean): boolean`; `fasesDaLinha(row: FunnelRow, agora: Date): { fases: Fase[]; desfecho: Desfecho; inicio: Date; fim: Date }`; `parseIdDeal(texto: string): string | null`; `ID_DEAL_RE`.

- [ ] **Step 1: Testes que falham**

```ts
// acrescentar em src/lib/funilFilterOptions.test.ts
import { dealNaJanela } from '@/lib/funilFilterOptions'
import { toWindow } from '@/lib/metrics'

describe('dealNaJanela', () => {
  const win = toWindow(null, null, [{ from: '2026-08-01', to: '2026-08-31' }])
  const row = { data_novo_mql: '2026-07-20T12:00:00Z', data_sal: '2026-08-10T12:00:00Z' } as unknown as FunnelRow
  it('entra se alguma etapa aconteceu na janela', () => { expect(dealNaJanela(row, win, false)).toBe(true) })
  it('no modo safra só o MQL conta', () => { expect(dealNaJanela(row, win, true)).toBe(false) })
  it('fora da janela em tudo → fora', () => {
    expect(dealNaJanela({ data_novo_mql: '2026-07-01T12:00:00Z' } as unknown as FunnelRow, win, false)).toBe(false)
  })
})
```
(Importe `FunnelRow` de `@/lib/funnelTypes` se o arquivo ainda não importa.)

```ts
// src/lib/timeline/fasesDaLinha.test.ts
import { describe, it, expect } from 'vitest'
import { fasesDaLinha } from '@/lib/timeline/fasesDaLinha'
import type { FunnelRow } from '@/lib/funnelTypes'

const AGORA = new Date('2026-09-02T12:00:00Z')
const row = (over: Partial<FunnelRow>): FunnelRow => ({ status_atual: 'Em andamento', data_novo_mql: '2026-08-06T12:00:00Z', ...over } as FunnelRow)

describe('fasesDaLinha', () => {
  it('ganho: MQL → SDR → Closer, fim na venda', () => {
    const r = fasesDaLinha(row({ status_atual: 'Ganho', data_tentando_contato: '2026-08-07T12:00:00Z', data_agendamento_reuniao_sql: '2026-08-11T12:00:00Z', data_reuniao_realizada: '2026-08-18T12:00:00Z', data_venda: '2026-09-01T12:00:00Z' }), AGORA)
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(r.fases[1].duracaoDias).toBeCloseTo(11, 5)
    expect(r.desfecho).toMatchObject({ tipo: 'ganho', instante: new Date('2026-09-01T12:00:00Z') })
    expect(r.fim).toEqual(new Date('2026-09-01T12:00:00Z'))
  })
  it('só MQL em andamento: 1 fase até agora', () => {
    const r = fasesDaLinha(row({}), AGORA)
    expect(r.fases).toHaveLength(1)
    expect(r.fases[0].tipo).toBe('MQL')
    expect(r.fim).toEqual(AGORA)
    expect(r.desfecho.tipo).toBe('em_andamento')
  })
  it('perdido no SDR: fim em data_perdido', () => {
    const r = fasesDaLinha(row({ status_atual: 'Perdido', data_contato_efetivo: '2026-08-09T12:00:00Z', data_perdido: '2026-08-12T12:00:00Z' }), AGORA)
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'SDR'])
    expect(r.desfecho.tipo).toBe('perda')
    expect(r.fim).toEqual(new Date('2026-08-12T12:00:00Z'))
  })
  it('sem MQL usa criação original como início', () => {
    const r = fasesDaLinha(row({ data_novo_mql: null, data_criacao_original: '2026-08-01T12:00:00Z', data_sal: '2026-08-20T12:00:00Z' }), AGORA)
    expect(r.inicio).toEqual(new Date('2026-08-01T12:00:00Z'))
    expect(r.fases.map(f => f.tipo)).toEqual(['MQL', 'Closer'])
  })
})
```

```ts
// src/lib/rd.test.ts
import { describe, it, expect } from 'vitest'
import { parseIdDeal, rdDealUrl } from '@/lib/rd'

describe('parseIdDeal', () => {
  it('aceita id de 24 hex, com espaços e caixa alta', () => {
    expect(parseIdDeal('  6A870AB4C5CD95000121CC95 ')).toBe('6a870ab4c5cd95000121cc95')
  })
  it('extrai o id de uma URL do RD (com ou sem sufixo)', () => {
    expect(parseIdDeal('https://crm.rdstation.com/app/deals/6a870ab4c5cd95000121cc95')).toBe('6a870ab4c5cd95000121cc95')
    expect(parseIdDeal(rdDealUrl('6a870ab4c5cd95000121cc95') + '?tab=history')).toBe('6a870ab4c5cd95000121cc95')
  })
  it('nome de deal ou id curto → null', () => {
    expect(parseIdDeal('Clínica Sorriso')).toBeNull()
    expect(parseIdDeal('6a870ab4')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/funilFilterOptions.test.ts src/lib/timeline/fasesDaLinha.test.ts src/lib/rd.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

Em `src/lib/funilFilterOptions.ts`, acima de `funilFilterOptions`:

```ts
/**
 * "Deal na janela" = alguma etapa dele (as 12 de STAGE_ORDER) aconteceu dentro
 * de `win`; no modo safra (`cohort`) só o MQL conta. É a regra que cruza as
 * opções dos filtros E a lista da Linha do Tempo — uma função só.
 */
export function dealNaJanela(row: FunnelRow, win: PeriodWindow, cohort: boolean): boolean {
  const campos = cohort ? (['data_novo_mql'] as const) : STAGE_ORDER.map(s => STAGE_DATE_FIELD[s])
  return campos.some(c => isInWindow(row[c] as string | null, win))
}
```
e dentro de `funilFilterOptions` trocar as 3 linhas de `camposJanela`/`naJanela` por:
```ts
  const naJanela = rows.filter(r => dealNaJanela(r, win, cohort))
```
(`PeriodWindow` já é o tipo de `win` no `FunilFilterOptionsInput`; importe de `@/lib/metrics` se necessário.)

```ts
// src/lib/timeline/fasesDaLinha.ts
import { STAGE_DATE_FIELD, STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'
import { diasEntre, type Desfecho, type Fase, type TipoFase } from './tipos'

const parse = (s: string | null | undefined): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
const menor = (ds: Array<Date | null>): Date | null =>
  ds.reduce<Date | null>((acc, d) => (d && (!acc || d < acc) ? d : acc), null)

/**
 * Fases (MQL · SDR · Closer) só a partir das datas de etapa da linha de
 * `vw_funil_vendas` — pro cartão Macro da lista, sem consultar eventos.
 * Início de cada fase = a data mais antiga das etapas daquela camada.
 */
export function fasesDaLinha(row: FunnelRow, agora: Date): { fases: Fase[]; desfecho: Desfecho; inicio: Date; fim: Date } {
  const etapas = STAGE_ORDER.filter(s => s !== 'MQL' && s !== 'Fechamento')
  const sdr = menor(etapas.filter(s => stageOwnerRole(s) === 'sdr').map(s => parse(row[STAGE_DATE_FIELD[s]])))
  const closer = menor(etapas.filter(s => stageOwnerRole(s) === 'closer').map(s => parse(row[STAGE_DATE_FIELD[s]])))
  const inicio = parse(row.data_novo_mql) ?? parse(row.data_criacao_original) ?? sdr ?? closer ?? agora

  let desfecho: Desfecho
  if (row.status_atual === 'Ganho') desfecho = { tipo: 'ganho', instante: parse(row.data_venda) ?? agora, momentoId: null }
  else if (row.status_atual === 'Perdido') desfecho = { tipo: 'perda', instante: parse(row.data_perdido) ?? agora, momentoId: null }
  else desfecho = { tipo: 'em_andamento', instante: agora, momentoId: null }
  const fim = desfecho.instante < inicio ? inicio : desfecho.instante

  const marcos: Array<[TipoFase, Date]> = [['MQL', inicio]]
  if (sdr && sdr > inicio) marcos.push(['SDR', sdr])
  if (closer && closer > (sdr ?? inicio)) marcos.push(['Closer', closer])
  const fases: Fase[] = marcos.map(([tipo, ini], i) => {
    const f = marcos[i + 1]?.[1] ?? fim
    return { tipo, inicio: ini, fim: f, duracaoDias: diasEntre(ini, f), ator: tipo === 'Closer' ? row.nome_closer : tipo === 'SDR' ? row.nome_sdr : null, etapas: 0, toques: 0, atrasados: 0, noShows: 0, reunioes: 0 }
  })
  return { fases, desfecho, inicio, fim }
}
```

```ts
// src/lib/rd.ts (arquivo inteiro)
/** URL da negociação no RD Station CRM a partir do id_deal (== id_lead em vw_funil_vendas). */
export function rdDealUrl(idDeal: string): string {
  return `https://crm.rdstation.com/app/deals/${idDeal}`
}

/** Id de deal do RD: 24 caracteres hexadecimais. Também é a única forma aceita numa query por id. */
export const ID_DEAL_RE = /^[0-9a-f]{24}$/

/** Extrai um id de deal de um id cru ou de uma URL do RD; null se o texto não é isso (ex.: nome de deal). */
export function parseIdDeal(texto: string): string | null {
  const t = texto.trim().toLowerCase()
  if (ID_DEAL_RE.test(t)) return t
  const m = t.match(/\/deals\/([0-9a-f]{24})(?:[/?#]|$)/)
  return m ? m[1] : null
}
```

- [ ] **Step 4: Rodar e ver passar** — os 3 arquivos de teste + `npx vitest run` inteiro (os testes antigos de `funilFilterOptions` não podem mudar).

- [ ] **Step 5: Commit**

```bash
git add src/lib/funilFilterOptions.ts src/lib/funilFilterOptions.test.ts src/lib/timeline/fasesDaLinha.ts src/lib/timeline/fasesDaLinha.test.ts src/lib/rd.ts src/lib/rd.test.ts
git commit -m "feat(vendas): dealNaJanela, fases da linha e parse de id do RD pra Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: `zoom.ts` — nível com histerese e limites

**Files:**
- Create: `src/lib/timeline/zoom.ts`, `src/lib/timeline/zoom.test.ts`

**Interfaces:**
- Produces: `type NivelZoom = 'macro' | 'etapas' | 'micro'`; `ZOOM` (constantes); `nivelDeZoom(k, atual)`; `kAjuste(diasTotal, larguraPx)`; `clampK(k, kMin)`; `clampX0(x0, larguraConteudo, larguraViewport)`; `MARGENS`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/zoom.test.ts
import { describe, it, expect } from 'vitest'
import { nivelDeZoom, kAjuste, clampK, clampX0, ZOOM, MARGENS } from '@/lib/timeline/zoom'

describe('nivelDeZoom (histerese)', () => {
  it('entra em macro abaixo de 9 e só sai acima de 12', () => {
    expect(nivelDeZoom(8, 'etapas')).toBe('macro')
    expect(nivelDeZoom(10, 'macro')).toBe('macro')
    expect(nivelDeZoom(10, 'etapas')).toBe('etapas')
    expect(nivelDeZoom(13, 'macro')).toBe('etapas')
  })
  it('entra em micro acima de 90 e só sai abaixo de 70', () => {
    expect(nivelDeZoom(95, 'etapas')).toBe('micro')
    expect(nivelDeZoom(80, 'micro')).toBe('micro')
    expect(nivelDeZoom(80, 'etapas')).toBe('etapas')
    expect(nivelDeZoom(60, 'micro')).toBe('etapas')
  })
})

describe('kAjuste / clamps', () => {
  it('ajuste faz o deal inteiro caber na largura útil', () => {
    expect(kAjuste(30, 1000)).toBeCloseTo((1000 - MARGENS.ESQ - MARGENS.DIR) / 30, 5)
    expect(kAjuste(0, 1000)).toBe(kAjuste(1, 1000)) // mínimo 1 dia
  })
  it('k fica entre o mínimo (60% do ajuste) e K_MAX', () => {
    expect(clampK(1, 10)).toBe(6)
    expect(clampK(9999, 10)).toBe(ZOOM.K_MAX)
    expect(clampK(50, 10)).toBe(50)
  })
  it('x0 nunca deixa a pista sair da tela', () => {
    expect(clampX0(-50, 2000, 1000)).toBe(0)
    expect(clampX0(5000, 2000, 1000)).toBe(1000)
    expect(clampX0(10, 500, 1000)).toBe(0) // conteúdo menor que a tela: sem pan
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/timeline/zoom.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/zoom.ts
export type NivelZoom = 'macro' | 'etapas' | 'micro'

/** Escalas em px por dia. Fronteiras com histerese pra não piscar de nível. */
export const ZOOM = { MACRO_ENTRA: 9, MACRO_SAI: 12, MICRO_ENTRA: 90, MICRO_SAI: 70, K_MAX: 400, FRACAO_MIN: 0.6 } as const

/** Margens horizontais da pista dentro do SVG (px). */
export const MARGENS = { ESQ: 30, DIR: 90 } as const

export function nivelDeZoom(k: number, atual: NivelZoom): NivelZoom {
  if (atual === 'macro') return k > ZOOM.MACRO_SAI ? (k > ZOOM.MICRO_ENTRA ? 'micro' : 'etapas') : 'macro'
  if (atual === 'micro') return k < ZOOM.MICRO_SAI ? (k < ZOOM.MACRO_ENTRA ? 'macro' : 'etapas') : 'micro'
  if (k < ZOOM.MACRO_ENTRA) return 'macro'
  if (k > ZOOM.MICRO_ENTRA) return 'micro'
  return 'etapas'
}

/** k que faz o deal inteiro caber na largura útil do viewport. */
export function kAjuste(diasTotal: number, larguraPx: number): number {
  const util = Math.max(100, larguraPx - MARGENS.ESQ - MARGENS.DIR)
  return util / Math.max(1, diasTotal)
}

/** k entre 60% do ajuste (não deixa o deal virar um pontinho) e K_MAX. */
export function clampK(k: number, kAjustado: number): number {
  return Math.min(ZOOM.K_MAX, Math.max(kAjustado * ZOOM.FRACAO_MIN, k))
}

/** x0 (deslocamento em px) sem deixar a pista sair da tela. */
export function clampX0(x0: number, larguraConteudo: number, larguraViewport: number): number {
  const max = Math.max(0, larguraConteudo - larguraViewport)
  return Math.min(max, Math.max(0, x0))
}
```

- [ ] **Step 4: Rodar e ver passar** — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/zoom.ts src/lib/timeline/zoom.test.ts
git commit -m "feat(vendas): níveis de zoom com histerese pra Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `layoutPista` — geometria pronta pro SVG

**Files:**
- Create: `src/lib/timeline/layout.ts`, `src/lib/timeline/layout.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `Fase`, `Momento` (Task 1); `NivelZoom`, `MARGENS` (Task 7); `toLocalDate` (`@/lib/dateUtils`).
- Produces: `interface Viewport { k: number; x0: number; largura: number }`, `PISTA` (constantes), `CORES`, `corDaCamada(camada)`, `rotuloDia(d)`, `fmtDiasCurto(d)`, `interface LayoutPista`, `function layoutPista(tl: Timeline, vp: Viewport, nivel: NivelZoom): LayoutPista`.

- [ ] **Step 1: Teste que falha**

```ts
// src/lib/timeline/layout.test.ts
import { describe, it, expect } from 'vitest'
import { layoutPista, PISTA, fmtDiasCurto, rotuloDia } from '@/lib/timeline/layout'
import { montarTimeline } from '@/lib/timeline/montar'
import type { MomentoBruto } from '@/lib/timeline/tipos'
import type { StageKey } from '@/lib/metrics'

const AGORA = new Date('2026-09-02T12:00:00Z')
let seq = 0
const etapa = (iso: string, e: StageKey): MomentoBruto => ({
  id: `evento:${++seq}`, idDeal: 'd1', instante: new Date(iso), tipo: e === 'No Show' ? 'no_show' : 'etapa', etapa: e, ator: 'Xayane', titulo: e,
  meta: { kind: 'etapa', etapaAnterior: null, funil: 'SDR', idEtapa: null },
})
const tarefa = (iso: string, atrasada = false): MomentoBruto => ({
  id: `tarefa:${++seq}`, idDeal: 'd1', instante: new Date(iso), tipo: 'tarefa', ator: 'Xayane', titulo: 'Ligação',
  meta: { kind: 'tarefa', tipoTarefa: 'call', status: 'concluida_no_prazo', concluida: true, atrasada, prazo: null, feitaEm: iso, atrasoDias: null, assunto: 'Ligação', notas: null },
})
const tl = () => montarTimeline([
  etapa('2026-08-06T12:00:00Z', 'MQL'),
  etapa('2026-08-07T12:00:00Z', 'Tentando Contato'),
  etapa('2026-08-07T13:00:00Z', 'Contato Efetivo'),   // 1h depois: colide na mesma fileira? não — fileiras alternam
  etapa('2026-08-07T14:00:00Z', 'Reunião Agendada SQL'), // mesma fileira do TC, 2h depois → empurrado
  tarefa('2026-08-08T10:00:00Z'), tarefa('2026-08-08T10:05:00Z', true), tarefa('2026-08-15T10:00:00Z'),
  etapa('2026-08-18T12:00:00Z', 'Diagnóstico'),
], { row: { id_lead: 'd1', ciclo: 1, status_atual: 'Em andamento', data_novo_mql: '2026-08-06T12:00:00Z' } as never, ciclos: [] }, AGORA)

describe('layoutPista — etapas', () => {
  const lp = layoutPista(tl(), { k: 30, x0: 0, largura: 1200 }, 'etapas')
  it('chevron por fase com largura proporcional ao tempo e cor da camada', () => {
    expect(lp.chevrons.map(c => c.fase.tipo)).toEqual(['MQL', 'SDR', 'Closer'])
    expect(lp.chevrons[1].w).toBeCloseTo(11 * 30, 3)
    expect(lp.chevrons[1].cor).toBe('#7E0E70')
    expect(lp.chevrons[0].labelVisivel).toBe(false) // 1 dia × 30px não cabe "MQL"? cabe: 30px < 3*7.2+24 → invisível
  })
  it('nós alternam cima/baixo e respeitam o gap mínimo na mesma fileira', () => {
    const nos = lp.nos.filter(n => !n.terminal)
    expect(nos.map(n => n.fileira)).toEqual(['cima', 'baixo', 'cima', 'baixo', 'cima'])
    // Tentando Contato (baixo) e SQL (baixo) estão a 2h — SQL é empurrado pra ≥ 190px
    expect(nos[3].x - nos[1].x).toBeGreaterThanOrEqual(PISTA.GAP_MIN)
    expect(nos[3].x).toBeGreaterThan(nos[3].xReal)
    expect(nos[2].x - nos[0].x).toBeGreaterThanOrEqual(PISTA.GAP_MIN) // Contato Efetivo (cima) empurrado pra longe do MQL
  })
  it('nó terminal em andamento fica sobre a pista no fim', () => {
    const t = lp.nos.find(n => n.terminal)!
    expect(t.fileira).toBe('pista')
    expect(t.y).toBe(PISTA.Y)
    expect(t.x).toBeCloseTo(PISTA.MARGEM_ESQ + 27 * 30, 3)
  })
  it('subtítulo do nó traz data e toques do trecho', () => {
    const sql = lp.nos.find(n => n.titulo === 'SQL')!
    expect(sql.detalhe).toContain('7 ago')
    expect(sql.detalhe).toContain('3 toques')
    expect(sql.detalhe).toContain('1 atrasado')
  })
  it('sem toques nem marcadores fora do micro', () => {
    expect(lp.toques).toEqual([])
    expect(lp.marcadores).toEqual([])
  })
})

describe('layoutPista — micro e macro', () => {
  it('micro: toques na fileira própria, clusterizados quando colam; atrasado tem contorno', () => {
    const lp = layoutPista(tl(), { k: 120, x0: 0, largura: 1200 }, 'micro')
    expect(lp.toques).toHaveLength(2) // 2 tarefas a 5 min viram 1 cluster + 1 solta
    expect(lp.toques[0].cluster).toHaveLength(2)
    expect(lp.toques[0].contorno).toBe('#F2A93B')
    expect(lp.toques[0].y).toBe(PISTA.TOQUES_Y)
  })
  it('macro: um nó por fase SDR/Closer, com resumo', () => {
    const lp = layoutPista(tl(), { k: 5, x0: 0, largura: 1200 }, 'macro')
    const nos = lp.nos.filter(n => !n.terminal)
    expect(nos.map(n => n.titulo)).toEqual(['SDR · Xayane', 'Closer · Xayane'])
    expect(nos[0].detalhe).toContain('3 etapas')
    expect(nos[0].detalhe).toContain('3 toques')
  })
  it('eixo: ticks diários no micro, mensais no macro', () => {
    expect(layoutPista(tl(), { k: 120, x0: 0, largura: 1200 }, 'micro').eixo.length).toBeGreaterThan(20)
    expect(layoutPista(tl(), { k: 5, x0: 0, largura: 1200 }, 'macro').eixo.map(t => t.label)).toEqual(['set 26'])
  })
})

describe('formatadores', () => {
  it('fmtDiasCurto', () => {
    expect(fmtDiasCurto(0.3)).toBe('7H')
    expect(fmtDiasCurto(1.2)).toBe('1 DIA')
    expect(fmtDiasCurto(17.4)).toBe('17 DIAS')
  })
  it('rotuloDia em Brasília', () => {
    expect(rotuloDia(new Date('2026-08-07T01:00:00Z'))).toBe('6 ago') // 22h de 6/08 em BRT
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/timeline/layout.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/timeline/layout.ts
import { toLocalDate } from '@/lib/dateUtils'
import { MARGENS, type NivelZoom } from './zoom'
import { MS_DIA, type Camada, type Desvio, type Fase, type Momento, type Timeline } from './tipos'

export interface Viewport { k: number; x0: number; largura: number }

export const PISTA = {
  Y: 184, H: 32, MARGEM_ESQ: MARGENS.ESQ, MARGEM_DIR: MARGENS.DIR,
  NO_Y_CIMA: 88, NO_Y_BAIXO: 282, RAIO: 26, RAIO_TERMINAL: 32, GAP_MIN: 190,
  BOLINHA_GAP: 14, TOQUES_Y: 232, MARCADOR_Y: 126, EIXO_Y: 352,
  ALTURA: 370, ALTURA_MICRO: 400, CLUSTER_PX: 26,
} as const

export const CORES = {
  MQL: '#33032D', SDR: '#7E0E70', Closer: '#2ABCB5', Desfecho: '#E0A928',
  ganho: '#E0A928', perda: '#E0506B', noShow: '#F2A93B', desconhecida: '#9CA3AF', hoje: '#CAD3E0', reaberto: '#CAD3E0',
} as const

export function corDaCamada(c: Camada): string { return CORES[c] }

export interface ChevronLayout { fase: Fase; x: number; w: number; cor: string; label: string; labelVisivel: boolean }
export interface NoLayout {
  id: string
  momento: Momento | null
  fase: Fase | null
  xReal: number
  x: number
  y: number
  fileira: 'cima' | 'baixo' | 'pista'
  raio: number
  cor: string
  titulo: string
  detalhe: string
  terminal: boolean
  desvio?: Desvio
  /** Chave pro ícone (etapa canônica, tipo do nó, ou fase no macro). */
  icone: string
}
export interface ToqueLayout { id: string; momento: Momento; x: number; y: number; cor: string; contorno: string | null; vazado: boolean; cluster: Momento[] }
export interface MarcadorLayout { id: string; momento: Momento; x: number; y: number; label: string }
export interface EixoTick { x: number; label: string }
export interface LayoutPista {
  chevrons: ChevronLayout[]
  nos: NoLayout[]
  toques: ToqueLayout[]
  marcadores: MarcadorLayout[]
  eixo: EixoTick[]
  larguraConteudo: number
  altura: number
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "7 ago" no dia de Brasília. */
export function rotuloDia(d: Date): string {
  const iso = toLocalDate(d.toISOString()) ?? d.toISOString().slice(0, 10)
  const [, m, dia] = iso.split('-')
  return `${Number(dia)} ${MESES[Number(m) - 1]}`
}
function rotuloHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}
export function fmtDiasCurto(dias: number): string {
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))}H`
  const n = Math.round(dias)
  return n === 1 ? '1 DIA' : `${n} DIAS`
}
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const LARGURA_CHAR = 7.2

function corDoNo(m: Momento): string {
  if (m.tipo === 'no_show') return CORES.noShow
  if (m.tipo === 'perda') return CORES.perda
  if (m.tipo === 'ganho') return CORES.ganho
  if (m.tipo === 'retomada') return CORES.reaberto
  if (m.tipo === 'etapa' && !m.etapa) return CORES.desconhecida
  return corDaCamada(m.camada)
}

export function layoutPista(tl: Timeline, vp: Viewport, nivel: NivelZoom): LayoutPista {
  const x = (t: Date) => PISTA.MARGEM_ESQ + ((t.getTime() - tl.inicio.getTime()) / MS_DIA) * vp.k - vp.x0
  const diasTotal = Math.max(1, (tl.fim.getTime() - tl.inicio.getTime()) / MS_DIA)

  // chevrons
  const chevrons: ChevronLayout[] = tl.fases.map(f => {
    const w = Math.max(PISTA.H, x(f.fim) - x(f.inicio))
    const label = f.tipo === 'MQL' ? 'MQL'
      : f.tipo === 'Reaberto' ? `REABERTO EM ${fmtDiasCurto(f.duracaoDias)}`
      : [f.tipo.toUpperCase(), fmtDiasCurto(f.duracaoDias), f.ator?.toUpperCase()].filter(Boolean).join(' · ')
    const cor = f.tipo === 'Reaberto' ? CORES.reaberto : corDaCamada(f.tipo)
    return { fase: f, x: x(f.inicio), w, cor, label, labelVisivel: w >= label.length * LARGURA_CHAR + 24 }
  })

  // nós
  const trechoPorNo = new Map(tl.trechos.map(t => [t.deId, t]))
  const nos: NoLayout[] = []
  const ultimoX: Record<'cima' | 'baixo', number> = { cima: -Infinity, baixo: -Infinity }
  let proxima: 'cima' | 'baixo' = 'cima'
  const posicionar = (xReal: number): { x: number; y: number; fileira: 'cima' | 'baixo' } => {
    const fileira = proxima
    proxima = fileira === 'cima' ? 'baixo' : 'cima'
    const xPos = Math.max(xReal, ultimoX[fileira] + PISTA.GAP_MIN)
    ultimoX[fileira] = xPos
    return { x: xPos, y: fileira === 'cima' ? PISTA.NO_Y_CIMA : PISTA.NO_Y_BAIXO, fileira }
  }

  if (nivel === 'macro') {
    for (const f of tl.fases) {
      if (f.tipo !== 'SDR' && f.tipo !== 'Closer') continue
      const meio = new Date((f.inicio.getTime() + f.fim.getTime()) / 2)
      const partes = [plural(f.etapas, 'etapa', 'etapas'), plural(f.toques, 'toque', 'toques')]
      if (f.noShows) partes.push(plural(f.noShows, 'no-show', 'no-shows'))
      if (f.reunioes) partes.push(plural(f.reunioes, 'reunião', 'reuniões'))
      const p = posicionar(x(meio))
      nos.push({ id: `fase:${f.tipo}:${f.inicio.getTime()}`, momento: null, fase: f, xReal: x(meio), ...p, raio: PISTA.RAIO, cor: corDaCamada(f.tipo),
        titulo: [f.tipo, f.ator].filter(Boolean).join(' · '), detalhe: partes.join(' · '), terminal: false, icone: f.tipo })
    }
  } else {
    for (const n of tl.nos) {
      if (n.id === tl.desfecho.momentoId) continue // vira o nó terminal
      const tr = trechoPorNo.get(n.id)
      const partes: string[] = [nivel === 'micro' ? `${rotuloDia(n.instante)} ${rotuloHora(n.instante)}` : rotuloDia(n.instante)]
      if (nivel === 'micro' && n.ator) partes.push(n.ator)
      if (nivel === 'etapas' && tr) {
        if (tr.toques) partes.push(plural(tr.toques, 'toque', 'toques') + (tr.atrasados ? ` · ${plural(tr.atrasados, 'atrasado', 'atrasados')}` : ''))
        if (tr.reunioes) partes.push(plural(tr.reunioes, 'reunião', 'reuniões'))
      }
      if (n.detalhe && (n.tipo === 'perda' || n.tipo === 'retomada' || n.tipo === 'etapa')) partes.push(n.detalhe)
      const p = posicionar(x(n.instante))
      nos.push({ id: n.id, momento: n, fase: null, xReal: x(n.instante), ...p, raio: PISTA.RAIO, cor: corDoNo(n), titulo: n.titulo, detalhe: partes.join(' · '),
        terminal: false, desvio: n.desvio, icone: n.tipo === 'etapa' ? (n.etapa ?? 'desconhecida') : n.tipo })
    }
  }
  // terminal
  const term = tl.desfecho
  const momentoTerm = tl.momentos.find(m => m.id === term.momentoId) ?? null
  const xTerm = x(term.instante)
  nos.push({
    id: `terminal:${term.tipo}`, momento: momentoTerm, fase: null, xReal: xTerm, x: xTerm, y: PISTA.Y, fileira: 'pista',
    raio: PISTA.RAIO_TERMINAL, cor: term.tipo === 'ganho' ? CORES.ganho : term.tipo === 'perda' ? CORES.perda : CORES.hoje,
    titulo: term.tipo === 'ganho' ? 'Ganho' : term.tipo === 'perda' ? 'Perdido' : 'Hoje',
    detalhe: term.tipo === 'em_andamento' ? `${fmtDiasCurto(diasTotal).toLowerCase()} no funil` : [rotuloDia(term.instante), momentoTerm?.detalhe].filter(Boolean).join(' · '),
    terminal: true, icone: term.tipo,
  })

  // toques + marcadores (micro)
  const toques: ToqueLayout[] = []
  const marcadores: MarcadorLayout[] = []
  if (nivel === 'micro') {
    const micro = tl.momentos.filter(m => m.tipo === 'tarefa' || m.tipo === 'reuniao').sort((a, b) => a.instante.getTime() - b.instante.getTime())
    for (const m of micro) {
      const xm = x(m.instante)
      const ultimo = toques[toques.length - 1]
      const atrasada = m.meta?.kind === 'tarefa' && m.meta.atrasada
      const vazado = m.meta?.kind === 'tarefa' && !m.meta.concluida
      if (ultimo && xm - ultimo.x < PISTA.CLUSTER_PX) {
        ultimo.cluster.push(m)
        if (atrasada) ultimo.contorno = CORES.noShow
        continue
      }
      toques.push({ id: m.id, momento: m, x: xm, y: PISTA.TOQUES_Y, cor: corDaCamada(m.camada), contorno: atrasada ? CORES.noShow : null, vazado, cluster: [m] })
    }
    for (const m of tl.momentos) {
      if (m.tipo !== 'troca_responsavel' && m.tipo !== 'mudanca_funil' && m.tipo !== 'mudanca_campo') continue
      marcadores.push({ id: m.id, momento: m, x: x(m.instante), y: PISTA.MARCADOR_Y, label: `${m.titulo}: ${m.detalhe ?? ''}` })
    }
  }

  // eixo do tempo
  const eixo: EixoTick[] = []
  const passoDias = vp.k >= 90 ? 1 : vp.k >= 12 ? 7 : 0
  if (passoDias > 0) {
    for (let t = new Date(tl.inicio); t <= tl.fim; t = new Date(t.getTime() + passoDias * MS_DIA)) eixo.push({ x: x(t), label: rotuloDia(t) })
  } else {
    const ini = toLocalDate(tl.inicio.toISOString())!.slice(0, 7)
    const fimM = toLocalDate(tl.fim.toISOString())!.slice(0, 7)
    for (let ym = ini; ym <= fimM;) {
      const [y, m] = ym.split('-').map(Number)
      const primeiro = new Date(`${ym}-01T03:00:00Z`)
      if (primeiro >= tl.inicio) eixo.push({ x: x(primeiro), label: `${MESES[m - 1]} ${String(y).slice(2)}` })
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
    if (eixo.length === 0) eixo.push({ x: x(tl.fim), label: `${MESES[tl.fim.getMonth()]} ${String(tl.fim.getFullYear()).slice(2)}` })
  }

  const maxX = Math.max(x(tl.fim), ...nos.map(n => n.x)) + PISTA.MARGEM_DIR + vp.x0
  return { chevrons, nos, toques, marcadores, eixo, larguraConteudo: maxX + 160, altura: nivel === 'micro' ? PISTA.ALTURA_MICRO : PISTA.ALTURA }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/timeline/layout.test.ts`. O teste do eixo macro espera `['set 26']` porque o deal começa em 6/ago (o "1 ago" fica antes do início); se o seu deal de teste mudar, ajuste a expectativa.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/layout.ts src/lib/timeline/layout.test.ts
git commit -m "feat(vendas): layout da Pista (chevrons, nós alternados, toques, eixo)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: `useDealTimeline` — 4 consultas em paralelo, falha parcial tolerada

**Files:**
- Create: `src/hooks/useDealTimeline.ts`

**Interfaces:**
- Consumes: `supabaseVendas`; `momentosDeEventos`/`momentosDeTarefas`/`momentosDeReunioes`/`montarTimeline`; `ID_DEAL_RE`; `normalizeMarcaRaw`.
- Produces: `useDealTimeline(idDeal: string | undefined): { timeline: Timeline | null; cabecalho: DealCabecalho | null; loading: boolean; naoEncontrado: boolean; erros: Partial<Record<'eventos' | 'tarefas' | 'reunioes' | 'deal', string>>; reload: () => void }`.

Sem teste unitário (rede); o Task 15 confere na tela com deals reais.

- [ ] **Step 1: Implementar**

```ts
// src/hooks/useDealTimeline.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { normalizeMarcaRaw } from '@/constants/brands'
import { ID_DEAL_RE } from '@/lib/rd'
import { momentosDeEventos, type DealEventoRow } from '@/lib/timeline/eventos'
import { momentosDeTarefas, type TarefaRow } from '@/lib/timeline/tarefas'
import { momentosDeReunioes, type ReuniaoRow } from '@/lib/timeline/reunioes'
import { montarTimeline } from '@/lib/timeline/montar'
import type { DealCabecalho, Timeline } from '@/lib/timeline/tipos'
import type { FunnelRow } from '@/lib/funnelTypes'

type Fonte = 'eventos' | 'tarefas' | 'reunioes' | 'deal'
export type ErrosTimeline = Partial<Record<Fonte, string>>

const COLS_EVENTOS = 'id_evento,id_deal,tipo_evento,nome_funil,id_etapa,nome_etapa,nome_etapa_anterior,responsavel,valor_anterior,valor_novo,data_evento,motivo_perda,anotacao_perda'
const COLS_TAREFAS = 'task_id,subject,type,notes,done,status_calc,prazo,done_date,user_name,deal_id'
/** NUNCA transcription/api_payload/associations_raw/phrase_trackers/evaluators — pesados. */
const COLS_REUNIOES = 'id,title,url,call_timestamp,call_type_name,user_name,duration_minutes,ai_score,scorecard_name,summary,scorecard_answers,attendees,id_deal,crm_deal_id,has_summary,has_scorecard'
const COLS_DEAL = 'id_lead,ciclo,eh_reciclagem,eh_ciclo_atual,marca,nome_funil,etapa_funil,id_etapa_atual,status_atual,nome_sdr,nome_closer,nome_negociacao,fonte_macro,sub_fonte,sub_fonte_crm,utm_source,valor_contrato,quantidade_unidades,valor_produto,motivo_perda,data_criacao_original,data_novo_mql,data_tentando_contato,data_contato_efetivo,data_interesse_reuniao,data_conexao,data_agendamento_reuniao_sql,data_reuniao_realizada,data_no_show,data_sal,data_oportunidade,data_comite,data_pre_contrato,data_venda,data_perdido,origem_comercial'

interface Estado {
  eventos: DealEventoRow[]
  tarefas: TarefaRow[]
  reunioes: ReuniaoRow[]
  ciclos: FunnelRow[]
  erros: ErrosTimeline
}
const VAZIO: Estado = { eventos: [], tarefas: [], reunioes: [], ciclos: [], erros: {} }

async function buscar(idDeal: string): Promise<Estado> {
  const [ev, ta, re, de] = await Promise.allSettled([
    supabaseVendas.from('deal_eventos').select(COLS_EVENTOS).eq('id_deal', idDeal).order('data_evento', { ascending: true }),
    supabaseVendas.from('db_tarefas_sdr').select(COLS_TAREFAS).eq('deal_id', idDeal).order('prazo', { ascending: true }),
    // id_deal só existe em 8 de 1.550 linhas; o vínculo de verdade é crm_deal_id. idDeal já passou pelo ID_DEAL_RE.
    supabaseVendas.from('DB_Reunioes_MeetRox').select(COLS_REUNIOES).or(`id_deal.eq.${idDeal},crm_deal_id.eq.${idDeal}`).order('call_timestamp', { ascending: true }),
    supabaseVendas.from('vw_funil_vendas').select(COLS_DEAL).eq('id_lead', idDeal).order('ciclo', { ascending: true }),
  ])
  const erros: ErrosTimeline = {}
  const pega = <T,>(r: PromiseSettledResult<{ data: unknown; error: { message: string } | null }>, fonte: Fonte): T[] => {
    if (r.status === 'rejected') { erros[fonte] = String(r.reason); return [] }
    if (r.value.error) { erros[fonte] = r.value.error.message; return [] }
    return (r.value.data ?? []) as T[]
  }
  const ciclos = pega<FunnelRow>(de, 'deal')
  for (const r of ciclos) r.marca = normalizeMarcaRaw(r.marca) ?? r.marca
  return { eventos: pega(ev, 'eventos'), tarefas: pega(ta, 'tarefas'), reunioes: pega(re, 'reunioes'), ciclos, erros }
}

export function useDealTimeline(idDeal: string | undefined) {
  const valido = !!idDeal && ID_DEAL_RE.test(idDeal)
  const [estado, setEstado] = useState<Estado>(VAZIO)
  const [loading, setLoading] = useState(valido)
  const ativo = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!valido || !idDeal) { setEstado(VAZIO); setLoading(false); return }
    ativo.current = idDeal
    setLoading(true)
    const r = await buscar(idDeal)
    if (ativo.current !== idDeal) return
    setEstado(r)
    setLoading(false)
  }, [idDeal, valido])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener('dashboard:refresh', onRefresh)
    return () => { ativo.current = null; window.removeEventListener('dashboard:refresh', onRefresh) }
  }, [load])

  const cabecalho = useMemo<DealCabecalho | null>(() => {
    if (!estado.ciclos.length) return null
    const row = estado.ciclos.find(c => c.eh_ciclo_atual) ?? estado.ciclos[estado.ciclos.length - 1]
    return { row, ciclos: estado.ciclos }
  }, [estado.ciclos])

  const timeline = useMemo<Timeline | null>(() => {
    if (!cabecalho) return null
    const agora = new Date()
    const brutos = [
      ...momentosDeEventos(estado.eventos),
      ...momentosDeTarefas(estado.tarefas, agora),
      ...momentosDeReunioes(estado.reunioes),
    ]
    return montarTimeline(brutos, cabecalho, agora)
  }, [estado, cabecalho])

  const naoEncontrado = !loading && (!valido || (cabecalho === null && !estado.erros.deal))
  return { timeline, cabecalho, loading, naoEncontrado, erros: estado.erros, reload: () => void load() }
}
```

- [ ] **Step 2: Build limpo**

Run: `cd ~/ws-dashboard-worktree-timeline && npm run build && npx oxlint src/hooks/useDealTimeline.ts` — Expected: sem erro (o hook ainda não é importado por ninguém; `tsc -b` compila tudo em `src/`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDealTimeline.ts
git commit -m "feat(vendas): hook useDealTimeline (4 consultas por deal, falha parcial tolerada)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `useZoomPan` — wheel/pinch/arrasto/botões, nível com histerese

**Files:**
- Create: `src/hooks/useZoomPan.ts`

**Interfaces:**
- Consumes: `nivelDeZoom`, `kAjuste`, `clampK`, `clampX0`, `MARGENS` (Task 7).
- Produces: `useZoomPan(opts: { diasTotal: number; larguraViewport: number; larguraConteudo: number }): { k: number; x0: number; nivel: NivelZoom; zoomIn(): void; zoomOut(): void; ajustar(): void; handlers: { onWheel(e: WheelEvent): void; onPointerDown(e: React.PointerEvent): void; onPointerMove(e: React.PointerEvent): void; onPointerUp(): void }; arrastando: boolean }`.

- [ ] **Step 1: Implementar**

```ts
// src/hooks/useZoomPan.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clampK, clampX0, kAjuste, nivelDeZoom, MARGENS, type NivelZoom } from '@/lib/timeline/zoom'

interface Opts {
  diasTotal: number
  larguraViewport: number
  /** Largura do conteúdo no k atual (vem do layout) — pra travar o pan. */
  larguraConteudo: number
}

const PASSO_BOTAO = 1.6

/**
 * Estado de zoom/pan da Pista. `k` = px por dia, `x0` = deslocamento em px.
 * Ctrl/⌘+scroll ou pinch = zoom ancorado no cursor; scroll simples e arrasto =
 * pan; botões −/+/ajustar. O nível (Macro/Etapas/Micro) deriva de `k` com
 * histerese — abre sempre em Etapas ajustado ao deal inteiro.
 */
export function useZoomPan({ diasTotal, larguraViewport, larguraConteudo }: Opts) {
  const kFit = useMemo(() => kAjuste(diasTotal, larguraViewport), [diasTotal, larguraViewport])
  const [k, setK] = useState(kFit)
  const [x0, setX0] = useState(0)
  const [nivel, setNivel] = useState<NivelZoom>('etapas')
  const [arrastando, setArrastando] = useState(false)
  const arrasto = useRef<{ x: number; x0: number } | null>(null)
  const inicializado = useRef(false)

  // 1ª medição do viewport (largura 0 → real): ajusta ao deal uma vez.
  useEffect(() => {
    if (inicializado.current || larguraViewport <= 0 || diasTotal <= 0) return
    inicializado.current = true
    setK(kFit); setX0(0); setNivel('etapas')
  }, [kFit, larguraViewport, diasTotal])

  useEffect(() => { setNivel(n => nivelDeZoom(k, n)) }, [k])
  useEffect(() => { setX0(v => clampX0(v, larguraConteudo, larguraViewport)) }, [larguraConteudo, larguraViewport])

  /** Zoom multiplicativo mantendo o ponto sob `xCursor` (px no viewport) parado. */
  const zoomEm = useCallback((fator: number, xCursor: number) => {
    setK(kAtual => {
      const kNovo = clampK(kAtual * fator, kFit)
      const dias = (xCursor - MARGENS.ESQ + x0) / kAtual
      setX0(clampX0(dias * kNovo - (xCursor - MARGENS.ESQ), larguraConteudo * (kNovo / kAtual), larguraViewport))
      return kNovo
    })
  }, [kFit, x0, larguraConteudo, larguraViewport])

  const zoomIn = useCallback(() => zoomEm(PASSO_BOTAO, larguraViewport / 2), [zoomEm, larguraViewport])
  const zoomOut = useCallback(() => zoomEm(1 / PASSO_BOTAO, larguraViewport / 2), [zoomEm, larguraViewport])
  const ajustar = useCallback(() => { setK(kFit); setX0(0) }, [kFit])

  const onWheel = useCallback((e: WheelEvent) => {
    const alvo = e.currentTarget as HTMLElement | null
    const esq = alvo?.getBoundingClientRect().left ?? 0
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoomEm(Math.exp(-e.deltaY * 0.01), e.clientX - esq)
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault()
      setX0(v => clampX0(v + (e.deltaX || e.deltaY), larguraConteudo, larguraViewport))
    }
  }, [zoomEm, larguraConteudo, larguraViewport])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return
    arrasto.current = { x: e.clientX, x0 }
    setArrastando(true)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }, [x0])
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!arrasto.current) return
    setX0(clampX0(arrasto.current.x0 - (e.clientX - arrasto.current.x), larguraConteudo, larguraViewport))
  }, [larguraConteudo, larguraViewport])
  const onPointerUp = useCallback(() => { arrasto.current = null; setArrastando(false) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === '+' || e.key === '=') zoomIn()
      else if (e.key === '-') zoomOut()
      else if (e.key === '0') ajustar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, ajustar])

  return { k, x0, nivel, zoomIn, zoomOut, ajustar, arrastando, handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp } }
}
```

Nota pro componente (Task 11): `onWheel` precisa ser registrado com `addEventListener('wheel', h, { passive: false })` num `useEffect` sobre o `ref` do container — o `onWheel` do React é passivo e `preventDefault` não funciona nele.

- [ ] **Step 2: Build limpo** — `npm run build && npx oxlint src/hooks/useZoomPan.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useZoomPan.ts
git commit -m "feat(vendas): hook useZoomPan da Pista (wheel, pinch, arrasto, botões)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: Componentes de desenho — `iconesEtapa`, `PistaCanvas`, `ZoomControls`, `TimelineLegend`

**Files:**
- Create: `src/components/timeline/iconesEtapa.tsx`, `src/components/timeline/PistaCanvas.tsx`, `src/components/timeline/ZoomControls.tsx`, `src/components/timeline/TimelineLegend.tsx`

**Interfaces:**
- Consumes: `LayoutPista`, `PISTA`, `CORES` (Task 8); `NivelZoom` (Task 7); `Momento` (Task 1).
- Produces: `IconeDe({ chave, size })`, `PistaCanvas({ layout, nivel, selecionadoId, onSelecionar, handlers, arrastando })`, `ZoomControls({ nivel, onMais, onMenos, onAjustar })`, `TimelineLegend({ nivel })`.

- [ ] **Step 1: Mapa de ícones**

```tsx
// src/components/timeline/iconesEtapa.tsx
import {
  Search, Phone, MessageSquare, Handshake, Link, CalendarCheck, Users, CircleCheck, FileText, Gavel, FilePen,
  Trophy, CircleX, Ban, Video, Mail, MessageCircle, ListTodo, Utensils, RotateCcw, HelpCircle, Flag, UserRound, ArrowRightLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Chave = StageKey, tipo de nó, tipo de tarefa, ou fase (macro). Todos os nomes conferidos em lucide-react 1.24. */
const MAPA: Record<string, LucideIcon> = {
  'MQL': Search, 'Tentando Contato': Phone, 'Contato Efetivo': MessageSquare, 'Interesse Reunião': Handshake, 'Conexão': Link,
  'Reunião Agendada SQL': CalendarCheck, 'Diagnóstico': Users, 'SAL': CircleCheck, 'Oportunidade COF': FileText, 'Comitê': Gavel,
  'Pré-Contrato': FilePen, 'Fechamento': Trophy, 'No Show': Ban,
  ganho: Trophy, perda: CircleX, no_show: Ban, retomada: RotateCcw, em_andamento: Flag, desconhecida: HelpCircle,
  SDR: Phone, Closer: Handshake,
  call: Phone, whatsapp: MessageCircle, email: Mail, task: ListTodo, lunch: Utensils, meeting: Users, outro: ListTodo, reuniao: Video,
  troca_responsavel: UserRound, mudanca_funil: ArrowRightLeft, mudanca_campo: ArrowRightLeft,
}

export function IconeDe({ chave, size = 22 }: { chave: string; size?: number }) {
  const Icon = MAPA[chave] ?? HelpCircle
  return <Icon size={size} strokeWidth={2.2} color="#fff" />
}
```

- [ ] **Step 2: PistaCanvas (o SVG)**

```tsx
// src/components/timeline/PistaCanvas.tsx
import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { PISTA, CORES } from '@/lib/timeline/layout'
import type { LayoutPista, NoLayout, ToqueLayout } from '@/lib/timeline/layout'
import type { NivelZoom } from '@/lib/timeline/zoom'
import { IconeDe } from './iconesEtapa'

interface Props {
  layout: LayoutPista
  nivel: NivelZoom
  selecionadoId: string | null
  /** Clique num nó/toque/marcador — `null` fecha o cartão. */
  onSelecionar: (id: string | null) => void
  handlers: {
    onWheel: (e: WheelEvent) => void
    onPointerDown: (e: ReactPointerEvent) => void
    onPointerMove: (e: ReactPointerEvent) => void
    onPointerUp: () => void
  }
  arrastando: boolean
  /** Largura medida do container (px); o SVG usa viewBox = largura × altura do layout. */
  largura: number
}

const FONTE = "'Clash Display','Public Sans',ui-sans-serif,system-ui,sans-serif"

function chevronPath(x: number, w: number, primeiro: boolean): string {
  const y = PISTA.Y - PISTA.H / 2, h = PISTA.H, p = 14
  return primeiro
    ? `M ${x} ${y} h ${w} l ${p} ${h / 2} l ${-p} ${h / 2} h ${-w} z`
    : `M ${x} ${y} h ${w} l ${p} ${h / 2} l ${-p} ${h / 2} h ${-w} l ${p} ${-h / 2} z`
}

export function PistaCanvas({ layout, nivel, selecionadoId, onSelecionar, handlers, arrastando, largura }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // wheel precisa de listener não-passivo (preventDefault no zoom) — o onWheel do React é passivo.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = handlers.onWheel
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [handlers.onWheel])

  const bordaPista = (fileira: NoLayout['fileira']) => fileira === 'cima' ? PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP : PISTA.Y + PISTA.H / 2 + PISTA.BOLINHA_GAP

  return (
    <div
      ref={ref}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerUp}
      onClick={e => { if (e.target === e.currentTarget) onSelecionar(null) }}
      style={{ width: '100%', overflow: 'hidden', cursor: arrastando ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
    >
      <svg viewBox={`0 0 ${Math.max(1, largura)} ${layout.altura}`} width="100%" height={layout.altura} style={{ display: 'block', fontFamily: FONTE }}>
        <defs>
          <filter id="pista-sombra" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#33032D" floodOpacity=".18" />
          </filter>
        </defs>

        {/* chevrons */}
        {layout.chevrons.map((c, i) => (
          <g key={`${c.fase.tipo}-${c.fase.inicio.getTime()}`}>
            <path d={chevronPath(c.x, c.w, i === 0)} fill={c.cor} opacity={c.fase.tipo === 'Reaberto' ? 0.6 : 1}
              strokeDasharray={c.fase.tipo === 'Reaberto' ? '6 4' : undefined} stroke={c.fase.tipo === 'Reaberto' ? '#9CA3AF' : undefined} />
            {c.labelVisivel && (
              <text x={c.x + c.w / 2} y={PISTA.Y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" letterSpacing=".04em">{c.label}</text>
            )}
          </g>
        ))}

        {/* eixo */}
        {layout.eixo.map(t => (
          <text key={`${t.x}-${t.label}`} x={t.x} y={PISTA.EIXO_Y} fontSize={10.5} fill="#B8AEB5" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{t.label}</text>
        ))}

        {/* marcadores (micro) */}
        {layout.marcadores.map(m => (
          <g key={m.id} onClick={e => { e.stopPropagation(); onSelecionar(m.id) }} style={{ cursor: 'pointer' }}>
            <line x1={m.x} y1={PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP - 4} x2={m.x} y2={m.y + 8} stroke="#CAD3E0" strokeWidth={1.5} strokeDasharray="2 4" />
            <circle cx={m.x} cy={PISTA.Y - PISTA.H / 2 - PISTA.BOLINHA_GAP} r={4.5} fill="#fff" stroke="#7C6B78" strokeWidth={2} />
            <text x={m.x} y={m.y} fontSize={10} fill="#7C6B78" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{m.label.length > 48 ? m.label.slice(0, 47) + '…' : m.label}</text>
          </g>
        ))}

        {/* fileira de toques (micro) */}
        {nivel === 'micro' && layout.toques.length > 0 && (
          <line x1={PISTA.MARGEM_ESQ} y1={PISTA.TOQUES_Y} x2={layout.larguraConteudo} y2={PISTA.TOQUES_Y} stroke="#E9EDF2" strokeWidth={1.5} />
        )}
        {layout.toques.map(t => <Toque key={t.id} t={t} selecionado={selecionadoId === t.id} onClick={() => onSelecionar(t.id)} />)}

        {/* fios + bolinhas + nós */}
        {layout.nos.map(n => {
          const sel = selecionadoId === n.id
          const yBorda = bordaPista(n.fileira)
          return (
            <g key={n.id} onClick={e => { e.stopPropagation(); onSelecionar(n.id) }} style={{ cursor: 'pointer' }}>
              {!n.terminal && (
                <>
                  <line x1={n.x} y1={n.y + (n.fileira === 'cima' ? n.raio + 2 : -n.raio - 2)} x2={n.xReal} y2={yBorda + (n.fileira === 'cima' ? -6 : 6)} stroke="#CAD3E0" strokeWidth={1.5} strokeDasharray="2 4" />
                  <circle cx={n.xReal} cy={yBorda} r={4.5} fill="#fff" stroke={n.cor} strokeWidth={n.desvio ? 3 : 2} />
                </>
              )}
              <g transform={`translate(${n.x},${n.y})`} filter="url(#pista-sombra)">
                <circle r={n.raio + (sel ? 4 : 0)} fill={n.cor} stroke="#fff" strokeWidth={n.terminal ? 3 : 0} />
                {n.icone === 'em_andamento' && <circle r={n.raio - 6} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />}
                <g transform={`translate(${-11},${-11})`}><IconeDe chave={n.icone} size={22} /></g>
              </g>
              <Rotulo n={n} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Rotulo({ n }: { n: NoLayout }) {
  const corTitulo = n.terminal ? (n.cor === CORES.ganho ? '#B7791F' : n.cor === CORES.perda ? '#B4324B' : '#7C6B78') : n.desvio === 'no_show' ? '#B7791F' : '#33032D'
  if (n.terminal) {
    // texto acima do nó terminal, alinhado à direita
    return (
      <g textAnchor="end">
        <text x={n.x + 32} y={n.y - 58} fontSize={14} fontWeight={700} fill={corTitulo}>{n.titulo}</text>
        <text x={n.x + 32} y={n.y - 42} fontSize={11} fill="#7C6B78" fontFamily="ui-sans-serif, system-ui, sans-serif">{n.detalhe}</text>
      </g>
    )
  }
  return (
    <g>
      <text x={n.x + n.raio + 11} y={n.y - 4} fontSize={14} fontWeight={700} fill={corTitulo}>{n.titulo}</text>
      <text x={n.x + n.raio + 11} y={n.y + 12} fontSize={11} fill="#7C6B78" fontFamily="ui-sans-serif, system-ui, sans-serif">{n.detalhe}</text>
    </g>
  )
}

function Toque({ t, selecionado, onClick }: { t: ToqueLayout; selecionado: boolean; onClick: () => void }) {
  const reuniao = t.momento.tipo === 'reuniao'
  const r = reuniao ? 14 : 11
  const chave = reuniao ? 'reuniao' : t.momento.meta?.kind === 'tarefa' ? t.momento.meta.tipoTarefa : 'outro'
  return (
    <g transform={`translate(${t.x},${t.y})`} onClick={e => { e.stopPropagation(); onClick() }} style={{ cursor: 'pointer' }}>
      <circle r={r + (selecionado ? 3 : 0)} fill={t.vazado ? '#fff' : t.cor} stroke={t.contorno ?? (t.vazado ? t.cor : 'none')} strokeWidth={t.contorno ? 3 : t.vazado ? 2 : 0} opacity={reuniao ? 1 : 0.85} />
      <g transform={`translate(${-(r * 0.55)},${-(r * 0.55)})`}>{t.vazado ? null : <IconeDe chave={chave} size={r * 1.1} />}</g>
      {t.cluster.length > 1 && (
        <>
          <circle cx={r - 2} cy={-r + 2} r={7} fill="#33032D" />
          <text x={r - 2} y={-r + 5} fontSize={8.5} fontWeight={700} fill="#fff" textAnchor="middle">{t.cluster.length}</text>
        </>
      )}
    </g>
  )
}
```

- [ ] **Step 3: Controles e legenda**

```tsx
// src/components/timeline/ZoomControls.tsx
import { Minus, Plus, Maximize2 } from 'lucide-react'
import type { NivelZoom } from '@/lib/timeline/zoom'

const NOME: Record<NivelZoom, string> = { macro: 'Macro', etapas: 'Etapas', micro: 'Micro' }
const btn = { width: 28, height: 28, border: '1px solid var(--ws-border)', borderRadius: 8, background: 'var(--ws-surface)', color: 'var(--ws-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as const

export function ZoomControls({ nivel, onMais, onMenos, onAjustar }: { nivel: NivelZoom; onMais: () => void; onMenos: () => void; onAjustar: () => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ws-vinho-b)', background: '#F7E9F5', borderRadius: 999, padding: '4px 10px' }}>{NOME[nivel]}</span>
      <button type="button" title="Afastar (−)" onClick={onMenos} style={btn}><Minus size={14} /></button>
      <button type="button" title="Aproximar (+)" onClick={onMais} style={btn}><Plus size={14} /></button>
      <button type="button" title="Ajustar ao deal (0)" onClick={onAjustar} style={btn}><Maximize2 size={14} /></button>
      <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginLeft: 6 }}>Ctrl + scroll pra zoom · arraste pra mover</span>
    </div>
  )
}
```

```tsx
// src/components/timeline/TimelineLegend.tsx
import { CORES } from '@/lib/timeline/layout'
import type { NivelZoom } from '@/lib/timeline/zoom'

const Item = ({ cor, label, contorno }: { cor: string; label: string; contorno?: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>
    <span style={{ width: 10, height: 10, borderRadius: 999, background: cor, border: contorno ? `2px solid ${contorno}` : undefined, display: 'inline-block' }} />{label}
  </span>
)

/** Só os símbolos que existem no nível atual. */
export function TimelineLegend({ nivel }: { nivel: NivelZoom }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
      <Item cor={CORES.MQL} label="MQL" /><Item cor={CORES.SDR} label="SDR" /><Item cor={CORES.Closer} label="Closer" />
      <Item cor={CORES.ganho} label="Ganho" /><Item cor={CORES.perda} label="Perdido" />
      {nivel !== 'macro' && <><Item cor={CORES.noShow} label="No-show" /><Item cor={CORES.desconhecida} label="Etapa fora do catálogo" /><Item cor={CORES.reaberto} label="Reaberto (reciclagem)" /></>}
      {nivel === 'micro' && <><Item cor={CORES.SDR} label="Toque (ligação · WhatsApp · e-mail)" /><Item cor={CORES.SDR} contorno={CORES.noShow} label="Toque atrasado" /><Item cor="#fff" contorno={CORES.SDR} label="Tarefa em aberto" /></>}
    </div>
  )
}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npx oxlint src/components/timeline` — Expected: limpo. (Se `tsc` reclamar de `import type { LucideIcon }`, troque por `import type { LucideProps } from 'lucide-react'` e `type LucideIcon = (p: LucideProps) => JSX.Element` — o nome exportado varia entre versões; conferir em `node_modules/lucide-react/dist/lucide-react.d.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/timeline
git commit -m "feat(vendas): PistaCanvas, ícones, controles de zoom e legenda da Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: `MomentoPopover` e `DealHeader`

**Files:**
- Create: `src/components/timeline/MomentoPopover.tsx`, `src/components/timeline/DealHeader.tsx`

**Interfaces:**
- Consumes: `Momento`, `Timeline`, `DealCabecalho`, `Fase` (Task 1); `NoLayout`/`ToqueLayout`/`MarcadorLayout` (Task 8); `classificarMotivo` de `@/constants/motivosPerda`; `fmtDuracao`, `fmtData` de `@/components/ui/dealDrawerShared`; `rdDealUrl`; `BRAND_ACCENT`, `marcaLabel`; `money`, `nf`.
- Produces: `MomentoPopover({ alvo, timeline, idDeal, onFechar })` onde `alvo` é `{ tipo: 'no'; no: NoLayout } | { tipo: 'toque'; toque: ToqueLayout } | { tipo: 'marcador'; marcador: MarcadorLayout }`; `DealHeader({ cabecalho, timeline })`.

- [ ] **Step 1: MomentoPopover**

```tsx
// src/components/timeline/MomentoPopover.tsx
import { ExternalLink, X } from 'lucide-react'
import { classificarMotivo } from '@/constants/motivosPerda'
import { fmtDuracao } from '@/components/ui/dealDrawerShared'
import { rdDealUrl } from '@/lib/rd'
import type { Momento, Timeline } from '@/lib/timeline/tipos'
import type { MarcadorLayout, NoLayout, ToqueLayout } from '@/lib/timeline/layout'

export type AlvoPopover =
  | { tipo: 'no'; no: NoLayout }
  | { tipo: 'toque'; toque: ToqueLayout }
  | { tipo: 'marcador'; marcador: MarcadorLayout }

interface Props { alvo: AlvoPopover; timeline: Timeline; idDeal: string; onFechar: () => void }

const hora = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const L = ({ k, v }: { k: string; v: React.ReactNode }) => v == null || v === '' ? null : (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--ws-text-secondary)', minWidth: 96 }}>{k}</span><span style={{ color: 'var(--ws-text-primary)' }}>{v}</span></div>
)
const Pill = ({ children, tom }: { children: React.ReactNode; tom: 'atencao' | 'positivo' | 'risco' | 'neutro' }) => {
  const cores = { atencao: ['#FDF1DE', '#B7791F'], positivo: ['#E4F6F5', '#1D8F89'], risco: ['#FBE7EB', '#B4324B'], neutro: ['#F1F5F9', '#475569'] }[tom]
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: cores[0], color: cores[1], borderRadius: 999, padding: '3px 8px' }}>{children}</span>
}
const linkExt = (href: string, texto: string) => (
  <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)' }}>{texto}<ExternalLink size={11} /></a>
)

function Corpo({ m, timeline }: { m: Momento; timeline: Timeline }) {
  const meta = m.meta
  if (meta?.kind === 'tarefa') {
    return (
      <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {meta.atrasada ? <Pill tom="atencao">{meta.atrasoDias != null ? `${meta.atrasoDias} dia${meta.atrasoDias === 1 ? '' : 's'} atrasada` : 'atrasada'}</Pill> : meta.concluida ? <Pill tom="positivo">no prazo</Pill> : <Pill tom="neutro">em aberto</Pill>}
          <Pill tom="neutro">{meta.tipoTarefa}</Pill>
        </div>
        <L k="Quem" v={m.ator} />
        <L k="Prazo" v={meta.prazo ? hora(new Date(meta.prazo)) : '—'} />
        <L k="Feita em" v={meta.feitaEm ? hora(new Date(meta.feitaEm)) : '—'} />
        {meta.notas && <div style={{ fontSize: 12.5, color: 'var(--ws-text-primary)', whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{meta.notas}</div>}
      </>
    )
  }
  if (meta?.kind === 'reuniao') {
    const ok = meta.respostas.filter(r => r.resposta === 'yes').length
    return (
      <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {meta.scorecard && <Pill tom="neutro">{meta.scorecard}</Pill>}
          {meta.notaIA != null && <Pill tom={meta.notaIA >= 7 ? 'positivo' : meta.notaIA >= 5 ? 'atencao' : 'risco'}>nota IA {meta.notaIA.toFixed(1).replace('.', ',')}</Pill>}
          {meta.duracaoMin != null && <Pill tom="neutro">{meta.duracaoMin} min</Pill>}
        </div>
        <L k="Tipo" v={meta.tipoReuniao} />
        <L k="Quem" v={m.ator} />
        <L k="Participantes" v={meta.participantes.length ? meta.participantes.join(', ') : null} />
        {meta.respostas.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>Scorecard · {ok}/{meta.respostas.length}</div>
            {meta.respostas.map((r, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', gap: 6 }}><span style={{ color: r.resposta === 'yes' ? '#1D8F89' : '#B4324B', fontWeight: 700 }}>{r.resposta === 'yes' ? '✓' : '✗'}</span><span style={{ color: 'var(--ws-text-secondary)' }}>{r.categoria} ·</span><span>{r.pergunta}</span></div>
            ))}
          </div>
        )}
        {meta.resumo.map(s => (
          <div key={s.titulo}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>{s.titulo}</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5 }}>{s.itens.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ))}
        {meta.url && linkExt(meta.url, 'Abrir no MeetRox')}
      </>
    )
  }
  if (meta?.kind === 'perda') {
    const cat = classificarMotivo(meta.motivo)
    return (
      <>
        <L k="Motivo" v={meta.motivo ?? '—'} />
        <L k="Categoria" v={cat ?? "—"} />
        {meta.anotacao && <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{meta.anotacao}</div>}
      </>
    )
  }
  if (meta?.kind === 'campo') return <><L k={meta.campo} v={`${meta.de ?? '—'} → ${meta.para ?? '—'}`} /><L k="Quem" v={m.ator} /></>
  // etapa / no_show / retomada / ganho
  const trecho = timeline.trechos.find(t => t.deId === m.id)
  return (
    <>
      {meta?.kind === 'etapa' && <L k="Veio de" v={meta.etapaAnterior ?? '—'} />}
      {meta?.kind === 'etapa' && <L k="Funil" v={meta.funil} />}
      <L k="Quem" v={m.ator} />
      {trecho && <L k="Parado aqui" v={fmtDuracao(trecho.duracaoDias)} />}
      {trecho && trecho.toques > 0 && <L k="Toques no trecho" v={`${trecho.toques}${trecho.atrasados ? ` (${trecho.atrasados} atrasados)` : ''}`} />}
      {m.desvio && <Pill tom={m.desvio === 'no_show' || m.desvio === 'voltou' ? 'atencao' : m.desvio === 'perdeu' ? 'risco' : 'neutro'}>{{ voltou: 'voltou etapa', pulou: 'pulou etapa', no_show: 'no-show', trocou_funil: 'trocou de funil', perdeu: 'perdido', reciclou: 'reciclado' }[m.desvio]}</Pill>}
    </>
  )
}

export function MomentoPopover({ alvo, timeline, idDeal, onFechar }: Props) {
  const m: Momento | null = alvo.tipo === 'no' ? alvo.no.momento : alvo.tipo === 'toque' ? alvo.toque.momento : alvo.marcador.momento
  const titulo = alvo.tipo === 'no' ? alvo.no.titulo : m?.titulo ?? ''
  const subtitulo = m ? hora(m.instante) : alvo.tipo === 'no' ? alvo.no.detalhe : ''
  const cluster = alvo.tipo === 'toque' && alvo.toque.cluster.length > 1 ? alvo.toque.cluster : null
  return (
    <div role="dialog" aria-label={titulo} style={{ position: 'absolute', right: 16, top: 16, width: 'min(380px, calc(100% - 32px))', maxHeight: 'calc(100% - 32px)', overflowY: 'auto', background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 14, boxShadow: '0 12px 32px rgba(51,3,45,.16)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ws-text-primary)' }}>{titulo}</div><div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>{subtitulo}</div></div>
        <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)' }}><X size={16} /></button>
      </div>
      {cluster ? cluster.map(c => (
        <div key={c.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.titulo} <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· {hora(c.instante)}</span></div>
          <Corpo m={c} timeline={timeline} />
        </div>
      )) : m ? <Corpo m={m} timeline={timeline} /> : alvo.tipo === 'no' && alvo.no.fase ? (
        <>
          <L k="Duração" v={fmtDuracao(alvo.no.fase.duracaoDias)} />
          <L k="Etapas" v={alvo.no.fase.etapas} /><L k="Toques" v={alvo.no.fase.toques} /><L k="Atrasados" v={alvo.no.fase.atrasados} /><L k="No-shows" v={alvo.no.fase.noShows} /><L k="Reuniões" v={alvo.no.fase.reunioes} />
        </>
      ) : null}
      <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 8 }}>{linkExt(rdDealUrl(idDeal), 'Abrir no RD')}</div>
    </div>
  )
}
```
`classificarMotivo` devolve `'processo' | 'mercado' | 'ignorar' | null` (string, não objeto).

- [ ] **Step 2: DealHeader**

```tsx
// src/components/timeline/DealHeader.tsx
import { ExternalLink } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { rdDealUrl } from '@/lib/rd'
import { money, nf } from '@/lib/format'
import { StatusBadge } from '@/components/ui/dealDrawerShared'
import type { DealCabecalho, Timeline } from '@/lib/timeline/tipos'

const Chip = ({ children, cor }: { children: React.ReactNode; cor?: string }) => (
  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1px solid ${cor ?? 'var(--ws-border)'}`, color: cor ?? 'var(--ws-text-secondary)', background: 'var(--ws-surface)', fontWeight: cor ? 600 : 400 }}>{children}</span>
)
const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div style={{ minWidth: 92 }}>
    <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)' }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
)

export function DealHeader({ cabecalho, timeline }: { cabecalho: DealCabecalho; timeline: Timeline }) {
  const r = cabecalho.row
  const accent = BRAND_ACCENT[r.marca ?? ''] ?? 'var(--ws-vinho-b)'
  const t = timeline.totais
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, color: 'var(--ws-text-primary)', lineHeight: 1.1 }}>{r.nome_negociacao ?? r.id_lead}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <Chip cor={accent}>{marcaLabel(r.marca)}</Chip>
            <Chip>{r.origem_comercial ?? 'Inbound'}</Chip>
            {r.fonte_macro && <Chip>{r.fonte_macro}</Chip>}
            <StatusBadge status={r.status_atual} />
            {r.nome_sdr && <Chip>SDR · {r.nome_sdr}</Chip>}
            {r.nome_closer && <Chip>Closer · {r.nome_closer}</Chip>}
            {cabecalho.ciclos.length > 1 && <Chip>{cabecalho.ciclos.length} ciclos</Chip>}
            <a href={rdDealUrl(r.id_lead)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ws-vinho-b)', fontWeight: 600 }}>Abrir no RD <ExternalLink size={11} /></a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Kpi label="Dias no funil" value={nf(Math.round(t.diasNoFunil))} />
          <Kpi label="Toques" value={nf(t.toques)} />
          <Kpi label="Atrasados" value={nf(t.atrasados)} />
          <Kpi label="Reuniões" value={nf(t.reunioes)} />
          <Kpi label="No-shows" value={nf(t.noShows)} />
          <Kpi label="Taxa de franquia" value={r.valor_produto != null ? money(r.valor_produto) : '—'} />
          <Kpi label="Unidades" value={nf(r.quantidade_unidades ?? 0)} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build + lint + commit**

```bash
npm run build && npx oxlint src/components/timeline
git add src/components/timeline/MomentoPopover.tsx src/components/timeline/DealHeader.tsx
git commit -m "feat(vendas): cartão do clique e cabeçalho do deal na Linha do Tempo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Página do deal, rota, menu e permissão

**Files:**
- Create: `src/pages/LinhaDoTempoDeal.tsx`
- Modify: `src/App.tsx` (rotas), `src/components/AppLayout.tsx` (`VENDAS_SUB`, `getActiveKey`, `getVendasActiveSub`, `handleSubNav`), `src/lib/permissoes.ts` (`ABAS`, `TELAS_COM_FILTRO_DE_MARCA`)

**Interfaces:**
- Consumes: `useDealTimeline` (Task 9), `useZoomPan` (Task 10), `layoutPista` (Task 8), componentes (Tasks 11–12), `useAcesso` de `@/contexts/AcessoContext`, `findBrandByMarca`.
- Produces: rota `/linha-do-tempo/:idDeal`; chave de permissão `aba.linha-do-tempo`.

- [ ] **Step 1: Permissão e menu**

`src/lib/permissoes.ts` — em `ABAS`, depois de `aba.analise-perda`:
```ts
  { chave: 'aba.linha-do-tempo',   label: 'Linha do Tempo',       rota: '/linha-do-tempo',     area: 'Vendas' },
```
e em `TELAS_COM_FILTRO_DE_MARCA` acrescentar `'aba.linha-do-tempo'` (a casa filtra por marca; pessoa limitada a marcas entra, restrita às dela).

`src/components/AppLayout.tsx`:
- `VENDAS_SUB`: depois de `analise-perda`, `{ key: 'linha-do-tempo', label: 'Linha do Tempo' }`.
- `getActiveKey`: incluir `|| pathname.startsWith('/linha-do-tempo')` na condição que devolve `'vendas'`.
- `getVendasActiveSub`: `if (pathname.startsWith('/linha-do-tempo')) return 'linha-do-tempo'`.
- `handleSubNav`: `else if (key === 'linha-do-tempo') navigate('/linha-do-tempo')`.

`src/App.tsx`:
```ts
const LinhaDoTempo     = lazyWithRetry(() => import('@/pages/LinhaDoTempo').then(m => ({ default: m.LinhaDoTempo })))
const LinhaDoTempoDeal = lazyWithRetry(() => import('@/pages/LinhaDoTempoDeal').then(m => ({ default: m.LinhaDoTempoDeal })))
```
e as rotas, junto das outras de Vendas:
```tsx
          <Route path="/linha-do-tempo"         element={<LinhaDoTempo />} />
          <Route path="/linha-do-tempo/:idDeal" element={<LinhaDoTempoDeal />} />
```
`permissaoDaRota` já resolve `/linha-do-tempo/...` pelo `startsWith` da rota de `ABAS` — sem mudança.

Até o Task 14 existir, crie `src/pages/LinhaDoTempo.tsx` mínimo pra o build passar:
```tsx
export function LinhaDoTempo() { return null }
```

- [ ] **Step 2: Página do deal**

```tsx
// src/pages/LinhaDoTempoDeal.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { SCard } from '@/components/ui/v2'
import { useAcesso } from '@/contexts/AcessoContext'
import { useDealTimeline } from '@/hooks/useDealTimeline'
import { useZoomPan } from '@/hooks/useZoomPan'
import { layoutPista } from '@/lib/timeline/layout'
import { rdDealUrl } from '@/lib/rd'
import { findBrandByMarca } from '@/constants/brands'
import { DealHeader } from '@/components/timeline/DealHeader'
import { PistaCanvas } from '@/components/timeline/PistaCanvas'
import { ZoomControls } from '@/components/timeline/ZoomControls'
import { TimelineLegend } from '@/components/timeline/TimelineLegend'
import { MomentoPopover, type AlvoPopover } from '@/components/timeline/MomentoPopover'

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => setLargura(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, largura }
}

const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

export function LinhaDoTempoDeal() {
  const { idDeal } = useParams<{ idDeal: string }>()
  const { marcas: marcasPermitidas } = useAcesso()
  const { timeline, cabecalho, loading, naoEncontrado, erros } = useDealTimeline(idDeal)
  const { ref, largura } = useLargura<HTMLDivElement>()
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  // Pessoa limitada a marcas só vê deal das marcas dela.
  const foraDaMarca = !!cabecalho && !!marcasPermitidas && !marcasPermitidas.includes(findBrandByMarca(cabecalho.row.marca)?.key ?? '')

  const diasTotal = timeline ? Math.max(1, timeline.totais.diasNoFunil) : 1
  const [larguraConteudo, setLarguraConteudo] = useState(0)
  const zoom = useZoomPan({ diasTotal, larguraViewport: largura, larguraConteudo })
  const layout = useMemo(() => timeline ? layoutPista(timeline, { k: zoom.k, x0: zoom.x0, largura }, zoom.nivel) : null, [timeline, zoom.k, zoom.x0, zoom.nivel, largura])
  useEffect(() => { if (layout) setLarguraConteudo(layout.larguraConteudo) }, [layout])
  useEffect(() => { setSelecionadoId(null) }, [zoom.nivel, idDeal])

  const alvo = useMemo<AlvoPopover | null>(() => {
    if (!layout || !selecionadoId) return null
    const no = layout.nos.find(n => n.id === selecionadoId)
    if (no) return { tipo: 'no', no }
    const toque = layout.toques.find(t => t.id === selecionadoId)
    if (toque) return { tipo: 'toque', toque }
    const marcador = layout.marcadores.find(m => m.id === selecionadoId)
    return marcador ? { tipo: 'marcador', marcador } : null
  }, [layout, selecionadoId])

  const voltar = <Link to="/linha-do-tempo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-secondary)', marginBottom: 16 }}><ArrowLeft size={14} /> Linha do Tempo</Link>

  if (loading) return <div style={pad}>{voltar}<div style={{ color: 'var(--ws-text-secondary)' }}>Carregando a história do deal…</div></div>

  if (naoEncontrado || foraDaMarca || !timeline || !cabecalho) {
    return (
      <div style={pad}>
        {voltar}
        <QueryErrorBanner errors={[erros.deal]} scope="deal" />
        <SCard>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-primary)' }}>Deal não encontrado no dashboard</div>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
            Deal sem marca no RD, de teste, excluído ou fora das marcas do seu acesso não aparece aqui.
          </div>
          {idDeal && <a href={rdDealUrl(idDeal)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--ws-vinho-b)' }}>Abrir no RD <ExternalLink size={12} /></a>}
        </SCard>
      </div>
    )
  }

  return (
    <div style={pad}>
      {voltar}
      <QueryErrorBanner errors={[erros.eventos && `eventos: ${erros.eventos}`, erros.tarefas && `tarefas indisponíveis: ${erros.tarefas}`, erros.reunioes && `reuniões indisponíveis: ${erros.reunioes}`]} scope="parte da linha do tempo" />
      <DealHeader cabecalho={cabecalho} timeline={timeline} />
      <SCard style={{ marginTop: 20, position: 'relative' }} pad={22}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ws-text-primary)' }}>A Pista</div>
          <ZoomControls nivel={zoom.nivel} onMais={zoom.zoomIn} onMenos={zoom.zoomOut} onAjustar={zoom.ajustar} />
        </div>
        <div ref={ref} style={{ position: 'relative' }}>
          {layout && largura > 0 && (
            <div key={zoom.nivel} style={{ animation: 'pista-fade 250ms ease' }}>
              <PistaCanvas layout={layout} nivel={zoom.nivel} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} handlers={zoom.handlers} arrastando={zoom.arrastando} largura={largura} />
            </div>
          )}
          {alvo && <MomentoPopover alvo={alvo} timeline={timeline} idDeal={cabecalho.row.id_lead} onFechar={() => setSelecionadoId(null)} />}
        </div>
        <TimelineLegend nivel={zoom.nivel} />
        {timeline.totais.toques === 0 && timeline.totais.reunioes === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 8 }}>Sem tarefas nem reuniões registradas pra este deal.</div>
        )}
      </SCard>
      <style>{`@keyframes pista-fade { from { opacity: 0; transform: scale(.985) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { [style*="pista-fade"] { animation: none !important } }`}</style>
    </div>
  )
}
```

- [ ] **Step 3: Build + lint**

`npm run build && npx oxlint src/pages/LinhaDoTempoDeal.tsx src/components/AppLayout.tsx src/App.tsx src/lib/permissoes.ts` — limpo.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LinhaDoTempoDeal.tsx src/pages/LinhaDoTempo.tsx src/App.tsx src/components/AppLayout.tsx src/lib/permissoes.ts
git commit -m "feat(vendas): tela /linha-do-tempo/:idDeal com Pista, zoom e cartão; rota, menu e permissão

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: A casa — `/linha-do-tempo` com FilterBar, busca e cartões Macro

**Files:**
- Create: `src/components/timeline/DealCardMacro.tsx`
- Modify: `src/pages/LinhaDoTempo.tsx` (substitui o stub do Task 13)

**Interfaces:**
- Consumes: `useSharedFilters`, `useFunilVendas`, `FilterBar`, `OrigemToggle`, `PageTop`, `QueryErrorBanner`, `FiltrosObrigatoriosAviso`, `buildScopeFilter`, `toWindow`, `funilFilterOptions`, `dealNaJanela` (Task 6), `fasesDaLinha` (Task 6), `parseIdDeal` (Task 6), `fmtDiasCurto`, `CORES` (Task 8), `BRAND_LIST`, `BRAND_ACCENT`, `marcaLabel`.
- Produces: `DealCardMacro({ row, agora })`; página `LinhaDoTempo`.

- [ ] **Step 1: DealCardMacro**

```tsx
// src/components/timeline/DealCardMacro.tsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { StatusBadge } from '@/components/ui/dealDrawerShared'
import { fasesDaLinha } from '@/lib/timeline/fasesDaLinha'
import { CORES, fmtDiasCurto } from '@/lib/timeline/layout'
import { diasEntre } from '@/lib/timeline/tipos'
import type { FunnelRow } from '@/lib/funnelTypes'

/** Cartão da lista: nome, chips e a mini-pista de fases (Macro) só com as datas da linha. */
export function DealCardMacro({ row, agora }: { row: FunnelRow; agora: Date }) {
  const { fases, desfecho, inicio, fim } = useMemo(() => fasesDaLinha(row, agora), [row, agora])
  const total = Math.max(1, diasEntre(inicio, fim))
  const accent = BRAND_ACCENT[row.marca ?? ''] ?? 'var(--ws-vinho-b)'
  const corFim = desfecho.tipo === 'ganho' ? CORES.ganho : desfecho.tipo === 'perda' ? CORES.perda : CORES.hoje
  return (
    <Link to={`/linha-do-tempo/${row.id_lead}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent }} onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ws-text-primary)' }}>{row.nome_negociacao ?? row.id_lead}</div>
          <StatusBadge status={row.status_atual} />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: accent, fontWeight: 600 }}>{marcaLabel(row.marca)}</span>
          {row.nome_sdr && <span>· SDR {row.nome_sdr}</span>}{row.nome_closer && <span>· Closer {row.nome_closer}</span>}
          <span>· {fmtDiasCurto(total).toLowerCase()}</span>
        </div>
        {/* mini-pista */}
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          {fases.map(f => (
            <div key={`${f.tipo}-${f.inicio.getTime()}`} title={`${f.tipo} · ${fmtDiasCurto(f.duracaoDias)}`} style={{ width: `${Math.max(2, (f.duracaoDias / total) * 100)}%`, background: CORES[f.tipo === 'Reaberto' ? 'reaberto' : f.tipo] }} />
          ))}
          <div style={{ width: 8, background: corFim, borderRadius: 4 }} />
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Página da casa**

```tsx
// src/pages/LinhaDoTempo.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FiltrosObrigatoriosAviso } from '@/components/ui/FiltrosObrigatoriosAviso'
import { DealCardMacro } from '@/components/timeline/DealCardMacro'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { buildScopeFilter, toWindow } from '@/lib/metrics'
import { funilFilterOptions, dealNaJanela } from '@/lib/funilFilterOptions'
import { parseIdDeal } from '@/lib/rd'
import { BRAND_LIST } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import { nf } from '@/lib/format'

const PAGINA = 50
const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

function useDebounce(v: string, ms: number): string {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function LinhaDoTempo() {
  const navigate = useNavigate()
  const { origem, brandKeys, periodMode, periodValues, ranges, fontes, subFontes, sdrs, closers, viewModes } = useSharedFilters()
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca, 300)
  const [limite, setLimite] = useState(PAGINA)
  const agora = useMemo(() => new Date(), [])

  const marcasParaEscopo = useMemo(
    () => brandKeys.map(k => BRAND_LIST.find(b => b.key === k)).filter((b): b is BrandDef => !!b).map(b => b.marca).filter((m): m is Marca => !!m),
    [brandKeys],
  )
  const { data: rows, error: rowsError, loading } = useFunilVendas(origem)
  const scope = useMemo(() => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes, sdrs, closers }), [origem, marcasParaEscopo, fontes, subFontes, sdrs, closers])
  const win = useMemo(() => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))), [ranges])
  const cohort = viewModes.funnelView === 'cohort'
  const opcoes = useMemo(() => funilFilterOptions({ rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, cohort }), [rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, cohort])
  const marcasDisponiveis = useMemo(() => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key), [opcoes.marcas])

  // id ou link do RD colado: vai direto, ignorando os filtros (o deal pode estar fora do recorte).
  useEffect(() => { const id = parseIdDeal(termo); if (id) navigate(`/linha-do-tempo/${id}`) }, [termo, navigate])

  const lista = useMemo(() => {
    const t = semAcento(termo.trim())
    return rows
      .filter(r => r.eh_ciclo_atual && scope(r) && dealNaJanela(r, win, cohort))
      .filter(r => !t || semAcento(r.nome_negociacao ?? '').includes(t))
      .sort((a, b) => (b.data_novo_mql ?? '').localeCompare(a.data_novo_mql ?? ''))
  }, [rows, scope, win, cohort, termo])
  useEffect(() => { setLimite(PAGINA) }, [termo, scope, win, cohort])

  const faltando = [brandKeys.length === 0 ? 'uma marca' : null, periodMode !== 'dia' && periodValues.length === 0 ? 'um período' : null].filter((x): x is string => x !== null)

  const barra = (
    <FilterBar marcasDisponiveis={marcasDisponiveis} fontesDisponiveis={opcoes.fontes} subFontesDisponiveis={opcoes.subFontes} sdrsDisponiveis={opcoes.sdrs} closersDisponiveis={opcoes.closers} hideVendasToggle hideContagemToggle />
  )

  if (faltando.length > 0) {
    return <div style={pad}><PageTop title="Linha do Tempo" titleAside={<OrigemToggle />} subtitle="Selecione os filtros obrigatórios" />{barra}<QueryErrorBanner errors={[rowsError]} scope="Linha do Tempo" /><FiltrosObrigatoriosAviso faltando={faltando} /></div>
  }

  return (
    <div style={pad}>
      <PageTop title="Linha do Tempo" titleAside={<OrigemToggle />} subtitle="Entre num deal e veja a história dele: etapas, toques e reuniões, com zoom." />
      {barra}
      <QueryErrorBanner errors={[rowsError]} scope="Linha do Tempo" />
      <div style={{ position: 'relative', margin: '16px 0' }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--ws-text-secondary)' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar deal por nome, ou colar o id / link do RD"
          style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 12, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', fontSize: 14, color: 'var(--ws-text-primary)' }} />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
        {loading && rows.length === 0 ? 'Carregando…' : `${nf(lista.length)} deals no recorte · alguma etapa dentro do período${cohort ? ' (safra de MQL)' : ''}`}
      </div>
      {lista.length === 0 && !loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhum deal com esse nome no recorte atual. Amplie o período ou cole o link do RD.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {lista.slice(0, limite).map(r => <DealCardMacro key={`${r.id_lead}::${r.ciclo}`} row={r} agora={agora} />)}
      </div>
      {lista.length > limite && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" onClick={() => setLimite(l => l + PAGINA)} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer' }}>
            Carregar mais ({nf(lista.length - limite)} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build + lint + commit**

```bash
npm run build && npx oxlint src/pages/LinhaDoTempo.tsx src/components/timeline/DealCardMacro.tsx
git add src/pages/LinhaDoTempo.tsx src/components/timeline/DealCardMacro.tsx
git commit -m "feat(vendas): casa da Linha do Tempo com os filtros de Vendas, busca e cartões Macro

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Atalho nos 4 popups de deal

**Files:**
- Modify: `src/components/ui/StageDealsDrawer.tsx`, `src/components/ui/SimpleDealsDrawer.tsx`, `src/components/ui/PerdaDealsDrawer.tsx`, `src/components/ui/RepeatedDealsDrawer.tsx`

- [ ] **Step 1: Componente compartilhado em `dealDrawerShared.tsx`**

```tsx
// acrescentar em src/components/ui/dealDrawerShared.tsx
import { Link } from 'react-router-dom'
import { History } from 'lucide-react'

/** Atalho pra Linha do Tempo do deal, ao lado do link externo pro RD nos popups. */
export function LinkLinhaDoTempo({ idDeal, cor }: { idDeal: string; cor: string }) {
  return (
    <Link to={`/linha-do-tempo/${idDeal}`} title="Linha do tempo do deal" onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 8, color: cor, opacity: .8 }}>
      <History size={13} />
    </Link>
  )
}
```

- [ ] **Step 2: Em cada drawer, logo depois do `</a>` do link do RD na célula da negociação**

`StageDealsDrawer.tsx` (≈ linha 163), `SimpleDealsDrawer.tsx` (≈ 94), `PerdaDealsDrawer.tsx` (≈ 106): `<LinkLinhaDoTempo idDeal={r.id_lead} cor={accent} />`.
`RepeatedDealsDrawer.tsx` (≈ 109): `<LinkLinhaDoTempo idDeal={g.row.id_lead} cor={accent} />`.
Importar `LinkLinhaDoTempo` de `./dealDrawerShared` em cada um. Os 4 drawers vivem dentro do `BrowserRouter` (renderizados pelas páginas), então o `Link` funciona.

- [ ] **Step 3: Build + testes + commit**

```bash
npm run build && npx vitest run && npx oxlint src/components/ui
git add src/components/ui
git commit -m "feat(vendas): atalho pra Linha do Tempo nos popups de deal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Ver renderizado com deals reais, permissão, docs e PR

**Files:**
- Create: `docs/sql/2026-09-16-acesso-linha-do-tempo.sql`
- Modify: `CLAUDE.md` (seção 5 + histórico), temporariamente `src/App.tsx` (rota sem login, removida antes do commit)

- [ ] **Step 1: Rota temporária sem autenticação (mesmo padrão das sessões anteriores)**

Em `src/App.tsx`, fora do `PrivateRoute`, adicionar temporariamente
`<Route path="/__tl/:idDeal" element={<SharedFiltersProvider><LinhaDoTempoDeal /></SharedFiltersProvider>} />` e
`<Route path="/__tl" element={<SharedFiltersProvider><LinhaDoTempo /></SharedFiltersProvider>} />`
(se `LinhaDoTempoDeal` precisar de `AcessoProvider`, envolva também). Subir o dev server pelo `preview_start` (nunca via Bash) num `.claude/launch.json` apontando pra `~/ws-dashboard-worktree-timeline` (`npm run dev`, porta 5173).

- [ ] **Step 2: Escolher 3 deals reais por SQL (Supabase de Expansão)**

```sql
-- ganho com no-show
select v.id_lead, v.nome_negociacao from vw_funil_vendas v
 where v.status_atual='Ganho' and v.data_no_show is not null and v.eh_ciclo_atual order by v.data_venda desc limit 1;
-- perdido e reciclado (2+ ciclos)
select id_lead, nome_negociacao from vw_funil_vendas where ciclo >= 2 and eh_ciclo_atual order by data_novo_mql desc limit 1;
-- em andamento só com MQL
select id_lead, nome_negociacao from vw_funil_vendas where status_atual='Em andamento' and etapa_funil='Novo MQL' and eh_ciclo_atual order by data_novo_mql desc limit 1;
-- e um com muitas tarefas + reunião MeetRox
select t.deal_id, count(*) n from db_tarefas_sdr t join "DB_Reunioes_MeetRox" r on r.crm_deal_id = t.deal_id group by 1 order by 2 desc limit 1;
```

- [ ] **Step 3: Conferir na tela (browser pane), pra cada deal**

- Etapas: nós alternam, nenhum rótulo colide, bolinhas a 14 px da pista, chevrons com duração, terminal certo (ganho dourado / perdido vermelho / hoje tracejado).
- Ctrl+scroll até Micro: fileira de toques aparece, atrasados com contorno laranja, cluster com contador, marcadores de troca de responsável; clicar num toque abre o cartão com assunto/notas; clicar numa reunião mostra scorecard e resumo.
- Afastar até Macro: 1 nó por fase com resumo; clique mostra os totais.
- `−`/`+`/ajustar e teclas `+`/`-`/`0`.
- Casa: FilterBar filtra a lista; contagem bate com `select count(distinct id_lead) from vw_funil_vendas where ...` pro mesmo recorte (mesma regra `dealNaJanela`); colar um link do RD navega direto; deal fora do recorte abre mesmo assim.
- Console sem erro (`read_console_messages`).
- Registrar screenshots dos 3 níveis (`SendUserFile`) pro Junior.

- [ ] **Step 4: Remover a rota temporária** e confirmar `git diff src/App.tsx` só com as 2 rotas reais.

- [ ] **Step 5: Script de permissão (Junior roda no SQL Editor do Supabase de Marketing)**

```sql
-- docs/sql/2026-09-16-acesso-linha-do-tempo.sql
-- Libera a aba "Linha do Tempo" pra todo papel que já vê a Visão Macro.
-- Administrador (acesso_total) já vê tudo sem isso.
insert into public.acesso_papel_permissoes (papel_id, permissao)
select pp.papel_id, 'aba.linha-do-tempo'
  from public.acesso_papel_permissoes pp
 where pp.permissao = 'aba.visao-macro'
on conflict do nothing;
```
Mandar via `SendUserFile` com a explicação de 1 linha.

- [ ] **Step 6: CLAUDE.md**

Na seção 1, tabela de abas: acrescentar "Linha do Tempo" nas abas de Vendas. Na seção 5, um bloco novo listando `src/lib/timeline/*`, `useDealTimeline`, `useZoomPan`, `src/components/timeline/*`, as 2 rotas, e as regras: reunião por `crm_deal_id`; handoff fundido; etapa crua vira nó cinza; Período da casa = `dealNaJanela`. Na seção 9, entrada `### 2026-09-16 — Linha do Tempo do deal (Pista com zoom Macro · Etapas · Micro)` no padrão das anteriores (o que, por quê, verificação, PR).

- [ ] **Step 7: PR**

```bash
cd ~/ws-dashboard-worktree-timeline && git fetch origin main && git merge origin/main   # resolver CLAUDE.md preservando os dois lados
npm run build && npx vitest run && npx oxlint src
git push -u origin feat/linha-do-tempo-deal
gh pr create --base main --title "feat(vendas): Linha do Tempo do deal (Pista com zoom Macro · Etapas · Micro)" --body-file - <<'EOF'
## O que muda
- Aba nova **Linha do Tempo** (Vendas): casa com os filtros de sempre + busca; tela do deal com a Pista (chevrons por fase, nós por etapa, toques e reuniões), zoom semântico e cartão do clique.
- Atalho nos 4 popups de deal.
- Camada pura `src/lib/timeline/` (normalizadores, montagem, layout, zoom) com testes.
- Permissão `aba.linha-do-tempo` (script em `docs/sql/` pro Junior rodar).

Spec: `docs/superpowers/specs/2026-09-15-linha-do-tempo-deal-design.md` · Plano: `docs/superpowers/plans/2026-09-15-linha-do-tempo-deal.md`

## Verificação
`npm run build` (tsc -b) + `npx vitest run` + `oxlint`; visto renderizado numa rota temporária sem login com 3 deals reais (ganho com no-show, perdido e reciclado, só MQL) — prints na conversa.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```
Depois do merge: avisar o Junior de rodar o SQL de permissão, e limpar `git worktree remove ~/ws-dashboard-worktree-timeline`.

---

## Self-review (feito ao escrever)

- **Cobertura do spec:** portas de entrada (T13, T14, T15); filtros da casa e regra do Período (T6, T14); 3 fontes + coalesce de reunião (T2–T4, T9); modelo e regras de montagem (T1, T5); layout aprovado (T8, T11); zoom com histerese e transição (T7, T10, T13); cartão por tipo (T12); cabeçalho/KPIs (T12); estados vazios/erros (T13, T14); permissão e marcas limitadas (T13, T16); testes (T2–T8); verificação visual + docs + PR (T16).
- **Tipos entre tasks:** `MomentoBruto`/`Momento`/`Timeline` (T1) usados igual em T2–T5, T8, T9, T12; `NoLayout.icone` (T8) consumido por `IconeDe` (T11); `AlvoPopover` (T12) montado em T13; `dealNaJanela`/`parseIdDeal`/`fasesDaLinha` (T6) usados em T14; `LinkLinhaDoTempo` (T15) importado de `dealDrawerShared`.
- **Placeholders:** nenhum "TBD"; todo passo de código tem o código.
