# Reuniões (sessões) ao lado do Diagnóstico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mostrar "em N reuniões · M de LIVE" colado no Diagnóstico (funil da Visão Macro, cards e tabelas da Performance), com pop-up, contando cada LIVE da Eletrovias como 1 reunião.

**Architecture:** uma view nova no Supabase de Expansão (`vw_reuniao_live`) liga cada negócio de LIVE à gravação do MeetRox que foi a R1 dele (por e-mail dos convidados). Um hook próprio lê a view (fora do `dash_*`). Uma função pura (`resumirReunioes`) recebe os mesmos eventos de Diagnóstico do card e devolve as reuniões; as duas abas chamam a mesma função.

**Tech Stack:** Postgres (Supabase, conector MCP), React 19 + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-reunioes-live-design.md`

## Global Constraints

- Piso de data: só Diagnósticos a partir de `2026-11-01 00:00-03`.
- Janela de busca da R1: gravação entre `data_reuniao_realizada − 14 dias` e `data_reuniao_realizada`, a **primeira** (`order by call_timestamp, call_id`).
- Convidado externo = e-mail que não termina em `@wescale.com.br` nem `@oralunic.com.br`.
- Linha/coluna só aparecem quando `total !== diagnosticos` **e** a base da view carregou.
- Diagnóstico, funil e colunas atuais: números idênticos antes/depois.
- Texto na tela em pt-BR: `em {total} reuniões · {deLive} de LIVE` (singular "reunião" quando total = 1).
- Build e testes fora do OneDrive (worktree `~/ws-wt-reunioes-live`): `npm run build` e `npx vitest run`.
- Commits em pt-BR, Conventional Commits, rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. LIVE em 30/11 com Diagnósticos registrados em 02/12: olhando dezembro, a sessão não conta e a linha aparece com "0 de LIVE"; olhando novembro, a sessão conta. → teste em Task 2.
2. Filtro de Closer: com Douglas, a LIVE conduzida pela Jéssica não conta para ele mesmo com negócios dela no nome dele; com Jéssica, conta mesmo se todos os negócios estão com Douglas. → teste em Task 2.
3. "Deals criados no período" (safra): a sessão conta se ≥1 negócio é da safra, sem olhar a data. → teste em Task 2.
4. Passagens: negócio de LIVE com 2 eventos de Diagnóstico conta 1 sessão; negócio individual com 2 eventos conta 2 reuniões. → teste em Task 2.
5. View ainda carregando ou com erro: a linha não aparece (não mostra LIVE "estimada" falsa). → teste em Task 3 (`pronto`).

---

### Task 1: View `vw_reuniao_live` no banco

**Files:**
- Create: `docs/sql/2026-11-24-reuniao-live.sql`

**Interfaces:**
- Produces: `public.vw_reuniao_live` com colunas
  `id_deal text, ciclo int, tipo_r1 text, data_diagnostico timestamptz, call_id bigint (nulo = sem gravação), call_timestamp timestamptz, closer text (quem gravou, nome do RD), titulo text, url text, convidados_externos int`.
  Uma linha por (negócio, ciclo) com Diagnóstico ≥ piso e (`tipo_r1 = 'LIVE'` ou cuja R1 é uma sessão de LIVE). `call_id` só preenchido quando a gravação é sessão de LIVE (R1 de ≥1 negócio LIVE).

- [ ] **Step 1: Escrever o SQL** com CTEs: `gravacoes` (`DB_Reunioes_MeetRox` ∩ `vw_closer_reunioes` por `call_id`, `call_timestamp >= '2026-10-15'`), `diag` (`vw_funil_vendas` com piso), `r1` (lateral com a regra da Global Constraints, match `exists (unnest(attendees) a join deal_contatos dc on lower(dc.email) = lower(btrim(a)) and dc.id_deal = d.id_lead)`), `sessoes` (`distinct call_id` de r1 com `tipo_r1 = 'LIVE'`). Cabeçalho explicando a regra e o porquê (mesmo estilo de `docs/sql/2026-10-01-closer-reunioes-meetrox.sql`). `grant select ... to anon, authenticated` e `comment on view`.
- [ ] **Step 2: Aplicar** pelo conector (`apply_migration`, nome `vw_reuniao_live`).
- [ ] **Step 3: Conferir**
  - `select count(*), count(call_id), count(distinct call_id) from vw_reuniao_live where tipo_r1='LIVE'` → 45 / 39 / 8 (números de 24/11; podem ter crescido — anotar os do dia).
  - `select * from vw_reuniao_live where call_id is null` → os negócios sem gravação (5 Eletrovias Cassiana/Jéssica + 1 Odonto Legacy Thaina em 24/11).
  - Tempo: `explain analyze select * from vw_reuniao_live` < 1 s (anon tem `statement_timeout` de 3 s). Se passar, trocar o join com `vw_closer_reunioes` por filtro direto de e-mail/cargo.
- [ ] **Step 4: Commit** `feat(vendas): view vw_reuniao_live liga negócio de LIVE à gravação da R1`

### Task 2: Função pura `resumirReunioes`

**Files:**
- Create: `src/lib/reunioesLive.ts`
- Test: `src/lib/reunioesLive.test.ts`

**Interfaces:**
- Consumes: `eventsInStage`, `dealKey`, `isInWindow`, `toWindow`, `PeriodWindow`, `ViewModes`, `EventCountOptions`, `FunnelEventRow` (`@/lib/metrics`); `FunnelRow` (`@/lib/funnelTypes`); `toLocalDate` (`@/lib/dateUtils`).
- Produces:

```ts
export interface ReuniaoLiveRow {
  id_deal: string; ciclo: number; tipo_r1: string | null; data_diagnostico: string | null
  call_id: number | null; call_timestamp: string | null; closer: string | null
  titulo: string | null; url: string | null; convidados_externos: number | null
}
export type TipoReuniao = 'individual' | 'live' | 'live-estimada'
export interface NegocioDaReuniao { row: FunnelRow; dataDiagnostico: string | null }
export interface Reuniao {
  chave: string            // 'ind:<dealKey>:<dia>:<n>' | 'live:<call_id>' | 'est:<closer>|<dia>'
  tipo: TipoReuniao
  data: string             // dia do evento (individual/estimada) ou call_timestamp (live)
  closer: string | null    // quem conduziu (live) ou nome_closer do negócio
  sdrs: string[]           // nome_sdr distintos dos negócios ('' = sem SDR)
  negocios: NegocioDaReuniao[]
  live?: { callId: number; titulo: string | null; url: string | null; convidadosExternos: number | null }
}
export interface ResumoReunioes {
  reunioes: Reuniao[]      // só as que contam no recorte, LIVE primeiro (data desc), depois individuais (data desc)
  total: number
  deLive: number           // live + live-estimada
  diagnosticos: number     // === countStageEvents(..., 'Diagnóstico', win, modes, opts)
  diagsDeLiveDeOutroPeriodo: (NegocioDaReuniao & { dataLive: string })[]
  porSdr: Map<string, number>     // chave = nome_sdr cru ('' = sem SDR); sessão conta 1 por SDR
  porCloser: Map<string, number>  // chave = closer da reunião ('' = sem Closer)
}
export const PISO_LIVE = '2026-11-01'
export function resumirReunioes(args: {
  eventos: FunnelEventRow[]
  rows: FunnelRow[]                // recorte SEM o filtro de Closer (superset), para achar linha por dealKey
  lives: ReuniaoLiveRow[]
  win: PeriodWindow
  modes: ViewModes
  opts: EventCountOptions          // o MESMO evOpts do card (com filtro de Closer)
  optsSessao?: EventCountOptions   // igual a opts, mas com escopo sem filtro de Closer (default: opts)
  closersFiltro?: string[]         // filtro de Closer da barra; aplicado a quem conduziu a sessão
}): ResumoReunioes
```

Regra (copiar do spec, seção "Regra de negócio"):
1. `diagnosticos = eventsInStage(eventos, 'Diagnóstico', win, modes, opts)`.
2. Eventos individuais: os de (1) cujo negócio **não** tem linha com `call_id` em `lives` e não é LIVE estimada → 1 reunião por evento.
3. LIVE estimada: evento de (1) de negócio com `row.tipo_r1 === 'LIVE'`, sem `call_id`, dia ≥ `PISO_LIVE` → agrupa por `(row.nome_closer ?? '', dia em Brasília)`, data = dia.
4. Sessões: eventos de `eventsInStage(eventos, 'Diagnóstico', JANELA_ABERTA, modes, optsSessao ?? opts)` (janela aberta = `toWindow()`) cujo negócio tem `call_id` → agrupa por `call_id`. Conta se `closersFiltro` vazio ou contém o `closer` da sessão, **e** (modo safra → sempre; senão `isInWindow(call_timestamp, win)`).
5. `diagsDeLiveDeOutroPeriodo`: eventos de (1) cujo negócio tem sessão que **não** conta no recorte por causa da data.
6. `porSdr`/`porCloser` conforme o tipo da reunião (spec, "Por pessoa").

- [ ] **Step 1: Escrever os testes** (dados sintéticos; helper `ev(id, dia, ciclo=1)`, `row({...})`, `live({...})`; `win` = nov/26 via `toWindow(undefined, { from: '2026-11-01', to: '2026-11-30' })`; `modes = DEFAULT_VIEW_MODES` e variações):
  - `individual: 2 negócios sem LIVE → total 2, deLive 0, total === diagnosticos`
  - `LIVE com 3 negócios na mesma gravação → total 1, deLive 1, diagnosticos 3, reunioes[0].negocios.length === 3`
  - `LIVE + 2 individuais → total 3, porCloser Jéssica 1 (LIVE) + nomes dos individuais`
  - `estimada: 2 negócios LIVE sem gravação, mesmo Closer e dia → 1 reunião tipo 'live-estimada'; dias diferentes → 2`
  - `negócio LIVE com Diagnóstico antes de PISO_LIVE → individual`
  - `outro período: LIVE em 30/11, Diagnósticos em 02/12, win = dez → total 0, diagnosticos 2, diagsDeLiveDeOutroPeriodo.length 2; win = nov → total 1, diagnosticos 0`
  - `Closer: sessão da Jéssica com negócio nome_closer Douglas; closersFiltro ['Douglas'] → sessão não conta; ['Jéssica'] com opts sem esse negócio e optsSessao com ele → sessão conta`
  - `safra: modes.funnelView 'cohort', cohortIds com 1 negócio da sessão de outubro → sessão conta`
  - `passagens: negócio LIVE com 2 eventos → 1 sessão; negócio individual com 2 eventos → 2 reuniões`
  - `porSdr: sessão com negócios de Sarah e Cassiana → porSdr Sarah 1, Cassiana 1; soma > total`
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/reunioesLive.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `resumirReunioes`** em `src/lib/reunioesLive.ts`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(vendas): contagem de reuniões com LIVE como uma sessão`

