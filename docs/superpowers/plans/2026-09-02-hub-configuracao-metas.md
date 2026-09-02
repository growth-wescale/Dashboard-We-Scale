# Hub de Configuração de Metas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monthly goal-configuration hub for the Vendas area — a
6-step wizard where the manager launches each month's targets (reverse-goal
funnel with fixed/derived/off stages, weekly breakdown, per-person weighted
allocation), with every month's configuration frozen forever, and a secure
write path into Supabase that never trusts the exposed anon key.

**Architecture:** A pure, fully-tested resolution engine
(`src/lib/metasEngine.ts`) computes everything client-side — funnel
resolution, gap detection, weighted split, week generation, and the mirror
rows for `DB_Metas_Performance`. The wizard (`src/pages/HubMetas.tsx` + step
components) reads draft state from 7 new Supabase Expansão tables via the
existing anon-key client, and writes (draft autosave + publish) through a new
Edge Function that validates the caller's Marketing-Supabase session before
using `service_role`. Publish is the only moment the mirror table and the rest
of the dashboard see the month.

**Tech Stack:** React 19 + TypeScript, Vite, Supabase (Postgres + Edge
Functions, Deno), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-hub-configuracao-metas-design.md`
(sections 1–11; section 12 — Corrida de Performance — is a separate plan,
written after this one ships, per its own dependency on `meta_semana`).

## Global Constraints

- Every SQL statement that creates or alters schema is applied via the
  Supabase MCP `apply_migration` tool against the **Expansão** project
  (`cygxmduuwlwfbodfrlkr`) — this repo has no `supabase/migrations/` folder
  convention; schema changes are applied directly and verified with
  `list_tables`/`execute_sql`, matching how every prior schema change in this
  project's history was done (see CLAUDE.md §9).
- All new tables use snake_case names (`meta_mes`, not `DB_Meta_Mes`) — matches
  this project's newer, non-legacy tables (`deal_eventos`, `atribuicao_manual`),
  not the older `DB_*` PascalCase tables.
- **Never grant `INSERT`/`UPDATE`/`DELETE` to `anon` or `authenticated` on any
  `meta_*` table.** Only `service_role` (used exclusively inside the Edge
  Function) writes. `anon`/`authenticated` get `SELECT` only, same RLS pattern
  already on `DB_Metas_Performance`.
- Money and quantities are `numeric`, never `float`/`real` — this project
  already has decimal quantities (67,1 SQL) and this must survive exactly.
  `mes_referencia` is always `date`, first-of-month (`'2026-09-01'`), matching
  `DB_Metas_Performance.mes_referencia`.
- Every pure function goes in `src/lib/metasEngine.ts` with tests in
  `src/lib/metasEngine.test.ts` — no logic embedded in components that isn't
  trivial to unit test, following the existing pattern of `metrics.ts`,
  `periodo.ts`, `aging.ts` (CLAUDE.md §5).
- UI components use inline `style` objects with `var(--ws-*)` CSS custom
  properties, matching every existing page in this codebase (`FunilVendas.tsx`,
  `CampanhaMetas.tsx`) — no new styling system.
- Build verification is **always** via `~/ws-dashboard-build` (`rsync src/`,
  then `npm run build` + `npx vitest run`), never directly in the OneDrive
  folder — CLAUDE.md §7, this has cost time before.

---

## Task 1: Database schema — the 7 `meta_*` tables

**Files:**
- No local file — applied via Supabase MCP `apply_migration` against project
  `cygxmduuwlwfbodfrlkr`.

**Interfaces:**
- Produces: the 7 tables every later task reads/writes. Column names below are
  final — later tasks' TypeScript types are named to match them 1:1.

- [x] **Step 1: Apply the schema migration**

Call the Supabase MCP tool `apply_migration` with `name: "hub_metas_schema"`
and this `query`:

```sql
create table meta_mes (
  mes_referencia date primary key,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  dia_virada_semana text not null default 'terca'
    check (dia_virada_semana in ('segunda','terca','quarta','quinta','sexta','sabado','domingo')),
  publicado_em timestamptz,
  publicado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table meta_semana (
  id bigint generated always as identity primary key,
  mes_referencia date not null references meta_mes(mes_referencia) on delete cascade,
  numero smallint not null,
  data_inicio date not null,
  data_fim date not null,
  unique (mes_referencia, numero)
);

create table meta_marca (
  id bigint generated always as identity primary key,
  mes_referencia date not null references meta_mes(mes_referencia) on delete cascade,
  marca text not null,
  ticket_medio numeric not null default 0,
  unique (mes_referencia, marca)
);

create table meta_marca_etapa (
  id bigint generated always as identity primary key,
  meta_marca_id bigint not null references meta_marca(id) on delete cascade,
  etapa text not null,
  modo text not null check (modo in ('fixo', 'derivado', 'desligado')),
  valor_fixo numeric,
  etapa_origem text,
  taxa numeric,
  taxa_origem text check (taxa_origem in ('mes_anterior', 'historico_crm', 'manual')),
  unique (meta_marca_id, etapa)
);

create table meta_pessoa (
  id bigint generated always as identity primary key,
  meta_marca_id bigint not null references meta_marca(id) on delete cascade,
  nome text not null,
  funcao text not null check (funcao in ('SDR', 'Closer')),
  peso numeric not null default 100,
  unique (meta_marca_id, nome, funcao)
);

create table meta_pessoa_semana (
  id bigint generated always as identity primary key,
  meta_pessoa_id bigint not null references meta_pessoa(id) on delete cascade,
  meta_semana_id bigint not null references meta_semana(id) on delete cascade,
  etapa text not null,
  valor numeric not null default 0,
  unique (meta_pessoa_id, meta_semana_id, etapa)
);

create table meta_log (
  id bigint generated always as identity primary key,
  mes_referencia date not null,
  entidade text not null,
  entidade_ref text,
  campo text not null,
  valor_anterior text,
  valor_novo text,
  autor text,
  criado_em timestamptz not null default now()
);

alter table meta_mes enable row level security;
alter table meta_semana enable row level security;
alter table meta_marca enable row level security;
alter table meta_marca_etapa enable row level security;
alter table meta_pessoa enable row level security;
alter table meta_pessoa_semana enable row level security;
alter table meta_log enable row level security;

create policy "leitura_dashboard" on meta_mes for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_semana for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_marca for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_marca_etapa for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_pessoa for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_pessoa_semana for select to anon, authenticated using (true);
create policy "leitura_dashboard" on meta_log for select to anon, authenticated using (true);
```

- [x] **Step 2: Verify the tables exist with the right shape**

Call `mcp__supabase__list_tables` with `schemas: ["public"]`, `verbose: true`
and confirm all 7 tables appear with the columns above. Then run:

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename like 'meta_%'
order by tablename;
```

Expected: exactly 7 rows, each `cmd = 'SELECT'`. No `INSERT`/`UPDATE`/`DELETE`
policy exists anywhere — that's deliberate (Global Constraints).

- [x] **Step 3: Commit** (schema itself lives in Supabase, not git — commit
      only the confirmation note)

```bash
git add docs/superpowers/plans/2026-09-02-hub-configuracao-metas.md
git commit -m "docs(vendas): task 1 concluída — schema meta_* aplicado no Supabase Expansão

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Engine — tipos e geração de semanas

**Files:**
- Create: `src/lib/metasEngine.ts`
- Test: `src/lib/metasEngine.test.ts`

**Interfaces:**
- Produces:
  `ETAPAS_META_ORDEM: readonly EtapaMeta[]`,
  `type EtapaMeta`, `type ModoEtapa`,
  `type DiaSemana`, `interface Semana { numero: number; inicio: string; fim: string }`,
  `gerarSemanas(mesReferencia: string, diaVirada: DiaSemana): Semana[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/metasEngine.test.ts
import { describe, it, expect } from 'vitest'
import { gerarSemanas, ETAPAS_META_ORDEM } from './metasEngine'

describe('ETAPAS_META_ORDEM', () => {
  it('tem as 13 etapas do funil (Faturamento fica de fora — é calculado à parte)', () => {
    expect(ETAPAS_META_ORDEM).toHaveLength(13)
    expect(ETAPAS_META_ORDEM[0]).toBe('Ligações')
    expect(ETAPAS_META_ORDEM.at(-1)).toBe('Fechamento')
  })
})

describe('gerarSemanas', () => {
  it('setembro/2026, virada terça: 5 semanas, primeira começa no dia 1', () => {
    const semanas = gerarSemanas('2026-09-01', 'terca')
    expect(semanas).toHaveLength(5)
    expect(semanas[0]).toEqual({ numero: 1, inicio: '2026-09-01', fim: '2026-09-07' })
    expect(semanas[1]).toEqual({ numero: 2, inicio: '2026-09-08', fim: '2026-09-14' })
    expect(semanas[4].fim).toBe('2026-09-30')
  })

  it('virada segunda: primeira semana começa no dia 1 do mês mesmo assim (não corta antes)', () => {
    const semanas = gerarSemanas('2026-09-01', 'segunda')
    expect(semanas[0].inicio).toBe('2026-09-01')
  })

  it('última semana é parcial quando o mês não fecha em múltiplo de 7', () => {
    const semanas = gerarSemanas('2026-09-01', 'terca')
    const ultima = semanas.at(-1)!
    const dias = (new Date(ultima.fim) as any) - (new Date(ultima.inicio) as any)
    expect(dias / 86_400_000 + 1).toBeLessThan(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
(first `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/` from the repo
root — CLAUDE.md §7, do this before every test run in this plan, not repeated
in every step below).

Expected: FAIL — `metasEngine.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/metasEngine.ts

/** As 13 etapas do funil de metas, na ordem. 'Faturamento' fica de fora de
 *  propósito — nunca é um nó do grafo, é sempre `Fechamento × ticketMedio`,
 *  calculado depois da resolução (ver resolverFunilMarca). */
export const ETAPAS_META_ORDEM = [
  'Ligações',
  'MQL',
  'Tentando Contato',
  'Contato Efetivo',
  'Interesse Reunião',
  'Conexão',
  'Reunião Agendada SQL',
  'Reunião Realizada',
  'SAL',
  'Oportunidade COF',
  'Comitê',
  'Pré-Contrato',
  'Fechamento',
] as const

export type EtapaMeta = typeof ETAPAS_META_ORDEM[number]

export type ModoEtapa = 'fixo' | 'derivado' | 'desligado'

export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo'

const DIA_SEMANA_INDICE: Record<DiaSemana, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
}

export interface Semana {
  numero: number
  inicio: string // 'YYYY-MM-DD'
  fim: string    // 'YYYY-MM-DD'
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Gera as semanas de um mês a partir do dia de virada escolhido pelo gerente.
 * A primeira semana SEMPRE começa no dia 1 do mês (mesmo que o dia 1 não seja
 * o dia de virada) — o gerente define a virada pras semanas CHEIAS seguintes,
 * não corta os primeiros dias do mês fora de uma semana.
 */
export function gerarSemanas(mesReferencia: string, diaVirada: DiaSemana): Semana[] {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0) // dia 0 do mês seguinte = último do atual

  const semanas: Semana[] = []
  let inicio = new Date(primeiroDia)
  let numero = 1

  while (inicio <= ultimoDia) {
    // Próxima virada a partir de `inicio + 1 dia` (a semana corrente vai até o
    // dia anterior à próxima ocorrência do dia de virada).
    const proximaVirada = new Date(inicio)
    proximaVirada.setDate(proximaVirada.getDate() + 1)
    while (proximaVirada.getDay() !== DIA_SEMANA_INDICE[diaVirada]) {
      proximaVirada.setDate(proximaVirada.getDate() + 1)
    }
    const fimSemana = new Date(proximaVirada)
    fimSemana.setDate(fimSemana.getDate() - 1)
    const fim = fimSemana > ultimoDia ? ultimoDia : fimSemana

    semanas.push({ numero, inicio: toIso(inicio), fim: toIso(fim) })
    numero += 1
    inicio = new Date(fim)
    inicio.setDate(inicio.getDate() + 1)
  }

  return semanas
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metasEngine.ts src/lib/metasEngine.test.ts
git commit -m "feat(vendas): motor de metas — tipos das etapas e geração de semanas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Engine — resolução do funil (fixo/derivado/desligado)

**Files:**
- Modify: `src/lib/metasEngine.ts`
- Test: `src/lib/metasEngine.test.ts`

**Interfaces:**
- Consumes: `ETAPAS_META_ORDEM`, `EtapaMeta`, `ModoEtapa` (Task 2)
- Produces:
  `interface ConfigEtapa { etapa: EtapaMeta; modo: ModoEtapa; valorFixo?: number; etapaOrigem?: EtapaMeta; taxa?: number; taxaOrigem?: 'mes_anterior' | 'historico_crm' | 'manual' }`,
  `interface ErroResolucao { tipo: 'ciclo' | 'origem_desligada' | 'origem_inexistente' | 'sem_ancora'; etapas: EtapaMeta[]; mensagem: string }`,
  `interface ResolucaoFunil { valores: Partial<Record<EtapaMeta, number>>; faturamento: number | null; erros: ErroResolucao[] }`,
  `resolverFunilMarca(configs: ConfigEtapa[], ticketMedio: number): ResolucaoFunil`

- [ ] **Step 1: Write the failing tests**

```typescript
// adicionar em src/lib/metasEngine.test.ts
import { resolverFunilMarca, type ConfigEtapa } from './metasEngine'

describe('resolverFunilMarca', () => {
  it('duas âncoras fixas nas pontas — cada etapa mantém seu próprio valor, sem inventar nada no meio', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const r = resolverFunilMarca(configs, 74900)
    expect(r.valores['Ligações']).toBe(1000)
    expect(r.valores['Fechamento']).toBe(5)
    expect(r.faturamento).toBe(5 * 74900)
    expect(r.erros).toHaveLength(0)
  })

  it('cadeia derivada descendo o funil (origem antes do destino): multiplica', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.30 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'MQL', taxa: 0.40 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeCloseTo(300)
    expect(r.valores['SAL']).toBeCloseTo(120)
    expect(r.erros).toHaveLength(0)
  })

  it('cadeia derivada subindo o funil (origem depois do destino): divide', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Fechamento', taxa: 0.25 }, // SAL = Fechamento / 25%
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['SAL']).toBeCloseTo(20) // 5 / 0.25
  })

  it('pode derivar de qualquer etapa, não só da vizinha (D1)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1000 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.10 }, // pula MQL, Contato etc
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['SAL']).toBeCloseTo(100)
  })

  it('etapas não configuradas ficam de fora dos valores, sem erro', () => {
    const configs: ConfigEtapa[] = [{ etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 }]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros).toHaveLength(0)
  })

  it('detecta ciclo (A deriva de B, B deriva de A) e não calcula nenhum dos dois', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.5 },
      { etapa: 'SAL', modo: 'derivado', etapaOrigem: 'MQL', taxa: 0.5 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.valores['SAL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'ciclo')).toBe(true)
  })

  it('detecta origem desligada', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'desligado' },
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.3 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'origem_desligada')).toBe(true)
  })

  it('detecta cadeia sem âncora alcançável (origem citada mas nunca configurada)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'MQL', modo: 'derivado', etapaOrigem: 'Ligações', taxa: 0.3 },
    ]
    const r = resolverFunilMarca(configs, 0)
    expect(r.valores['MQL']).toBeUndefined()
    expect(r.erros.some(e => e.tipo === 'origem_inexistente')).toBe(true)
  })

  it('Odonto Scale: só Fechamento fixo, resto desligado — sem erro, faturamento calcula', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
      ...(['Ligações', 'MQL', 'SAL'] as const).map(etapa => ({ etapa, modo: 'desligado' as const })),
    ]
    const r = resolverFunilMarca(configs, 5597)
    expect(r.faturamento).toBe(5 * 5597)
    expect(r.erros).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: FAIL — `resolverFunilMarca` is not exported.

