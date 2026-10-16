# Distribuição de leads por SDR com peso da meta — desenho

Data: 2026-10-16 · Dono: Junior (Expansão) · Estado: revisado pelo construtor, aguardando aprovação do Junior

## 1. Intenção e porquê

Hoje a criação dos deals de Inbound no RD CRM é feita por automações do RD
Marketing, que distribuem os deals "entre a equipe" da marca no CRM. O RD só
sabe fazer rodízio igual (1 pra 1). O Junior quer que a distribuição siga o
**peso que cada SDR tem na meta da marca no mês** (ex.: Eletrovias 50/20/30),
configurável pelo gestor no dashboard, sem depender do RD.

Dois problemas de hoje que o desenho também resolve, porque o Junior os
nomeou como dor:

- **Sem histórico da barreira de MQL.** A regra "qual capital entra" vive na
  segmentação e de novo dentro da automação do RD Marketing. Quando alguém
  altera, ninguém sabe o que era antes, e fica impossível explicar por que um
  deal entrou como MQL.
- **Marca errada.** A marca do deal vem de um campo do lead, não do evento que
  disparou. Um lead que converteu em dois chatbots entra com a marca errada
  (caso real: deal criado pela automação da Eletrovias com Marca = B2Case).

Medido em 16/10/2026: Eletrovias é a única marca com mais de um SDR na equipe
do CRM (Sarah, Thiago, Xayane). Peso da versão ativa de outubro: Sarah 50 ·
Thiago 20 · Xayane 30. Realizado de MQL do mês até o dia 16: Sarah 177 ·
Thiago 122 · Xayane 18 (a Xayane só entrou na equipe do CRM em 15/10).

## 2. Como funciona hoje (levantado nos sistemas em 16/10/2026)

```
lead termina o chatbot → conversão "<marca>_multistep" no RD Marketing
  → segmentação "Entrada Chatbot - <marca>" (converteu no evento E barreira de capital)
    → automação "<marca> > CRM (Limpo)":
         [critério de entrada repete a barreira de capital]
         1. Criar Negociação no CRM — funil SDR, etapa Novo MQL,
            "Distribuir entre equipe <marca>" (rodízio igual do RD)
         2. Enviar e-mail da COF
         3. Adicionar anotação no lead
```

