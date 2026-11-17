# Resgate nos pop-ups de deal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** selo "Resgate", leadtime geral e leadtime pós-reativação nos pop-ups de deal de Vendas, e a Corrida dando os 2 pts de resgate pela mesma regra.

**Architecture:** a regra mora em `vw_funil_vendas` (`eh_resgate`, `data_perda_anterior`), chega ao navegador pela base ao vivo (`dash_colunas` + `COLUNAS_VENDAS`) e é lida por uma função só, `ehResgate`, usada pelos pop-ups e pela Corrida.

**Tech Stack:** Postgres (Supabase de Expansão), React 19 + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-resgate-nos-popups-design.md`

## Global Constraints

- Resgate = `ciclo > 1` e dia (America/Sao_Paulo) de `data_criacao_negociacao` > dia de `data_perdido` do ciclo anterior. Sem perda anterior ou sem início do ciclo → resgate.
- Coluna nova só no FIM da view; `dash_colunas` na mesma transação do `select dash_sincronizar(true)`.
- Fonte Macro "Resgate" de ciclo 1 não é resgate.
- Textos em pt-BR.

## Review Focus

- Reabertura no mesmo dia da perda (ciclo 2) → sem selo, sem leadtime pós-reativação, sem bônus na Corrida.
- Ciclo 2 com MQL novo no ciclo → leadtime geral mede desde `data_criacao_original`, não do MQL novo.
- Data de referência anterior à reativação (relógio torto) → "—", nunca negativo.
- Base guardada no navegador sem as colunas novas → falha alta já existente ("veio sem as colunas"); nada a fazer além de manter as listas iguais.
- Pop-up de Repetidos usa `g.row` (linha agrupada) → mesmo selo/colunas.

---

### Task 1: Banco — `eh_resgate` e `data_perda_anterior`

**Files:** Create `docs/sql/2026-11-17-resgate.sql`; Modify `docs/sql/2026-11-03-dashboard-vendas-tempo-real.sql` (lista `vendas` de `dash_colunas`).

- [ ] Backup em `_backup_viewdefs` (`vw_funil_vendas_pre_resgate_20261117`); `CREATE OR REPLACE VIEW` com `LEFT JOIN vw_deal_ciclo_enriquecido pa ON pa.id_lead = d.id_lead AND pa.ciclo = d.ciclo - 1` e, no fim, `pa.data_perdido AS data_perda_anterior` e `eh_resgate`.
- [ ] `dash_colunas('vendas')` com `'data_perda_anterior', 'eh_resgate'` no fim + `select dash_sincronizar(true)` na mesma transação.
- [ ] Conferir: md5 das colunas antigas igual antes/depois; `count(*) filter (where eh_resgate)` ≈ 106; nenhuma linha de ciclo 1 com `eh_resgate`.

### Task 2: Regra e leadtimes (`src/lib/resgate.ts`)

**Interfaces — Produces:**
- `ehResgate(row: { eh_resgate?: boolean | null }): boolean`
- `inicioLeadtimeGeral(row: Pick<FunnelRow,'ciclo'|'data_novo_mql'|'data_criacao_original'>): string | null` — ciclo 1: MQL ?? criação; ciclo > 1: criação original.
- `inicioPosReativacao(row): string | null` — `data_criacao_negociacao` se resgate, senão null.
- `diasParado(row): number | null` — `data_perda_anterior` → `data_criacao_negociacao`.
- `FunnelRow` ganha `eh_resgate?: boolean | null`, `data_perda_anterior?: string | null`; `COLUNAS_VENDAS` ganha as duas no fim.

- [ ] Testes `src/lib/resgate.test.ts`: ciclo 1 nunca é resgate; ciclo 2 com `eh_resgate:false` → sem pós-reativação; ciclo 2 com MQL novo → geral = criação original; dias parado = 8 para perda 12/09 e reativação 20/09.
- [ ] Implementar, rodar vitest (inclui `colecao.test.ts`, que compara as listas).

### Task 3: Pop-ups

**Files:** `dealDrawerShared.tsx` (`SeloResgate`, `CelulasLeadtimeResgate`), `StageDealsDrawer.tsx`, `SimpleDealsDrawer.tsx`, `PerdaDealsDrawer.tsx`, `RepeatedDealsDrawer.tsx`, `useStageDealsFilters.ts`.

- [ ] `SeloResgate({row})` ao lado do nome; `title` "Perdido em dd/mm/aaaa, reaberto em dd/mm/aaaa · N dias parado".
- [ ] Coluna "Leadtime" vira "Leadtime geral" (`inicioLeadtimeGeral` → ref do pop-up) + nova "Leadtime pós-reativação" (`inicioPosReativacao` → mesma ref). Em Aging/Atual, "Leadtime" (até hoje) segue a mesma troca.
- [ ] Filtro "Tipo" (Novo × Resgate) em `useStageDealsFilters` como os demais campos cruzados; teste no `useStageDealsFilters.test.ts`.
- [ ] Linha de total com as colunas novas em branco.

### Task 4: Corrida

**Files:** `corridaPerformance.ts`, `corridaDados.ts`, `useCorridaPerformance.ts`, `corridaExtrato.ts`, `ExtratoCorrida.tsx`, `PontosDoNegocio.tsx`, `CampanhaMetas.tsx` + testes.

- [ ] `NegocioDaUnidade.resgate?: boolean`; `EntradaLancamento.resgate: boolean`; `pesoDaUnidade(fonte, resgate: boolean)`; sai `ehRetomada`. `lancamento.retomada = resgate`.
- [ ] Hooks pedem `eh_resgate`; `RawRr`/`RawVenda` ganham o campo e passam `resgate: ehResgate(r)`.
- [ ] Testes que usavam `ciclo: 2` para retomada passam `resgate: true`; novo: `ciclo: 2, resgate: false` → peso pela fonte.
- [ ] Textos: "Negociação retomada (perdida e reaberta em outro dia)"; `PontosDoNegocio`: "ciclo N (resgate)" só se `eh_resgate`.

### Task 5: Verificação e entrega

- [ ] `npm run build` + `npx vitest run` + oxlint em cópia fora do OneDrive.
- [ ] Conferir 3 resgates reais na tela (rota de prévia sem login, fora do commit).
- [ ] PR → CI → merge → conferir Deploy; CLAUDE.md (seção 3/4 + histórico).