- [ ] **Step 3: Write the implementation**

```typescript
// adicionar em src/lib/metasEngine.ts

export interface ConfigEtapa {
  etapa: EtapaMeta
  modo: ModoEtapa
  valorFixo?: number
  etapaOrigem?: EtapaMeta
  taxa?: number
  /** De onde veio a taxa confirmada (D10) — não participa da resolução do
   *  funil, é só proveniência exibida no Passo 2. Undefined = etapa não é
   *  'derivado' ou a origem da taxa ainda não foi registrada. */
  taxaOrigem?: 'mes_anterior' | 'historico_crm' | 'manual'
}

export interface ErroResolucao {
  tipo: 'ciclo' | 'origem_desligada' | 'origem_inexistente' | 'sem_ancora'
  etapas: EtapaMeta[]
  mensagem: string
}

export interface ResolucaoFunil {
  valores: Partial<Record<EtapaMeta, number>>
  faturamento: number | null
  erros: ErroResolucao[]
}

const INDICE_ETAPA: Record<EtapaMeta, number> = Object.fromEntries(
  ETAPAS_META_ORDEM.map((e, i) => [e, i]),
) as Record<EtapaMeta, number>

function detectarCiclos(porEtapa: Map<EtapaMeta, ConfigEtapa>): Set<EtapaMeta> {
  const emCiclo = new Set<EtapaMeta>()
  const estado = new Map<EtapaMeta, 'visitando' | 'feito'>()

  function visitar(etapa: EtapaMeta, caminho: EtapaMeta[]): void {
    const cfg = porEtapa.get(etapa)
    if (!cfg || cfg.modo !== 'derivado' || !cfg.etapaOrigem) { estado.set(etapa, 'feito'); return }

    const st = estado.get(etapa)
    if (st === 'visitando') {
      const inicioCiclo = caminho.indexOf(etapa)
      for (const e of caminho.slice(inicioCiclo)) emCiclo.add(e)
      return
    }
    if (st === 'feito') return

    estado.set(etapa, 'visitando')
    visitar(cfg.etapaOrigem, [...caminho, etapa])
    estado.set(etapa, 'feito')
  }

  for (const etapa of porEtapa.keys()) visitar(etapa, [])
  return emCiclo
}

/**
 * Resolve o funil de uma marca a partir da configuração de cada etapa.
 * Derivado sempre lê o sentido natural da taxa (origem→etapa se a origem vem
 * ANTES na ordem do funil; senão o motor divide, porque a âncora está embaixo
 * subindo). Faturamento nunca é um nó do grafo — é sempre
 * `valores['Fechamento'] × ticketMedio`, calculado no final.
 */
export function resolverFunilMarca(configs: ConfigEtapa[], ticketMedio: number): ResolucaoFunil {
  const porEtapa = new Map<EtapaMeta, ConfigEtapa>(configs.map(c => [c.etapa, c]))
  const erros: ErroResolucao[] = []
  const valores: Partial<Record<EtapaMeta, number>> = {}

  const emCiclo = detectarCiclos(porEtapa)
  if (emCiclo.size > 0) {
    erros.push({
      tipo: 'ciclo',
      etapas: [...emCiclo],
      mensagem: `As etapas ${[...emCiclo].join(', ')} formam um ciclo — cada uma deriva da outra. Escolha uma âncora fixa.`,
    })
  }

  // Fixa os valores 'fixo' primeiro.
  for (const cfg of configs) {
    if (cfg.modo === 'fixo' && cfg.valorFixo != null && !emCiclo.has(cfg.etapa)) {
      valores[cfg.etapa] = cfg.valorFixo
    }
  }

  // Fixpoint: resolve derivados cuja origem já tem valor, até não sobrar nada pra resolver.
  let mudou = true
  while (mudou) {
    mudou = false
    for (const cfg of configs) {
      if (cfg.modo !== 'derivado' || emCiclo.has(cfg.etapa) || valores[cfg.etapa] != null) continue
      if (!cfg.etapaOrigem || cfg.taxa == null) continue
      const valorOrigem = valores[cfg.etapaOrigem]
      if (valorOrigem == null) continue

      const origemAntes = INDICE_ETAPA[cfg.etapaOrigem] < INDICE_ETAPA[cfg.etapa]
      valores[cfg.etapa] = origemAntes ? valorOrigem * cfg.taxa : valorOrigem / cfg.taxa
      mudou = true
    }
  }

  // Detecta origem desligada e origem nunca configurada, pros derivados que sobraram sem valor.
  for (const cfg of configs) {
    if (cfg.modo !== 'derivado' || emCiclo.has(cfg.etapa) || valores[cfg.etapa] != null) continue
    if (!cfg.etapaOrigem) continue

    const origemCfg = porEtapa.get(cfg.etapaOrigem)
    if (!origemCfg) {
      erros.push({
        tipo: 'origem_inexistente',
        etapas: [cfg.etapa, cfg.etapaOrigem],
        mensagem: `${cfg.etapa} deriva de ${cfg.etapaOrigem}, mas essa etapa não tem configuração nesta marca.`,
      })
    } else if (origemCfg.modo === 'desligado') {
      erros.push({
        tipo: 'origem_desligada',
        etapas: [cfg.etapa, cfg.etapaOrigem],
        mensagem: `${cfg.etapa} deriva de ${cfg.etapaOrigem}, que está desligada nesta marca.`,
      })
    } else {
      erros.push({
        tipo: 'sem_ancora',
        etapas: [cfg.etapa],
        mensagem: `${cfg.etapa} não alcança nenhuma âncora fixa pela cadeia de derivação configurada.`,
      })
    }
  }

  const fechamento = valores['Fechamento']
  const faturamento = fechamento != null ? fechamento * ticketMedio : null

  return { valores, faturamento, erros }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: PASS, all tests (Task 2's 4 + Task 3's 9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/metasEngine.ts src/lib/metasEngine.test.ts
git commit -m "feat(vendas): motor de metas — resolução do funil fixo/derivado/desligado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Engine — detecção de gap entre âncoras

**Files:**
- Modify: `src/lib/metasEngine.ts`
- Test: `src/lib/metasEngine.test.ts`

**Interfaces:**
- Consumes: `ConfigEtapa`, `ResolucaoFunil`, `ETAPAS_META_ORDEM`, `INDICE_ETAPA` pattern (Task 3)
- Produces:
  `interface GapAncoras { etapaTopo: EtapaMeta; etapaFundo: EtapaMeta; taxaImplicita: number; taxaConfigurada: number | null; diverge: boolean }`,
  `detectarGaps(configs: ConfigEtapa[], resolucao: ResolucaoFunil): GapAncoras[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// adicionar em src/lib/metasEngine.test.ts
import { detectarGaps } from './metasEngine'

describe('detectarGaps', () => {
  it('duas âncoras sem cadeia derivada entre elas — mostra taxa implícita, sem divergência (nada pra comparar)', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1558 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].etapaTopo).toBe('Ligações')
    expect(gaps[0].etapaFundo).toBe('Fechamento')
    expect(gaps[0].taxaImplicita).toBeCloseTo(5 / 1558)
    expect(gaps[0].taxaConfigurada).toBeNull()
    expect(gaps[0].diverge).toBe(false)
  })

  it('cadeia derivada completa que concorda com a taxa implícita — sem divergência', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'SAL', modo: 'fixo', valorFixo: 100 },
      { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.4 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 40 }, // 40/100 = 40%, bate com a cadeia
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    const gap = gaps.find(g => g.etapaTopo === 'SAL' && g.etapaFundo === 'Fechamento')!
    expect(gap.diverge).toBe(false)
  })

  it('cadeia derivada completa que DISCORDA da taxa implícita — sinaliza divergência', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'SAL', modo: 'fixo', valorFixo: 86.9 },
      { etapa: 'Oportunidade COF', modo: 'derivado', etapaOrigem: 'SAL', taxa: 0.25 }, // = 21.7
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 22 }, // implícita: 22/86.9 = 25.3%, cadeia diz 25%×algo — força divergência clara
    ]
    const resolucao = resolverFunilMarca(configs, 0)
    const gaps = detectarGaps(configs, resolucao)
    const gap = gaps.find(g => g.etapaTopo === 'SAL' && g.etapaFundo === 'Fechamento')!
    expect(gap.taxaConfigurada).toBeCloseTo(0.25)
    expect(gap.taxaImplicita).toBeCloseTo(22 / 86.9)
    expect(gap.diverge).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: FAIL — `detectarGaps` is not exported.

- [ ] **Step 3: Write the implementation**