Barreiras por marca, como estão no RD Marketing (campo do lead "Qual o
capital disponível para o investimento?", salvo IDA):

| Marca | Barra se o valor for |
|---|---|
| Eletrovias | "Até R$ 50 mil" ou "De R$ 50 mil a R$ 100 mil" |
| B2Case | "Ainda não possuo" ou "Até R$ 60.000" |
| Inpot, Lisô Laser, Oral Unic | "Ainda não possuo" ou "Até R$ 200.000" |
| Viva | "Ainda não possuo" ou "até 600k" |
| Instituto do Autismo | campo "Capital" = "Menos de R$ 550k" |
| Odonto Legacy (funil Odonto Legacy / Novos Leads) | sem barreira |
| Scale Partner (funil Scale Partner / Novo MQL) | sem barreira |
| Beauty Connection (funil Beauty Connection / Novo MQL) | sem barreira |

Todas têm a mesma forma: **um campo do lead e uma lista de valores que
barram**. Odonto Legacy ainda adiciona tag, notifica o responsável e cria
tarefa "Novo Lead"; Scale Partner renomeia o deal para "Scale Partner -
<primeiro nome>".

Outros fatos que o desenho usa:

- A automação "Eletrovias > CRM (Limpo) - Prosp Ativa" é disparada pelo evento
  **"[CRM] Negociação atualizada"** com os campos de CRM que o RD Marketing
  recebe de volta do CRM (funil, etapa, "Marca New"). Logo, automações do RD
  Marketing conseguem reagir a deal criado no CRM.
- Nenhum webhook está configurado no RD Marketing hoje. O recurso existe
  (evento `WEBHOOK.CONVERTED`, filtro por identificador de conversão, payload
  com `contact.email`, `contact.uuid`, campos personalizados `cf_*`, UTMs).
- Os 4 SDRs ativos têm `user_id` do RD em `nome_cargo_foto`.
- Configuração das Metas grava `meta_pessoa.peso` por marca na `meta_versao`
  ativa do mês. Versões são imutáveis; mudar = publicar e ativar uma nova.
- A API do RD CRM cria deal com `user_id` (responsável), etapa, campos
  personalizados, campanha e fonte num único POST. **Não tem busca de deal por
  e-mail**; o espelho `deal_snapshot` tem.
- A equipe do CRM (`/teams`) deixa de ser usada para distribuir. Continua
  existindo no RD; não é apagada.

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**

1. Todo deal de conversão (as 10 marcas da tabela acima) passa a ser criado
   pelo nosso fluxo, com o SDR escolhido pelo peso da versão ativa das metas.
2. Barreira de MQL, funil/etapa de destino e evento de disparo configuráveis
   por marca no dashboard, por Administrador, **com histórico de versões**.
3. Toda conversão recebida fica registrada com a versão da regra avaliada, o
   resultado (MQL ou barrado, e por quê), o SDR escolhido, os contadores no
   momento e o deal criado. Inclusive as barradas.
4. Marca do deal vem do evento que disparou, nunca de campo do lead.
5. Falha nunca perde lead: fica na fila de reprocessar, com alerta.

**Não-objetivos (nesta entrega)**

- Mandar o e-mail da COF, anotação, tag, tarefa e notificação. Continuam no
  RD Marketing, com o gatilho trocado (seção 6).
- Prospecção Ativa. As automações "- Prosp Ativa" só mandam e-mail e não
  criam deal; ficam como estão.
- Mexer na cadeia de views do dashboard. O deal criado pela API entra no
  espelho pelo sync de sempre.
- Redistribuir deals já criados. **Transferência de carteira** (quando um SDR
  sai de férias ou do time: transferir no RD os deals em etapas iniciais
  criados nos últimos dias e as reuniões agendadas no período, pelos mesmos
  pesos, com filtros configuráveis e registro) é a **segunda entrega**, na
  mesma aba. Decisão do Junior em 16/10. Falta de um dia não mexe em carteira.

**Anti-objetivos (o que tornaria isso um fracasso mesmo funcionando)**

- Dois caminhos criando deal ao mesmo tempo (RD e nosso) para a mesma marca.
- Distribuição por sorteio ou não auditável. Tem que dar para mostrar, lead a
  lead, por que foi para aquela pessoa.
- Barreira em dois lugares de novo.
- Lead perdido em silêncio quando o RD ou o banco falha.

## 4. Regras de negócio (decisões do Junior)

- **Peso = peso da versão ativa das metas, com cadeia de prioridade.** O time
  da marca (SDRs + pesos) vem, nesta ordem: (1) versão ativa das metas do mês
  corrente; (2) última versão ativa que a marca já teve, em qualquer mês;
  (3) **time próprio da regra da marca**, cadastrado na aba de distribuição,
  só para marca que nunca teve meta (hoje: Instituto do Autismo, Scale
  Partner, Beauty Connection). O time próprio nunca vence uma meta publicada:
  no dia em que a meta existir, ela assume sozinha, e o card da marca mostra
  "distribuindo sem meta publicada" enquanto está em (2) ou (3). Com meta,
  mudar a distribuição é publicar e ativar uma versão nova. Só SDRs com
  `funcao = 'SDR'` e `peso > 0` na marca entram no rodízio.
- **Disponibilidade é separada da meta.** Cada SDR tem um estado "recebendo
  leads / fora" e ausências agendadas (de–até, motivo). Fora = sai do rodízio
  de leads novos em todas as marcas, os pesos dos demais são renormalizados,
  a meta não muda. Toda mudança de disponibilidade reinicia o contador das
  marcas em que a pessoa está (mesma regra "dali pra frente": quem volta de
  férias não recebe rajada para alcançar a cota). Transferir a carteira em
  andamento de quem está fora **não** faz parte desta entrega (seção 3).
- **Meta vale o mês inteiro; distribuição vale dali em diante.** Quando uma
  versão vira ativa (publicada, reativada, ou virada de mês), ou quando a
  disponibilidade de alguém da marca muda, o contador da marca zera naquele
  instante. Dali em diante cada lead vai para quem está
  mais abaixo do seu percentual, contando só o que foi distribuído desde essa
  marca de tempo. Não há "correr atrás" do que passou.
- **Conversão nova = deal novo, sempre**, mesmo com deal aberto do mesmo lead.
  Só o ruído técnico é descartado: mesmo e-mail + mesma marca + mesmo evento em
  menos de 10 minutos (escolha minha; ajustável na configuração geral).
- **Barreira por marca**: um campo do lead + lista de valores barrados. Marca
  sem barreira passa tudo. Sempre versionada.
- **Só Administrador** edita configuração e barreira, pelo catálogo de
  permissões existente. Leitura do log e das regras segue a permissão da aba.
- **Todas as 10 marcas entram desde já**, inclusive as que têm um SDR só
  (viram o caso trivial de 100%, mas passam pelo mesmo caminho e deixam o mesmo
  registro).
- **Mês sem versão ativa ainda** (dia 1 antes de publicar): é o item (2) da
  cadeia, a última versão ativa da marca, até a nova ser ativada.
- **Casos de borda não param o fluxo**: SDR com peso mas sem `user_id` ou
  inativo no cadastro de pessoas sai do rodízio e os pesos dos que sobram
  são renormalizados (escolha minha: com 50/20/30 e o de 20 inelegível, vira
  62,5/37,5). Só quando **nenhum** SDR é elegível o deal vai para o
  **responsável padrão** da marca (configuração) e o registro fica marcado
  como "fallback", com alerta. Se faltar até o responsável padrão, o lead
  fica na fila com alerta.
- **Um evento de conversão por marca basta.** Conferido nos 606 deals
  criados de 01 a 16/10/2026: todos os criados por automação vêm das 10
  automações da tabela (mais `testes_multistep`, de teste); os 12 sem
  campanha são deals manuais (Indicação, Parceiro, Repasse) e continuam
  manuais. Não há segundo caminho automático a desligar.

## 5. Algoritmo de escolha ("quem está mais abaixo do seu percentual")

Dado, para a marca M, o conjunto S de SDRs elegíveis (no time da marca pela
cadeia da seção 4, disponíveis, com `user_id`) com pesos renormalizados p_i
(somam 100) e o instante de reinício T (o mais recente entre: `ativada_em` da
versão em uso, a virada do mês, e a última mudança de disponibilidade de
alguém do time da marca):

1. n_i = quantos registros com `resultado = 'atribuido'` a pessoa i recebeu na
   marca M desde T (fallback não conta para ninguém).
2. N = Σ n_i.
3. Escolhe i que **minimiza** n_i − p_i × (N + 1) / 100, isto é, quem ficará
   mais abaixo da sua cota após receber este lead. Empate: maior peso; depois
   ordem alfabética.

Com 50/20/30 e 10 leads a sequência é determinística e fecha 5/2/3. É o
"smooth weighted round robin": sem sorteio, sem rajada, auditável.

A escolha roda **dentro do banco**, numa função que segura um advisory lock
por marca e grava o registro na mesma transação, para dois webhooks no mesmo
segundo nunca lerem o mesmo contador.

## 6. Arquitetura

```
RD Marketing ──webhook WEBHOOK.CONVERTED──▶ Edge Function `distribuir-lead` (Expansão)
                                               │ 1. autentica (segredo na URL), valida payload
                                               │ 2. evento → marca (config vigente); ignora evento desconhecido
                                               │ 3. dedup 10 min
                                               │ 4. barreira de MQL (versão vigente)        ─┐
                                               │ 5. rpc distribuicao_registrar_e_escolher()  │ 1 transação
                                               │ 6. POST /deals no RD CRM (retry 3×)         ─┘ (passo 5 grava
                                               │ 7. atualiza o registro com id_deal / erro       antes do POST)
                                               ▼
                                     distribuicao_atribuicao (log) ──▶ dashboard "Distribuição de Leads"
                                               │
             wf_5 / espelhar-rd ◀── RD CRM ◀───┘ (deal_snapshot como qualquer deal)
                                               │
RD Marketing automação de e-mail/tag/tarefa ◀── "[CRM] Negociação criada" (integração nativa CRM→MKT)
```

### 6.1 Webhook do RD Marketing

- **Um webhook só**, `WEBHOOK.CONVERTED`, `entity_type CONTACT`, apontando para
  `https://<ref>.supabase.co/functions/v1/distribuir-lead?chave=<segredo>`.
  A função roteia pelo `event_identifier`; identificador que não está na
  configuração de nenhuma marca é respondido com 200 e descartado (contado em
  métrica, não logado linha a linha). Motivo: a API não aceita a mesma URL em
  dois webhooks, e filtrar na função é mais simples que 10 webhooks com
  query strings diferentes.
- Se a tela do RD Marketing permitir filtrar por identificadores, o construtor
  lista os 10 identificadores configurados; senão recebe todas as conversões
  (volume baixo: ordem de poucos milhares por mês).
- Criação do webhook: pela tela "Integrações → Webhooks" do RD Marketing (o
  Junior ou eu no navegador com o OK dele). Via API exigiria token OAuth de
  um app do Marketing que não temos em mãos.
- O RD valida a URL com uma chamada no momento da criação (precisa 2xx), e
  reenvia quando o endereço não responde. A função responde 200 **sempre que
  recebeu e gravou** (mesmo que o POST no RD falhe depois), para o RD não
  reenviar duplicado; só responde erro se não conseguiu gravar o registro.
- O payload não tem assinatura. O segredo na URL (`?chave=`) é a
  autenticação: guardado no Vault (`distribuicao_webhook_chave`), a função
  rejeita com 401 quando não bate. `verify_jwt = false`.

### 6.2 Edge Function `distribuir-lead` (Supabase de Expansão)

Mesmo padrão de `espelhar-rd`: Deno/TS em `supabase/functions/distribuir-lead/`,
`SUPABASE_SERVICE_ROLE_KEY` do ambiente, `rd_token` via `get_secret`, log de
saúde em `sync_execucao` (job `distribuir_lead`, 1 linha por chamada que
chegou a avaliar uma marca; chamadas descartadas por evento desconhecido não
logam).

Passos, com o que grava em cada um:

1. **Autentica e valida.** Sem `chave` válida → 401. Sem `contact.email` ou sem
   `event_identifier` → 400 e linha em `sync_execucao` com o motivo.
2. **Roteia.** `event_identifier` → marca pela regra vigente (`vigente_ate IS
   NULL`). Marca com `modo = 'desligado'` → descarta (200).
3. **Dedup.** Existe registro da mesma marca + mesmo e-mail + mesmo evento com
   `recebido_em` nos últimos N minutos (config geral, padrão 10)? → grava
   registro com `resultado = 'duplicado'` e para.
4. **Barreira.** Lê `contact.<campo>` do payload (chave `cf_...` guardada na
   regra). Valor na lista de barrados → `resultado = 'barrado'`, com o valor
   lido. Campo ausente no payload → `resultado = 'barrado'` com motivo
   "campo vazio"? **Não**: campo ausente **passa** (decisão minha: hoje a
   condição do RD é "não é igual a X", e vazio não é igual a X; manter a mesma
   semântica evita mudar o volume de MQL na migração). Fica registrado como
   "campo vazio, passou" para o gestor ver.
5. **Escolhe e registra** via RPC `distribuicao_registrar_e_escolher(...)`
   (seção 7), que devolve `atribuicao_id`, `nome_sdr`, `user_id`, contadores e
   `fallback`. Em `modo = 'sombra'` a RPC registra com `resultado =
   'simulado'` e **não** desconta no contador real nem cria deal.
6. **Cria o deal** no RD CRM (`POST /api/v1/deals?token=`), 3 tentativas com
   espera crescente, respeitando 429/`Retry-After`:
   - `deal.name` = nome do lead (ou e-mail se vazio); `deal_stage_id` da regra;
     `user_id` do SDR;
   - `deal_custom_fields`: Marca (obrigatório), Fonte Macro = "Inbound",
     SDR Responsável = nome do SDR, Cidade/Estado do lead, Capital Disponível
     (ou Capital no IDA), utm_source/medium/campaign/term/content, Sub-Fonte
     quando a regra definir, e os demais campos do lead que a automação do RD
     copia hoje (o construtor copia a lista de um deal real criado em 16/10:
     Motivo Franquia, Tempo Abertura, Canal de Conexão…);
   - `campaign._id` = a campanha do CRM que a automação daquela marca grava
     hoje (ex.: "Eletrovias > CRM (Limpo)" = `69e0e12b7fe67b000120920d`),
     para nenhum relatório mudar; `deal_source` não é enviado (hoje fica
     "Desconhecido");
   - `contacts[]` com nome, e-mail e telefone do lead.
   Scale Partner e Beauty Connection: `deal.name` = "<Marca> - <primeiro
   nome>" (regra `nome_formato` opcional na configuração; é o que as
   automações dessas duas marcas fazem hoje).
