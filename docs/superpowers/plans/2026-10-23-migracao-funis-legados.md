# Migração dos funis de marca para SDR/Closer — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mover todos os deals de Inpot, Lisô Laser, Get it, Rota's, Odonto Legacy e Oral Unic para os funis SDR/Closer no RD CRM, com histórico completo no banco e **zero mudança de número** no dashboard e nos relatórios.

**Architecture:** uma lista de ocultação por id de deal nas views e na RPC do relatório substitui a allowlist por nome; uma Edge Function (`migrar-funis`) faz `PUT` + `GET` por deal a partir de uma tabela-plano e registra a exclusão preventiva do evento lateral; a janela noturna roda com o disjuntor de webhooks desligado; checksum antes/depois com diff obrigatoriamente vazio.

**Tech Stack:** Supabase de Expansão (`cygxmduuwlwfbodfrlkr`: Postgres, Edge Functions Deno, `pg_net`, Vault), RD CRM API v1, dashboard React/TS (vitest, tsc -b), n8n (só configuração via banco).

**Spec:** `docs/superpowers/specs/2026-10-21-migracao-funis-legados-design.md` (v2 + revisão) e `docs/superpowers/specs/2026-10-21-migracao-funis-legados-sdr-closer-analise.md`.

## Global Constraints

- Nenhum número muda em Visão Macro, Performance, Análise de Perda, Campanha de Metas, MeetRox, Linha do Tempo, Visão Geral/S&OP/Acompanhamento Meta (Marketing) nem no Relatório Diário: diff do checksum = 0 linhas em cada onda.
- Nenhum lead recebe WhatsApp, tarefa ou troca de dono por causa da migração: `webhook_controle.habilitado = false` do primeiro ao último `PUT` de cada onda.
- Deal fechado continua fechado: `win`, `closed_at` e `data_venda` idênticos antes/depois (conferido por id).
- Cadência operacional do Legacy intocada: só `cadencia_etapas`/condições/`mover_no_disparo_*` da cadência 3 mudam de endereço, antes da onda 1 e depois das 19h.
- Fonte Macro só com evidência (tabela 6.1 do desenho); sem evidência = opção nova "Não identificado".
- Dono dos deals não muda. "SDR Responsável"/"Closer responsável" derivados do dono (decisão 6).
- Nunca copiar chaves/tokens para repositório, memória ou documento. Escrita no RD só pela Edge Function (token do Vault).
- Build e testes do dashboard fora do OneDrive (`~/ws-dashboard-build` ou worktree em `~/ws-dashboard-worktree-*`); `npm run build` (tsc -b) + `npx vitest run` + oxlint antes de abrir PR; merge manual, conferir o Deploy do SHA.
- Janelas: 20h–05h; sábado/domingo também servem (Limpeza e Reconciliação não rodam). Reconciliação 06h seg–sex não pode pegar a onda no meio.

## Review Focus

1. Deal do Legacy com `nome_etapa` "Documentação"/"Oportunidade" (nomes só do funil antigo) depois da migração: `resolveStage` continua traduzindo (Pré-Contrato/Oportunidade COF) e o Atual não perde o deal — teste em Task 1.
2. Evento lateral que escapa da exclusão preventiva (relógio do RD vs `start_date` ±2 s): a conferência pós-onda conta `mudanca_etapa` com `data_evento` na janela para os ids do plano e exige 0 — Task 6.
3. `PUT` que o RD aceita (200) mas não aplica (etapa igual à anterior): `GET` de confirmação compara `deal_stage.id` com o destino — Task 3.
4. Lista de ocultação com id de deal que hoje está visível (ciclo antigo de deal que já migrou pro SDR): a carga é por `deal_snapshot.id_funil` nos 5 funis, e o checksum com a lista carregada tem que dar 0 — Task 2.
5. Deal "Teste" no plano (nome com "test", marca Teste): fica fora do dashboard por construção, mas entra no plano e conta no RD; o plano exclui `marca = 'Teste'` e nome `~* test` — Task 2.

---

### Task 1: Dashboard — regra do Legacy com data de corte, Comitê, "Não identificado"

**Files:**
- Modify: `src/lib/metrics.ts` (`idsEtapaObrigatoria`, `etapaPermitida`, `eventsInStage`, `currentStage`, `ETAPAS_AUSENTES_POR_MARCA`)
- Modify: `src/lib/corridaPerformance.ts` (`FONTES_UM_PONTO`)
- Test: `src/lib/metrics.test.ts`, `src/lib/corridaPerformance.test.ts`