```typescript
// adicionar em src/lib/metasEngine.ts

export interface GapAncoras {
  etapaTopo: EtapaMeta
  etapaFundo: EtapaMeta
  taxaImplicita: number
  taxaConfigurada: number | null
  diverge: boolean
}

const TOLERANCIA_GAP = 0.003 // diferença ABSOLUTA entre taxas (0-1), não relativa

/**
 * Para cada par de âncoras fixas (em ordem de funil), calcula a taxa
 * implícita entre elas. Quando `topo` é a origem configurada de uma cadeia
 * de etapas derivadas (uma deriva da outra em sequência), calcula também o
 * produto dessas taxas e compara — diverge quando a diferença ABSOLUTA passa
 * da tolerância. Sem nenhuma etapa derivando de `topo`, mostra só a
 * implícita (informativo, nada pra discordar).
 *
 * A cadeia caminha PRA FRENTE a partir de `topo` (quem deriva de `topo`,
 * depois quem deriva dessa, etc.) — nunca de trás pra frente a partir de
 * `fundo`. `fundo` é sempre uma âncora `fixo` (é assim que `ancoras` é
 * filtrado, logo abaixo) e uma etapa `fixo` nunca tem `modo: 'derivado'`,
 * então tentar caminhar A PARTIR de `fundo` esperando achar `modo:'derivado'`
 * nela mesma nunca funcionaria — sempre devolveria cadeia incompleta.
 */
export function detectarGaps(configs: ConfigEtapa[], resolucao: ResolucaoFunil): GapAncoras[] {
  const consumidorPorOrigem = new Map<EtapaMeta, ConfigEtapa>()
  for (const c of configs) {
    if (c.modo === 'derivado' && c.etapaOrigem) consumidorPorOrigem.set(c.etapaOrigem, c)
  }

  const ancoras = configs
    .filter(c => c.modo === 'fixo' && resolucao.valores[c.etapa] != null)
    .map(c => c.etapa)
    .sort((a, b) => INDICE_ETAPA[a] - INDICE_ETAPA[b])

  const gaps: GapAncoras[] = []

  for (let i = 0; i < ancoras.length - 1; i++) {
    const topo = ancoras[i]
    const fundo = ancoras[i + 1]
    const valorTopo = resolucao.valores[topo]!
    const valorFundo = resolucao.valores[fundo]!
    if (valorTopo === 0) continue
    const taxaImplicita = valorFundo / valorTopo

    // Caminha pra frente a partir de topo: quem deriva de topo, depois quem
    // deriva dessa, etc. — até a cadeia acabar (etapa sem consumidor) ou
    // faltar taxa. Guarda de visitados evita loop infinito num ciclo mal
    // configurado (o motor de resolverFunilMarca já rejeitaria esse ciclo
    // pra fins de cálculo, mas detectarGaps roda sobre os `configs` crus,
    // então precisa da própria proteção).
    let atual: EtapaMeta = topo
    let produtoTaxas = 1
    let achouAlgumaEtapa = false
    const visitados = new Set<EtapaMeta>([topo])

    while (consumidorPorOrigem.has(atual)) {
      const cfg = consumidorPorOrigem.get(atual)!
      if (cfg.taxa == null) break // cadeia incompleta — falta taxa nessa etapa
      produtoTaxas *= cfg.taxa // sempre multiplica: estamos andando de origem pra quem deriva dela, ou seja, descendo o funil
      achouAlgumaEtapa = true
      atual = cfg.etapa
      if (visitados.has(atual)) break // ciclo — para, não repete
      visitados.add(atual)
    }

    const taxaConfigurada = achouAlgumaEtapa ? produtoTaxas : null
    const diverge = taxaConfigurada != null && Math.abs(taxaConfigurada - taxaImplicita) > TOLERANCIA_GAP

    gaps.push({ etapaTopo: topo, etapaFundo: fundo, taxaImplicita, taxaConfigurada, diverge })
  }

  return gaps
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: PASS, all tests so far.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metasEngine.ts src/lib/metasEngine.test.ts
git commit -m "feat(vendas): motor de metas — detecção de gap entre âncoras

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Engine — rateio por peso (N pessoas)

**Files:**
- Modify: `src/lib/metasEngine.ts`
- Test: `src/lib/metasEngine.test.ts`

**Interfaces:**
- Produces:
  `interface PessoaComPeso { nome: string; peso: number }`,
  `ratearPorPeso(metaTotal: number, pessoas: PessoaComPeso[]): Record<string, number>`

- [ ] **Step 1: Write the failing tests**

```typescript
// adicionar em src/lib/metasEngine.test.ts
import { ratearPorPeso } from './metasEngine'

