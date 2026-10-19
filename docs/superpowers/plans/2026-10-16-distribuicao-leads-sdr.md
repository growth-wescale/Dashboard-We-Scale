# Distribuição de leads por SDR com peso da meta — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o "Criar Negociação no CRM" das automações do RD Marketing por um fluxo nosso que recebe a conversão por webhook, aplica a barreira de MQL versionada, escolhe o SDR pelo peso da versão ativa das metas, cria o deal no RD CRM e registra tudo, com uma aba de configuração e auditoria no dashboard.

**Architecture:** Webhook do RD Marketing → Edge Function `distribuir-lead` (Supabase de Expansão), que é fina: autentica, chama **uma** RPC transacional (`distribuicao_processar`) que roteia, deduplica, avalia a barreira, escolhe o SDR com advisory lock e grava o registro; depois faz o POST no RD CRM e fecha o registro. Toda a regra de negócio fica em SQL (testável com rollback). O dashboard lê views e escreve só por `gravar-distribuicao`, que valida a permissão no Marketing como `gravar-meta`.

**Tech Stack:** Postgres (Supabase de Expansão `cygxmduuwlwfbodfrlkr`) com RPCs plpgsql e advisory locks; Edge Functions Deno/TS; React 19 + TS + vitest no dashboard; API RD CRM v1 (`?token=`); webhooks do RD Marketing.

**Spec:** `docs/superpowers/specs/2026-10-16-distribuicao-leads-sdr-design.md`

## Global Constraints

- Nenhuma tabela, view ou função existente é alterada. `meta_versao`, `meta_marca`, `meta_pessoa`, `nome_cargo_foto`, `deal_snapshot` são só lidas.
- Nada de segredo em arquivo ou commit: `rd_token`, `teams_alertas_url`, `distribuicao_webhook_chave` vivem no Vault e saem só por `get_secret`.
- Migrations aplicadas por `mcp__supabase__apply_migration` (nome em snake_case) **e** salvas em `docs/sql/2026-10-16-distribuicao-leads.sql` (apêndice por tarefa), como o projeto faz desde setembro.
- Build e teste fora do OneDrive: `rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/ && cd ~/ws-dashboard-build && npm run build && npx vitest run` (CLAUDE.md §7). `tsc -b` do build é a validação, não `tsc --noEmit`.
- Commits em pt-BR, Conventional Commits, branch `feat/distribuicao-leads`, PR para `main`, merge manual pelo Junior (memória `implementar-e-deployar-direto`).
- Nomes de marca: `distribuicao_regra.marca` usa o nome das metas (`meta_marca.marca`, ex. `Odonto Scale`); `marca_rd` é o valor gravado no campo "Marca" do CRM (ex. `Odonto Legacy`). As duas iguais para as outras marcas.
- Janela de dedup 10 min, 3 tentativas no RD, alerta de silêncio 6 h: valores iniciais de `distribuicao_config`.
- Front: layout com classes `rs-*` (CLAUDE.md §7), `supabaseVendas` lê só views, nunca tabela.

## Review Focus