7. **Fecha o registro**: `id_deal`, `resultado = 'atribuido'` (ou `'erro'` com a
   resposta do RD e `tentativas`). Erro → alerta no Teams.

Tempo esperado por chamada: < 2 s (uma leitura no banco, uma RPC, um POST).
Dentro do limite de CPU de 2 s da Edge Function com folga; sem varredura, sem
paginação.

### 6.3 Reprocessar

Botão na tela do log para registros `erro` (e `fallback`, se o gestor
quiser trocar o dono). Chama a própria Edge Function com `?reprocessar=<id>`:
reexecuta só os passos 5–7 sobre o payload guardado, sem passar de novo pelo
webhook. Um registro reprocessado com sucesso vira `atribuido`; o original
fica com `reprocessado_em`.

### 6.4 Modos por marca e virada (cutover)

`distribuicao_regra.modo` ∈ `desligado` · `sombra` · `ativo`.

- **sombra**: a função recebe, avalia e registra o que **faria** (`simulado`),
  sem criar deal. A automação do RD continua criando. Serve para comparar
  por alguns dias: mesmas conversões passando/barrando nos dois lados, e a
  distribuição simulada vs. a real.
- **ativo**: a função cria o deal. **No mesmo instante** o passo "Criar
  Negociação no CRM" é removido da automação daquela marca no RD Marketing, e
  o gatilho dela passa a ser "[CRM] Negociação criada" + funil/etapa de
  destino + Marca (ver 6.5). Uma marca por vez, começando pela Eletrovias.