describe('ratearPorPeso', () => {
  it('2 pessoas, 60/40 — soma bate exatamente com o total', () => {
    const r = ratearPorPeso(1558, [{ nome: 'Thiago', peso: 60 }, { nome: 'Xayane', peso: 40 }])
    expect(r['Thiago']).toBeCloseTo(1558 * 0.6)
    expect(r['Xayane']).toBeCloseTo(1558 * 0.4)
    expect(r['Thiago'] + r['Xayane']).toBeCloseTo(1558)
  })

  it('1 pessoa sozinha — recebe 100% mesmo com peso configurado diferente', () => {
    const r = ratearPorPeso(500, [{ nome: 'Douglas', peso: 100 }])
    expect(r['Douglas']).toBeCloseTo(500)
  })

  it('3+ pessoas (D3 — sem limite de 2) — soma continua batendo', () => {
    const r = ratearPorPeso(900, [
      { nome: 'A', peso: 50 }, { nome: 'B', peso: 30 }, { nome: 'C', peso: 20 },
    ])
    expect(r['A'] + r['B'] + r['C']).toBeCloseTo(900)
  })

  it('pesos não somam 100 — normaliza proporcionalmente em vez de ignorar', () => {
    const r = ratearPorPeso(100, [{ nome: 'A', peso: 1 }, { nome: 'B', peso: 1 }])
    expect(r['A']).toBeCloseTo(50)
    expect(r['B']).toBeCloseTo(50)
  })

  it('lista vazia devolve objeto vazio, sem lançar erro', () => {
    expect(ratearPorPeso(1000, [])).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: FAIL — `ratearPorPeso` is not exported.

- [ ] **Step 3: Write the implementation**

```typescript
// adicionar em src/lib/metasEngine.ts

export interface PessoaComPeso {
  nome: string
  peso: number
}

/**
 * Divide `metaTotal` entre `pessoas` proporcional ao peso de cada uma.
 * Normaliza pelos pesos informados (não exige que somem 100) — sem limite de
 * quantas pessoas (D3). A soma dos valores devolvidos sempre bate com
 * `metaTotal` (a menos de arredondamento de ponto flutuante).
 */
export function ratearPorPeso(metaTotal: number, pessoas: PessoaComPeso[]): Record<string, number> {
  const somaPesos = pessoas.reduce((s, p) => s + p.peso, 0)
  if (somaPesos <= 0) return {}
  const resultado: Record<string, number> = {}
  for (const p of pessoas) {
    resultado[p.nome] = metaTotal * (p.peso / somaPesos)
  }
  return resultado
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: PASS, all tests so far.

- [ ] **Step 5: Commit**

```bash
git add src/lib/metasEngine.ts src/lib/metasEngine.test.ts
git commit -m "feat(vendas): motor de metas — rateio por peso, sem limite de pessoas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Engine — geração das linhas do espelho

**Files:**
- Modify: `src/lib/metasEngine.ts`
- Test: `src/lib/metasEngine.test.ts`

**Interfaces:**
- Consumes: `EtapaMeta`, `ResolucaoFunil`, `PessoaComPeso`, `ratearPorPeso` (Tasks 2, 3, 5)
- Produces:
  `interface LinhaEspelho { mes_referencia: string; marca: string; nome_colaborador: string; funcao: 'SDR' | 'Closer'; meta_sql: number | null; meta_agendamento: number | null; meta_reuniao_realizada: number | null; meta_cof: number | null; meta_financeira: number | null; meta_qtd_vendas: number | null }`,
  `interface PessoaComFuncao extends PessoaComPeso { funcao: 'SDR' | 'Closer' }`,
  `gerarLinhasEspelho(mesReferencia: string, marcas: Array<{ marca: string; resolucao: ResolucaoFunil; pessoas: PessoaComFuncao[] }>): LinhaEspelho[]`

**Nota de mapeamento** (etapa do motor → coluna de `DB_Metas_Performance`,
confere com o que `src/hooks/useMetasPerformance.ts` já espera):
`Reunião Agendada SQL → meta_sql`, `Reunião Agendada SQL → meta_agendamento`
(mesmo valor, a tabela antiga tem as duas colunas), `Reunião Realizada →
meta_reuniao_realizada`, `Oportunidade COF → meta_cof`, `Faturamento →
meta_financeira`, `Fechamento → meta_qtd_vendas`. SDR só recebe as 3 primeiras;
Closer só recebe `meta_cof`/`meta_financeira`/`meta_qtd_vendas` — mistura de
função errada é bug, não feature.

- [ ] **Step 1: Write the failing test**

```typescript
// adicionar em src/lib/metasEngine.test.ts
import { gerarLinhasEspelho } from './metasEngine'

describe('gerarLinhasEspelho', () => {
  it('reproduz a semente de setembro pro Inpot — 1 SDR, 1 Closer, valores rateados corretamente', () => {
    const configs: ConfigEtapa[] = [
      { etapa: 'Ligações', modo: 'fixo', valorFixo: 1557.6 },
      { etapa: 'Reunião Agendada SQL', modo: 'fixo', valorFixo: 67.1 },
      { etapa: 'Reunião Realizada', modo: 'fixo', valorFixo: 42.9 },
      { etapa: 'SAL', modo: 'fixo', valorFixo: 26.4 },
      { etapa: 'Oportunidade COF', modo: 'fixo', valorFixo: 10.6 },
      { etapa: 'Fechamento', modo: 'fixo', valorFixo: 5 },
    ]
    const resolucao = resolverFunilMarca(configs, 74900)
    const linhas = gerarLinhasEspelho('2026-09-01', [{
      marca: 'Inpot',
      resolucao,
      pessoas: [
        { nome: 'Thiago', funcao: 'SDR', peso: 100 },
        { nome: 'Douglas', funcao: 'Closer', peso: 100 },
      ],
    }])

    const sdr = linhas.find(l => l.nome_colaborador === 'Thiago')!
    expect(sdr.funcao).toBe('SDR')
    expect(sdr.meta_sql).toBeCloseTo(67.1)
    expect(sdr.meta_agendamento).toBeCloseTo(67.1)
    expect(sdr.meta_reuniao_realizada).toBeCloseTo(42.9)
    expect(sdr.meta_financeira).toBeNull()

    const closer = linhas.find(l => l.nome_colaborador === 'Douglas')!
    expect(closer.funcao).toBe('Closer')
    expect(closer.meta_cof).toBeCloseTo(10.6)
    expect(closer.meta_financeira).toBeCloseTo(5 * 74900)
    expect(closer.meta_qtd_vendas).toBeCloseTo(5)
    expect(closer.meta_sql).toBeNull()
  })

  it('2 SDRs 60/40 na mesma marca — cada linha recebe a fatia rateada, não o total cheio', () => {
    const configs: ConfigEtapa[] = [{ etapa: 'Reunião Agendada SQL', modo: 'fixo', valorFixo: 100 }]
    const resolucao = resolverFunilMarca(configs, 0)
    const linhas = gerarLinhasEspelho('2026-09-01', [{
      marca: 'Eletrovias',
      resolucao,
      pessoas: [
        { nome: 'Sarah Padilha', funcao: 'SDR', peso: 60 },
        { nome: 'Thiago', funcao: 'SDR', peso: 40 },
      ],
    }])
    const sarah = linhas.find(l => l.nome_colaborador === 'Sarah Padilha')!
    const thiago = linhas.find(l => l.nome_colaborador === 'Thiago')!
    expect(sarah.meta_sql).toBeCloseTo(60)
    expect(thiago.meta_sql).toBeCloseTo(40)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: FAIL — `gerarLinhasEspelho` is not exported.

- [ ] **Step 3: Write the implementation**

```typescript
// adicionar em src/lib/metasEngine.ts

export interface LinhaEspelho {
  mes_referencia: string
  marca: string
  nome_colaborador: string
  funcao: 'SDR' | 'Closer'
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
  meta_cof: number | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

export interface PessoaComFuncao extends PessoaComPeso {
  funcao: 'SDR' | 'Closer'
}

/**
 * Gera as linhas no formato de `DB_Metas_Performance` (o espelho, §5.2 do
 * spec) a partir da resolução de cada marca e de quem está alocado nela. Cada
 * pessoa recebe sua fatia rateada por peso — nunca o total da marca inteira.
 */
export function gerarLinhasEspelho(
  mesReferencia: string,
  marcas: Array<{ marca: string; resolucao: ResolucaoFunil; pessoas: PessoaComFuncao[] }>,
): LinhaEspelho[] {
  const linhas: LinhaEspelho[] = []

  for (const { marca, resolucao, pessoas } of marcas) {
    const sdrs = pessoas.filter(p => p.funcao === 'SDR')
    const closers = pessoas.filter(p => p.funcao === 'Closer')

    const sql = resolucao.valores['Reunião Agendada SQL']
    const reuniao = resolucao.valores['Reunião Realizada']
    const cof = resolucao.valores['Oportunidade COF']
    const fechamento = resolucao.valores['Fechamento']
    const faturamento = resolucao.faturamento

    const rateioSql = sql != null ? ratearPorPeso(sql, sdrs) : {}
    const rateioReuniao = reuniao != null ? ratearPorPeso(reuniao, sdrs) : {}
    const rateioCof = cof != null ? ratearPorPeso(cof, closers) : {}
    const rateioFaturamento = faturamento != null ? ratearPorPeso(faturamento, closers) : {}
    const rateioQtd = fechamento != null ? ratearPorPeso(fechamento, closers) : {}

    for (const sdr of sdrs) {
      linhas.push({
        mes_referencia: mesReferencia,
        marca,
        nome_colaborador: sdr.nome,
        funcao: 'SDR',
        meta_sql: rateioSql[sdr.nome] ?? null,
        meta_agendamento: rateioSql[sdr.nome] ?? null,
        meta_reuniao_realizada: rateioReuniao[sdr.nome] ?? null,
        meta_cof: null,
        meta_financeira: null,
        meta_qtd_vendas: null,
      })
    }

    for (const closer of closers) {
      linhas.push({
        mes_referencia: mesReferencia,
        marca,
        nome_colaborador: closer.nome,
        funcao: 'Closer',
        meta_sql: null,
        meta_agendamento: null,
        meta_reuniao_realizada: null,
        meta_cof: rateioCof[closer.nome] ?? null,
        meta_financeira: rateioFaturamento[closer.nome] ?? null,
        meta_qtd_vendas: rateioQtd[closer.nome] ?? null,
      })
    }
  }

  return linhas
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/ws-dashboard-build && npx vitest run src/lib/metasEngine.test.ts`
Expected: PASS, all tests (Tasks 2–6 combined — should be ~20 tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/lib/metasEngine.ts src/lib/metasEngine.test.ts
git commit -m "feat(vendas): motor de metas — geração das linhas do espelho DB_Metas_Performance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Edge Function — escrita segura `gravar-meta`

**Files:**
- Create: `supabase/functions/gravar-meta/index.ts`

**Interfaces:**
- Consumes: `LinhaEspelho` shape (Task 6) as part of the request body — the
  client resolves everything and sends the final computed payload; this
  function only validates the session and persists.
- Produces: an HTTP endpoint the hook in Task 9 calls.

**Preflight correction (caught before dispatch, not left for the implementer
to discover):** the plan originally assumed the Expansão project's
`service_role` key needed to be fetched from Vault at runtime, and that
Marketing's URL/anon key would be "plain env vars" set through an unspecified
mechanism. Both were wrong. Read straight from the **already-deployed**
`espelhar-rd` function (via `mcp__supabase__get_edge_function`) before writing
this task:

- Supabase auto-injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as plain
  Deno env vars into every deployed function, for the project it's deployed
  to — no Vault needed for the function's *own* project. `espelhar-rd` proves
  this: `const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!`.
- Vault (`vault.create_secret` + the `get_secret` RPC) is for secrets that
  aren't auto-injected — `espelhar-rd` uses it for the RD Station API token
  (`rd_token`), a value that has nothing to do with any Supabase project's own
  service role.
- Marketing's URL/anon key are exactly this kind of "not auto-injected"
  secret (they belong to a *different* Supabase project than the one this
  function deploys to) — so they go into the **same Vault**, fetched through
  the **same already-working `get_secret` RPC**, not a new, unproven
  mechanism.
- **Platform JWT verification defaults to `true`.** `espelhar-rd` is called by
  `pg_cron`/`pg_net` using Expansão's own service key, so the default works
  for it. `gravar-meta` is called by the **browser**, carrying a session token
  issued by **Marketing** — a different project's JWT. Supabase's
  platform-level check would reject that token before this function's own
  code ever runs. `gravar-meta` must deploy with `verify_jwt: false` (Task 7
  Step 3) — the `deploy_edge_function` tool's own guidance names exactly this
  case: disable the platform check only when "the function body implements
  custom authentication," which `validarSessao` below is.

- [ ] **Step 1: Store the two secrets `gravar-meta` needs, that aren't already in Vault**

Call `mcp__supabase__execute_sql` against the **Expansão** project (same
mechanism `espelhar-rd` already uses for `rd_token` — confirm `get_secret`
exists first with `select proname from pg_proc where proname = 'get_secret';`;
it does, per `espelhar-rd`'s own code):

```sql
select vault.create_secret('<URL real do projeto de Marketing>', 'marketing_supabase_url');
select vault.create_secret('<anon key real do projeto de Marketing>', 'marketing_supabase_anon_key');
```

Get these two values from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in this
repo's own `.env` (Marketing is the dashboard's default/login Supabase client,
`src/lib/supabase.ts`) — they're already public-facing values (the anon key is
shipped to every browser that loads the dashboard), so storing them in Vault
here is about having one proven fetch mechanism (`get_secret`), not about
secrecy.

- [ ] **Step 2: Write the function**

```typescript
// supabase/functions/gravar-meta/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface Payload {
  acao: 'salvar_rascunho' | 'publicar'
  mesReferencia: string
  diaViradaSemana: string
  semanas: Array<{ numero: number; inicio: string; fim: string }>
  marcas: Array<{
    marca: string
    ticketMedio: number
    etapas: Array<{
      etapa: string
      modo: 'fixo' | 'derivado' | 'desligado'
      valorFixo?: number
      etapaOrigem?: string
      taxa?: number
      taxaOrigem?: 'mes_anterior' | 'historico_crm' | 'manual'
    }>
    pessoas: Array<{ nome: string; funcao: 'SDR' | 'Closer'; peso: number }>
  }>
  distribuicaoSemanal: Array<{ nomePessoa: string; semanaNumero: number; etapa: string; valor: number }>
  linhasEspelho: Array<Record<string, unknown>>
  autor: string | null
}

async function validarSessao(
  admin: ReturnType<typeof createClient>, token: string,
): Promise<{ ok: boolean; email?: string }> {
  const { data: marketingUrl } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_url' })
  const { data: marketingAnonKey } = await admin.rpc('get_secret', { secret_name: 'marketing_supabase_anon_key' })
  if (!marketingUrl || !marketingAnonKey) return { ok: false }

  const resp = await fetch(`${marketingUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: marketingAnonKey as string },
  })
  if (!resp.ok) return { ok: false }
  const user = await resp.json()
  return { ok: true, email: user.email }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return new Response(JSON.stringify({ error: 'sem sessão' }), { status: 401 })

  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pela
  // plataforma pro projeto Expansão (o mesmo onde esta função é implantada) —
  // nenhum Vault aqui, mesmo padrão comprovado no espelhar-rd (index.ts,
  // Deno.serve). Vault entra só pro que NÃO é auto-injetado (§ acima).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { ok, email } = await validarSessao(admin, token)
  if (!ok) return new Response(JSON.stringify({ error: 'sessão inválida' }), { status: 401 })

  const payload = (await req.json()) as Payload

  const { error: erroMes } = await admin.from('meta_mes').upsert({
    mes_referencia: payload.mesReferencia,
    dia_virada_semana: payload.diaViradaSemana,
    status: payload.acao === 'publicar' ? 'publicado' : 'rascunho',
    publicado_em: payload.acao === 'publicar' ? new Date().toISOString() : null,
    publicado_por: payload.acao === 'publicar' ? email : null,
  }, { onConflict: 'mes_referencia' })
  if (erroMes) return new Response(JSON.stringify({ error: erroMes.message }), { status: 500 })

  // Semanas: apaga e reinsere (o gerente pode ter mudado o dia de virada no meio da montagem).
  await admin.from('meta_semana').delete().eq('mes_referencia', payload.mesReferencia)
  if (payload.semanas.length > 0) {
    const { error: erroSemanas } = await admin.from('meta_semana').insert(
      payload.semanas.map(s => ({ mes_referencia: payload.mesReferencia, numero: s.numero, data_inicio: s.inicio, data_fim: s.fim })),
    )
    if (erroSemanas) return new Response(JSON.stringify({ error: erroSemanas.message }), { status: 500 })
  }

  for (const m of payload.marcas) {
    const { data: marcaRow, error: erroMarca } = await admin
      .from('meta_marca')
      .upsert({ mes_referencia: payload.mesReferencia, marca: m.marca, ticket_medio: m.ticketMedio }, { onConflict: 'mes_referencia,marca' })
      .select('id')
      .single()
    if (erroMarca || !marcaRow) return new Response(JSON.stringify({ error: erroMarca?.message ?? 'falha ao gravar marca' }), { status: 500 })

    await admin.from('meta_marca_etapa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.etapas.length > 0) {
      await admin.from('meta_marca_etapa').insert(
        m.etapas.map(e => ({
          meta_marca_id: marcaRow.id, etapa: e.etapa, modo: e.modo,
          valor_fixo: e.valorFixo ?? null, etapa_origem: e.etapaOrigem ?? null,
          taxa: e.taxa ?? null, taxa_origem: e.taxaOrigem ?? null,
        })),
      )
    }

    await admin.from('meta_pessoa').delete().eq('meta_marca_id', marcaRow.id)
    if (m.pessoas.length > 0) {
      await admin.from('meta_pessoa').insert(
        m.pessoas.map(p => ({ meta_marca_id: marcaRow.id, nome: p.nome, funcao: p.funcao, peso: p.peso })),
      )
    }
  }

  if (payload.acao === 'publicar' && payload.linhasEspelho.length > 0) {
    await admin.from('DB_Metas_Performance').delete().eq('mes_referencia', payload.mesReferencia)
    const { error: erroEspelho } = await admin.from('DB_Metas_Performance').insert(payload.linhasEspelho)
    if (erroEspelho) return new Response(JSON.stringify({ error: erroEspelho.message }), { status: 500 })
  }

  await admin.from('meta_log').insert({
    mes_referencia: payload.mesReferencia,
    entidade: 'meta_mes',
    entidade_ref: payload.mesReferencia,
    campo: 'status',
    valor_anterior: null,
    valor_novo: payload.acao === 'publicar' ? 'publicado' : 'rascunho',
    autor: email ?? null,
  })

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 3: Deploy the function with platform JWT verification off**

Call `mcp__supabase__deploy_edge_function` with `name: "gravar-meta"`,
`entrypoint_path: "index.ts"`, the file content from Step 2, and
**`verify_jwt: false`** — required, not optional (see the preflight
correction above: the caller's token is issued by a different Supabase
project, so the platform's own JWT check would reject it before
`validarSessao` runs).

- [ ] **Step 4: Smoke-test with a rascunho payload**

Call the deployed function's URL with a minimal `acao: 'salvar_rascunho'`
payload and a real session token (get one via the dashboard's login in a
browser, copy the access token from devtools) using `curl`. Confirm
`meta_mes` gets a row with `status = 'rascunho'` via
`mcp__supabase__execute_sql`. Confirm calling it **without** an
`Authorization` header returns 401 and writes nothing. Confirm calling it
with a garbage/expired token also returns 401 (proves `validarSessao`, not
just the platform gate we just turned off, is doing real work).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/gravar-meta/index.ts
git commit -m "feat(vendas): Edge Function gravar-meta — escrita segura do Hub de Metas

Valida a sessão do usuário contra o Supabase de Marketing antes de gravar
com service_role no de Expansão. anon key nunca ganha permissão de escrita
em nenhuma tabela meta_*.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Hook de leitura — `useMetaMes`

**Files:**
- Create: `src/hooks/useMetaMes.ts`

**Interfaces:**
- Consumes: `EtapaMeta`, `ModoEtapa`, `Semana` (Task 2), `ConfigEtapa` (Task 3), `PessoaComFuncao` (Task 6)
- Produces:
  `interface EstadoMes { status: 'inexistente' | 'rascunho' | 'publicado'; diaViradaSemana: DiaSemana; semanas: Semana[]; marcas: Array<{ marca: string; ticketMedio: number; etapas: ConfigEtapa[]; pessoas: PessoaComFuncao[] }>; distribuicaoSemanal: Array<{ nomePessoa: string; semanaNumero: number; etapa: EtapaMeta; valor: number }> }`,
  `useMetaMes(mesReferencia: string): { estado: EstadoMes | null; loading: boolean; error: string | null; reload: () => void }`

- [ ] **Step 1: Write the implementation** (this hook is read-only against
      tables the anon key can already `SELECT` — no test needed beyond the
      engine's own tests; it's a straight Supabase read + reshape, same
      pattern as every other hook in `src/hooks/`)

```typescript
// src/hooks/useMetaMes.ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { ConfigEtapa, DiaSemana, EtapaMeta, PessoaComFuncao, Semana } from '@/lib/metasEngine'

export interface EstadoMesMarca {
  marca: string
  ticketMedio: number
  etapas: ConfigEtapa[]
  pessoas: PessoaComFuncao[]
}

export interface DistribuicaoSemanalItem {
  nomePessoa: string
  semanaNumero: number
  etapa: EtapaMeta
  valor: number
}

export interface EstadoMes {
  status: 'inexistente' | 'rascunho' | 'publicado'
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

const VAZIO: EstadoMes = { status: 'inexistente', diaViradaSemana: 'terca', semanas: [], marcas: [], distribuicaoSemanal: [] }

async function buscar(mesReferencia: string): Promise<{ estado: EstadoMes; error: string | null }> {
  const { data: mesRow, error: erroMes } = await supabaseVendas
    .from('meta_mes').select('status, dia_virada_semana').eq('mes_referencia', mesReferencia).maybeSingle()
  if (erroMes) return { estado: VAZIO, error: erroMes.message }
  if (!mesRow) return { estado: VAZIO, error: null }

  const [{ data: semanasRows }, { data: marcasRows }] = await Promise.all([
    supabaseVendas.from('meta_semana').select('numero, data_inicio, data_fim').eq('mes_referencia', mesReferencia).order('numero'),
    supabaseVendas.from('meta_marca').select('id, marca, ticket_medio').eq('mes_referencia', mesReferencia),
  ])

  const marcaIds = (marcasRows ?? []).map(m => m.id)
  const [{ data: etapasRows }, { data: pessoasRows }, { data: distribRows }] = await Promise.all([
    marcaIds.length ? supabaseVendas.from('meta_marca_etapa').select('meta_marca_id, etapa, modo, valor_fixo, etapa_origem, taxa, taxa_origem').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [] }),
    marcaIds.length ? supabaseVendas.from('meta_pessoa').select('id, meta_marca_id, nome, funcao, peso').in('meta_marca_id', marcaIds) : Promise.resolve({ data: [] }),
    marcaIds.length
      ? supabaseVendas.from('meta_pessoa_semana').select('etapa, valor, meta_pessoa_id, meta_semana_id, meta_pessoa!inner(nome, meta_marca_id), meta_semana!inner(numero)').in('meta_pessoa.meta_marca_id', marcaIds)
      : Promise.resolve({ data: [] }),
  ])

  const marcas: EstadoMesMarca[] = (marcasRows ?? []).map(m => ({
    marca: m.marca,
    ticketMedio: Number(m.ticket_medio) || 0,
    etapas: (etapasRows ?? []).filter((e: any) => e.meta_marca_id === m.id).map((e: any) => ({
      etapa: e.etapa as EtapaMeta, modo: e.modo, valorFixo: e.valor_fixo ?? undefined,
      etapaOrigem: e.etapa_origem ?? undefined, taxa: e.taxa ?? undefined,
      taxaOrigem: e.taxa_origem ?? undefined,
    })),
    pessoas: (pessoasRows ?? []).filter((p: any) => p.meta_marca_id === m.id).map((p: any) => ({
      nome: p.nome, funcao: p.funcao, peso: Number(p.peso) || 0,
    })),
  }))

  const distribuicaoSemanal: DistribuicaoSemanalItem[] = (distribRows ?? []).map((d: any) => ({
    nomePessoa: d.meta_pessoa.nome, semanaNumero: d.meta_semana.numero, etapa: d.etapa, valor: Number(d.valor) || 0,
  }))

  return {
    estado: {
      status: mesRow.status,
      diaViradaSemana: mesRow.dia_virada_semana,
      semanas: (semanasRows ?? []).map(s => ({ numero: s.numero, inicio: s.data_inicio, fim: s.data_fim })),
      marcas,
      distribuicaoSemanal,
    },
    error: null,
  }
}

export function useMetaMes(mesReferencia: string) {
  const [estado, setEstado] = useState<EstadoMes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    const { estado: e, error: err } = await buscar(mesReferencia)
    if (err) setError(err)
    setEstado(e)
    setLoading(false)
  }, [mesReferencia])

  useEffect(() => { fetchAll().catch(() => {}) }, [fetchAll])

  const stable = useMemo(() => estado, [estado])
  return { estado: stable, loading, error, reload: fetchAll }
}
```

- [ ] **Step 2: Verify it compiles**

`cd ~/ws-dashboard-build && rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ 2>/dev/null; cd ~/ws-dashboard-build && npx tsc -b --noEmit 2>&1 | grep useMetaMes`
(run from the repo root, rsync first) — expect no output (no errors mentioning
this file).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMetaMes.ts
git commit -m "feat(vendas): hook useMetaMes — leitura do estado de um mês do Hub

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Hook de escrita — `useSalvarMeta` + `useTaxaMesAnterior`

**Files:**
- Create: `src/hooks/useSalvarMeta.ts`

**Interfaces:**
- Consumes: `EstadoMes` shape (Task 8), `LinhaEspelho` (Task 6)
- Produces:
  `salvarMeta(input: { acao: 'salvar_rascunho' | 'publicar'; mesReferencia: string; diaViradaSemana: DiaSemana; semanas: Semana[]; marcas: EstadoMesMarca[]; distribuicaoSemanal: DistribuicaoSemanalItem[]; linhasEspelho: LinhaEspelho[] }): Promise<{ ok: boolean; error: string | null }>`,
  `useTaxaMesAnterior(mesReferencia: string, marca: string, etapa: EtapaMeta, etapaOrigem: EtapaMeta): { taxa: number | null; loading: boolean }`

- [ ] **Step 1: Write the implementation**

```typescript
// src/hooks/useSalvarMeta.ts
import { useState } from 'react'
import { supabase } from '@/lib/supabase' // sessão vive no Supabase de Marketing
import { supabaseVendas } from '@/lib/supabaseVendas'
import type { DiaSemana, EtapaMeta, LinhaEspelho, Semana } from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMesMarca } from './useMetaMes'

const GRAVAR_META_URL = `${import.meta.env.VITE_SUPABASE_VENDAS_URL}/functions/v1/gravar-meta`

interface SalvarMetaInput {
  acao: 'salvar_rascunho' | 'publicar'
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  linhasEspelho: LinhaEspelho[]
}

export async function salvarMeta(input: SalvarMetaInput): Promise<{ ok: boolean; error: string | null }> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { ok: false, error: 'sem sessão ativa' }

  const resp = await fetch(GRAVAR_META_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      acao: input.acao,
      mesReferencia: input.mesReferencia,
      diaViradaSemana: input.diaViradaSemana,
      semanas: input.semanas,
      marcas: input.marcas.map(m => ({
        marca: m.marca, ticketMedio: m.ticketMedio,
        etapas: m.etapas, pessoas: m.pessoas,
      })),
      distribuicaoSemanal: input.distribuicaoSemanal,
      linhasEspelho: input.acao === 'publicar' ? input.linhasEspelho : [],
      autor: null, // D6 — sem controle de permissão ainda; a Edge Function já grava o e-mail da sessão
    }),
  })

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    return { ok: false, error: body.error ?? `HTTP ${resp.status}` }
  }
  return { ok: true, error: null }
}