1. **Reenvio do RD Marketing.** O RD reenvia o webhook quando não recebe 2xx; o mesmo payload duas vezes em minutos tem que virar 1 `atribuido` + 1 `duplicado`, nunca 2 deals. Teste na Tarefa 3.
2. **Campo personalizado em lista.** Campos `multiple_choice` chegam como array (`"cf_x": ["A","B"]`); a barreira tem que barrar se **qualquer** elemento estiver na lista. Teste na Tarefa 3.
3. **Nome da pessoa divergente entre metas e cadastro.** `meta_pessoa.nome` = "Thiago" e `nome_cargo_foto.nome` = "Thiago"; mas se alguém cadastrar "Thiago Cotliarenco Gomes" numa das duas, o SDR some do rodízio em silêncio. Elegível exige o join exato; SDR com peso e sem `user_id` aparece como `inelegiveis` no retorno e no painel. Teste na Tarefa 2.
4. **Erro 4xx do RD não é para repetir.** 422 por campo obrigatório ou 404 de etapa tem que virar `erro` na primeira tentativa, com o corpo da resposta, e alerta; só 429/5xx/timeout repetem. Teste na Tarefa 5.
5. **Virada de mês sem versão nova.** Dia 1 às 00:05 sem versão de novembro ativa: usa a última versão ativa de outubro (item 2 da cadeia), com `reinicio_em` = 00:00 do dia 1 (T é o mais recente entre ativação, virada do mês e disponibilidade). Teste na Tarefa 2.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `docs/sql/2026-10-16-distribuicao-leads.sql` | Todo o SQL aplicado, na ordem, com os blocos de teste (`DO $$ … RAISE EXCEPTION`) rolados em transação |
| `supabase/functions/distribuir-lead/index.ts` | Receber webhook / reprocessar: auth, parse, RPC, POST no RD, fechar, alerta, log |
| `supabase/functions/distribuir-lead/rd.ts` | `criarDealNoRd()` com retry/429 e o mapeamento payload → campos do CRM |
| `supabase/functions/gravar-distribuicao/index.ts` | Escrita autenticada: publicar regra, alterar disponibilidade, reprocessar |
| `src/lib/permissoes.ts` | 2 chaves novas no catálogo |
| `src/lib/distribuicao/regras.ts` (+ `.test.ts`) | Puro: texto da barreira, diff entre versões, desvio por SDR, rótulo da fonte do time |
| `src/hooks/useDistribuicao.ts` | Lê `vw_distribuicao_painel`, `vw_distribuicao_atribuicoes`, `vw_distribuicao_disponibilidade`, `vw_distribuicao_regras` |
| `src/hooks/useGravarDistribuicao.ts` | Chama `gravar-distribuicao` com a sessão do Marketing (molde de `useSalvarMeta`) |
| `src/pages/DistribuicaoLeads.tsx` | Página: painel por marca, log, disponibilidade, saúde |
| `src/components/distribuicao/{CardMarca,EditorRegra,LogAtribuicoes,PainelDisponibilidade}.tsx` | Blocos da página |
| `src/App.tsx`, `src/components/AppLayout.tsx` | Rota `/distribuicao-leads` e item do submenu Vendas |
| `CLAUDE.md` | Seções 3, 5, 8 e histórico |

IDs do RD usados pelas regras (levantados em 16/10/2026):

| Marca (metas) | marca_rd | evento | id_funil / id_etapa destino | campaign_id |
|---|---|---|---|---|
| Eletrovias | Eletrovias | `eletrovias_multistep` | `69380917e00ed10014daaa62` / `69380917e00ed10014daaa64` | `69e0e12b7fe67b000120920d` |
| Inpot | Inpot | `inpot_multistep` (confirmar na captura) | idem SDR / Novo MQL | `69c7525ffb146d0001d4168e` |
| Lisô Laser | Lisô Laser | `lisolaser_multistep` (confirmar) | idem | `69c6e2ac2b676f0001d1e746` |
| B2Case | B2Case | `b2case_multistep` (confirmar) | idem | `69c6fef14838de0001381f0f` |
| Viva | Viva | `viva_multistep` (confirmar) | idem | `69c58b6d396823000101e826` |
| Oral Unic | Oral Unic | `oralunic_multistep` (confirmar) | idem | `69c876287f81280001106a2a` |
| Instituto do Autismo | Instituto do Autismo | `IDA_multistep` (confirmar) | idem | `6a8f8896d619e9000168bfa2` |
| Odonto Scale | Odonto Legacy | `odontolegacy_multistep` | `68b84341646c55001ed64e4f` / `68b84341646c55001ed64e51` | `6aaae6662240570001f15c03` |
| We Scale | Scale Partner | `partner_multistep` | `6a99b60d62f84e00234789da` / `6a99b60d62f84e00234789dc` | `6aa37e0d0de2d9000191898f` |
| Beauty Connection | Beauty Connection | `beautyconnection_multistep` | `6ab14ed684645500206bee2e` / `6ab14ed684645500206bee30` | `6aad821938e43a0001ca761f` |
| Teste (só para a Tarefa 5) | Teste | `distribuicao_teste` | `6abf2318dca0200020ff065d` / 1ª etapa "Novo MQL" (ler em `/deal_pipelines`) | — |

Campos personalizados do deal (CRM): Marca `69600aafd006b100155e4066` · Fonte Macro `6a8c4f1b06873300248bbff5` · SDR Responsável `69b15d318868b20016a8ee40` · Cidade `699f1fb06dd7650019c8a725` · Estado `699f1fbcea4328001396ecba` · Capital Disponível `699f2143a0f592001365ce42` · Sub-Fonte `6a5a37694db19c002e602fb4` · utm_source `691b38dca83bd300133d2337` · utm_medium `691b38e90402180013d39e51` · utm_campaign `691b390066b68c0016ea0877` · utm_term `691b390891e1f0001577ddfd` · utm_content `691b391254af6f00182abd23` · Motivo Franquia `699f369f439d5d00136cd82e` · Tempo Abertura `699f374fdd9cf5001edbbf13`.