**Interfaces:**
- Produces: `export const CORTE_ODONTO_LEGACY = '2026-10-24'` (dia da onda 1, Brasília) em `metrics.ts`; `etapaPermitida(stage, idEtapa, marca, dia?: string | null)`: para Odonto Legacy, `dia < CORTE` → só `ETAPA_SQL_ODONTO_LEGACY`; `dia >= CORTE` ou `dia` ausente (modo Atual) → `[ETAPA_SQL_ODONTO_LEGACY, ETAPA_SQL_CLOSER, ETAPA_SQL_SCALE_PARTNER]`.

- [ ] **Step 1: testes que falham** em `metrics.test.ts`: (a) evento Legacy na etapa do Closer com `dia = '2026-10-10'` não conta; (b) mesmo evento com `dia = '2026-10-24'` conta; (c) evento Legacy na etapa Legacy com `dia = '2026-10-24'` conta; (d) `currentStage` de deal Legacy com `id_etapa_atual = ETAPA_SQL_CLOSER` resolve "Reunião Agendada SQL"; (e) `etapasDaMarca(STAGE_ORDER, ['Odonto Scale'])` inclui "Comitê". Em `corridaPerformance.test.ts`: `pesoFonte('Não identificado') === 1`.
- [ ] **Step 2:** `npx vitest run src/lib/metrics.test.ts src/lib/corridaPerformance.test.ts` → FAIL nos novos.
- [ ] **Step 3:** implementar: `idsEtapaObrigatoria(stage, marca, dia?)`; `eventsInStage` passa `e.dia`; `currentStage` passa `undefined`; remover `'Comitê'` de `ETAPAS_AUSENTES_POR_MARCA['Odonto Scale']` (mapa fica vazio para a marca; manter a constante); `FONTES_UM_PONTO` ganha `'nao identificado'` (normalizado). Atualizar o comentário da regra.
- [ ] **Step 4:** `npm run build && npx vitest run` → PASS (contagem de testes anterior + 6).
- [ ] **Step 5:** branch `feat/migracao-funis-legados` a partir de `origin/main`, commit `feat(vendas): SQL do Odonto Legacy conta no Closer a partir de 24/10; Comitê visível; fonte "Não identificado" vale 1 pt`, `gh pr create --base main`, CI verde, merge manual, conferir `Deploy` do SHA.

### Task 2: Banco — ocultação, checksum, backup, plano

**Files:** `docs/sql/2026-10-23-migracao-funis-legados.sql` (tudo aplicado, em blocos numerados)

**Interfaces:**
- Produces: `public.dashboard_deal_oculto(id_deal text pk, lote text, funil_origem text, motivo text, ocultado_em timestamptz default now(), liberado_em timestamptz)`; `public.migracao_funis_checksum(p_rotulo text) returns int` (grava linhas em `_migracao_funis_checksum(rotulo, bateria, chave, valor numeric)`); `public.migracao_funis_diff(p_a text, p_b text) returns table(bateria, chave, valor_a, valor_b)`; `public._migracao_funis_plano(id serial, id_deal text unique, onda text, funil_origem text, id_etapa_origem text, status_origem text, id_etapa_destino text, campos jsonb, closed_at_antes timestamptz, aplicado_em timestamptz, http int, resultado text, exclusao_em timestamptz, historico_novo jsonb)`; `public._migracao_funis_backup_20261023` (cópia de `deal_snapshot` dos 2.805 ids) e `_migracao_funis_backup_eventos_20261023` (`deal_eventos` dos mesmos ids).