/** Sugestão de taxa pro Passo 2 (D10): a taxa que o mês anterior publicou pra
 *  essa marca/etapa, se existir. Leitura direta — RLS já permite SELECT. */
export function useTaxaMesAnterior(mesAnterior: string, marca: string, etapa: EtapaMeta) {
  const [taxa, setTaxa] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useState(() => {
    (async () => {
      const { data } = await supabaseVendas
        .from('meta_marca_etapa')
        .select('taxa, meta_marca!inner(marca, mes_referencia)')
        .eq('etapa', etapa)
        .eq('meta_marca.marca', marca)
        .eq('meta_marca.mes_referencia', mesAnterior)
        .maybeSingle()
      setTaxa((data as any)?.taxa ?? null)
      setLoading(false)
    })()
  })

  return { taxa, loading }
}
```

- [ ] **Step 2: Verify it compiles**

`cd ~/ws-dashboard-build && rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/` from repo root, then `cd ~/ws-dashboard-build && npx tsc -b --noEmit 2>&1 | grep useSalvarMeta` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSalvarMeta.ts
git commit -m "feat(vendas): hooks de escrita do Hub — salvarMeta e sugestão de taxa do mês anterior

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Página do Hub — casca, rota e Passo 0 (abrir mês)

**Files:**
- Create: `src/pages/HubMetas.tsx`
- Modify: `src/App.tsx` (adiciona rota `/metas`, lazy import)
- Modify: `src/components/AppLayout.tsx` (adiciona item "Metas" no submenu de Vendas)

**Interfaces:**
- Consumes: `useMetaMes` (Task 8), `EstadoMes` (Task 8)
- Produces: the wizard's top-level state (`mesReferencia`, `estadoEditavel`,
  `passoAtual`) passed down as props — later tasks (11–16) are step
  components that receive `estado: EstadoMesMarca[]` /
  `onMudar: (novo: ...) => void` style props, named consistently with Task 8's
  types.

- [ ] **Step 1: Write the page shell**

```typescript
// src/pages/HubMetas.tsx
import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useMetaMes, type EstadoMes, type EstadoMesMarca, type DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { DiaSemana, Semana } from '@/lib/metasEngine'

// 7 entradas, índice 0–6 — Passo 0 é a única "fora da contagem" do spec
// (abrir/copiar o mês, não uma etapa de configuração em si); Passo 1–6 são
// os "6 passos" que a §4 do spec conta. Toda referência a `passo === N` nas
// Tasks 11–16 usa esses mesmos índices — não renumerar sem atualizar as 6.
const PASSOS = ['Abrir mês', 'Semanas', 'Taxas', 'Funil por marca', 'Pessoas', 'Distribuição semanal', 'Revisar e publicar'] as const

function mesAtualKey(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
}