---

### Task 1: Tabelas, triggers e views

**Files:**
- Create: `docs/sql/2026-10-16-distribuicao-leads.sql` (bloco 1)
- Migration: `distribuicao_leads_tabelas`

**Interfaces:**
- Produces: tabelas `distribuicao_regra`, `distribuicao_atribuicao`, `distribuicao_disponibilidade`, `distribuicao_config`; views `vw_distribuicao_regras`, `vw_distribuicao_atribuicoes`, `vw_distribuicao_disponibilidade` (security invoker desligado = rodam como dono, padrão das outras `vw_*` lidas pela anon).

- [ ] **Step 1: Escrever o DDL** com as colunas da spec §7.1–7.3 mais:
  - `distribuicao_regra`: `marca_rd text not null`, `time_proprio jsonb null`, índice único parcial `(marca) where vigente_ate is null`, `unique (marca, versao)`, check `modo in ('desligado','sombra','ativo')`.
  - `distribuicao_atribuicao`: check de `resultado in ('atribuido','barrado','duplicado','simulado','fallback','erro')`, coluna `fonte_time text` (`versao_ativa`|`versao_anterior`|`time_proprio`|`nenhum`), `inelegiveis jsonb`, índices da spec.
  - `distribuicao_disponibilidade`: check `tipo in ('fora_agora','ausencia')`, check `fim is null or fim > inicio`.
  - `distribuicao_config(chave text pk, valor text, descricao text)` com as 3 linhas iniciais (`janela_dedup_min`=10, `retries_rd`=3, `alerta_silencio_horas`=6).
  - Trigger `distribuicao_regra_imutavel`: bloqueia DELETE e UPDATE de qualquer coluna exceto `vigente_ate` (de null para não-null). Trigger `distribuicao_disponibilidade_imutavel`: só `encerrado_em` e `fim` mudam.
  - RLS ligado nas 4 tabelas, sem policy. Grants: `select` para `service_role`; views com `grant select to anon, authenticated`.
  - `vw_distribuicao_atribuicoes` = todas as colunas **menos** `payload`; `vw_distribuicao_regras` = tudo; `vw_distribuicao_disponibilidade` = tudo + coluna `disponivel_agora boolean`.
- [ ] **Step 2: Aplicar** `mcp__supabase__apply_migration` com nome `distribuicao_leads_tabelas`.
- [ ] **Step 3: Testar as travas** com `execute_sql` numa transação rolada:
  ```sql
  begin;
  insert into distribuicao_regra (marca, marca_rd, versao, vigente_de, modo, evento_identificador, id_funil, id_etapa, responsavel_padrao_user_id, criado_por) values ('X','X',1,now(),'sombra','x_multistep','f','e','u','teste');
  -- 2ª vigente da mesma marca deve falhar
  do $$ begin
    begin insert into distribuicao_regra (marca, marca_rd, versao, vigente_de, modo, evento_identificador, id_funil, id_etapa, responsavel_padrao_user_id, criado_por) values ('X','X',2,now(),'sombra','x','f','e','u','t'); raise exception 'esperava unique_violation';
    exception when unique_violation then null; end;
    begin update distribuicao_regra set modo='ativo' where marca='X'; raise exception 'esperava bloqueio do trigger';
    exception when others then if sqlerrm like '%esperava%' then raise; end if; end;
  end $$;
  rollback;
  ```
  Esperado: sem erro (os dois `RAISE 'esperava…'` nunca disparam).
- [ ] **Step 4: Salvar o SQL** aplicado no arquivo de docs e commitar: `git commit -m "feat(distribuicao): tabelas, triggers e views da distribuição de leads"`.

### Task 2: RPC `distribuicao_time_da_marca`

**Files:**
- Modify: `docs/sql/2026-10-16-distribuicao-leads.sql` (bloco 2)
- Migration: `distribuicao_time_da_marca`