- Enquanto uma marca está `ativo`, o dashboard mostra um aviso se a automação
  do RD ainda criar deal para ela (detectável: deal no espelho com campanha da
  marca, criado na janela, sem registro `atribuido` correspondente).

### 6.5 O que fica no RD Marketing

Cada automação "<marca> > CRM" perde o passo "Criar Negociação no CRM" e
troca o critério de entrada para: **converteu no evento "[CRM] Negociação
criada"** e "Funil de vendas no CRM (última atualização)" = funil de destino
e "Marca New" = marca (campos que a integração nativa CRM→Marketing já
alimenta, como a automação "Prosp Ativa" prova). Mantém e-mail da COF,
anotação, tag, tarefa, notificação.

Efeito desejado pelo Junior: deal criado **à mão** no CRM com e-mail passa a
receber a COF também. Deal manual sem e-mail não recebe em nenhum desenho: a
integração casa o contato pelo e-mail e não há para quem mandar. É regra de
processo (preencher e-mail ao criar), não de código.

**Verificação obrigatória antes da primeira virada**: criar um deal de teste
pela API (contato de teste que já converteu) e outro à mão com e-mail de quem
nunca converteu, e confirmar no RD Marketing que o lead recebe o evento
"[CRM] Negociação criada" e os campos de CRM (e, no segundo caso, se o lead é
criado no Marketing). Se a integração nativa
**não** refletir deals criados pela API, plano B: a Edge Function registra um
evento de conversão `mql_aprovado_<marca>` no lead via API do RD Marketing
(`POST /platform/events`, exige token OAuth de um app conectado), e a
automação passa a disparar por ele. O plano B entra no documento de plano só
se a verificação falhar.