function mesAnteriorKey(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const d = new Date(ano, mes - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function HubMetas() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualKey())
  const [passo, setPasso] = useState(0)

  const { estado, loading, reload } = useMetaMes(mesReferencia)
  const { estado: estadoAnterior } = useMetaMes(mesAnteriorKey(mesReferencia))

  const [rascunho, setRascunho] = useState<{
    diaViradaSemana: DiaSemana
    semanas: Semana[]
    marcas: EstadoMesMarca[]
    distribuicaoSemanal: DistribuicaoSemanalItem[]
  } | null>(null)

  // Ao trocar de mês (ou carregar), inicializa o rascunho local a partir do
  // estado do banco (ou vazio, se o mês nunca foi aberto).
  const rascunhoAtual = useMemo(() => {
    if (rascunho) return rascunho
    if (estado && estado.status !== 'inexistente') {
      return { diaViradaSemana: estado.diaViradaSemana, semanas: estado.semanas, marcas: estado.marcas, distribuicaoSemanal: estado.distribuicaoSemanal }
    }
    return null
  }, [estado, rascunho])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Metas"
        subtitle="Lançamento mensal de metas — funil configurável por marca, semanas e pessoas"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PASSOS.map((label, i) => (
          <button key={label} onClick={() => setPasso(i)} style={{
            padding: '6px 14px', borderRadius: 999,
            border: '1px solid ' + (i === passo ? 'var(--ws-brand)' : 'var(--ws-border)'),
            background: i === passo ? 'var(--ws-brand)' : '#fff',
            color: i === passo ? '#fff' : 'var(--ws-text-primary)',
            fontSize: 12, cursor: 'pointer',
          }}>{i}. {label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Carregando…</div>}

      {!loading && passo === 0 && (
        <PassoAbrirMes
          mesReferencia={mesReferencia}
          setMesReferencia={setMesReferencia}
          estado={estado as EstadoMes | null}
          estadoAnterior={estadoAnterior as EstadoMes | null}
          onCopiarMesAnterior={() => {
            if (!estadoAnterior || estadoAnterior.status === 'inexistente') return
            setRascunho({
              diaViradaSemana: estadoAnterior.diaViradaSemana,
              semanas: [], // semanas do mês novo são geradas no Passo 1, não copiadas (datas mudam de mês pra mês)
              marcas: estadoAnterior.marcas,
              distribuicaoSemanal: [],
            })
          }}
          onIniciarVazio={() => setRascunho({ diaViradaSemana: 'terca', semanas: [], marcas: [], distribuicaoSemanal: [] })}
        />
      )}

      {!loading && passo > 0 && !rascunhoAtual && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Volte ao Passo 0 e abra o mês (copiando do anterior ou começando vazio) antes de continuar.
        </div>
      )}

      {/* Passos 1–5 chegam nas Tasks 11–16, todos recebendo `rascunhoAtual` e `setRascunho` */}
    </div>
  )
}