**Interfaces:**
- Consumes: tabelas da Tarefa 1; `meta_versao(id, mes_referencia, ativa, ativada_em)`, `meta_marca(id, meta_versao_id, marca)`, `meta_pessoa(meta_marca_id, nome, funcao, peso)`, `nome_cargo_foto(nome, cargo, user_id, ativo)`.
- Produces: `distribuicao_time_da_marca(p_marca text, p_em timestamptz default now()) returns jsonb`:
  `{"fonte": "versao_ativa"|"versao_anterior"|"time_proprio"|"nenhum", "meta_versao_id": int|null, "reinicio_em": timestamptz, "sdrs": [{"nome","user_id","peso"}], "inelegiveis": [{"nome","motivo"}]}` — `peso` já renormalizado para somar 100 entre os elegíveis; `reinicio_em` = maior entre `ativada_em` da versão usada, `date_trunc('month', p_em)` e a última mudança de disponibilidade (`criado_em`/`encerrado_em`/`fim`) de alguém do time dessa marca; `security definer`, `revoke execute from public, anon; grant to service_role`.

- [ ] **Step 1: Escrever o teste em SQL** (rollback) com fixture mínima: versão ativa de `2026-10-01` para marca `T1` com `A` 50 / `B` 20 / `C` 30 (SDR) e `nome_cargo_foto` com `user_id` para A e B, **sem** para C; `C` também com `distribuicao_disponibilidade` aberta. Asserts:
  - `fonte = 'versao_ativa'`, `sdrs` = A 71.43, B 28.57 (renormalizado), `inelegiveis` contém C com motivo `sem user_id`.
  - `p_em = '2026-11-01 00:05'` sem versão de novembro → `fonte = 'versao_anterior'`, `reinicio_em = '2026-11-01 00:00'`.
  - marca sem nenhuma versão e com `time_proprio` na regra vigente → `fonte = 'time_proprio'`; sem nada → `fonte = 'nenhum'`, `sdrs = []`.
- [ ] **Step 2: Rodar** e confirmar que falha com "function does not exist".
- [ ] **Step 3: Implementar a função** (plpgsql). Ordem da cadeia: (1) `meta_versao` ativa com `mes_referencia = date_trunc('month', p_em)` que tenha `meta_marca.marca = p_marca`; (2) senão a versão com `ativada_em` mais recente, qualquer mês, que tenha a marca; (3) senão `time_proprio` da regra vigente. Elegível = `funcao = 'SDR'` e `peso > 0` e `nome_cargo_foto.user_id is not null` e `ativo` e sem linha de disponibilidade cobrindo `p_em` (`inicio <= p_em and (fim is null or fim > p_em) and encerrado_em is null`).
- [ ] **Step 4: Rodar o teste** → passa. Aplicar a migration, salvar no arquivo de docs, commit `feat(distribuicao): time da marca pela cadeia versão ativa → anterior → time próprio`.

### Task 3: RPC `distribuicao_processar` (roteia, dedup, barreira, escolhe, registra)

**Files:**
- Modify: `docs/sql/2026-10-16-distribuicao-leads.sql` (bloco 3)
- Migration: `distribuicao_processar`

**Interfaces:**
- Consumes: Tarefa 2; `distribuicao_config`.
- Produces:
  - `distribuicao_escolher(p_sdrs jsonb, p_contadores jsonb) returns text` — puro: `p_sdrs` como no retorno da Tarefa 2, `p_contadores` `{"nome": n}`; devolve o nome que minimiza `n_i − p_i × (N+1)/100`, empate por maior peso e depois nome.
  - `distribuicao_processar(p_payload jsonb, p_recebido_em timestamptz default now()) returns jsonb`:
    `{"atribuicao_id": bigint|null, "resultado": text, "motivo": text, "marca": text, "regra_id": bigint, "modo": text, "nome_sdr": text|null, "user_id": text|null, "fallback": bool, "deal": {…campos prontos para o POST…}}`; `resultado = 'ignorado'` (sem gravar) quando o evento não casa com regra vigente ou `modo = 'desligado'`. Grava a linha em `distribuicao_atribuicao` para todos os outros resultados. `pg_advisory_xact_lock(hashtext('distribuicao:' || marca))` antes de contar. `security definer`, só `service_role`.

- [ ] **Step 1: Teste SQL** (rollback) com a fixture da Tarefa 2 (A 50 / B 20 / C 30, todos elegíveis) e regra vigente `T1` em modo `ativo`, barreira `cf_capital` barrando `['Até 50']`:
  - 10 payloads válidos em sequência → contagem A 5, B 2, C 3 e a ordem exata começa `A, C, A, B, A, C …` (anotar a sequência que a fórmula dá e fixar no assert).
  - payload com `cf_capital = 'Até 50'` → `barrado`, `barreira_valor_lido = 'Até 50'`; com `cf_capital = ['OK','Até 50']` (array) → `barrado`; sem o campo → `atribuido` com `motivo = 'campo vazio, passou'`.
  - mesmo e-mail + mesmo evento 2× em 1 min → 2º é `duplicado`; 11 min depois → `atribuido`.
  - `modo = 'sombra'` → `simulado`, e um payload seguinte em `ativo` não vê o simulado no contador.
  - evento desconhecido → `{"resultado":"ignorado"}` e nenhuma linha gravada.
  - todos inelegíveis → `fallback` com `user_id` = `responsavel_padrao_user_id`.