As segmentações "Entrada Chatbot - <marca>" deixam de ter automação
pendurada; não são apagadas nesta entrega (podem servir de conferência).

### 6.6 Alertas

Teams, pelo mesmo canal das automações de No Show/Closer de hoje (URL do
webhook de entrada no Vault como `teams_alertas_url`; o Junior fornece).
Dispara em: `erro` depois das 3 tentativas, `fallback`, marca `ativo` sem
nenhum registro há mais de X horas em dia útil (config geral, padrão 6 h), e
automação do RD ainda criando deal para marca `ativo` (6.4).

## 7. Banco de dados (Supabase de Expansão `cygxmduuwlwfbodfrlkr`)

**Nada muda nas tabelas, views e funções existentes.** Tudo abaixo é novo.
`meta_versao`, `meta_marca`, `meta_pessoa`, `nome_cargo_foto` são só lidas.

### 7.1 `distribuicao_regra` — configuração por marca, versionada (append-only)

| coluna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| marca | text | nome canônico igual ao de `vw_funil_vendas.marca` |
| versao | int | 1, 2, 3… por marca |
| vigente_de | timestamptz | |
| vigente_ate | timestamptz null | null = vigente. Índice único parcial: 1 vigente por marca |
| modo | text | `desligado` · `sombra` · `ativo` |
| evento_identificador | text | ex. `eletrovias_multistep` |
| id_funil / id_etapa | text | destino no RD CRM |
| campaign_id | text null | campanha do CRM gravada no deal |
| barreira_campo | text null | chave do campo no payload do webhook (`cf_…`) |
| barreira_valores_barrados | text[] | vazio = sem barreira |
| responsavel_padrao_user_id | text | fallback |
| nome_formato | text null | ex. `Scale Partner - {primeiro_nome}` |
| campos_extra | jsonb | mapeamento lead → custom field do CRM além do padrão |
| criado_por / criado_em / motivo | | quem, quando, por quê |

