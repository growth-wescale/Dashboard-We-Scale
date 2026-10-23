# Migração dos funis de marca para SDR/Closer — desenho (v2)

Data: 21/10/2026 · Complementa a análise `2026-10-21-migracao-funis-legados-sdr-closer-analise.md` (números e mecanismos). Aqui ficam as decisões do Junior, o desenho que garante **zero mudança de número** e o que ainda está em aberto.

---

## 1. Intenção

Acabar com os funis de marca no RD CRM (Inpot, Lisô Laser, Get it, Rota's, Odonto Legacy, Oral Unic): todo deal passa a viver no **SDR** ou no **Closer**, os funis antigos são **apagados**, e o banco guarda o histórico completo sem que **nenhum número do dashboard ou dos relatórios mude**. Odonto Legacy primeiro (urgente).

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- RD limpo: 2 funis comerciais (+ Prospecção Ativa, Scale Partner, Repasse, Beauty Connection, Avaliadores, CS, Busca de Ponto, Funil de teste, que não entram nesta migração).
- Histórico de etapas de todo deal preservado no banco (eventos, `deal_stage_historico`, tarefas, anotações).
- Dashboard e relatórios idênticos antes e depois, até o Junior decidir, lote a lote, o que passa a aparecer.
- Cadência e distribuição funcionando no dia seguinte como hoje.

**Não-objetivos**
- Reclassificar histórico (SDR/Closer de deal antigo, motivos de perda).
- Trazer Get it e Rota's para o dashboard (marcas fora do portfólio; vão para o banco, ocultas).
- Resolver as pendências de segurança (anon key, RLS) — fora do escopo.

**Anti-objetivos (fracasso mesmo "funcionando")**
- Qualquer número mudar em Visão Macro, Performance, Análise de Perda, Campanha de Metas, bloco do MeetRox, Linha do Tempo (lista) ou no Relatório Diário.
- Lead antigo receber WhatsApp ou ligação por causa da migração.
- Deal fechado ser reaberto, ou trocar de dono, por efeito colateral.
- Dado ficar de fora do banco por volume.

## 3. Decisões do Junior (21/10)

| # | Decisão |
|---|---|
| 1 | Migrar **todos** (abertos e fechados), porque os funis serão apagados. |
| 2 | Deals **abertos** de Inpot, Lisô, Get it, Rota's e Oral Unic viram **perdidos** antes de mover. Odonto Legacy continua aberto. |
| 3 | Get it e Rota's entram também (histórico), mesmo fora do portfólio. |
| 4 | Ordem: preparar tudo (código, banco, cadência, distribuição) → mover no RD → dados chegam **ocultos** para o dashboard (menos Odonto Legacy) → relatório → Junior libera o que quiser; muito fica oculto para sempre. |
| 5 | Campos obrigatórios: procurar a informação por lead; sem informação, valor genérico ("Não identificado"). Marca pelo funil. **Fonte é o campo mais importante** e não pode ser inventada. |
| 6 | SDR responsável / Closer responsável = derivados do **dono** do deal (dono SDR → só SDR responsável; dono Closer → só Closer responsável). |
| 7 | Mapeamento de etapas aprovado (seção 4 da análise). |
| 8 | Odonto Legacy entra na cadência do SDR (é a mesma cadência; a duplicidade só existia por causa dos 2 funis). |
| 9 | Funis antigos: **apagar** do RD depois de vazios. |
| 10 | Banco e dashboard devem referenciar etapas e funis por **ID**, não por nome. |

## 4. Como garantir zero mudança de número

### 4.1 Lista de ocultação por ID (substitui a allowlist por nome)

Hoje os deals dos 5 funis de marca ficam fora do dashboard porque `vw_funil_vendas` só aceita funil por **nome**. Depois da migração o snapshot deles diz "SDR"/"Closer" e esse filtro deixa de escondê-los. Entra uma tabela explícita:

```
dashboard_deal_oculto (id_deal pk, lote, funil_origem, motivo, ocultado_em, liberado_em null)
```

Antes de mover, todos os deals dos 5 funis (Inpot 861, Lisô 292, Oral Unic 47, Get it 140, Rota's 498 = 1.838) entram nela com `lote` = funil de origem. Odonto Legacy **não** entra. A condição `NOT EXISTS (… liberado_em IS NULL)` vai em:

- `vw_funil_vendas` e `vw_funil_etapas_v2` (todo o dashboard de Vendas, Campanha de Metas, MeetRox);
- `vw_deal_eventos_marca_resolvida` (RPC `relatorio_sdr_marcas`);
- `relatorio_expansao_metricas` (Relatório Diário), junto do filtro de teste que já existe;
- **`vw_marketing_funil`** (achado da revisão de 23/10): a view não tem allowlist, mas o hook `useVendasFunil` das páginas de Marketing (Visão Geral, S&OP, Acompanhamento Meta) filtra `funil IN (SDR, Closer, Prospecção Ativa, Odonto Scale)`. Hoje os 1.838 ficam fora dessas páginas por isso; depois da migração o `funil` deles vira SDR/Closer e eles entrariam. O filtro de ocultação na view mantém as páginas do Gabriel idênticas sem mexer no código dele.

Liberar um lote = `UPDATE … SET liberado_em = now()`. Reversível. O "super relatório" (seção 9) é calculado por fora dessa lista, sobre as tabelas cruas, para o Junior ver o que cada lote traria.

Efeito hoje: zero — esses deals já estão fora por outro motivo. Conferido na análise: só 2 ciclos de 10.928 dependem do funil do snapshot, e nenhum deles é de deal nesses funis.

### 4.2 O evento lateral não chega a nascer (decisão 5 da análise, explicada)

Quando um deal muda de funil, o RD anota no histórico dele "entrou na etapa X do funil novo" naquele instante. O banco lê esse histórico e grava uma **passagem**. Para o dashboard parece que o deal "chegou" em Tentando Contato hoje, e o número de outubro sobe. Isso vale para os 967 do Legacy (que estão visíveis) e para os 1.838 ocultos (que um dia podem ser liberados).

Já existe no banco a tabela `deal_eventos_excluidos_manualmente`: o `registrar_stage_history` consulta ela e **nunca grava** uma entrada registrada lá (deal + etapa + instante ±2 s). O desenho usa isso **de forma preventiva**: a função que move o deal faz `PUT` → `GET` de confirmação → lê a entrada nova do histórico (etapa de destino, `start_date`) → grava na tabela de exclusão com o motivo "migração de funil, mesma etapa canônica". Quando o `wf_5` ou o espelho lerem o histórico minutos depois, a entrada é pulada. Fica só o `mudanca_funil` (a Linha do Tempo mostra "Mudou de funil"). Sem janela transitória, sem limpeza depois.

Pré-condição a confirmar no JSON do `wf_5`: que ele grava etapa pelo `registrar_stage_history` (como o espelho) e não por outro caminho.

### 4.3 Odonto Legacy: regra do SQL com data de corte

Hoje o código conta SQL do Legacy só na "Reunião Agendada" do funil Legacy, e a do Closer não conta. Depois da migração a Sarah agenda no SDR e o deal vai para o Closer, como as outras marcas.

- **Eventos** (`idsEtapaObrigatoria` em `metrics.ts`): para deal da marca Odonto Legacy, etapa do funil Legacy **até a data de corte**, etapa do Closer **a partir dela**. Espelha o que aconteceu de verdade. Os 2 ciclos com reunião no Closer antes do corte (Thaina, ago e out/26) continuam fora, exatamente como hoje.
- **Atual** (`currentStage`): aceita Legacy **ou** Closer. Hoje nenhum deal Legacy aberto está na SQL do Closer, então nada muda no dia; depois, os 2 que forem movidos de "Reunião Agendada" continuam contando.
- `ETAPAS_AUSENTES_POR_MARCA['Odonto Scale'] = ['Comitê']`: sai no corte (a linha Comitê passa a aparecer zerada com só Legacy selecionada; não é número que muda).

### 4.4 Prova de igualdade

Antes de cada onda e depois de o sync convergir, a mesma bateria de contagens, salva em tabela:

- `vw_funil_vendas`: linhas, ciclos atuais, ganhos, receita, perdidos, em andamento, por marca;
- `vw_funil_etapas_v2`: passagens e deals únicos por mês × etapa canônica × marca (2025-09 → hoje), Inbound e Prospecção Ativa;
- Atual: deals vivos por etapa corrente × marca;
- `relatorio_expansao_metricas` para ontem e MTD;
- MeetRox: reuniões com negócio no funil por mês;
- `vw_marketing_funil` com o mesmo filtro do hook de Marketing: linhas, MQL por mês × marca, ganhos e receita por mês (Visão Geral/S&OP).

Diferença permitida: **zero** linhas. A onda só é dada como concluída com o diff vazio.

### 4.5 Nome → ID (decisão 10)

É um projeto próprio (PR e sessão próprios), **logo depois da onda 1**, com a mesma prova de igualdade da 4.4. Escopo levantado:

- Banco: allowlist de `vw_funil_vendas` (nomes → `id_funil`); camada em `vw_deal_eventos_ciclo` (`nome_funil = 'Closer'`); `data_agendamento_reuniao_sql` em `vw_deal_ciclo` (`nome_funil <> 'SDR'`); `vw_deal_origem_comercial` e a matview (`'Prospecção Ativa'`); `funis` por nome em `relatorio_expansao_metricas`; e o principal: `etapa_canonica` passa a ser por `stage_id` (`rd_funis_etapas` ganha `etapa_canonica`/`camada`; 280 de 28.739 eventos e 256 snapshots têm `id_etapa` fora do catálogo hoje: funis Repasse, Beauty Connection, Busca de Ponto, Funil de teste, CS — cadastrar).
- Front: `idsEtapaObrigatoria` já é por id; `resolveStage` fica como tradução de rótulo, alimentada pela etapa canônica que a view passa a expor por id.
- `rd_funis_etapas` continua sendo a fonte dos nomes, inclusive dos funis apagados (`ativo = false`, nunca apagar linhas).

Não entra na onda 1 para não atrasar o Legacy; a lista de ocultação por ID já é o primeiro passo nessa direção.

## 5. Ondas

### Onda 0 — preparação (sem mover nada)
1. PR do dashboard: 4.3 + leitura da lista de ocultação não precisa de front (é nas views).
2. Banco: `dashboard_deal_oculto` + filtros (4.1); carga dos 1.838 ids; Edge Function `mover-funil` no padrão da `transferir-responsavel` (tabela-plano com deal, etapa destino, dono, campos a preencher; backup do estado anterior; `PUT` + `GET`; exclusão preventiva 4.2; lotes ≤ 55).
3. Cadência (ver 7.2): **antes de mover**, reapontar a cadência 3 (Odonto Legacy) para o funil SDR — `cadencia_etapas` (3 linhas: pipeline SDR, etapas Novo MQL / Tentando Contato / Contato Efetivo), condições 14 (funil) e 15 (etapas) e `mover_no_disparo_de/para` — e acrescentar a condição Marca = "Odonto Legacy", para ela continuar exclusiva do Legacy. As 70 execuções seguem na mesma régua, mesmos passos, sem reinício. Nada mais muda na cadência: régua, execuções, tarefas e fila ficam como estão. Juntar com a cadência 6 é opcional e sem data.
4. Distribuição: nova versão da regra do Odonto Legacy apontando SDR / Novo MQL, sem `tarefa` (a cadência já cria a ligação); desativar a automação antiga "OdontoScale > CRM (Limpo)" quando o Gabriel trocar a LP.
5. Campos obrigatórios: regra de preenchimento aprovada (seção 6).
6. **Teste com 1 deal** no "Funil de teste" (seção 8).
7. Checksum "antes" (4.4).

### Onda 1 — Odonto Legacy (967 deals: 92 abertos, 875 fechados)
**Janela: entre 20h e 05h de um dia útil para o seguinte** (a Limpeza da cadência roda só 8h–19h e a Reconciliação às 06h; nenhuma das duas pode pegar o meio da onda). Antes do primeiro `PUT`: `UPDATE webhook_controle SET habilitado = false` (o roteador descarta os webhooks do RD em vez de enfileirar: nada de Ingresso, nada de troca de dono nos deals movidos). Mover; esperar `wf_5` + espelho convergirem (~15–20 min); conferir que os 967 têm snapshot em SDR/Closer e `mudanca_funil`; checksum "depois" = igual; conferir Atual contra o RD; religar o disjuntor (`select webhook_religar()` e `habilitado = true`); conferir `rd_escrita_propria` e `automacao_rate_guard` (nenhuma escrita na janela); Sarah confere a cadência no dia seguinte.

### Onda 2 — os 5 funis de marca (1.838 deals)
1. Perda em massa dos 667 abertos (Rota's 469, Get it 131, Lisô 61, Inpot 6), **dentro do funil antigo**, com motivo definido (seção 6). Deal perdido não entra em cadência (trigger `cadencia_bloquear_entrada_deal_perdido`) nem recebe WhatsApp.
2. Mover os 1.838, já na lista de ocultação, na mesma janela noturna e com o disjuntor desligado (as duas automações de troca de dono não checam se o deal está aberto: sem o disjuntor desligado, ~100 deals fechados que entram em "Reunião Agendada SQL" ou "No Show" trocariam de dono). Convergência ~1 h (espelho em lotes, 429 tratado).
3. Checksum = igual (tudo oculto). Conferir que nenhuma automação escreveu no RD (`rd_escrita_propria`, `automacao_rate_guard`).

### Onda 3 — fechamento
1. Conferir que todo deal dos 6 funis tem o histórico completo em `deal_stage_historico` (a migração força `GET` individual de cada um, então deve fechar em 100%).
2. Apagar os 6 funis no RD (pela tela; não há API). `rd_funis_etapas` fica intacta.
3. Super relatório (seção 9) → Junior libera lotes.
4. CLAUDE.md, memória, pendências.

## 6. Preenchimento de campos obrigatórios

| Campo | Regra proposta |
|---|---|
| Marca | pelo funil de origem (Inpot, Lisô Laser, Get it, Rota's, Oral Unic; todas existem como opção). Deal que já tem Marca mantém |
| Fonte Macro | **só com evidência**, nunca chute (tabela de regras em 6.1): (a) já preenchida → mantém; (b) `deal_source` do RD indica mídia/orgânico (Instagram, Facebook, "Busca Paga", "Tráfego Direto", "Redes Sociais", "Contato pelo Site") → `Inbound`; "Outbound"/"Prospecção Ativa" → `Prospecção Ativa`; "Feiras e Eventos" → `Evento`; (c) sem fonte no CRM → cruzar o e-mail com o RD Marketing (`leads` do Supabase de Marketing); (d) sem nada → criar a opção **"Não identificado"** no campo Fonte Macro e usar só nesses (hoje: 482 Inpot + 469 Rota's + 131 Get it + 60 Lisô estão como "Desconhecido" no RD). Nunca chutar Inbound. Tabela de evidência por deal para revisão antes de gravar |
| Cidade, Estado | o que estiver no deal; senão "Não identificado" |
| Canal de Conexão (Conexão, No Show) | o que estiver; senão "WhatsApp" (decidido 23/10) |
| Motivo no-show (No Show) | o que estiver; senão "Não compareceu" (decidido 23/10) |
| Temperatura (SAL/COF/Comitê/Pré) | o que estiver; senão "Padrão" (decidido 23/10) |
| Data COF / Previsão (COF/Comitê/Pré) | o que estiver; senão a data da venda (ganho) ou do fechamento (perdido) — decidido 23/10 (15 deals do Legacy em Documentação/Oportunidade) |
| SDR Responsável | dono com cargo SDR e que exista como opção (Xayane → "Xay", Thiago, Sarah Padilha); senão vazio |
| Closer responsável | dono com cargo Closer. **Trava**: a opção só existe para os 6 Closers atuais; 39 deals fechados têm dono Giullia/Aurélio/Rômulo e 15 têm dona Xayane (SDR) em etapa de Closer. Decidido 23/10: reincluir temporariamente os nomes antigos nas opções do campo **já na onda 0** (o Legacy tem 30 fechados em etapa de Closer com Vanessa Daniel / Aurélio Briano no campo, opções retiradas em 20/10, e 2 com o valor antigo "Aurélio", que viram "Aurélio Briano" no mesmo `PUT`) e tirar na onda 3. Para os 15 fechados com dona Xayane (SDR) em etapa de Closer, o campo fica vazio (decisão 6); se o teste de 1 deal mostrar que o RD exige o campo nesse `PUT`, a regra de obrigatoriedade por etapa desse campo é suspensa só durante a janela e restaurada no fim |
| Motivo de perda (667 abertos) | criar o motivo **"Funil descontinuado"** no catálogo (via API, 1 cadastro com ID, grupo Descarte), para a perda em massa ficar rastreável e filtrável depois. Entra em `classificarMotivo` no dashboard quando algum lote for liberado |

### 6.1 Regras de evidência → Fonte Macro (revisão do construtor, item 8)

| Evidência | Fonte Macro |
|---|---|
| campo já preenchido no deal | mantém |
| `deal_source` do RD = Instagram/Facebook (qualquer "Outros \| instagram_*", "facebook_*", "paid", "pago", "{{placement}}"), "Busca Paga", "Busca Orgânica", "Tráfego Direto", "Redes Sociais", "Contato pelo Site" | Inbound |
| `deal_source` = "Outbound" ou "Prospecção Ativa" | Prospecção Ativa |
| `deal_source` = "Feiras e Eventos", ou lead do Marketing com `formulario` de evento | Evento |
| `deal_source` = "Leads Oral Unic RD CRM - Cenário Atual" (lista importada) | Outro CRM |
| sem fonte no CRM, mas e-mail casa com lead do Marketing que tem `formulario` ou `utm_source` de mídia/LP | Inbound |
| e-mail casa com lead do Marketing **sem** `utm_source`/`formulario`, ou não casa (`leads` só cobre o que o RD Marketing recebeu; Rota's/Get it de 2025 podem ser lista fria) | Não identificado |

A tabela de evidência por deal (id, regra aplicada, valor da evidência) é gerada antes de gravar e entra no super relatório. No dashboard, "Não identificado" entra em `FONTES_UM_PONTO` (`corridaPerformance.ts`) para valer 1 ponto na Corrida, como "Sem Classificação" (hoje valor desconhecido vale 2); muda só o que algum lote liberado traria, nunca o que está visível.

Blocos a confirmar no teste de 1 deal: se o RD valida os campos obrigatórios **da etapa de destino** no `PUT` (hoje sabemos que valida os "sempre obrigatórios").

Fonte via Marketing: a tabela `leads` do Supabase de Marketing não responde à chave anon a partir do Expansão (RLS), mas o **n8n já a lê todo dia** (workflow "wf_5 Reconciliacao MQL Lead a Lead", colunas `email, marca, formulario, utm_source, dados_extras`). O cruzamento sai como um workflow manual no n8n, no mesmo molde: lê a tabela-plano no Expansão, consulta `leads` por e-mail em lotes e grava a evidência (`formulario`, `utm_source`, `dia`) de volta no Expansão. Sem credencial nova e sem função no projeto do Gabriel; avisar o Gabriel por cortesia, já que o dado é dele. Cobertura de e-mail nos deals: Inpot 751/861, Lisô 282/292, Get it 136/140, Rota's 498/498, Oral Unic 44/47, Legacy 876/944.

## 7. Automações (n8n) — confirmado nos JSONs (23/10)

Os 13 arquivos exportados pelo Junior (12 workflows; "Alerta - Disjuntor de Webhooks (RD CRM)" são dois workflows diferentes com o mesmo nome) foram lidos linha a linha. **Nenhum deles quebra com a migração.** Três mexem no desenho (7.1 a 7.3); o resto só confirma.

### 7.1 Os webhooks do RD têm um interruptor manual
O roteador (pasta Webhooks) recebe `crm_deal_created/updated/deleted` do RD e, antes de qualquer coisa, chama `webhook_guard()`: conta eventos por minuto e **descarta** tudo se `webhook_controle.habilitado = false` ou se passou de `limite_por_minuto` (hoje 500). Evento descartado não fica em fila. Depois disso, o roteador manda o evento para: Ingresso na Cadência (se o funil tiver cadência ativa), "Altera SDR histórico" (etapa No Show do SDR), "Altera Closer" (etapa Reunião Agendada SQL do Closer) e um NoOp para o funil Legacy.

**As duas automações de troca de dono não checam se o deal está aberto.** Deal fechado movido para essas etapas trocaria de dono (e geraria `troca_responsavel`, que no Legacy, visível, mexe na eleição de SDR/Closer de deal perdido). Por isso a onda inteira roda com `habilitado = false`, e o religamento é explícito no fim (`webhook_religar()`). O outro workflow de mesmo nome (pasta Cadência) é só o alerta por e-mail a cada 5 min; vai avisar que o disjuntor está desligado, e isso é esperado.

### 7.2 Cadência: três peças que reagem à migração
- **Limpeza a cada 15 min** (8h–19h, dias úteis) lê `cadencia.v_execucoes_a_encerrar`: execução ativa cujo deal (no `deal_snapshot`) está perdido/ganho **ou fora dos pares funil+etapa de `cadencia_etapas`**. Fecha as tarefas vinculadas no RD e encerra a execução. Se a cadência 3 continuar apontando para o funil Legacy, as 70 execuções são encerradas e as 526 tarefas fechadas na primeira rodada depois do sync. **Por isso a cadência 3 é reapontada para o SDR antes da onda 1.**
- **Reconciliação às 06h** busca no RD os deals abertos de cada par funil+etapa das cadências ativas e **cria execução para quem não tem** (`inclui_existentes`); deal mais velho que a régua recomeça do dia 1, e o primeiro WhatsApp do dia 1 sai na hora (`primeiro_whatsapp_imediato`). É o que mandaria WhatsApp para lead dormente ou reiniciaria o Legacy. Fica inofensiva porque: dormentes viram perdidos antes de mover; Legacy continua casando só com a cadência 3 (condição nova de Marca), que já tem as execuções.
- **Ingresso** (chamado pelo roteador) ignora deal fechado, casa a cadência pelas condições e cria execução nova (ciclo 1). Com o disjuntor desligado durante a onda, não roda; depois, lead novo do Legacy no SDR casa com a 3 (não com a 6, que exclui a marca).
- **Disparador de Templates** só envia o que está na fila e revalida etapa e `closed_at` no RD. Sem execução nova, nada entra na fila.

Conclusão (ajustada em 23/10 a pedido do Junior: **a cadência operacional do Legacy não muda**). A cadência tem duas partes: a régua com o andamento de cada deal (dia 8, dia 12, tarefas abertas, WhatsApps programados) e o "endereço" onde ela procura os deals (funil + etapas do RD). Só o endereço muda, porque os deals mudam de funil: de "Odonto Legacy / Novos Leads, Tentando Contato, Contato Efetivo" para "SDR / Novo MQL, Tentando Contato, Contato Efetivo", restrito à marca Odonto Legacy. Régua, execuções, tarefas e fila continuam exatamente onde estão; para a Sarah nada muda. A junção com a cadência 6 (decisão 8) **não é necessária** para a migração, e as duas réguas **não são iguais** (medido em 23/10, versão 2 das duas): as 24 ligações e as 9 tarefas são idênticas, mas os WhatsApps diferem. Legacy manda 5 templates próprios (`e3m1`, `e3t04`, `e3t05`, `e3t08`, `e3t12`, às 08h55, nos dias 1, 3, 5, 9 e 13); SDR manda 8 (`m1`, `c1`, `t04`, `t05`, `t07`, `t08`, `t09`, `t10`, às 09h e 14h, nos dias 1, 2, 3, 5, 9, 13, 15 e 21). Juntar as duas seria decisão de negócio sobre quais mensagens o lead do Legacy recebe, não de dado. Depois da migração o funil SDR fica com 2 cadências escolhidas pela marca, como a Prospecção Ativa já tem hoje.

### 7.3 wf_5 e o espelho
`wf_5` roda a cada 10 min, lista as 200 negociações mais recentes por `updated_at`, processa as 30 mais antigas delas e avança o watermark até ali. Com 2.800 updates em rajada, ele **não vê** as mais antigas (`janela_incompleta`, o Watchdog avisa) e vai sendo coberto pelo espelho, que compara o RD inteiro com o snapshot a cada 15 min. Os dois gravam etapa pelo `registrar_stage_history`, então a exclusão preventiva (4.2) vale para os dois caminhos. Nada se perde: a conferência final é por id.

### 7.4 Tabela

| Workflow | O que faz (lido no JSON) | Efeito da migração |
|---|---|---|
| wf_5 Sync Incremental Deals (v4) | 10 min; 2 páginas × 100; 30 deals/rodada; `registrar_stage_history` + `processar_deal_evento` (`api_sync`) | throughput só; exclusão preventiva cobre |
| Alerta - Disjuntor de Webhooks (RD CRM) · roteador | webhooks do RD → `webhook_guard` → Ingresso / Altera SDR / Altera Closer / NoOp Legacy; deleted → wf_2/wf_3 | **desligar na janela** (`habilitado = false`); religar no fim |
| Alerta - Disjuntor de Webhooks (RD CRM) · alerta | 5 min; e-mail quando o banco não responde, quando o disjuntor cai e quando volta | vai mandar e-mail na janela; esperado |
| Altera o responsável para o Closer quando reunião agendada | eco → `/users` → "Closer responsável" → `PUT user_id`; rate guard 3/h | sem checagem de aberto; neutralizado pelo disjuntor desligado |
| Altera o responsável … SDR histórico quando No Show (corrigido 02-10) | eco → RPC `sdr_historico_no_show` → `PUT user_id`; Teams se não achar | idem |
| Cadência - Ingresso na Cadência | ignora fechado; casa condições; execução nova; passos do dia; template na fila | não roda na janela; depois, Legacy casa com a 3 |
| Cadência - Limpeza a cada 15 min | `v_execucoes_a_encerrar` → fecha tarefas e encerra; parte 2 = tarefas do TI por funil | inofensiva com a cadência 3 reapontada **antes** |
| Cadência - Reconciliação Diária das Tarefas | 06h; enrola abertos sem execução; passos faltantes; perda por conclusão | inofensiva com dormentes perdidos e Legacy só na 3 |
| Cadência - Disparador de Templates | 2 min; envia fila pelo Tallos; revalida etapa/fechado; cria tarefa WA; move Novo MQL → Tentando | nada entra na fila |
| Webhook RD Marketing | formulário do site Odonto Scale → contato no RD Marketing (OAuth) | nenhum (não toca o CRM) |
| sync_Supabase_funil_Odonto_Scale | **vazio** (NoOp) | nenhum; pode ser apagado junto com o funil |
| wf_5 Reconciliacao MQL Lead a Lead (Growth x CRM) | 08h30; RPC `recon_mql_lado_crm` × tabela `leads` do Marketing; grava `recon_mql_diario` | janela de 7 dias; eventos laterais não nascem; sem efeito |
| Formulário evento Feira de Franquias | formulário n8n → conversão no RD Marketing (Fonte Macro = Evento) | nenhum |

### 7.5 Segredos nos arquivos
Os JSONs trazem em texto plano: token do RD CRM (dois tokens diferentes), chave `service_role` e chave `sb_secret` do Supabase de Expansão, chave `service_role` do Supabase de **Marketing** (no Reconciliacao MQL), JWT do Tallos, chave da API do RD Marketing (Feira) e a URL do webhook do Teams. Nada disso foi copiado para o repositório, para a memória nem para este documento. Os arquivos ficam no Downloads do Junior: não anexar em chat, e-mail ou repositório. A rotação das chaves já é pendência da seção 8 do CLAUDE.md; a lista acima amplia o que precisa girar.

## 8. RD CRM — o que o teste de 1 deal precisa provar

Evidência já no banco (23/10): **590 deals perdidos e 11 ganhos têm entrada no histórico de etapas depois do `closed_at`** e continuam perdidos/ganhos no snapshot, ou seja, o RD move deal fechado sem reabrir (ao menos pela tela). O teste confirma pela API.

No "Funil de teste" (`6abf2318dca0200020ff065d`), com um deal aberto, um perdido **e um ganho**:
1. `PUT /deals/:id` com `deal_stage_id` de **outro** funil move o deal (e o `deal_pipeline` acompanha).
2. Mover um deal **perdido** e um **ganho** não os reabre (`win`/`closed_at`/`data_venda` intactos). **Plano B** se a API recusar ou reabrir: mover pela tela do RD (lista → selecionar → mover para o funil), com o `REFRESH` da matview (pg_cron, 2 min) pausado durante a janela, e registrar os eventos laterais em `deal_eventos_excluidos_manualmente` logo depois do sync, antes de voltar o refresh. Reabrir-mover-refechar fica proibido (muda `closed_at`).
3. O RD valida os campos obrigatórios da etapa de destino no `PUT` (e aceita todos no mesmo corpo).
4. O histórico ganha a entrada nova (como visto no deal `6ace137e…`) e a exclusão preventiva (4.2) segura o evento.
5. Quais webhooks chegam ao Disjuntor e o que as automações fazem com deal fechado.
6. Apagar um funil vazio não dispara webhook de exclusão de deal.

Volume: ~2.800 `PUT`+`GET` em lotes de 55 (gateway corta em 150 s); o RD devolve 429 sob carga, a função espera. `wf_5` pega 30 por rodada e o espelho reconcilia o resto (até 1.000 escritas por ciclo de 15 min, lotes de 25 a cada ~20 s). Nada se perde: o espelho compara o RD inteiro com o snapshot a cada ciclo, e a conferência final é por id (plano × snapshot × `mudanca_funil` × `deal_stage_historico`).

## 9. Super relatório (depois da onda 2)

Por lote (funil de origem) e por marca: deals, status, período coberto; o que cada lote **acrescentaria** por mês × etapa canônica (passagens e únicos), vendas e receita por mês, perdas por mês e motivo, SDR/Closer eleitos (e quantos cairiam em "Ex-integrantes"), qualidade da Fonte Macro (quantos por evidência, quantos vazios). Com isso o Junior decide `liberado_em` por lote.

## 10. O que o construtor decide sozinho

- Nome e colunas exatas da tabela de ocultação e da tabela-plano; formato do backup.
- Tamanho dos lotes e horário (madrugada, fora da janela 08:30–18:30 da cadência).
- Ordem dentro da onda 2 (sugestão: Inpot, Lisô, Oral Unic, Get it, Rota's).
- Texto dos motivos nas tabelas de exclusão/ocultação.

## 11. Em aberto (atualizado 23/10, depois dos JSONs)

1. ~~JSONs~~ — recebidos e lidos (seção 7).
2. ~~Valores genéricos~~ — decididos (seção 6).
3. ~~Motivo de perda~~ — "Funil descontinuado".
4. ~~Closers antigos nas opções~~ — sim.
5. ~~Fonte~~ — cruzamento pelo n8n (seção 6); os ~1.140 que não casarem recebem "Não identificado".
6. ~~Data de corte~~ — dia da onda 1.
7. ~~Cadência do Legacy~~ — só o endereço muda (7.2); junção com a cadência 6 fica como opção futura, sem data.
8. ~~Revisão independente~~ — feita em 23/10 (seção 12).
9. **LP antiga do Odonto** (revisão, item 5): a automação "OdontoScale > CRM (Limpo)" do RD Marketing continua criando deal no funil Legacy (`odontoscale_multistep`). Opções: (a) reapontar essa automação para SDR / Novo MQL com a Sarah, na onda 0, e o funil Legacy pode ser apagado na onda 3; (b) esperar o Gabriel trocar a LP, e o funil Legacy fica em pé até lá. Decisão do Junior.
10. **Automações nativas do RD CRM** (revisão, item 7): Junior confere em Configurações → Automações se existe gatilho por entrada nas etapas do SDR e do Closer (tarefa, e-mail, troca de dono). Se houver, entra um passo de desligar/religar na tela, dentro da janela.
11. **TI**: avisar que o receptor de webhooks do DW na VPS vai receber ~2.800 atualizações numa madrugada.

---

## 12. Revisão do construtor (23/10) — o que foi perguntado e onde ficou

| # | Pergunta do revisor | Resposta |
|---|---|---|
| 1 | Plano B se o RD recusar/reabrir deal fechado; teste sem o caso "ganho" | Evidência: 601 deals fechados já trocaram de etapa depois de fechados sem reabrir. Teste ganha o caso ganho; plano B (tela + matview pausada + exclusão posterior) na seção 8 |
| 2 | "Closer responsável" obrigatório contra a decisão 6; opções removidas no Legacy | Reinclusão das opções antigas na onda 0 (30 deals do Legacy); 15 da Xayane ficam vazios, com a regra do campo suspensa na janela se o RD exigir (seção 6) |
| 3 | Fonte Macro vazia em deal visível do Legacy | Não existe: os 967 do Legacy têm Fonte Macro preenchida (0 vazios, medido 21/10) |
| 4 | `vw_marketing_funil` e consumidores fora da lista | O hook de Marketing filtra `funil` por nome: a view entra na lista de ocultação (4.1) e no checksum (4.4). `vw_funil_compat` (Lovable, `calcular_previsao_*`, `funil_relatorio_compat`) não tem allowlist: esses deals já estão lá hoje, nada muda. O receptor de webhooks do DW do TI recebe os ~2.800 updates; avisar o TI antes da janela |
| 5 | Apagar o funil Legacy depende da LP antiga do Gabriel | **Decisão do Junior** (seção 11) |
| 6 | O que ainda cria deal nos funis de marca | Nada automático desde 19/10 (as 6 "<marca> > CRM (Limpo)" estão desativadas; últimas criações: Lisô "Teste IA" em set/26, Inpot manual em ago/26). Só a "OdontoScale > CRM (Limpo)" cria no Legacy (item 5) |
| 7 | Automações nativas do RD CRM nas etapas de destino | **Ação do Junior** (seção 11): conferir na tela do RD; não há API |
| 8 | Evidência → valor de Fonte Macro | Tabela 6.1 |
| 9 | Relatório Diário agrupa por nome de funil? | Não: os nomes de funil são só filtro; os blocos são por marca (`mtd_marca_cont`). O checksum por marca compara igual |