- [ ] **Step 2: Rodar** → falha (função inexistente).
- [ ] **Step 3: Implementar** as duas funções. O objeto `deal` devolvido já traz `name`, `deal_stage_id`, `user_id`, `campaign_id`, `marca_rd`, `nome_sdr`, `contato {nome, email, telefone}`, `utm {source, medium, campaign, term, content}`, `cidade`, `estado`, `capital`, `campos_extra` (resolvidos do payload pelo mapeamento `campos_extra` da regra) — o Edge só traduz isso para IDs de campo.
- [ ] **Step 4: Rodar** → passa. Migration, docs, commit `feat(distribuicao): processar conversão com dedup, barreira e escolha por peso`.

### Task 4: RPCs de escrita e fechamento

**Files:**
- Modify: `docs/sql/2026-10-16-distribuicao-leads.sql` (bloco 4)
- Migration: `distribuicao_escrita`

**Interfaces:**
- Produces (todas `security definer`, só `service_role`):
  - `distribuicao_fechar(p_id bigint, p_id_deal text, p_erro text, p_tentativas int) returns void` — seta `id_deal` e `resultado = 'atribuido'` (ou mantém `fallback`) quando `p_id_deal` não nulo; senão `resultado = 'erro'`, `erro_rd = p_erro`.
  - `distribuicao_publicar_regra(p jsonb, p_autor text) returns jsonb {regra_id, versao}` — `p` com as colunas da regra; encerra a vigente (`vigente_ate = now()`) e insere `versao + 1`; exige `motivo` não vazio quando já existe versão.
  - `distribuicao_alterar_disponibilidade(p jsonb, p_autor text) returns jsonb` — `{"acao":"fora_agora"|"voltou"|"agendar"|"cancelar", "nome_sdr", "inicio", "fim", "motivo", "id"}`; `voltou`/`cancelar` setam `encerrado_em`.
  - `distribuicao_reabrir(p_id bigint) returns jsonb` — devolve `payload` + regra de um registro `erro` para o reprocessamento (usado pelo Edge).
- [ ] **Step 1: Teste SQL** (rollback): publicar v1 e v2 da marca `T1` → v1 com `vigente_ate` preenchido, v2 vigente; publicar sem motivo com versão existente → erro; `fora_agora` + `voltou` → linha encerrada e `disponivel_agora = true`; `distribuicao_fechar` com erro → `resultado = 'erro'`.
- [ ] **Step 2: Rodar** → falha. **Step 3: Implementar.** **Step 4: Rodar** → passa; migration; docs; commit `feat(distribuicao): publicar regra, disponibilidade e fechamento`.

### Task 5: Edge Function `distribuir-lead`

**Files:**
- Create: `supabase/functions/distribuir-lead/index.ts`, `supabase/functions/distribuir-lead/rd.ts`
- Vault: `distribuicao_webhook_chave` (gerar com `select encode(gen_random_bytes(24),'hex')`, guardar com `vault.create_secret`)

**Interfaces:**
- Consumes: Tarefas 3 e 4; `get_secret('rd_token')`, `get_secret('teams_alertas_url')`, `get_secret('distribuicao_webhook_chave')`.
- Produces: `POST /functions/v1/distribuir-lead?chave=…` (webhook) e `POST …?chave=…&reprocessar=<id>`; `rd.ts` exporta `criarDealNoRd(token: string, deal: DealPronto, campaignId: string | null): Promise<{ id?: string; erro?: string; tentativas: number }>` e `montarCorpoDeal(deal: DealPronto): RdDealBody` (os IDs de campo da tabela do mapa).