Toda mudança = INSERT de versão nova + UPDATE do `vigente_ate` da anterior,
numa RPC `distribuicao_publicar_regra` (abaixo). Linhas nunca são apagadas
nem editadas depois (trigger `*_imutavel`, mesmo padrão de `meta_versao`,
liberando só `vigente_ate`).

### 7.2 `distribuicao_atribuicao` — log de toda conversão recebida

| coluna | nota |
|---|---|
| id bigserial PK, recebido_em | |
| marca, evento_identificador, regra_id (FK) | a versão da regra avaliada |
| lead_email, lead_uuid, lead_nome, payload jsonb | payload inteiro, para reprocessar e auditar |
| resultado | `atribuido` · `barrado` · `duplicado` · `simulado` · `fallback` · `erro` |
| motivo | texto curto ("Capital = Até R$ 50 mil", "SDR sem user_id") |
| barreira_valor_lido | o valor do campo no payload |
| meta_versao_id (FK), reinicio_em | versão e instante T usados nos contadores |
| nome_sdr, user_id | escolhido (ou responsável padrão) |
| contadores jsonb | `{"Sarah Padilha": [n, p], …}` no momento da escolha |
| id_deal, tentativas, erro_rd | preenchidos no passo 7 |
| reprocessado_em, reprocessado_por | |

Índices: (marca, recebido_em), (lead_email, marca, recebido_em), (resultado).
RLS ligado, sem policy: o front lê por **view** (padrão da seção 5 do
CLAUDE.md — `supabaseVendas` é `anon`), e a view **não expõe `payload`**
(tem telefone e respostas do lead); expõe nome, e-mail, resultado, motivo,
SDR, contadores, deal, datas.

### 7.3 `distribuicao_disponibilidade` — estado e ausências por SDR

| coluna | nota |
|---|---|
| id, nome_sdr (= `nome_cargo_foto.nome`) | |
| tipo | `fora_agora` (até segunda ordem) · `ausencia` (agendada) |
| inicio, fim | `fim` null em `fora_agora` |
| motivo, criado_por, criado_em, encerrado_em | histórico: linha nunca é apagada, só encerrada |

"Disponível agora" = sem linha aberta cobrindo `now()`. A RPC de escolha lê
esta tabela; a tela mostra, por SDR, o estado e as próximas ausências, com
botões "fora hoje" / "voltou" / "agendar ausência".

