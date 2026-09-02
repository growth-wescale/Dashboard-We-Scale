# Hub de Configuração de Metas — design

Data: 2026-09-02
Autor: Claude Code, com decisões do Junior
Status: aprovado em conversa, pendente revisão do spec escrito

---

## 1. O problema

Hoje a meta de cada mês nasce numa planilha (`Metas 2026.xlsx`, OneDrive) e é
transcrita à mão para a tabela `DB_Metas_Performance` no Supabase de Expansão.
Três consequências:

1. **A lógica não fica gravada.** A planilha guarda o *resultado* (5 vendas no
   Inpot), não a *receita* (que taxa foi usada, o que era âncora, quem decidiu).
   Quando a metodologia muda, não dá para saber com que régua o mês passado foi
   medido.
2. **A metodologia é rígida.** As contas estão presas nas fórmulas das células.
   Mudar "derivar SQL de ligação" para "derivar SQL do SAL" significa reescrever
   a planilha.
3. **Não existe meta semanal no sistema.** O time passou a trabalhar com meta por
   semana (SDR e Closer), e isso só existe na planilha.

O dashboard deixa de ser só leitura: passa a ter um **hub de lançamento**.

## 2. Decisões tomadas

| # | Decisão | Quem decidiu |
|---|---|---|
| D1 | O funil é **configurável**, não fixo em código: cada etapa é *fixa*, *derivada* ou *desligada*; derivada pode puxar de **qualquer** outra etapa, não só da vizinha | Junior |
| D2 | A unidade de configuração é a **marca**; dentro dela o gerente escolhe as pessoas do mês (pode mudar todo mês) e a meta individual de cada uma | Junior |
| D3 | Meta da marca vira meta individual por **rateio de peso ajustável**, com a soma travada na meta da marca | Junior |
| D4 | O **gerente define o calendário de semanas** (hoje terça→segunda, mutável) e **distribui os números pelas semanas na mão** — o sistema não rateia sozinho | Junior |
| D5 | As taxas de conversão vêm **sugeridas pelo histórico real**, mas vale sempre a que o gerente confirmou | Junior |
| D6 | Sem controle de permissão por ora — o login do dashboard ainda vai ser fortificado. Desenhar para plugar depois | Junior |
| D7 | **Tabelas novas**; a `DB_Metas_Performance` continua existindo como **espelho automático**, para não quebrar leitores atuais | Junior |
| D8 | Setembro/2026 entra pré-preenchido a partir da planilha, usando a aba **Segundo Semestre** (não a Acompanhamento 2026, cuja coluna de quantidade está desatualizada) e a tabela **de baixo** da aba SDRs | Junior |
| D9 | **Odonto Scale entra** na meta, com ticket **R$ 5.597** | Junior |

## 3. O motor de meta

### 3.1 Etapas

As 12 etapas do funil do dashboard (`STAGE_ORDER` em `src/lib/metrics.ts`), mais
duas que a planilha usa e o funil do RD não tem:

```
Ligações → MQL → Tentando Contato → Contato Efetivo → Interesse Reunião
  → Conexão → Reunião Agendada SQL → Reunião Realizada (Diagnóstico) → SAL
  → Oportunidade COF → Comitê → Pré-Contrato → Fechamento → Faturamento
```

- **Ligações** não é etapa do RD. O realizado vem de `db_tarefas_sdr`
  (`type='call'`, `done=true`), que tem marca, pessoa e data — 17.863 ligações
  concluídas desde out/2025. A tabela estava listada como "não usada" no
  CLAUDE.md; passa a ser usada.
- **Faturamento** = `Fechamento × ticket médio da marca`. O ticket é um valor
  fixo por marca, gravado no mês.
- "Reunião Realizada" é o rótulo de negócio para a etapa que o dashboard chama
  de **Diagnóstico** (`data_reuniao_realizada`). Mesmo dado, dois nomes — o hub
  usa o nome de negócio, o resto do dashboard segue com o seu.

### 3.2 Modos

Cada etapa, em cada marca, em cada mês, é uma de três coisas:

- **`fixo`** — o gerente digita o número. É uma âncora.
- **`derivado`** — sai de outra etapa (`origem`) por uma `taxa`.
- **`desligado`** — não participa da meta desse mês nessa marca.