- [ ] **Step 1: Escrever `rd.ts`** com o mapeamento da spec §6.2 passo 6. Retry: 3 tentativas só para 429 (respeita `Retry-After`), 5xx e timeout (`AbortSignal.timeout(15_000)`); 4xx devolve `erro` na hora com o corpo.
- [ ] **Step 2: Escrever `index.ts`**: `OPTIONS` → 200; valida `chave`; `reprocessar` → `distribuicao_reabrir` e segue; senão `distribuicao_processar(payload)`; `ignorado`/`barrado`/`duplicado`/`simulado` → 200; `atribuido`/`fallback` → `criarDealNoRd` → `distribuicao_fechar`; erro ou fallback → `POST teams_alertas_url` com `{ "titulo": "Distribuição de leads", "texto": "<marca> · <resultado> · <motivo> · <lead_email>", "link": "<url do dashboard>/distribuicao-leads" }`; 1 linha em `sync_execucao` (`job = 'distribuir_lead'`, `status` = `success`|`error`, `checkpoint = {marca, resultado, atribuicao_id, id_deal, dt_ms}`). Responde 200 sempre que gravou o registro; 500 só se nem gravar deu.
- [ ] **Step 3: Deploy** com `mcp__supabase__deploy_edge_function` (`verify_jwt: false`).
- [ ] **Step 4: Teste ponta a ponta na marca Teste.** Publicar regra `Teste` (marca_rd `Teste`, evento `distribuicao_teste`, funil de teste, modo `ativo`, `time_proprio` = `[{"nome":"Xayane","peso":100}]`, responsável padrão = user_id do Gabriel Limas `698cd5a90b636f001c017469`). `curl -X POST "<url>?chave=…"` com um payload no formato da spec §6.1 (e-mail `teste-distribuicao@wescale.com.br`). Esperado: 200; linha `atribuido` com `id_deal`; deal visível no RD no Funil de teste com responsável Xayane, Marca Teste, Fonte Macro Inbound. Repetir o mesmo POST → `duplicado`, nenhum deal novo. POST com `deal_stage_id` inválido na regra → `erro` na 1ª tentativa com corpo 404/422 e mensagem no Teams. Apagar o deal de teste no RD (interface) ao fim.
- [ ] **Step 5: Commit** `feat(distribuicao): edge function distribuir-lead (webhook, RD CRM, alertas)`.

### Task 6: Webhook no RD Marketing, captura de payloads e regras em modo sombra

**Files:**
- Modify: `docs/sql/2026-10-16-distribuicao-leads.sql` (bloco 6: os 10 `distribuicao_publicar_regra` iniciais, sem valores de segredo)

- [ ] **Step 1: Criar o webhook** em RD Marketing → Integrações → Webhooks → Criar: evento "Novas Conversões", URL `…/distribuir-lead?chave=<segredo>`, todos os identificadores se a tela não filtrar. Confirmar que o RD validou a URL (status ativo).
- [ ] **Step 2: Publicar as 10 regras em modo `sombra`** com os IDs da tabela do mapa, **sem barreira** ainda, `campos_extra = {}`.
- [ ] **Step 3: Capturar 1 payload real por marca** (esperar as conversões chegarem; `select marca, payload->'contact' from distribuicao_atribuicao …`). Anotar a chave `cf_*` do campo de capital de cada marca e os identificadores de evento que divergirem da tabela.
- [ ] **Step 4: Publicar a versão 2 de cada regra** com a barreira da spec §2 (`barreira_campo` = chave capturada, `barreira_valores_barrados` = os valores exatos da tabela) e os `campos_extra` copiados de um deal real criado pela automação do RD no mesmo dia (`GET /deals?campaign_id=…&limit=1`).
- [ ] **Step 5: Verificação de paridade (≥ 3 dias úteis).** Query: para cada `simulado`/`barrado` da marca, existe deal no `deal_snapshot` com o mesmo e-mail do contato criado na mesma hora pela automação do RD? Esperado: todo `simulado` tem deal; nenhum `barrado` tem. Divergência = investigar antes da virada. Guardar a query no bloco 6 do SQL.
- [ ] **Step 6: Commit** `docs(distribuicao): regras iniciais e query de paridade`.

### Task 7: Catálogo de permissões, rota e menu

**Files:**
- Modify: `src/lib/permissoes.ts:24-45`, `src/lib/permissoes.test.ts`, `src/App.tsx:75-95`, `src/components/AppLayout.tsx:49-57`
- Create: `src/pages/DistribuicaoLeads.tsx` (só o esqueleto com `<h1>`)

**Interfaces:**
- Produces: chaves `aba.distribuicao` (label `Distribuição de Leads`, rota `/distribuicao-leads`, área `Vendas`) e `acao.distribuicao-editar` (label `Configurar distribuição de leads`, descrição `Na aba Distribuição de Leads: publicar regras, barreira de MQL e disponibilidade dos SDRs.`); `VENDAS_SUB` ganha `{ key: 'distribuicao-leads', label: 'Distribuição de Leads' }` após `metas`.