`distribuicao_regra` ganha a coluna `time_proprio jsonb null` (lista de
`{nome, peso}`), usada só no item (3) da cadeia da seção 4.

### 7.4 `distribuicao_config` — configuração geral (1 linha por chave)

`janela_dedup_min` (10), `alerta_silencio_horas` (6), `retries_rd` (3).

### 7.5 Funções

- **`distribuicao_registrar_e_escolher(p_marca, p_regra_id, p_lead jsonb,
  p_modo)`** → `{atribuicao_id, nome_sdr, user_id, fallback, contadores}`.
  `pg_advisory_xact_lock(hashtext('distribuicao:'||p_marca))`; resolve o time
  pela cadeia da seção 4 e T; elegíveis = SDRs do time com `funcao='SDR'`,
  `peso>0`, `user_id` em `nome_cargo_foto` (ativo) e disponíveis em
  `distribuicao_disponibilidade`; renormaliza os pesos; conta `atribuido`
  desde T; aplica a seção 5; insere o registro e devolve (inclusive qual
  item da cadeia foi usado). Só `service_role` executa.
- **`distribuicao_alterar_disponibilidade(p jsonb, p_autor)`** — abre ou
  encerra uma linha de disponibilidade; chamada por `gravar-distribuicao`.
- **`distribuicao_publicar_regra(p jsonb, p_autor)`** → versão nova. Só
  `service_role`; chamada pela Edge Function `gravar-distribuicao` (abaixo).
- **`distribuicao_fechar(p_id, p_id_deal, p_erro, p_tentativas)`** — passo 7.
- **View `vw_distribuicao_atribuicoes`** (sem payload) e **view
  `vw_distribuicao_painel`**: por marca vigente, cada SDR com peso alvo,
  recebidos desde T e desvio; usada pela tela.

### 7.6 Supabase de Marketing (`jmuluoksnlqrvzbcltim`) — nada é criado nem alterado

O Marketing só entra porque é onde mora o controle de acessos do dashboard
(papéis, permissões, usuários). As duas permissões novas são declaradas **no
código**, no catálogo `src/lib/permissoes.ts`: `aba.distribuicao`
("Distribuição de Leads", rota `/distribuicao-leads`, área Vendas) e
`acao.distribuicao-editar` ("Configurar distribuição de leads e barreira de
MQL"). O papel Administrador tem acesso total e as recebe sozinho; os outros
papéis ficam sem até alguém marcar na tela Usuários & Acessos (que grava em
`acesso_papel_permissoes`, como para qualquer aba). Nenhum SQL, tabela ou
linha nova no Marketing. A função `gravar-distribuicao` só **lê** de lá, via
`tem_permissao`, igual a `gravar-meta`.

### 7.7 Edge Function `gravar-distribuicao` (Expansão)

Mesmo molde de `gravar-meta`: valida a sessão do usuário contra o Marketing,
exige `tem_permissao('acao.distribuicao-editar')`, e só então chama
`distribuicao_publicar_regra` com `service_role`. É o único caminho de
escrita da configuração — a chave anon não escreve nada.

### 7.8 Consequências checadas

- `vw_funil_vendas`, `vw_funil_etapas_v2`, `vw_deal_origem_comercial` e o
  resto da cadeia não são tocadas. O deal entra em `deal_snapshot` pelo
  `wf_5`/`espelhar-rd` como hoje; `origem_comercial` continua `Inbound`
  (nenhum evento no funil Prospecção Ativa).
- `from_rdsm_integration` (marca do RD de deal criado pela integração
  Marketing) **não** é lida por nada no repositório (grep em `src`,
  `supabase`, `docs`: 0 ocorrências). Deals via API não terão a flag; sem
  efeito.
- `campaign` do deal não entra em nenhuma view do dashboard (o front lê
  `utm_campaign`, campo personalizado). Mantido igual ao de hoje por
  prudência.
- A fonte `campo_rd` de `nome_sdr` passa a ficar preenchida já na criação
  ("SDR Responsável" = SDR escolhido), o que só reforça a eleição de SDR das
  views.
- Volume: ~1.000 MQL Inbound/mês hoje; a tabela de log cresce na casa de
  poucos milhares de linhas/mês. Sem custo relevante.
- O plano Pro da Expansão não muda.

## 8. Dashboard — aba "Distribuição de Leads" (Vendas, rota `/distribuicao-leads`)

Só Administrador vê e edita (permissões acima). Nome e e-mail do lead no
log ficam legíveis pela chave anon, como na Linha do Tempo (aceito pelo
Junior em 16/10). Quatro blocos:

1. **Painel por marca** (um card por marca da configuração): modo
   (desligado/sombra/ativo), evento, funil/etapa de destino, barreira vigente
   em texto ("barra Até R$ 50 mil e De R$ 50 mil a R$ 100 mil"), e a tabela de
   SDRs: peso alvo (da versão ativa, com link para Configuração das Metas),
   recebidos desde T, % recebido e desvio. Rodapé: "contador reiniciado em
   <T> pela versão <rótulo>". Botão **Editar regra** (abre a edição; salvar =
   publica versão nova com motivo obrigatório) e **Histórico** (lista as
   versões com diff em texto).