- [ ] **Step 1:** `migracao_funis_checksum('antes_tabela')` cria as baterias: `vw_funil_vendas` (linhas, ciclos atuais, ganhos, receita, perdidos, em andamento, por marca); `vw_funil_etapas_v2` passagens e únicos (deal+ciclo+mês) por `mes × etapa_canonica × marca_deal × origem_comercial` desde 2025-09; Atual (deals vivos por `etapa_funil` resolvida × marca); `relatorio_expansao_metricas` ontem e MTD (jsonb inteiro hasheado + totais); `vw_closer_reunioes` por mês; `vw_marketing_funil` com `funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale')`: linhas, MQL/mês/marca, ganhos/receita por mês. Rodar e guardar.
- [ ] **Step 2:** criar `dashboard_deal_oculto` (RLS ligado, sem policy; grants só ao owner). `CREATE OR REPLACE` via `EXECUTE replace(pg_get_viewdef(...))` acrescentando `AND NOT EXISTS (SELECT 1 FROM dashboard_deal_oculto o WHERE o.id_deal = <coluna> AND o.liberado_em IS NULL)` em: `vw_funil_vendas` (`d.id_lead`), `vw_funil_etapas_v2` (`v.id_deal`), `vw_deal_eventos_marca_resolvida` (`e.id_deal`), `vw_marketing_funil` (`d.id_lead`); e na RPC `relatorio_expansao_metricas` o CTE `deals_teste` passa a unir `SELECT id_deal FROM dashboard_deal_oculto WHERE liberado_em IS NULL`. Backup das definições anteriores em `_backup_viewdefs` (`*_pre_oculto_20261023`).
- [ ] **Step 3:** `migracao_funis_checksum('depois_views')`; `migracao_funis_diff('antes_tabela','depois_views')` → 0 linhas.
- [ ] **Step 4:** carregar a lista: `INSERT ... SELECT id_deal, nome_funil, nome_funil, 'migração 10/2026' FROM deal_snapshot WHERE deleted_at IS NULL AND id_funil IN (5 funis)` → 1.838. `migracao_funis_checksum('depois_lista')` → diff 0.
- [ ] **Step 5:** backups (2 tabelas, RLS ligado) e tabela-plano com os 2.805 (967 Legacy = onda 1; 1.838 = onda 2). `id_etapa_destino` pela tabela de mapeamento da seção 4 do desenho (função `migracao_funis_etapa_destino(id_etapa_origem text) returns text`, com `rd_funis_etapas`); `campos` = jsonb `{custom_field_id: valor}` só do que falta (Marca pelo funil; Fonte Macro pela tabela 6.1 ou "Não identificado"; Cidade/Estado "Não identificado"; Canal de Conexão "WhatsApp"; Motivo no-show "Não compareceu"; Temperatura "Padrão"; Data COF/Previsão = `_closed_at`; Closer responsável = dono quando cargo Closer e opção existe, "Aurélio" → "Aurélio Briano"; SDR Responsável = Xayane→"Xay"/Thiago/Sarah Padilha). Conferir: `select onda, count(*), count(*) filter (where campos ? '<id Fonte Macro>') from _migracao_funis_plano group by 1`.

### Task 3: Edge Function `migrar-funis` + preparação no RD

**Files:**
- Create: `supabase/functions/migrar-funis/index.ts`
- Modify: `docs/sql/2026-10-23-migracao-funis-legados.sql` (bloco `invocar_migrar_funis`)

**Interfaces:**
- Produces: `POST /functions/v1/migrar-funis?acao=preparar|perder|mover|teste&onda=<onda>&max=<n>` (Bearer service_role; `verify_jwt` true). `preparar`: `POST /deal_lost_reasons {name:'Funil descontinuado'}` se não existir (devolve id), `PUT /custom_fields/69e242a4cf6bc60013948e4e {custom_field:{opts: atuais + Vanessa Daniel, Aurélio Briano, Giullia, Rômulo, Raissa}}`, `PUT /custom_fields/6a8c4f1b06873300248bbff5 {opts: atuais + 'Não identificado'}`; grava os ids em `espelho_rd_config` (`migracao_motivo_perda_id`). `perder`: para linhas da onda com `status_origem='open'` e `perdido_em is null`: `PUT /deals/:id {deal:{win:false, deal_lost_reason_id}}` + `GET` (closed_at preenchido) → `perdido_em`. `mover`: `PUT /deals/:id {deal_stage_id, deal:{deal_custom_fields:[...campos]}}` → `GET` → confirma `deal_stage.id = destino`, `win`/`closed_at` iguais a `closed_at_antes` → pega a última entrada de `deal_stage_histories` com `deal_stage_id = destino` → `INSERT deal_eventos_excluidos_manualmente(id_deal, id_etapa, data_evento_aproximada = start_date, motivo, evento_original)` → `aplicado_em`, `historico_novo`. Lotes ≤ 55 (`max`), 400 ms entre deals, 429 com `Retry-After`. `public.invocar_migrar_funis(p_acao text, p_onda text, p_max int) returns bigint` (security definer, `net.http_post` com Bearer do Vault, como `invocar_marca_put`).
- [ ] **Step 1:** escrever a função (Deno, `jsr:@supabase/supabase-js@2`, mesmo esqueleto da `transferir-responsavel`); `deno check`.
- [ ] **Step 2:** publicar (`supabase functions deploy migrar-funis --project-ref cygxmduuwlwfbodfrlkr` ou MCP `deploy_edge_function`), criar `invocar_migrar_funis`.
- [ ] **Step 3:** `select invocar_migrar_funis('preparar', null, 0)`; conferir no RD (`GET /deal_lost_reasons`, `GET /custom_fields`) que o motivo existe e as opções entraram sem perder `required_rules`.