- [ ] **Step 1: Teste** em `permissoes.test.ts`: `permissaoDaRota('/distribuicao-leads') === 'aba.distribuicao'` e `ACOES.some(a => a.chave === 'acao.distribuicao-editar')`.
- [ ] **Step 2: Rodar** → falha. **Step 3: Implementar** (catálogo, rota lazy como `Acessos`, submenu). **Step 4: Rodar** vitest + build → passam. **Step 5: Commit** `feat(distribuicao): aba Distribuição de Leads no catálogo, rota e menu`.

### Task 8: Lógica pura do front

**Files:**
- Create: `src/lib/distribuicao/regras.ts`, `src/lib/distribuicao/regras.test.ts`

**Interfaces:**
- Produces:
  - `textoBarreira(campo: string | null, valores: string[]): string` → `"sem barreira"` | `"barra quando <campo> é Até R$ 50 mil ou De R$ 50 mil a R$ 100 mil"`.
  - `diffRegra(antes: RegraRow, depois: RegraRow): string[]` → uma frase por campo que mudou (`"modo: sombra → ativo"`).
  - `desvios(sdrs: {nome, peso}[], contadores: Record<string, number>): {nome, peso, recebidos, pctRecebido, desvio}[]` ordenado por desvio.
  - `rotuloFonteTime(fonte: string): string` → `versao_ativa` "meta do mês" · `versao_anterior` "última meta publicada (sem meta neste mês)" · `time_proprio` "time próprio (marca sem meta)" · `nenhum` "sem SDR elegível".
  - tipos `RegraRow`, `AtribuicaoRow`, `DisponibilidadeRow`, `PainelMarca` iguais às colunas das views.
- [ ] **Step 1: Testes** com os exemplos acima (inclusive `desvios` com 50/20/30 e recebidos 23/9/14 → desvio de A = 23 − 0,5×46 = 0).
- [ ] **Step 2: Rodar** → falha. **Step 3: Implementar.** **Step 4: Rodar** → passa. **Step 5: Commit** `feat(distribuicao): lógica pura do painel`.

### Task 9: Edge Function `gravar-distribuicao` e hook de escrita

**Files:**
- Create: `supabase/functions/gravar-distribuicao/index.ts`, `src/hooks/useGravarDistribuicao.ts`

**Interfaces:**
- Consumes: Tarefa 4; molde de `supabase/functions/gravar-meta/index.ts` (`validarSessao` com `tem_permissao`, chave `acao.distribuicao-editar`).
- Produces: `POST` com `{acao: 'publicar_regra', regra, motivo}` | `{acao: 'disponibilidade', …}` | `{acao: 'reprocessar', id}` (este último chama `distribuir-lead?reprocessar=` com a chave do Vault); hook exporta `publicarRegra(input): Promise<{ok, error, versao}>`, `alterarDisponibilidade(input)`, `reprocessar(id)`.
- [ ] **Step 1: Escrever a function** copiando `validarSessao` de `gravar-meta` (trocar a chave). **Step 2: Deploy** (`verify_jwt: false`). **Step 3: Testar** com `curl` usando um token de sessão do Junior (ele cola no terminal, não vai pro chat) → publicar uma regra na marca Teste e ver a versão subir; sem token → 401. **Step 4: Hook** no molde de `useSalvarMeta`. **Step 5: Build** → passa. **Step 6: Commit** `feat(distribuicao): escrita autenticada da configuração`.

### Task 10: Página Distribuição de Leads

**Files:**
- Create: `src/hooks/useDistribuicao.ts`, `src/components/distribuicao/CardMarca.tsx`, `EditorRegra.tsx`, `LogAtribuicoes.tsx`, `PainelDisponibilidade.tsx`
- Modify: `src/pages/DistribuicaoLeads.tsx`

**Interfaces:**
- Consumes: views da Tarefa 1 (+ `vw_distribuicao_painel` criada aqui: por regra vigente, `distribuicao_time_da_marca(marca)` expandido em 1 linha por SDR com `recebidos` desde `reinicio_em`), Tarefas 8 e 9, `useAcesso().pode('acao.distribuicao-editar')`.
- [ ] **Step 1: Migration** `distribuicao_painel_views` com três views, salvas no bloco 10 do SQL:
  - `vw_distribuicao_painel` (colunas: marca, marca_rd, modo, fonte_time, meta_versao_id, reinicio_em, nome_sdr, user_id, peso, recebidos, inelegivel_motivo);
  - `vw_distribuicao_campos_vistos` (marca, chave `cf_*`, valores distintos vistos, última vez) a partir de `payload->'contact'` dos últimos 90 dias;
  - `vw_distribuicao_saude` (por marca: último `recebido_em`, erros pendentes = `resultado = 'erro' and reprocessado_em is null`, e `rd_ainda_criando` = existe deal em `deal_snapshot` da marca criado nas últimas 24 h, pela campanha da regra, sem `distribuicao_atribuicao.id_deal` igual, só quando `modo = 'ativo'`).