function PassoAbrirMes({
  mesReferencia, setMesReferencia, estado, estadoAnterior, onCopiarMesAnterior, onIniciarVazio,
}: {
  mesReferencia: string
  setMesReferencia: (m: string) => void
  estado: EstadoMes | null
  estadoAnterior: EstadoMes | null
  onCopiarMesAnterior: () => void
  onIniciarVazio: () => void
}) {
  const jaAberto = estado != null && estado.status !== 'inexistente'
  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 240 }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Mês de referência</span>
        <input type="month" value={mesReferencia.slice(0, 7)} onChange={e => setMesReferencia(`${e.target.value}-01`)}
          style={{ padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
      </label>

      {jaAberto ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          Este mês já está {estado!.status === 'publicado' ? 'publicado' : 'em rascunho'}. Avance pelos passos pra editar.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          {estadoAnterior && estadoAnterior.status !== 'inexistente' && (
            <button onClick={onCopiarMesAnterior} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--ws-brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Copiar do mês anterior
            </button>
          )}
          <button onClick={onIniciarVazio} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--ws-border)', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Começar vazio
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/App.tsx`, add near the other Vendas lazy imports:

```typescript
const HubMetas = lazy(() => import('@/pages/HubMetas').then(m => ({ default: m.HubMetas })))
```

And inside `<Routes>`, next to `/performance-vendas`:

```tsx
<Route path="/metas" element={<HubMetas />} />
```

- [ ] **Step 3: Add the nav entry**

In `src/components/AppLayout.tsx`, find the Vendas submenu array (around
line 37, where `funil-vendas`/`performance-vendas`/`analise-perda` live) and
add:

```typescript
{ key: 'metas', label: 'Metas' },
```

Find `getVendasActiveSub` and add:

```typescript
if (pathname.startsWith('/metas')) return 'metas'
```

Find the `pathname.startsWith(...)` chain that maps to `'vendas'` in
`getActiveKey` and add `|| pathname.startsWith('/metas')` to it.

- [ ] **Step 4: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HubMetas.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(vendas): Hub de Metas — página, rota e Passo 0 (abrir mês)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Passo 1 — Semanas

**Files:**
- Create: `src/components/metas/PassoSemanas.tsx`
- Modify: `src/pages/HubMetas.tsx` (renders this when `passo === 1`)

**Interfaces:**
- Consumes: `DiaSemana`, `Semana`, `gerarSemanas` (Task 2)
- Produces: `<PassoSemanas diaViradaSemana={DiaSemana} semanas={Semana[]} mesReferencia={string} onMudar={(diaViradaSemana: DiaSemana, semanas: Semana[]) => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoSemanas.tsx
import { gerarSemanas, type DiaSemana, type Semana } from '@/lib/metasEngine'

const DIAS: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
}

export function PassoSemanas({
  mesReferencia, diaViradaSemana, onMudar,
}: {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  onMudar: (diaViradaSemana: DiaSemana, semanas: Semana[]) => void
}) {
  const semanas = gerarSemanas(mesReferencia, diaViradaSemana)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Semana começa em</span>
        <select value={diaViradaSemana} onChange={e => onMudar(e.target.value as DiaSemana, gerarSemanas(mesReferencia, e.target.value as DiaSemana))}
          style={{ padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6 }}>
          {DIAS.map(d => <option key={d} value={d}>{DIA_LABEL[d]}</option>)}
        </select>
      </label>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {semanas.map(s => (
          <div key={s.numero} style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--ws-bg)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>S{s.numero}</span>
            <span>{s.inicio} → {s.fim}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

Add the import and, right after the "Passo 0" block, add:

```tsx
{!loading && passo === 1 && rascunhoAtual && (
  <PassoSemanas
    mesReferencia={mesReferencia}
    diaViradaSemana={rascunhoAtual.diaViradaSemana}
    onMudar={(dia, semanas) => setRascunho({ ...rascunhoAtual, diaViradaSemana: dia, semanas })}
  />
)}
```

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoSemanas.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 1 (semanas)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Passo 2 — Taxas de conversão (D10)

**Files:**
- Create: `src/components/metas/PassoTaxas.tsx`
- Modify: `src/pages/HubMetas.tsx`

**Interfaces:**
- Consumes: `ConfigEtapa`, `ETAPAS_META_ORDEM` (Task 2/3), `useTaxaMesAnterior` (Task 9)
- Produces: `<PassoTaxas marcas={EstadoMesMarca[]} mesAnterior={string} onMudarTaxa={(marca: string, etapa: EtapaMeta, taxa: number, origem: 'mes_anterior'|'historico_crm'|'manual') => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoTaxas.tsx
import { useTaxaMesAnterior } from '@/hooks/useSalvarMeta'
import type { EtapaMeta } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'

export function PassoTaxas({
  marcas, mesAnterior, onMudarTaxa,
}: {
  marcas: EstadoMesMarca[]
  mesAnterior: string
  onMudarTaxa: (marca: string, etapa: EtapaMeta, taxa: number, origem: 'mes_anterior' | 'historico_crm' | 'manual') => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => (
        <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>
          {m.etapas.filter(e => e.modo === 'derivado').map(e => (
            <LinhaTaxa key={e.etapa} marca={m.marca} etapa={e.etapa} etapaOrigem={e.etapaOrigem!}
              taxaAtual={e.taxa} mesAnterior={mesAnterior} onMudarTaxa={onMudarTaxa} />
          ))}
          {m.etapas.filter(e => e.modo === 'derivado').length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhuma etapa derivada configurada ainda — volte ao Passo 3 pra definir o modo de cada etapa primeiro.</p>
          )}
        </div>
      ))}
    </div>
  )
}

function LinhaTaxa({
  marca, etapa, etapaOrigem, taxaAtual, mesAnterior, onMudarTaxa,
}: {
  marca: string
  etapa: EtapaMeta
  etapaOrigem: EtapaMeta
  taxaAtual: number | undefined
  mesAnterior: string
  onMudarTaxa: (marca: string, etapa: EtapaMeta, taxa: number, origem: 'mes_anterior' | 'historico_crm' | 'manual') => void
}) {
  const { taxa: taxaMesAnterior } = useTaxaMesAnterior(mesAnterior, marca, etapa)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ws-border)' }}>
      <span style={{ fontSize: 13, minWidth: 220 }}>{etapaOrigem} → {etapa}</span>
      <input type="number" step="0.1" min="0" max="100"
        value={taxaAtual != null ? Math.round(taxaAtual * 1000) / 10 : ''}
        onChange={e => onMudarTaxa(marca, etapa, Number(e.target.value) / 100, 'manual')}
        style={{ width: 90, padding: '6px 10px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
      <span style={{ fontSize: 12 }}>%</span>
      {taxaMesAnterior != null && (
        <button onClick={() => onMudarTaxa(marca, etapa, taxaMesAnterior, 'mes_anterior')}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-bg)', cursor: 'pointer' }}>
          usar mês anterior · {(taxaMesAnterior * 100).toFixed(1)}%
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

```tsx
{!loading && passo === 2 && rascunhoAtual && (
  <PassoTaxas
    marcas={rascunhoAtual.marcas}
    mesAnterior={mesAnteriorKey(mesReferencia)}
    onMudarTaxa={(marca, etapa, taxa, origem) => {
      setRascunho({
        ...rascunhoAtual,
        marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : {
          ...m, etapas: m.etapas.map(e => e.etapa !== etapa ? e : { ...e, taxa, taxaOrigem: origem }),
        }),
      })
    }}
  />
)}
```

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoTaxas.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 2 (taxas, sugestão do mês anterior)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Passo 3 — Funil por marca (modo + resultado ao vivo)

**Files:**
- Create: `src/components/metas/PassoFunilMarca.tsx`
- Modify: `src/pages/HubMetas.tsx`

**Interfaces:**
- Consumes: `ETAPAS_META_ORDEM`, `resolverFunilMarca`, `detectarGaps`, `ConfigEtapa` (Tasks 2–4)
- Produces: `<PassoFunilMarca marcas={EstadoMesMarca[]} onMudarEtapa={(marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => void} onMudarTicket={(marca: string, ticket: number) => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoFunilMarca.tsx
import { ETAPAS_META_ORDEM, resolverFunilMarca, detectarGaps, type ConfigEtapa, type EtapaMeta, type ModoEtapa } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'

export function PassoFunilMarca({
  marcas, onMudarEtapa, onMudarTicket,
}: {
  marcas: EstadoMesMarca[]
  onMudarEtapa: (marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => void
  onMudarTicket: (marca: string, ticket: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => <CartaoMarca key={m.marca} marca={m} onMudarEtapa={onMudarEtapa} onMudarTicket={onMudarTicket} />)}
    </div>
  )
}

function CartaoMarca({
  marca, onMudarEtapa, onMudarTicket,
}: {
  marca: EstadoMesMarca
  onMudarEtapa: (marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => void
  onMudarTicket: (marca: string, ticket: number) => void
}) {
  const resolucao = resolverFunilMarca(marca.etapas, marca.ticketMedio)
  const gaps = detectarGaps(marca.etapas, resolucao)
  const porEtapa = new Map(marca.etapas.map(e => [e.etapa, e]))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{marca.marca}</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          Ticket médio
          <input type="number" value={marca.ticketMedio} onChange={e => onMudarTicket(marca.marca, Number(e.target.value))}
            style={{ width: 100, padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
        </label>
      </div>

      {ETAPAS_META_ORDEM.map(etapa => {
        const cfg = porEtapa.get(etapa) ?? { etapa, modo: 'desligado' as ModoEtapa }
        const valor = resolucao.valores[etapa]
        return (
          <div key={etapa} style={{ display: 'grid', gridTemplateColumns: '160px 140px 1fr 100px', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--ws-border)' }}>
            <span style={{ fontSize: 13 }}>{etapa}</span>
            <select value={cfg.modo} onChange={e => onMudarEtapa(marca.marca, etapa, { modo: e.target.value as ModoEtapa })}
              style={{ padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12 }}>
              <option value="fixo">Fixo</option>
              <option value="derivado">Derivado</option>
              <option value="desligado">Desligado</option>
            </select>
            {cfg.modo === 'fixo' && (
              <input type="number" value={cfg.valorFixo ?? ''} onChange={e => onMudarEtapa(marca.marca, etapa, { valorFixo: Number(e.target.value) })}
                style={{ width: 100, padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
            )}
            {cfg.modo === 'derivado' && (
              <select value={cfg.etapaOrigem ?? ''} onChange={e => onMudarEtapa(marca.marca, etapa, { etapaOrigem: e.target.value as EtapaMeta })}
                style={{ padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12 }}>
                <option value="">origem…</option>
                {ETAPAS_META_ORDEM.filter(e => e !== etapa).map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
              {valor != null ? Math.round(valor * 10) / 10 : '—'}
            </span>
          </div>
        )
      })}

      <div style={{ marginTop: 10, padding: '8px 0', borderTop: '2px solid var(--ws-brand)', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
        <span>Faturamento</span>
        <span>{resolucao.faturamento != null ? `R$ ${resolucao.faturamento.toLocaleString('pt-BR')}` : '—'}</span>
      </div>

      {resolucao.erros.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: '#B91C1C' }}>
          {resolucao.erros.map((e, i) => <div key={i}>{e.mensagem}</div>)}
        </div>
      )}

      {gaps.filter(g => g.diverge).length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
          {gaps.filter(g => g.diverge).map((g, i) => (
            <div key={i}>
              {g.etapaTopo} → {g.etapaFundo}: taxa configurada {((g.taxaConfigurada ?? 0) * 100).toFixed(1)}%,
              mas o resultado implica {(g.taxaImplicita * 100).toFixed(1)}%.
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

```tsx
{!loading && passo === 3 && rascunhoAtual && (
  <PassoFunilMarca
    marcas={rascunhoAtual.marcas}
    onMudarEtapa={(marca, etapa, config) => {
      setRascunho({
        ...rascunhoAtual,
        marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : {
          ...m,
          etapas: m.etapas.some(e => e.etapa === etapa)
            ? m.etapas.map(e => e.etapa !== etapa ? e : { ...e, ...config })
            : [...m.etapas, { etapa, modo: 'desligado', ...config } as any],
        }),
      })
    }}
    onMudarTicket={(marca, ticket) => {
      setRascunho({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, ticketMedio: ticket }) })
    }}
  />
)}
```

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoFunilMarca.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 3 (funil por marca, cálculo ao vivo)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Passo 4 — Pessoas da marca (roster + pesos, N pessoas)

**Files:**
- Create: `src/components/metas/PassoPessoas.tsx`
- Modify: `src/pages/HubMetas.tsx`

**Interfaces:**
- Consumes: `useRosterVendas` (existing hook), `PessoaComFuncao` (Task 6)
- Produces: `<PassoPessoas marcas={EstadoMesMarca[]} onMudarPessoas={(marca: string, pessoas: PessoaComFuncao[]) => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoPessoas.tsx
import { useRosterVendas } from '@/hooks/useRosterVendas'
import type { PessoaComFuncao } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'

export function PassoPessoas({
  marcas, onMudarPessoas,
}: {
  marcas: EstadoMesMarca[]
  onMudarPessoas: (marca: string, pessoas: PessoaComFuncao[]) => void
}) {
  const { data: roster } = useRosterVendas()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => (
        <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>

          {(['SDR', 'Closer'] as const).map(funcao => {
            const dessaFuncao = m.pessoas.filter(p => p.funcao === funcao)
            const somaPeso = dessaFuncao.reduce((s, p) => s + p.peso, 0)
            return (
              <div key={funcao} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 6 }}>
                  {funcao}{somaPeso !== 100 && dessaFuncao.length > 0 && ` — pesos somam ${somaPeso}%, não 100%`}
                </div>

                {dessaFuncao.map(p => (
                  <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, minWidth: 140 }}>{p.nome}</span>
                    <input type="number" value={p.peso} min={0} max={100}
                      onChange={e => onMudarPessoas(m.marca, m.pessoas.map(x => x.nome === p.nome && x.funcao === funcao ? { ...x, peso: Number(e.target.value) } : x))}
                      style={{ width: 70, padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
                    <span style={{ fontSize: 12 }}>%</span>
                    <button onClick={() => onMudarPessoas(m.marca, m.pessoas.filter(x => !(x.nome === p.nome && x.funcao === funcao)))}
                      style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>
                  </div>
                ))}

                <select value="" onChange={e => {
                  if (!e.target.value) return
                  onMudarPessoas(m.marca, [...m.pessoas, { nome: e.target.value, funcao, peso: dessaFuncao.length === 0 ? 100 : Math.round(100 / (dessaFuncao.length + 1)) }])
                }} style={{ padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12, marginTop: 4 }}>
                  <option value="">+ adicionar {funcao}…</option>
                  {(roster ?? [])
                    .filter(pessoa => pessoa.cargo === funcao || pessoa.cargo === 'SDR/Closer')
                    .filter(pessoa => !dessaFuncao.some(d => d.nome === pessoa.nome))
                    .map(pessoa => <option key={pessoa.nome} value={pessoa.nome}>{pessoa.nome}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

```tsx
{!loading && passo === 4 && rascunhoAtual && (
  <PassoPessoas
    marcas={rascunhoAtual.marcas}
    onMudarPessoas={(marca, pessoas) => {
      setRascunho({ ...rascunhoAtual, marcas: rascunhoAtual.marcas.map(m => m.marca !== marca ? m : { ...m, pessoas }) })
    }}
  />
)}
```

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoPessoas.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 4 (pessoas por marca, sem limite de quantidade)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Passo 5 — Distribuição semanal

**Files:**
- Create: `src/components/metas/PassoDistribuicaoSemanal.tsx`
- Modify: `src/pages/HubMetas.tsx`

**Interfaces:**
- Consumes: `ratearPorPeso` used only as a starting suggestion (not auto-applied — D4 says the manager types every number), `Semana`, `EtapaMeta`
- Produces: `<PassoDistribuicaoSemanal marcas={EstadoMesMarca[]} semanas={Semana[]} distribuicaoSemanal={DistribuicaoSemanalItem[]} onMudarValor={(nomePessoa: string, semanaNumero: number, etapa: EtapaMeta, valor: number) => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoDistribuicaoSemanal.tsx
import { resolverFunilMarca, type EtapaMeta, type Semana } from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMesMarca } from '@/hooks/useMetaMes'

const ETAPAS_DISTRIBUIVEIS: EtapaMeta[] = ['Ligações', 'Reunião Agendada SQL', 'Oportunidade COF', 'Fechamento']

export function PassoDistribuicaoSemanal({
  marcas, semanas, distribuicaoSemanal, onMudarValor,
}: {
  marcas: EstadoMesMarca[]
  semanas: Semana[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  onMudarValor: (nomePessoa: string, semanaNumero: number, etapa: EtapaMeta, valor: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => {
        const resolucao = resolverFunilMarca(m.etapas, m.ticketMedio)
        return (
          <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>
            {m.pessoas.map(p => (
              <div key={`${p.nome}-${p.funcao}`} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.nome} ({p.funcao})</div>
                {ETAPAS_DISTRIBUIVEIS.filter(e => (p.funcao === 'SDR' ? e !== 'Oportunidade COF' && e !== 'Fechamento' : e === 'Oportunidade COF' || e === 'Fechamento')).map(etapa => {
                  const metaPessoa = (resolucao.valores[etapa] ?? 0) * (p.peso / 100)
                  const itens = distribuicaoSemanal.filter(d => d.nomePessoa === p.nome && d.etapa === etapa)
                  const alocado = itens.reduce((s, d) => s + d.valor, 0)
                  return (
                    <div key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, minWidth: 160 }}>{etapa}</span>
                      {semanas.map(s => {
                        const valorAtual = itens.find(d => d.semanaNumero === s.numero)?.valor ?? 0
                        return (
                          <input key={s.numero} type="number" value={valorAtual}
                            onChange={e => onMudarValor(p.nome, s.numero, etapa, Number(e.target.value))}
                            title={`S${s.numero}`}
                            style={{ width: 56, padding: '4px 6px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12 }} />
                        )
                      })}
                      <span style={{ fontSize: 11, color: alocado > metaPessoa + 0.01 ? '#B91C1C' : 'var(--ws-text-secondary)' }}>
                        {Math.round(alocado * 10) / 10} / {Math.round(metaPessoa * 10) / 10}
                        {alocado > metaPessoa + 0.01 ? ' ▸ passou da meta' : alocado < metaPessoa - 0.01 ? ` ▸ faltam ${Math.round((metaPessoa - alocado) * 10) / 10}` : ' ✓'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

```tsx
{!loading && passo === 5 && rascunhoAtual && (
  <PassoDistribuicaoSemanal
    marcas={rascunhoAtual.marcas}
    semanas={rascunhoAtual.semanas}
    distribuicaoSemanal={rascunhoAtual.distribuicaoSemanal}
    onMudarValor={(nomePessoa, semanaNumero, etapa, valor) => {
      const semOEditado = rascunhoAtual.distribuicaoSemanal.filter(d => !(d.nomePessoa === nomePessoa && d.semanaNumero === semanaNumero && d.etapa === etapa))
      setRascunho({ ...rascunhoAtual, distribuicaoSemanal: [...semOEditado, { nomePessoa, semanaNumero, etapa, valor }] })
    }}
  />
)}
```

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoDistribuicaoSemanal.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 5 (distribuição semanal manual)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Passo 6 — Revisar e publicar

**Files:**
- Create: `src/components/metas/PassoRevisarPublicar.tsx`
- Modify: `src/pages/HubMetas.tsx`

**Interfaces:**
- Consumes: `resolverFunilMarca`, `gerarLinhasEspelho` (Tasks 3, 6), `salvarMeta` (Task 9)
- Produces: `<PassoRevisarPublicar mesReferencia={string} rascunho={...} estadoMesAnterior={EstadoMes|null} onPublicado={() => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/metas/PassoRevisarPublicar.tsx
import { useState } from 'react'
import { resolverFunilMarca, gerarLinhasEspelho } from '@/lib/metasEngine'
import { salvarMeta } from '@/hooks/useSalvarMeta'
import type { EstadoMes, EstadoMesMarca, DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { DiaSemana, Semana } from '@/lib/metasEngine'

export function PassoRevisarPublicar({
  mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, estadoMesAnterior, onPublicado,
}: {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  estadoMesAnterior: EstadoMes | null
  onPublicado: () => void
}) {
  const [publicando, setPublicando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const resolucoes = marcas.map(m => ({ marca: m.marca, resolucao: resolverFunilMarca(m.etapas, m.ticketMedio), pessoas: m.pessoas }))
  const totalVendas = resolucoes.reduce((s, r) => s + (r.resolucao.valores['Fechamento'] ?? 0), 0)
  const totalFaturamento = resolucoes.reduce((s, r) => s + (r.resolucao.faturamento ?? 0), 0)
  const temErro = resolucoes.some(r => r.resolucao.erros.length > 0)

  const totalVendasAnterior = (estadoMesAnterior?.marcas ?? []).reduce((s, m) => {
    const r = resolverFunilMarca(m.etapas, m.ticketMedio)
    return s + (r.valores['Fechamento'] ?? 0)
  }, 0)

  async function publicar() {
    setPublicando(true); setMsg(null)
    const linhasEspelho = gerarLinhasEspelho(mesReferencia, resolucoes)
    const resultado = await salvarMeta({
      acao: 'publicar', mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, linhasEspelho,
    })
    setPublicando(false)
    if (!resultado.ok) { setMsg(`Erro: ${resultado.error}`); return }
    setMsg('Publicado com sucesso.')
    onPublicado()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Consolidado — {mesReferencia}</h3>

      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Vendas</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{totalVendas}</div>
          {totalVendasAnterior > 0 && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>mês anterior: {totalVendasAnterior}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Faturamento</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>R$ {totalFaturamento.toLocaleString('pt-BR')}</div>
        </div>
      </div>

      {temErro && (
        <div style={{ padding: 10, background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: '#B91C1C', marginBottom: 16 }}>
          Existem marcas com erro de configuração — corrija no Passo 3 antes de publicar.
        </div>
      )}

      {msg && (
        <div style={{ padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 16, background: msg.startsWith('Erro') ? '#FEE2E2' : '#DCFCE7', color: msg.startsWith('Erro') ? '#B91C1C' : '#166534' }}>
          {msg}
        </div>
      )}

      <button onClick={publicar} disabled={publicando || temErro}
        style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: temErro ? 'var(--ws-border)' : 'var(--ws-brand)', color: '#fff', cursor: temErro ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}>
        {publicando ? 'Publicando…' : 'Publicar mês'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `HubMetas.tsx`**

```tsx
{!loading && passo === 6 && rascunhoAtual && (
  <PassoRevisarPublicar
    mesReferencia={mesReferencia}
    diaViradaSemana={rascunhoAtual.diaViradaSemana}
    semanas={rascunhoAtual.semanas}
    marcas={rascunhoAtual.marcas}
    distribuicaoSemanal={rascunhoAtual.distribuicaoSemanal}
    estadoMesAnterior={estadoAnterior}
    onPublicado={reload}
  />
)}
```

(`passo === 6` above is correct as written — `PASSOS[6] === 'Revisar e
publicar'`, per Task 10's corrected 7-entry array. No change needed to
`PASSOS` in this task.)

- [ ] **Step 3: Verify the build**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build && npx vitest run
```

Expected: build succeeds, all vitest tests pass (should be ~20+ tests across
`metasEngine.test.ts` plus the pre-existing suite — CLAUDE.md mentions 139 as
of the last count).

- [ ] **Step 4: Commit**

```bash
git add src/components/metas/PassoRevisarPublicar.tsx src/pages/HubMetas.tsx
git commit -m "feat(vendas): Hub de Metas — Passo 6 (revisar e publicar)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Semear setembro/2026

**Files:**
- No new file — data entered **through the Hub UI itself** (dogfooding the
  tool before trusting it), following §8 of the spec exactly.

**Interfaces:**
- Consumes: the full wizard from Tasks 10–16.

- [ ] **Step 1: Open `/metas`, select September 2026, start empty**

(Not "copy from previous month" — August's config in `DB_Metas_Performance`
predates the Hub and isn't in the new schema yet; September is the first real
month launched through the Hub.)

- [ ] **Step 2: Passo 1 — Semanas**

Dia de virada: **terça**. Confirm the 5 generated weeks match:
S1 01–07/09, S2 08–14/09, S3 15–21/09, S4 22–28/09, S5 29–30/09.

- [ ] **Step 3: Passo 3 — Funil por marca, all stages `fixo`**

Per §8's table, for each brand set **every** relevant stage to `fixo` with the
exact spreadsheet number (not `derivado` — the September seed is a direct
transcription, so there's no floating-point risk in the acceptance check):

| Marca | Ligações | Reunião Agendada SQL | Reunião Realizada | SAL | Oportunidade COF | Fechamento | Ticket |
|---|---:|---:|---:|---:|---:|---:|---:|
| Inpot | 1557.6 | 67.1 | 42.9 | 26.4 | 10.6 | 5 | 74900 |
| Eletrovias | 3049.2 | 55.0 | 31.9 | 18.7 | 7.5 | 4 | 39900 |
| B2Case | 2481.6 | 55.0 | 31.9 | 18.7 | 7.5 | 4 | 10000 |
| Oral Unic | 1039.5 | 30.8 | 17.6 | 11.0 | 4.4 | 2 | 74900 |
| Lisô Laser | 1240.8 | 22.0 | 11.0 | 5.5 | 2.2 | 1 | 39900 |
| Viva | 531.3 | 15.4 | 9.9 | 6.6 | 2.6 | 1 | 69900 |
| Odonto Scale | *desligado* | *desligado* | *desligado* | *desligado* | *desligado* | 5 | 5597 |

All other stages (MQL, Tentando Contato, Contato Efetivo, Interesse Reunião,
Conexão, Comitê, Pré-Contrato) stay `desligado` for every brand — the seed
doesn't have data for them.

- [ ] **Step 4: Passo 4 — Pessoas**

Per §8's allocation table, add SDR/Closer per brand, all weights 50/50 where
two people share a role:

| Marca | SDR | Closer |
|---|---|---|
| Inpot | Thiago (50%) + Xayane (50%) | Douglas (100%) |
| Lisô Laser | Thiago (50%) + Xayane (50%) | Jéssica (100%) |
| B2Case | Thiago (50%) + Xayane (50%) | Bruna (100%) |
| Oral Unic | Sarah Padilha (100%) | Aurélio Briano (100%) |
| Viva | Sarah Padilha (100%) | Aurélio Briano (100%) |
| Eletrovias | Sarah Padilha (50%) + Thiago (50%) | Jéssica (100%) |
| Odonto Scale | *(nenhum SDR)* | Aurélio Briano (100%) |

- [ ] **Step 5: Passo 5 — Distribuição semanal**

Leave every weekly cell at 0 for this seed — the spreadsheet only had monthly
totals, no real weekly split existed before the Hub. This is expected and
matches D4 (the manager fills these in later, on their own schedule); it does
**not** block publishing.

- [ ] **Step 6: Passo 6 — Publish**

Confirm the consolidated total shows **22 vendas** and **R$ 861.685**
(5+4+4+2+1+1+5 vendas; the 6 brands with tickets sum to R$ 856.088 and Odonto
Scale adds R$ 27.985 — verify the on-screen total matches
R$ 856.088 + R$ 27.985 = **R$ 884.073**... **recompute exactly before
publishing**: if the on-screen total doesn't equal R$ 861.685 from spec §8,
STOP and debug the engine before publishing — do not adjust the seed numbers
to force a match. Note: §8's table total (R$ 861.685) already accounts for
Odonto Scale's R$ 27.985 — re-derive by summing the "Faturamento" column in
§8's table exactly: 374500+159600+40000+149800+39900+69900+27985 = 861685.
Confirm this by hand before clicking Publicar.

- [ ] **Step 7: Verify via SQL**

```sql
select mes_referencia, count(*) linhas,
  sum(meta_qtd_vendas) as total_vendas,
  sum(meta_financeira) as total_faturamento
from "DB_Metas_Performance"
where mes_referencia = '2026-09-01';
```

Expected: `total_vendas = 22`, `total_faturamento = 861685`.

- [ ] **Step 8: Commit** (nothing to commit — this task's output is database
      state, not files; note completion in the next task's commit message)

---

## Task 18: Verificação final e checksum de regressão

**Files:**
- No new file — verification only.

- [ ] **Step 1: Confirm the acceptance numbers exactly**

```sql
select
  sum(case when funcao='SDR' then meta_agendamento else 0 end) as sql_total,
  sum(case when funcao='SDR' then meta_reuniao_realizada else 0 end) as reuniao_total,
  sum(case when funcao='Closer' then meta_cof else 0 end) as opp_total,
  sum(case when funcao='Closer' then meta_qtd_vendas else 0 end) as vendas_total,
  sum(case when funcao='Closer' then meta_financeira else 0 end) as faturamento_total
from "DB_Metas_Performance" where mes_referencia = '2026-09-01';
```

Expected: `sql_total ≈ 245.3`, `reuniao_total ≈ 145.2`, `opp_total ≈ 34.8`,
`vendas_total = 22`, `faturamento_total = 861685`. (SAL and Ligações aren't
mirrored columns in `DB_Metas_Performance` — they only live in `meta_marca_etapa`,
confirmed separately below.)

```sql
select mm.marca, mme.etapa, mme.valor_fixo
from meta_marca mm join meta_marca_etapa mme on mme.meta_marca_id = mm.id
where mm.mes_referencia = '2026-09-01' and mme.etapa in ('Ligações', 'SAL')
order by mm.marca, mme.etapa;
```

Expected: 6 rows for Ligações (all brands except Odonto Scale) summing to
9900, 6 rows for SAL summing to 86.9.

- [ ] **Step 2: Confirm August and earlier months are untouched**

```sql
select mes_referencia, count(*) from "DB_Metas_Performance"
where mes_referencia < '2026-09-01' group by 1 order by 1;
```

Compare row counts against what was recorded before Task 17 ran (from the
Task 1 planning conversation: Feb 14, Mar 17, Apr 21, May 21, Jun 20, Jul 12,
Aug 14 rows). Any change here is a bug — the publish flow must only ever
delete-and-reinsert the month it's publishing (`Deno.serve` handler in
Task 7's `index.ts`, the `.delete().eq('mes_referencia', ...)` line — confirm
it's scoped to `payload.mesReferencia` and nothing else).

- [ ] **Step 3: Confirm Performance Detalhada and Visão Macro read August unchanged**

Since building requires login credentials this session doesn't have, verify
via SQL instead: confirm `src/hooks/useMetasPerformance.ts`'s query shape
(`select nome_colaborador, marca, mes_referencia, funcao, meta_sql,
meta_agendamento, meta_reuniao_realizada, meta_cof, meta_financeira,
meta_qtd_vendas from "DB_Metas_Performance" where mes_referencia = ...`)
returns the same row count and same aggregate sums for `'2026-08-01'` after
this plan's work as it did before Task 1 (re-run the exact query, diff
against a saved snapshot taken before Task 1 started).

- [ ] **Step 4: Final full test + build run**

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build && npx vitest run
```

Expected: build succeeds, all tests pass, zero TypeScript errors.

- [ ] **Step 5: Update CLAUDE.md's Histórico de mudanças**

Per this repo's own rule (CLAUDE.md header: "Ao terminar qualquer mudança...
registre em Histórico de mudanças"), add a dated entry summarizing: the Hub
shipped, the schema, the Edge Function security model, and the exact September
seed numbers confirmed in Step 1. Follow the style of existing entries (see
any entry under `## 9. Histórico de mudanças` for the expected level of
detail and honesty about what was/wasn't verified).

- [ ] **Step 6: Final commit and PR**

```bash
git add CLAUDE.md
git commit -m "docs(vendas): registra lançamento do Hub de Configuração de Metas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push -u origin docs/hub-configuracao-metas
gh pr create --base main --title "feat(vendas): Hub de Configuração de Metas" --body "$(cat <<'EOF'
Implementa o Hub de lançamento mensal de metas — motor de funil configurável
(fixo/derivado/desligado, deriva de qualquer etapa), semanas definidas pelo
gerente, rateio por peso entre N pessoas, e escrita segura via Edge Function
(nunca pela anon key exposta).

Setembro/2026 lançado através do próprio Hub, conferido byte a byte contra a
planilha: 9.900 ligações, 245,3 SQL, 145,2 reuniões, 86,9 SAL, 22 vendas,
R$ 861.685.

Espelha em DB_Metas_Performance — Performance Detalhada, Visão Macro e a
Campanha de Metas continuam lendo normalmente, sem alteração.

Spec: docs/superpowers/specs/2026-09-02-hub-configuracao-metas-design.md
Plano: docs/superpowers/plans/2026-09-02-hub-configuracao-metas.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1–§4 (motor + tela) → Tasks 2–16. §5 (dados) → Task 1
(schema) + Task 6 (espelho). §6 (sugestão de taxa) → Task 12 + Task 9's
`useTaxaMesAnterior` (historical-CRM half of §6 deliberately deferred — see
below). §7 (segurança) → Task 7. §8 (semente) → Task 17. §9 (verificação) →
Task 18. §10/§11 → reflected in scope notes throughout, not separate tasks.

**Known gap, deliberately deferred:** §6 of the spec also calls for a
CRM-historical-conversion suggestion (3/6/12-month real rates with volume
floor) alongside the "usar mês anterior" suggestion this plan builds in
Task 12. That's a second, independent suggestion source — no engine work
depends on it, and Task 12's `LinhaTaxa` component has a clear seam
(`useTaxaMesAnterior`'s sibling would be `useTaxaHistoricaCrm`) to add it
without touching anything else. Left out of this plan to keep it shippable
sooner; flag to Junior before merging in case he wants it in this PR instead
of a fast-follow.

**Type consistency check:** `EtapaMeta`, `ConfigEtapa`, `ResolucaoFunil`,
`PessoaComFuncao`, `LinhaEspelho`, `Semana`, `DiaSemana` are each defined once
(Tasks 2/3/5/6) and imported by name in every later task — grepped for
mismatched names (e.g. `etapaOrigem` vs `origemEtapa`) across all 18 tasks
above; consistent throughout.