2. **Log de atribuições**: filtros por marca, resultado, SDR, período, e-mail;
   colunas data, lead, marca, resultado/motivo, versão da regra, SDR,
   contadores no momento, deal (link RD + Linha do Tempo). Linha `erro` tem
   botão **Reprocessar**; `fallback` mostra por quê.
3. **Disponibilidade dos SDRs**: lista de SDRs ativos com estado (recebendo /
   fora desde…), próximas ausências agendadas, botões "fora hoje", "voltou",
   "agendar ausência" (de–até, motivo). Mudança aqui reinicia o contador das
   marcas da pessoa, e o painel avisa isso antes de confirmar.
4. **Saúde**: último webhook recebido por marca, erros pendentes, aviso de
   "RD ainda criando deal" (6.4).

A edição da barreira é um formulário simples: campo do lead (lista das
chaves `cf_*` já vistas nos payloads daquela marca, com opção de digitar) e
lista de valores barrados (sugeridos a partir dos valores já vistos). Sem
editor de expressão. Layout segue os padrões `rs-*` da seção 7 do CLAUDE.md.

## 9. O que precisamos do Junior antes de construir

1. OK para criar o webhook no RD Marketing (eu faço no navegador) e para
   editar as automações "<marca> > CRM" na virada de cada marca.
2. URL do webhook de entrada do Teams para os alertas (vai pro Vault, não
   pro repositório).

## 10. O que fica para o construtor decidir

- Nomes exatos das chaves `cf_*` de cada campo no payload do webhook:
  capturar 1 payload real por marca com a função em modo `sombra` antes de
  configurar as barreiras (é o primeiro passo do plano).
- Comportamento do `POST /deals` com contato já existente no CRM (cria
  contato duplicado ou reaproveita?): testar com um e-mail de teste e, se
  duplicar, buscar o contato por e-mail em `/contacts` e enviar o `_id`.
- Se o POST exige os campos personalizados marcados "obrigatório" no CRM
  (Cidade, Estado, Canal de Conexão, Temperatura…): testar; a automação do RD
  cria sem eles, então a API provavelmente também aceita.
- Formato dos contadores no card e no log.
- Estratégia de teste: função pura para o algoritmo da seção 5 (vitest, com o
  cenário 50/20/30 × 10 leads e mudança de versão no meio), teste da RPC em
  SQL com rollback, e virada em `sombra` por ≥ 3 dias úteis na Eletrovias
  antes do `ativo`.

## 11. Ordem de entrega sugerida

1. Banco: tabelas, funções, views, permissões no catálogo.
2. Edge Function `distribuir-lead` em modo `sombra` + webhook do RD Marketing
   apontando para ela. Capturar payloads reais.
3. Tela do dashboard (painel, log, edição de regra) + `gravar-distribuicao`.
4. Configurar as 10 regras pelo dashboard, conferir o `sombra` contra o que
   o RD criou.
5. Virada marca a marca (Eletrovias primeiro), editando a automação do RD
   no mesmo ato. Verificação do "[CRM] Negociação criada" antes da primeira.