### Task 3: Hook e coluna por pessoa

**Files:**
- Create: `src/hooks/useReuniaoLive.ts`
- Modify: `src/lib/performanceRows.ts` (`SdrRow`, `CloserRow`, `buildSdrRows`, `buildCloserRows`)
- Test: `src/lib/performanceRows.test.ts`

**Interfaces:**
- Consumes: `ReuniaoLiveRow` (Task 2); `buscarTodasPaginas`, `carregarComCache`, `lerCache` (mesmo desenho de `useReunioesCloser`).
- Produces:
  - `useReuniaoLive(): { data: ReuniaoLiveRow[]; pronto: boolean; error: string | null }` — `pronto` = carregou ao menos uma vez sem erro. Chave de cache `'vw_reuniao_live'`, ordem `id_deal, ciclo`, revalida em 60 s.
  - `SdrRow.reunioes?: number` e `CloserRow.reunioes?: number`.
  - Último parâmetro opcional novo em `buildSdrRows(..., contagem?, reunioesPorPessoa?: Map<string, number>)` e `buildCloserRows(..., contagem?, reunioesPorPessoa?: Map<string, number>)`: soma no bucket de `linhaDe.chave(nome)` (Ex-integrantes / Sem responsável iguais às outras colunas); cria o bucket se a pessoa não tiver linha (Closer que só conduziu LIVE). Sem o parâmetro, `reunioes` fica `undefined` e nada muda.