### Task 4: Teste no Funil de teste

- [ ] **Step 1:** criar 3 deals no Funil de teste (`6abf2318dca0200020ff065d`, etapa Novo MQL) via `POST /deals` pela função (`acao=teste&fase=criar`): nome "TESTE migração funil (apagar) A/B/C", Marca "Teste", Cidade/Estado "Teste", Fonte Macro "Inbound"; B vira perdido (`win:false`, motivo "Funil descontinuado"), C vira ganho (`win:true`).
- [ ] **Step 2:** linhas de plano `onda='teste'` com destino SDR / Tentando Contato (`69380917e00ed10014daaa65`); `invocar_migrar_funis('mover','teste',10)`.
- [ ] **Step 3:** conferir: os 3 em `deal_pipeline` SDR; B segue `win=false`, C `win=true`, `closed_at` iguais; `deal_eventos_excluidos_manualmente` com 3 linhas; depois de 2 ciclos do espelho: `deal_eventos` dos 3 tem `mudanca_funil` e **nenhum** `mudanca_etapa` com `id_etapa` = destino; `rd_escrita_propria` sem linha nova; `cadencia_execucoes` sem linha nova.
- [ ] **Step 4:** `acao=teste&fase=obrigatorios`: mover A para SDR / Conexão **sem** "Canal de Conexão" → anotar se o RD devolve 422 (então o `mover` da onda precisa dos campos no mesmo `PUT`, já previsto) ou 200.
- [ ] **Step 5:** devolver os 3 ao Funil de teste e marcar com nome "(apagar)"; registrar resultado no plano.

### Task 5: Cadência 3 e regra de distribuição (início da janela, depois das 19h)

- [ ] **Step 1:** `UPDATE cadencia_etapas SET pipeline_id='69380917e00ed10014daaa62', stage_id = CASE id WHEN 7 THEN '69380917e00ed10014daaa64' WHEN 8 THEN '69380917e00ed10014daaa65' WHEN 27 THEN '69380917e00ed10014daaa66' END, rotulo = 'SDR / ...' WHERE cadencia_id=3`; `UPDATE cadencia_condicoes SET valor='69380917e00ed10014daaa62', campo='Funil SDR' WHERE id=14`; `UPDATE cadencia_condicoes SET valor='69380917e00ed10014daaa64,69380917e00ed10014daaa65,69380917e00ed10014daaa66', campo='Etapa Novo MQL, Tentando Contato ou Contato Efetivo' WHERE id=15`; `INSERT cadencia_condicoes(cadencia_id, campo, origem_campo, operador, valor, grupo) VALUES (3,'Marca','custom_field_label','equals','Odonto Legacy',1)`; `UPDATE cadencias SET mover_no_disparo_de='69380917e00ed10014daaa64', mover_no_disparo_para='69380917e00ed10014daaa65' WHERE id=3`. Backup das linhas antes em `_migracao_funis_backup_cadencia_20261023`.
- [ ] **Step 2:** `select * from cadencia.v_execucoes_a_encerrar where cadencia_id=3` → vai listar as 70 (deal ainda no funil antigo): esperado **só** até o move; nunca rodar Limpeza nesse intervalo (janela > 19h).
- [ ] **Step 3:** `distribuicao_publicar_regra` com a regra 58 copiada, `id_funil='69380917e00ed10014daaa62'`, `id_etapa='69380917e00ed10014daaa64'`, `modo='ativo'`, `motivo='Migração dos funis de marca (23/10): Legacy passa a nascer no SDR'`, autor `claude@sessao-23-10`. Conferir `vw_distribuicao_regras`.