- [ ] **Step 2: Hook** `useDistribuicao()` → `{painel, regras, atribuicoes, disponibilidade, loading, error, refetch}` com polling de 60 s (padrão `dashboard:refresh` dos outros hooks).
- [ ] **Step 3: Página** com os 4 blocos da spec §8. `EditorRegra`: campos modo, evento, funil/etapa (texto), campanha, barreira (campo em `<select>` com as chaves `cf_*` distintas vistas nos payloads da marca via view auxiliar `vw_distribuicao_campos_vistos`, mais "digitar"), valores barrados (chips), responsável padrão (lista de `nome_cargo_foto` ativos com `user_id`), time próprio (só editável quando `fonte_time <> 'versao_ativa'`), motivo obrigatório. Botões de disponibilidade com confirmação que avisa "reinicia o contador de: <marcas>".
- [ ] **Step 4: Ver renderizado** numa rota temporária sem login (removida antes do commit), 1440×900 e 375×812, com os dados reais em `sombra`. Build + vitest + oxlint.
- [ ] **Step 5: Commit** `feat(distribuicao): aba Distribuição de Leads (painel, log, disponibilidade, saúde)`.

### Task 11: Virada marca a marca

**Files:**
- Modify: `CLAUDE.md` (§3 nova subseção "Distribuição de leads", §5 mapa de arquivos, §8 pendências, §9 histórico), memória do projeto.

- [ ] **Step 1: Verificação do gatilho** (spec §6.5): com o deal de teste da Tarefa 5 recriado, conferir no RD Marketing que o lead `teste-distribuicao@…` recebeu "[CRM] Negociação criada"; criar um deal à mão no CRM com e-mail de contato novo e conferir se o lead aparece no Marketing. Registrar os dois resultados no histórico do CLAUDE.md. Se o primeiro falhar, parar e voltar ao Junior (plano B da spec).
- [ ] **Step 2: Mostrar ao Junior** a paridade da Tarefa 6 para a Eletrovias e pedir o OK da virada dela.
- [ ] **Step 3: Virar a Eletrovias**, nesta ordem e no mesmo minuto: (a) editar a automação "Eletrovias > CRM (Limpo)": trocar o critério de entrada para "converteu no evento [CRM] Negociação criada" + "Funil de vendas no CRM (última atualização) = SDR" + "Marca New = Eletrovias", remover o passo "Criar Negociação no CRM", salvar e ativar; (b) `distribuicao_publicar_regra` da Eletrovias com `modo = 'ativo'`. Acompanhar os 3 primeiros leads: deal criado pela função, COF enviada pela automação (ver o lead no Marketing), deal no dashboard em até 15 min.
- [ ] **Step 4: Antes do Odonto Legacy**, mostrar ao Junior que a versão ativa de outubro põe **Sarah Padilha** como SDR de "Odonto Scale", enquanto quem recebe os leads hoje é **Vanessa Daniel** (82 de 89 MQL em outubro). A virada dessa marca espera ele ajustar a meta (ou o time próprio só vale sem meta, então é a meta que precisa mudar).
- [ ] **Step 5: Repetir o Step 3** para as outras marcas, uma por vez, cada uma com OK do Junior. Odonto Legacy, Scale Partner e Beauty Connection: a automação mantém tag/tarefa/renomear com o gatilho novo.
- [ ] **Step 6: CLAUDE.md e memória**: subseção em §3 (regra do peso, cadeia, disponibilidade, "conversão nova = deal novo", onde mora cada coisa), §5 (arquivos), §8 (pendências: transferência de carteira como entrega 2; segmentações "Entrada Chatbot" sem uso; sombra das marcas ainda não viradas), §9 (entrada da data). Memória: atualizar `rd-api-criar-deal-e-webhook-mkt` com o que o teste do gatilho mostrou.
- [ ] **Step 7: PR** `feat(distribuicao): distribuição de leads por SDR com peso da meta` para `main`, CI, merge manual pelo Junior, conferir o Deploy do SHA.