- [ ] **Step 1: Testes em `performanceRows.test.ts`**
  - `buildCloserRows com reunioesPorPessoa cria linha da Jéssica mesmo sem negócio no nome dela (reunioes 1, rr 0)`
  - `buildSdrRows soma reuniões de inativo em Ex-integrantes`
  - `sem reunioesPorPessoa, reunioes é undefined (linhas idênticas às de antes)`
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o parâmetro nos dois builders e o hook. Hook só lê; sem teste próprio (mesmo padrão de `useReunioesCloser`), mas `pronto` é coberto pela regra de exibição da Task 4.
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/performanceRows.test.ts`.
- [ ] **Step 5: Commit** `feat(vendas): coluna de reuniões por pessoa e leitura de vw_reuniao_live`

### Task 4: Tela — linha, pop-up e colunas

**Files:**
- Create: `src/components/ui/ReunioesDrawer.tsx`, `src/components/ui/ReunioesLinha.tsx`
- Modify: `src/components/ui/TrapFunnel.tsx`, `src/pages/FunilVendas.tsx`, `src/pages/PerformanceVendas.tsx`

**Interfaces:**
- Consumes: `resumirReunioes`, `ResumoReunioes` (Task 2); `useReuniaoLive` (Task 3); `dealDrawerShared` (StatusBadge, cell, fmtData).
- Produces:
  - `ReunioesLinha({ resumo, pronto, onClick })` — botão "em N reuniões · M de LIVE"; devolve `null` se `!pronto || resumo.total === resumo.diagnosticos`. `onClick` com `stopPropagation` (o card da Performance também é clicável).
  - `ReunioesDrawer({ open, onClose, resumo, titulo, subtitulo })` — seções: LIVEs (data/hora, Closer, título com link `url`, convidados externos, Diagnósticos, % comparecimento = negócios ÷ convidados, etiqueta "estimada", expande para a lista de negócios com SDR, status, data do Diagnóstico, link do RD e `/linha-do-tempo/:id`); "Diagnósticos de LIVE de outro período" (quando houver); R1 individuais (uma linha por negócio).
  - `TrapFunnel` prop nova `rodapeEtapa?: Partial<Record<string, React.ReactNode>>` renderizada logo abaixo da barra da etapa (antes do "+N repetidos").

- [ ] **Step 1: Visão Macro** — em `FunilVendas.tsx`: `scopeSemCloser` (= `buildScopeFilter` sem `closers`), `rowsSemCloser`, `optsSessao = { cohortIds: safra, extra: noEscopoDoCiclo(rowsSemCloser) }`; `resumo = resumirReunioes({ eventos, rows: rowsSemCloser, lives, win, modes: viewModes, opts: { cohortIds: safra, extra: noEscopo }, optsSessao, closersFiltro: closers })` só em `modo === 'performance'`; passar `rodapeEtapa={{ 'Diagnóstico': <ReunioesLinha .../> }}`; drawer com `subtitle` igual aos outros.
- [ ] **Step 2: Performance** — mesmo cálculo com o `evOpts` existente; `rodape` nos dois `MetaRitmoCard` de Diagnóstico; `reunioesPorPessoa` = `resumo.porSdr` / `resumo.porCloser` nos `buildSdrRows`/`buildCloserRows` do período (não nos "Hoje"); coluna **REUNIÕES** depois do grupo DIAGNÓSTICO (SDR, +52px em `cols` e `minWidth`) e depois de DIAG (Closer), com total no rodapé da tabela; coluna só aparece quando a linha aparece (mesma condição).
- [ ] **Step 3: Build e testes** — `npm run build && npx vitest run` → sem erro.
- [ ] **Step 4: Commit** `feat(vendas): reuniões ao lado do Diagnóstico na Visão Macro e na Performance`

### Task 5: Verificação com dado real, documentação e entrega

**Files:**
- Modify: `CLAUDE.md` (seção 3: linha de `vw_reuniao_live`; seção 3 `tipo_r1`: corrigir a frase "outras marcas e meses anteriores = Individual" para dizer que vale o que está no RD; seção 5: os 4 arquivos novos; seção 9: entrada de 24/11/2026)

- [ ] **Step 1: Ver renderizado com dado real** numa rota de prévia sem login **só na cópia de build** (nunca no commit): Visão Macro e Performance em nov/26, Inbound, Eletrovias → linha "em ~49 reuniões · ~11 de LIVE", pop-up com as 8 LIVEs + estimadas; Inpot → linha some; "Tipo de R1 = Individual" → linha some; Closer = Douglas → LIVE da Jéssica fora. Diagnóstico e colunas existentes iguais aos de produção.
- [ ] **Step 2: CLAUDE.md** atualizado.
- [ ] **Step 3: PR** `gh pr create --base main`, CI verde (`gh api "repos/growth-wescale/Dashboard-We-Scale/actions/runs?head_sha=<sha>"`), `gh pr merge N --merge`, conferir que o `Deploy` rodou para o SHA do merge.
- [ ] **Step 4: Copiar** a entrada do histórico para o `CLAUDE.md` da pasta do OneDrive (o arquivo de lá tem mudanças locais de outras sessões; acrescentar só a entrada).