### Task 6: Onda 1 — Odonto Legacy (967)

- [ ] **Step 1:** `UPDATE webhook_controle SET habilitado=false WHERE id=1`; pausar o refresh da matview (`cron.unschedule` do job de `REFRESH mv_deal_ciclo_enriquecido`; anotar o jobid/schedule). `migracao_funis_checksum('onda1_antes')`.
- [ ] **Step 2:** `invocar_migrar_funis('mover','onda1',55)` em laço até `select count(*) from _migracao_funis_plano where onda='onda1' and aplicado_em is null` = 0 (18 chamadas; esperar cada uma terminar: a linha muda de `http`). Falhas (`http` ≠ 2xx) ficam para revisão; não repetir 422 automaticamente.
- [ ] **Step 3:** esperar `wf_5` + espelho: `select count(*) from _migracao_funis_plano p join deal_snapshot s using (id_deal) where onda='onda1' and s.id_funil not in ('69380917e00ed10014daaa62','69380937219fc3001702b9b5')` = 0 e `select count(*) from _migracao_funis_plano p where onda='onda1' and not exists (select 1 from deal_eventos e where e.id_deal=p.id_deal and e.tipo_evento='mudanca_funil' and e.data_evento >= '<início>')` = 0.
- [ ] **Step 4:** conferências: 0 `mudanca_etapa` dos ids da onda com `data_evento >= <início>`; `closed_at`/`status` iguais ao backup; `cadencia_execucoes` da cadência 3 ainda 70 ativas; `v_execucoes_a_encerrar` vazia para a 3; `rd_escrita_propria`/`automacao_rate_guard` sem linha desde `<início>`.
- [ ] **Step 5:** religar o refresh da matview, rodar `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_deal_ciclo_enriquecido`, `migracao_funis_checksum('onda1_depois')`, `migracao_funis_diff('onda1_antes','onda1_depois')` → **0 linhas**. Se > 0: não religar o disjuntor antes de entender; reverter é mover de volta pelo plano (`id_etapa_origem`).
- [ ] **Step 6:** `select webhook_religar(); UPDATE webhook_controle SET habilitado=true WHERE id=1`.

### Task 7: Onda 2 — perdas em massa e os 5 funis (1.838)

- [ ] **Step 1:** mesma abertura da onda 1 (disjuntor off, matview pausada, `checksum('onda2_antes')`).
- [ ] **Step 2:** `invocar_migrar_funis('perder','onda2',55)` até zerar os 667 abertos; conferir `closed_at` preenchido e motivo "Funil descontinuado".
- [ ] **Step 3:** `invocar_migrar_funis('mover','onda2',55)` até zerar (34 chamadas); esperar o espelho (até 3 ciclos).
- [ ] **Step 4:** conferências da Task 6 Step 3–4 para `onda2`; `select count(*) from deal_snapshot where deleted_at is null and id_funil in (5 funis)` = 0.
- [ ] **Step 5:** `checksum('onda2_depois')` → diff 0 contra `onda2_antes` (tudo oculto); religar matview e disjuntor.

### Task 8: Fechamento

- [ ] **Step 1:** super relatório em `docs/superpowers/specs/2026-10-23-migracao-funis-relatorio-lotes.md`: por lote (funil de origem) e marca, o que cada liberação traria por mês × etapa (passagens e únicos, lendo as tabelas cruas sem a ocultação), vendas/receita, perdas por motivo, SDR/Closer, qualidade da Fonte (regra aplicada por deal). Comando de liberação por lote (`UPDATE dashboard_deal_oculto SET liberado_em=now() WHERE lote='Inpot'`).
- [ ] **Step 2:** instruções manuais para o Junior: apagar os 5 funis vazios no RD (tela); editar a automação "OdontoScale > CRM (Limpo)" no RD Marketing para criar no SDR / Novo MQL com a Sarah (ou desativar) e só então apagar o funil Legacy; retirar os Closers antigos das opções do campo; conferir Configurações → Automações do RD CRM; avisar o TI.
- [ ] **Step 3:** CLAUDE.md (seções 3, 4, 5, 8, histórico), memória, `rd_funis_etapas.ativo=false` nos 6 funis, apagar o workflow vazio `sync_Supabase_funil_Odonto_Scale` (Junior).