**A taxa é sempre digitada no sentido natural do funil** ("40% do SAL vira
Oportunidade"). O motor sabe, pela ordem das etapas, se a origem está acima ou
abaixo do destino, e multiplica ou divide sozinho. O gerente nunca digita uma
taxa invertida.

### 3.3 Resolução

O conjunto de etapas de uma marca forma um grafo de dependências. O motor:

1. Monta o grafo (nó derivado aponta para sua origem).
2. **Detecta ciclo** (A deriva de B e B deriva de A) e recusa a configuração com
   mensagem clara, apontando as etapas envolvidas. Nunca calcula com ciclo.
3. Detecta nó derivado cuja origem está `desligada` — também é erro de
   configuração, não silêncio.
4. Resolve em ordem topológica a partir das âncoras.

Uma marca precisa de **pelo menos uma âncora**; zero âncoras é erro.

### 3.4 Âncoras nas duas pontas

Quando o gerente fixa topo **e** fundo (o caso de setembro: ligações fixas e
fechamento fixo), a taxa entre eles não é digitada — é **implícita** e o sistema
a exibe: "no Inpot, os 26,4 SAL do topo com 5 vendas no fundo implicam 18,9% de
conversão SAL→venda".

Se o gerente fixar as duas pontas **e** digitar a taxa do meio, as duas correntes
discordam. O motor **não escolhe uma**: mostra o gap na etapa de encontro.
Exemplo real, com os números da planilha de hoje: o lado SDR entrega 86,9 SAL; se
as 22 vendas fossem convertidas a 25%, o fundo pediria 88 SAL. Hoje ninguém vê
esse encontro.

## 4. A tela

Aba nova, **Metas**, no grupo de Vendas. Abre no mês vigente. Trilha de 5 passos
com progresso salvo — dá para parar no meio.

**Passo 0 · Abrir o mês.** Seletor de mês. Mês vazio oferece **"Copiar de
&lt;mês anterior&gt;"**, que traz semanas, taxas, alocação de pessoas e pesos
prontos para ajuste. Sem isso, todo dia 1 é redigitar 7 marcas do zero.

**Passo 1 · Semanas.** Escolhe o dia de virada (padrão: terça) e o sistema monta
as semanas do mês com as datas na tela, editáveis nas bordas. Fica gravado
naquele mês: mudar a virada em 2027 não mexe em 2026.

**Passo 2 · Funil por marca.** Um cartão por marca. Cada etapa mostra modo, taxa
e resultado, recalculando em cascata enquanto digita. A sugestão histórica
aparece ao lado **com o tamanho da base** — ver §6.

**Passo 3 · Pessoas da marca.** Escolhe do roster (`nome_cargo_foto`) quem é SDR
e quem é Closer daquela marca naquele mês, e ajusta o peso de cada um. A soma
dos pesos trava em 100% da meta da marca.

**Passo 4 · Distribuição semanal.** Grade pessoa × semana. **O gerente digita
cada número.** O sistema não distribui — apenas mostra quanto falta alocar e
acusa quando a soma passa da meta do mês.

**Passo 5 · Revisar e publicar.** Consolidado do mês, comparação com o mês
anterior, gaps e avisos. Só ao **publicar** o número passa a valer no resto do
dashboard.

### 4.1 Rascunho × publicado

Enquanto o gerente monta, o mês fica em **rascunho** e o resto do dashboard
ignora. A Visão Macro e a Performance Detalhada nunca mostram meta pela metade.
Publicar é uma ação explícita.

Editar um mês passado abre a mesma tela com a configuração **congelada daquele
mês**, e um aviso de que está mexendo em mês fechado. Meses passados continuam
editáveis (D6: sem trava por ora).

## 5. Dados

### 5.1 Tabelas novas (Supabase de Expansão, `cygxmduuwlwfbodfrlkr`)

- **`meta_mes`** — um registro por mês: status (rascunho/publicado), dia de
  virada da semana, quem publicou e quando.
- **`meta_semana`** — as semanas daquele mês, com data de início e fim.
- **`meta_marca`** — por mês e marca: ticket médio e a configuração de cada
  etapa (modo, taxa, origem). Guarda a **receita**, não só o resultado.
- **`meta_pessoa`** — por mês, marca e pessoa: função e peso.
- **`meta_pessoa_semana`** — o número que o gerente alocou em cada semana, por
  pessoa e etapa.
- **`meta_log`** — histórico de alterações (quem, quando, de quanto para
  quanto). Gravado desde já, mesmo sem controle de permissão, porque é barato
  agora e caro de reconstruir depois.

O resultado calculado é **derivado**, não gravado como fonte da verdade — exceto
no espelho (§5.2), que existe para consumo externo.

### 5.2 O espelho

Ao publicar, o sistema reescreve as linhas daquele mês em
`DB_Metas_Performance`, no formato que ela já tem (mês × marca × pessoa ×
função, totais mensais). Consumidores atuais seguem intactos:

- `src/hooks/useMetasPerformance.ts` → Performance Detalhada e o card de Meta da
  Visão Macro
- qualquer automação n8n / relatório que leia a tabela

A meta **semanal** não cabe no formato antigo e vive só nas tabelas novas.

### 5.3 Congelamento histórico

O requisito central ("mudar a lógica em outubro não pode mexer em setembro") é
atendido porque **cada mês guarda sua própria configuração completa**: semanas,
âncoras, taxas, ticket, alocação de pessoas e pesos. Não há tabela global de
taxas que, ao ser editada, reescreva o passado.

Editar um mês passado recalcula **com as taxas daquele mês**, não com as de
hoje.

## 6. Sugestão de taxa pelo histórico

Ao lado de cada taxa, o sistema oferece a conversão real calculada de
`vw_funil_vendas`, em três recortes (últimos 3 meses, últimos 6, mesmo mês do
ano anterior), **sempre acompanhada do tamanho da base**.

Isso é obrigatório, não decorativo. Medido em 2026-09-02, ciclo atual,
jun–ago/2026:

| Marca | SQL | Reunião | SAL | Opp | Venda |
|---|---:|---:|---:|---:|---:|
| Eletrovias | 135 | 91 | 56 | 20 | 2 |
| B2Case | 89 | 54 | 35 | 12 | 3 |
| Inpot | 60 | 50 | 29 | 10 | 1 |
| Viva | 23 | 14 | 7 | 1 | 0 |
| Oral Unic | 16 | 8 | 3 | 0 | 1 |
| Odonto Scale | 14 | 9 | 9 | 0 | 5 |
| Lisô Laser | 3 | 4 | 4 | 1 | 1 |

Lisô Laser com 3 SQL e Oral Unic com 0 oportunidade não sustentam taxa alguma.
Regras:

- Abaixo de um piso de volume, a sugestão da marca é **suprimida** e o sistema
  oferece a do consolidado, rotulada como tal.
- A base sempre aparece ("hist: 58% — 50 reuniões"), nunca a taxa sozinha.
- Quando a taxa digitada diverge muito da histórica, o sistema **avisa** sem
  bloquear ("você está pedindo 2,7 p.p. acima do histórico recente").

## 7. Segurança do caminho de escrita

Este é o **primeiro caminho de escrita do dashboard no Supabase de Expansão** —
hoje toda escrita do app (`useSopLeituras`, `useCadencias`) vai para o Supabase
de Marketing, onde o usuário está autenticado.

Estado atual medido: `DB_Metas_Performance` tem RLS **ligada** com uma única
política, de `SELECT` para `anon` e `authenticated`. Não há escrita liberada.

**Não abrir política de escrita para `anon`.** A anon key do dashboard está
exposta no histórico do git de um repositório público (pendência já registrada
no CLAUDE.md §8). Liberar escrita para ela significa permitir que qualquer
pessoa com a chave reescreva as metas da We Scale.

**Caminho escolhido:** uma Edge Function no projeto de Expansão (mesmo padrão de
`supabase/functions/espelhar-rd/`, já em produção) que:

1. Recebe a gravação do dashboard junto com o token de sessão do usuário.
2. Valida esse token contra o Supabase de **Marketing** (onde o login vive).
3. Só então grava, usando `service_role` buscada do Vault em tempo de execução —
   nunca em texto plano no código ou no cron.

A leitura continua direta pela anon key (RLS de SELECT já permite).

Quando o login for fortificado (D6), a lista de autorizados entra **nessa
função**, num único ponto.

## 8. Semente de setembro/2026

Origem: aba **Segundo Semestre** (vendas), aba **SDRs** tabela **de baixo**
(lado SDR), aba **Closer** (alocação de closers e Odonto Scale).

| Marca | Lig./mês | SQL | Reunião | SAL | Opp | Vendas | Ticket | Faturamento |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Inpot | 1.557,6 | 67,1 | 42,9 | 26,4 | 10,6 | 5 | 74.900 | 374.500 |
| Eletrovias | 3.049,2 | 55,0 | 31,9 | 18,7 | 7,5 | 4 | 39.900 | 159.600 |
| B2Case | 2.481,6 | 55,0 | 31,9 | 18,7 | 7,5 | 4 | 10.000 | 40.000 |
| Oral Unic | 1.039,5 | 30,8 | 17,6 | 11,0 | 4,4 | 2 | 74.900 | 149.800 |
| Lisô Laser | 1.240,8 | 22,0 | 11,0 | 5,5 | 2,2 | 1 | 39.900 | 39.900 |
| Viva | 531,3 | 15,4 | 9,9 | 6,6 | 2,6 | 1 | 69.900 | 69.900 |
| Odonto Scale | — | — | — | — | — | 5 | 5.597 | 27.985 |
| **Total** | **9.900** | **245,3** | **145,2** | **86,9** | **34,8** | **22** | | **861.685** |

Odonto Scale entra com o lado SDR **desligado** (D9) — não tem SDR alocado na
planilha.

Alocação de setembro (muda em relação a agosto):

| Marca | SDR | Closer |
|---|---|---|
| Inpot | Thiago + Xayane | Douglas |
| Lisô Laser | Thiago + Xayane | Jéssica |
| B2Case | Thiago + Xayane | **Bruna** (era Jéssica) |
| Oral Unic | Sarah Padilha | Aurélio Briano |
| Viva | Sarah Padilha | Aurélio Briano |
| Eletrovias | Sarah Padilha + Thiago | Jéssica |
| Odonto Scale | — | **Aurélio Briano** (era Vanessa Daniel) |

Todos os nomes existem em `nome_cargo_foto`. Peso inicial 50/50 quando há duas
pessoas — o gerente ajusta.

### 8.1 Incoerências da planilha, preservadas de propósito

A semente reproduz a planilha ao decimal, e por isso carrega duas incoerências
dela. Ambas ficam **visíveis** no hub, o que é o ponto:

1. **As taxas por marca não formam corrente coerente.** SQL por ligação varia de
   1,77% (Lisô) a 4,31% (Inpot). Isso não é comportamento de marca: é efeito do
   método de rateio da planilha, em que cada coluna é distribuída por um mix
   diferente, então as linhas de uma mesma marca não se conversam.
2. **Ligações/dia e ligações/mês usam mixes diferentes.** No Inpot, 66,4/dia ×
   22 dias = 1.460, mas a planilha traz 1.557,6 na coluna de mês (~6% de
   diferença), porque a tabela de origem usava 24 dias úteis para uns e 21 para
   outros. A semente usa **ligações/mês** como âncora e deriva o /dia dividindo
   por 22.

Nenhuma das duas é corrigida na semente — corrigir seria mudar a meta que o time
já combinou. Ficam registradas para o gerente decidir em outubro.

## 9. Verificação

- **Teste de aceitação do motor:** reproduzir a planilha de setembro número a
  número — 9.900 ligações, 245,3 SQL, 145,2 reuniões, 86,9 SAL, 22 vendas,
  R$ 861.685. Divergência reprova.
- **Testes unitários** (vitest, padrão já existente no repo) das funções puras:
  resolução topológica, detecção de ciclo, origem desligada, ausência de âncora,
  rateio por peso com trava de soma, geração de semanas a partir do dia de
  virada, soma semanal versus meta do mês.
- **Checksum do espelho:** publicar setembro e conferir que
  `DB_Metas_Performance` recebe exatamente as linhas esperadas, e que os meses
  anteriores ficam byte a byte intactos.
- **Regressão de leitura:** Performance Detalhada e o card de Meta da Visão
  Macro continuam mostrando os mesmos números para agosto depois da mudança.
- **Build de produção** via `~/ws-dashboard-build` (`npm run build` com `tsc -b`,
  mais `npx vitest run`), conforme CLAUDE.md §7 — a pasta está no OneDrive e o
  build local é inviável.

## 10. Fora de escopo

- **A competição de bonificação.** Junior ainda está escrevendo a lógica num
  `.md`. Este spec cobre apenas a **configuração de metas**. A meta semanal por
  pessoa fica gravada e o realizado semanal já existe (vendas em
  `vw_funil_vendas`, ligações em `db_tarefas_sdr`), então o dado necessário
  estará pronto.
- **Controle de permissão por usuário** (D6), a plugar na Edge Function depois.
- **Trava de mês fechado** — meses passados seguem editáveis.
- **Aposentar a `DB_Metas_Performance`** e migrar as telas que a leem (D7).
- **Metas separadas por Inbound × Prospecção Ativa** — pendência já conhecida no
  CLAUDE.md §8, não resolvida aqui.
- **Acompanhamento semanal na tela** (pacing por semana). O dado passa a existir;
  exibi-lo é trabalho seguinte.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Anon key exposta ganhar poder de escrita | Escrita só por Edge Function com `service_role` do Vault; anon segue só leitura (§7) |
| Mês publicado pela metade quebrar a Visão Macro | Estado rascunho/publicado; só publicado é lido (§4.1) |
| Sugestão histórica virar número falso em marca de baixo volume | Piso de volume, base sempre exibida, fallback ao consolidado (§6) |
| Configuração com ciclo produzir número silenciosamente errado | Detecção de ciclo recusa a configuração antes de calcular (§3.3) |
| Volume de digitação no dia 1 desanimar o uso | "Copiar do mês anterior" no passo 0; progresso salvo entre passos (§4) |
| Espelho e tabelas novas divergirem | Espelho é reescrito inteiro no publish, nunca editado à mão |
