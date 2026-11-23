# Bloqueio de Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lista de e-mails bloqueados por marca que impede a distribuição de criar negócio, com histórico completo e aba própria.

**Architecture:** Estado + log append-only no Supabase de Expansão; `distribuicao_processar` consulta `distribuicao_bloqueio_vigente` logo depois de achar a regra e grava o resultado `bloqueado`. Escrita só pela Edge Function `gravar-bloqueio-lead` (sessão do Marketing + `aba.bloqueio-leads`). Tela React lê views.

**Tech Stack:** Postgres (plpgsql), Supabase Edge Functions (Deno), React 19 + TS + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-bloqueio-de-leads-design.md`

## Global Constraints

- E-mail normalizado: `lower(btrim(email))`, regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` (igual no banco e na tela).
- Marca = `distribuicao_regra.marca`; rótulo na tela = `marca_rd` da regra vigente.
- Motivo obrigatório (≥ 3 caracteres) em bloqueio, alteração e desbloqueio.
- Log nunca é alterado nem apagado; estado nunca é apagado (desbloqueio = `marcas = '{}'`).
- Permissão: `aba.bloqueio-leads`, rota `/bloqueio-leads`, rótulo "Bloqueio de Leads", área Vendas.
- Resultado novo do registro: `bloqueado`, rótulo "Bloqueado".
- Nada de escrita em tabela real para testar: testes do banco em `pg_temp` com tabelas temporárias.

## Review Focus

- E-mail com maiúsculas/espaços no RD (`Fulano@Gmail.com `) tem que casar com o bloqueio → teste da RPC e de `distribuicao_bloqueio_vigente`.
- Marca do bloqueio ≠ marca da conversão (bloqueado só na Inpot, converte na Eletrovias) → segue o fluxo normal (teste no `distribuicao_processar` em pg_temp).
- Desbloquear e converter em < 10 min não pode cair como "Duplicado" → dedup ignora `bloqueado` (teste em pg_temp).
- Salvar sem mudança ou com marca inexistente → erro claro, nada gravado (teste da RPC).
- Corrida entre dois cliques salvando o mesmo e-mail → advisory lock por e-mail na RPC.

---

### Task 1: Banco

**Files:** Create `docs/sql/2026-11-23-bloqueio-de-leads.sql`

**Produces:** tabelas `distribuicao_bloqueio(email pk, marcas text[], motivo, criado_em, criado_por, atualizado_em, atualizado_por)`, `distribuicao_bloqueio_log(id, email, acao, marcas_antes, marcas_depois, motivo, autor, em)`; `distribuicao_bloqueio_salvar(p_email text, p_marcas text[], p_motivo text, p_autor text) returns jsonb {email, acao, marcas, log_id}`; `distribuicao_bloqueio_vigente(p_email text, p_marca text) returns jsonb {desde, por, motivo_registro} | null`; views `vw_distribuicao_bloqueios`, `vw_distribuicao_bloqueio_log`, `vw_distribuicao_lead_negocios`; CHECK de `distribuicao_atribuicao.resultado` com `bloqueado`; `distribuicao_processar` com a checagem e a dedup ignorando `bloqueado`.

- [ ] Testar em `pg_temp` (um único lote): bloqueio → alteração → desbloqueio → rebloqueio (ações e log certos), "nada mudou" e marca desconhecida dão erro, e-mail com maiúscula casa, `distribuicao_processar` copiado devolve `bloqueado` só na marca bloqueada.
- [ ] Aplicar a migration; conferir `pg_get_functiondef` com a checagem e checksum: nenhuma conversão nova falhando (`sync_execucao` job `distribuir_lead`).
- [ ] Commit.

### Task 2: Edge Function `gravar-bloqueio-lead`

**Files:** Create `supabase/functions/gravar-bloqueio-lead/index.ts`, `entrada.ts`, `entrada.test.ts`

**Interfaces:** POST `{ email: string, marcas: string[], motivo: string }`, Bearer do Marketing → `200 {ok, email, acao, marcas, log_id}` / `400 {error}` / `401` / `403`. `lerEntrada(body: unknown): { ok: true; email: string; marcas: string[]; motivo: string } | { ok: false; erro: string }`.

- [ ] Testes de `lerEntrada`: tipos errados, marcas não-array, campos ausentes.
- [ ] Implementar e publicar (`verify_jwt: false`); chamada sem token devolve 401.
- [ ] Commit.

### Task 3: Lógica pura da tela

**Files:** Create `src/lib/distribuicao/bloqueio.ts`, `bloqueio.test.ts`

**Produces:** tipos `BloqueioRow`, `BloqueioLogRow`, `NegocioLeadRow`, `AcaoBloqueio = 'bloqueio' | 'alteracao' | 'desbloqueio'`, `ItemLinhaLead`; `normalizarEmail(s)`, `emailValido(s)`, `acaoDaMudanca(antes, depois): AcaoBloqueio | null`, `diffMarcas(antes, depois): {adicionadas, removidas}`, `textoMarcas(marcas, todas, rotulo): string` ("Todas as marcas" / "Nenhuma"), `resumoLog(l, rotulo): string`, `filtrarBloqueios(rows, {busca, situacao: 'bloqueados'|'desbloqueados'|'todos'})`, `montarLinhaDoTempoLead(conversoes, negocios, log): ItemLinhaLead[]` (desc; conversão com `id_deal` absorve o negócio).

- [ ] Testes (TDD) para cada função, incluindo ordem da linha do tempo e conversão que absorve o negócio.
- [ ] Implementar; `npx vitest run src/lib/distribuicao` passa.
- [ ] Commit.

### Task 4: Tela, rota, menu, permissão e Distribuição

**Files:** Create `src/hooks/useBloqueios.ts`, `src/hooks/useHistoricoLead.ts`, `src/hooks/useGravarBloqueio.ts`, `src/pages/BloqueioLeads.tsx`, `src/components/bloqueio/EditorBloqueio.tsx`, `src/components/bloqueio/HistoricoLead.tsx`. Modify `src/lib/permissoes.ts` (+test), `src/App.tsx`, `src/components/AppLayout.tsx`, `src/lib/distribuicao/regras.ts`, `src/components/distribuicao/ui.ts`, `src/components/distribuicao/LogAtribuicoes.tsx`, `src/lib/distribuicao/regrasProcesso.ts` (+test).

- [ ] Teste: `permissaoDaRota('/bloqueio-leads') === 'aba.bloqueio-leads'`; passo "E-mail na lista de bloqueio" no processo.
- [ ] Implementar; `npm run build` + `npx vitest run` + oxlint limpos.
- [ ] Ver a tela renderizada com dado real (rota de prévia sem login só na cópia de build, nunca no commit).
- [ ] Commit.

### Task 5: Entrega

- [ ] Revisão independente do branch; corrigir o que for real.
- [ ] PR → CI → merge → conferir Deploy do SHA.
- [ ] CLAUDE.md: seção 3 (distribuição) + histórico; nota no vault quando disponível.
