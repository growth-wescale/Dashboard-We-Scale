# Dashboard We Scale — Contexto para Claude Code

> Este arquivo é carregado automaticamente em toda conversa nesta pasta.
> **Ao terminar qualquer mudança no dashboard ou no banco, registre em "Histórico
> de mudanças" no fim do arquivo** e atualize a seção correspondente aqui em cima.

---

## 1. O que é

Dashboard de performance de **marketing e vendas** da We Scale. Duas áreas com
donos diferentes convivendo no mesmo app:

| Área | Abas | Dono |
|---|---|---|
| Marketing | Visão Geral, Saúde da Marca, Acompanhamento Meta, Cadências, S&OP Marketing, Análise de Termos | Gabriel |
| **Expansão / Vendas** | **Visão Macro, Performance Detalhada, Análise de Perda, Análise de Objeções** | **Junior** |

**Junior mexe só nas abas de Vendas** — e, dentro delas, não em Análise de Objeções.

- **Stack**: React 19 + TypeScript + Vite + Tailwind 4 + Supabase + React Router 7
- **Produção**: https://dashboard.srv1816822.hstgr.cloud
- **Repositório**: https://github.com/growth-wescale/Dashboard-We-Scale

---

## 2. Os DOIS Supabase (a confusão mais cara deste projeto)

| Projeto | Ref | Serve para |
|---|---|---|
| Marketing | `jmuluoksnlqrvzbcltim` | mídia paga, leads, SOP, termos |
| **Expansão** | **`cygxmduuwlwfbodfrlkr`** | **funil, metas, perdas, cadências, event sourcing** |

Clientes separados no código: `src/lib/supabase.ts` (Marketing) e
`src/lib/supabaseVendas.ts` (Expansão).

**Regra**: tudo de Vendas vem do Supabase de Expansão. A única coisa que ainda
vem do Marketing nas abas de Vendas é **investimento de mídia**, que sustenta
CAC e ROAS.

### Fonte da verdade é o RD Station, não o Supabase

`deal_snapshot` é **espelho** do RD CRM (UPSERT por `id_deal` via webhook n8n).
Escrever direto nele é sobrescrito no próximo sync. Mudança de dado de negócio
tem que ser feita **no RD via API**, e o espelho se atualiza sozinho.

```
RD Station CRM ──webhook──> processar_deal_evento() ──> deal_snapshot + deal_eventos
                                                              └──> views ──> dashboard
```

---

## 3. Modelo de dados de Expansão

### Tabelas centrais

| Objeto | O que é |
|---|---|
| `deal_snapshot` | estado atual de cada deal (espelho do RD). `payload` jsonb tem os campos personalizados |
| `deal_eventos` | log append-only de eventos (mudança de etapa, ganho, perda, troca de responsável, mudança de funil, mudança de fonte macro) |
| `vw_deal_ciclo_enriquecido` | 1 linha por **ciclo de vida** do deal. Chave composta `id_lead + ciclo` |
| **`vw_funil_vendas`** | **base das abas de Vendas.** Projeção da anterior com allowlist de funis, sem deals de teste e sem Excluído |
| `vw_funil_etapas_v2` | eventos de passagem por etapa — base dos modos de contagem |
| `vw_deal_etapa_periodos` | entrada/saída por etapa — base do modo Aging |
| `vw_leadtime_stats` | percentis p25/p50/p75/p95 por etapa e marca |

`vw_marketing_funil` é a view **antiga**; ainda serve Performance Detalhada e
Análise de Perda até elas serem migradas. Não usar em código novo.

### Campos que importam

- `fonte_macro` — classificação de negócio: `Inbound`, `Resgate`, `Prospecção Ativa`, `Sem Classificação`. Vem de `payload->>'Fonte Macro'`
- `sub_fonte` / `utm_source` — origem de tráfego (meta, google, ig…). Dimensão **ortogonal** à fonte macro
- `quantidade_unidades` — quantidade de franquias do produto anexado ao deal no RD. Disponível em **qualquer** etapa/status (não só Ganho); vale 1 quando o deal não tem produto com quantidade diferente
- `ciclo` / `eh_reciclagem` / `eh_ciclo_atual` — um deal perdido e reciclado tem várias linhas

### Event Sourcing dirigido por configuração

Para rastrear um campo novo do payload **basta inserir uma linha** — sem tocar
em função nem no n8n:

```sql
insert into event_fields_config
  (nome_campo, tipo_evento, caminho_json, ativo, modo_processamento, label_no_payload)
values
  ('Meu Campo', 'mudanca_meu_campo', 'payload.Meu Campo', true, 'config', 'Meu Campo');
```

`processar_deal_evento` lê essa tabela e compara o payload antigo com o novo.

---

## 4. Regras de negócio (não quebrar)

**Trava de venda.** Só é venda se `status_atual = 'Ganho'`. `data_venda`
preenchida não basta — deals revertidos mantêm a data.

**Fechamento não é etapa.** No histórico de eventos, ganho é um *tipo de
evento*, não etapa. Contar Fechamento sempre pela trava de venda, nunca
procurando etapa no event sourcing.

**"Reunião Agendada SQL" só conta no funil do Closer** (`69b1badfe1def700137f1b89`).
A etapa existe também no SDR, e o handoff SDR→Closer gera dois eventos para a
mesma reunião. Duas reuniões só quando o deal **reentra** na etapa do Closer.

**Passagens ≥ Deals únicos, sempre.** Os dois modos leem o histórico de eventos;
a deduplicação do modo único é por `(deal, ciclo, mês)` **depois** dos filtros.
Não usar `rn_deal_etapa_mes` do banco: a partição ignora funil.

**Aging exige deals vivos.** `vw_deal_etapa_periodos` não fecha o período quando
o deal é perdido. Sem cruzar com `status_atual = 'Em andamento'` e
`eh_ciclo_atual`, "Tentando Contato" mostra 1.959 deals parados há 95 dias em
vez de 105 há 10 dias.

**O funil não é monotônico.** Deals pulam etapas: em ago/26, Pré-Contrato (3) >
Comitê (2). Taxa de passagem acima de 100% é normal, exibida com seta pra cima.

**Marca do evento não é confiável.** `deal_eventos.marca` (e portanto
`vw_funil_etapas_v2.marca`) é um retrato denormalizado gravado na ingestão:
nulo em ~17% dos eventos de ago/26, e 0% preenchido na origem
`api_backfill_stage_history`. A marca confiável é a do **deal** —
`vw_funil_vendas.marca` no dashboard, `deal_snapshot.marca` no SQL (é o que a
RPC do relatório diário já faz). Nunca filtrar evento por marca.

**Deal sem marca é invisível.** As views exigem marca preenchida. Deals sem
marca no RD não aparecem no dashboard, nem no Consolidado.

**Período em curso termina hoje**, não no último dia. Senão o mês corrente
compete com meses fechados e todo indicador parece em queda.

---

## 5. Arquitetura da aba Visão Macro

```
src/lib/metrics.ts            camada ÚNICA de contagem (12 etapas, toggles, trava de venda)
src/lib/periodo.ts            granularidade, range de período e multi-seleção (puro, testado)
src/lib/aging.ts              agregação do modo Aging (puro, testado)
src/lib/fonteMapping.ts       normaliza utm_source em grupos
src/lib/funnelTypes.ts        tipos de vw_funil_vendas

src/contexts/SharedFiltersContext.tsx   filtros compartilhados, persistidos em localStorage
src/components/ui/FilterBar.tsx         barra sticky
src/components/ui/TrapFunnel.tsx          funil visual (trapézios, custo, repetidos) — compartilhado com Performance Detalhada
src/components/ui/FunilCompletoSection.tsx bloco do funil completo (12 etapas) em Performance Detalhada
src/components/ui/MultiSelect.tsx         multi-seleção estilo Excel — usada pela barra E pelos filtros dos popups
src/components/ui/DateRangePicker.tsx     calendário + atalhos (Hoje/Ontem/...) pro filtro de Dia
src/components/ui/StageDealsDrawer.tsx    popup de deals de uma etapa (clique no funil) — filtros MultiSelect por marca/funil/fonte/SDR/closer, opções vêm sempre do próprio recorte
src/components/ui/RepeatedDealsDrawer.tsx popup de repetidos — por etapa ou "todas as etapas" (modo Passagens)
src/components/ui/SimpleDealsDrawer.tsx   popup leve (sem filtro) dos quadrantes de KPI — Receita, Fechamentos, Vendas por fonte
src/components/ui/dealDrawerShared.tsx    BarList/topBreakdown/StatusBadge/cell/fmtData usados pelos popups acima

src/hooks/useFunilVendas.ts   lê vw_funil_vendas (sem filtro de data — o recorte é no metrics)
src/hooks/useFunilEventos.ts  lê vw_funil_etapas_v2
src/hooks/useFunilAging.ts    lê vw_deal_etapa_periodos + vw_leadtime_stats
src/hooks/useMetasPerformance.ts  metas por colaborador/mês + `useMetaResumo` (meta por marca, soma vários meses, sem quebra por pessoa)
```

### Os controles da barra

| Controle | Efeito |
|---|---|
| Marca | multi-seleção estilo Excel. Todas marcadas == Consolidado. 2+ marcas: busca sem filtro no servidor e filtra no cliente |
| Período | granularidade (dia/mês/trimestre/ano) + quais períodos (multi-seleção estilo Excel, exceto no modo Dia) |
| Fonte / Sub-Fonte | `fonte_macro` / `utm_source` normalizado. **Opções vêm dos dados, nunca de lista fixa** |
| Vendas | Negócios × Unidades |
| Deals criados no período | Off = data da etapa · On = safra de MQL |
| Contagem | Deals únicos × Passagens |

Modos do card do funil: **Performance** (volume no período, `TrapFunnel`),
**Aging** (há quanto tempo parados) e **Atual** (onde estão agora, ignora
período) — os dois últimos renderizam `EtapaLeadtimeList`, não o funil visual:
uma etapa por linha, na mesma sequência de 8 do Performance, com 2 médias —
tempo parado NESSA etapa e tempo em andamento no funil inteiro (desde o MQL).
Aging lê de `vw_deal_etapa_periodos` (tempo por etapa) cruzado com
`data_novo_mql` de `vw_funil_vendas` (tempo em andamento); Atual computa as
duas datas direto da etapa corrente de cada deal, sem consultar a tabela de
aging. A Visão Macro mostra um subconjunto de 8 etapas (MQL → Contato
Efetivo → Conexão → SQL · Reunião Agendada → Diagnóstico → SAL →
Oportunidade → Fechamento) em todos os 3 modos; o funil completo de 12
etapas fica em Performance Detalhada.

**Multi-seleção de período é união exata, não intervalo.** Selecionar Junho +
Agosto mostra só esses dois meses — Julho não entra, mesmo estando entre os
dois. `SharedFiltersContext.ranges` carrega essa união (um `DateRange` por
período selecionado, cada um truncado em "hoje" individualmente se estiver em
curso); `range` continua existindo só como caixa delimitadora pra textos e
consultas de servidor de intervalo único (ex.: mídia). Com 2+ períodos
selecionados, a comparação "vs. período anterior" some da tela — não há
"anterior" bem definido pra um conjunto não-contíguo.

---

## 6. Deploy

`main` é protegida. Todo trabalho passa por PR; o merge dispara o deploy
automático (build + rsync para a VPS), que leva ~45s.

```bash
git checkout -b feat/nome-curto     # ou fix/, docs/, refactor/, chore/
# ... mudanças ...
git commit -m "feat(vendas): descrição em pt-BR"
gh pr create --base main
# CI passar -> merge -> deploy automático
```

Convenções em `CONTRIBUTING.md`. Commits em pt-BR, Conventional Commits.

---

## 7. Armadilhas do ambiente (custaram tempo)

**A pasta está no OneDrive.** Build local leva minutos porque o OneDrive
intercepta cada I/O, e o dev server do Vite chega a travar. Para build e teste,
copie o `src/` para disco local:

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build && npx vitest run    # ~300ms
```

**`tsc --noEmit` é mais permissivo que `tsc -b`.** O build de produção usa
`-b` e pega import não usado. Sempre valide com `npm run build`.

**`overflow: hidden` mata `position: sticky`.** Torna o elemento container de
rolagem. Use `overflow-x: clip` (já corrigido no `AppLayout`).

**Python do sistema não tem certificados raiz.** Scripts que chamam API externa
devem usar `curl` via `subprocess`, não `urllib`.

**API do RD Station CRM**: token vai em **query param** `?token=`, nunca em
header Authorization. Campos obrigatórios vazios (ex.: Marca) fazem qualquer
`PUT` falhar com 422 — o erro vem em `deal_required_custom_fields`. `PUT` de
custom fields faz **merge**, não substitui os demais.

**`new Date('YYYY-MM-DD')` (sem hora) parseia como meia-noite UTC, não meia-
noite local.** Formatar isso em Brasília (UTC-3) devolve o dia ANTERIOR.
Só afeta colunas `date` puras (ex.: `vw_funil_etapas_v2.dia`) — colunas
`timestamptz` sempre chegam com hora e não têm esse problema. `toLocalDate`
(`dateUtils.ts`) já trata isso: string no formato `YYYY-MM-DD` passa direto,
sem conversão de fuso.

---

## 8. Pendências conhecidas

- [ ] **Performance Detalhada e Análise de Perda** ainda leem `vw_marketing_funil` e têm filtros próprios. Migrar para `vw_funil_vendas` + `SharedFiltersContext` — Performance Detalhada já ganhou um bloco novo (`FunilCompletoSection`) na base nova, mas o resto da página continua na antiga
- [ ] **Metas hardcoded** em `src/constants/metasVendas.ts` — `DB_Metas_Performance` já tem o dado. Viva diverge: 1 no código, 0 no banco
- [ ] **Motivos de perda hardcoded** em `src/constants/motivosPerda.ts` (listas de string, frágil a acento)
- [ ] **RLS desabilitado** em `atributos_legado` e `_backup_correcao_closer_20260807`
- [ ] **Anon key do Supabase de Marketing exposta** no histórico do git (repo é público) — rotacionar
- [ ] **~50 deals sem marca** no CRM, invisíveis no dashboard
- [ ] **`fonte_macro` em branco** em parte da base — melhorou de 100% (abr) para 35% (ago), mas é preenchimento na origem
- [ ] Dados de Expansão no Supabase ainda não usados: `db_tarefas_sdr` (38k linhas), `DB_Reunioes_MeetRox`, `DB_Metas_Conversao`, `DB_Valor_Franquia`, motor de cadências
- [ ] **`processar_deal_evento` sem tratamento pra perda duplicada no mesmo dia** — o insert de evento `'perda'` não tem `EXCEPTION WHEN unique_violation` pro índice `ux_deal_eventos_perda_por_dia` (só o `ON CONFLICT` do índice de timestamp exato). Se um deal for perdido, reaberto e perdido de novo no mesmo dia calendário, a segunda perda derruba a função inteira — visto 1x num backfill em 25/08. Raro, mas real
- [ ] **Chave `service_role` do Supabase de Expansão e token do RD circularam em texto plano** (JSONs de workflow do n8n, exportados pra debug em 25/08). `service_role` ignora RLS por completo — rotacionar as duas quando der

---

## 9. Histórico de mudanças

### 2026-08-25 — Unidades vira coluna disponível em qualquer etapa, não só Fechamento
Até aqui `quantidade_unidades` só existia (na view) pra deals com
`status_atual = 'Ganho'` — fazia sentido enquanto o único consumo era o
toggle de vendas Negócios×Unidades. Junior pediu a coluna também no popup de
detalhamento de etapa (`StageDealsDrawer`, abre ao clicar numa etapa do
funil), pra qualquer etapa: "é bom pra vermos quantas unidades tal deal está
negociando", mesmo antes de fechar.

`vw_deal_ciclo_enriquecido` perdeu o `CASE WHEN status_efetivo = 'Ganho' ...
ELSE NULL` em `quantidade_unidades` — agora todo deal tem
`GREATEST(COALESCE(_quantidade_unidades, al_unid, 1), 1)`, ganho ou não (o
produto e a quantidade já existem na negociação antes de virar venda).
Checksum antes/depois: linhas, ciclo atual, ganhos, soma de valor_contrato,
perdidos, em andamento — todos idênticos; só `quantidade_unidades` foi de 41
linhas preenchidas (só ganhos, de 6.395 no total) pra 6.395 (todas), min 1 /
max 6. `saleUnits()`/`countSales()` (`metrics.ts`) não mudam de
comportamento — já só liam esse campo em deals com `isSale(r)` verdadeiro.

`StageDealsDrawer.tsx` perdeu a condicional que escondia a coluna Unidades
fora de Fechamento — aparece sempre agora. `SimpleDealsDrawer.tsx` (popups
leves de Receita/Fechamentos/Vendas por fonte, que só listam Ganho) também
ganhou a coluna, já que esses popups sempre lidam com vendas concretizadas.

Pré-condição pro dado fazer sentido: `_quantidade_unidades` no payload
precisava estar confiável pra qualquer deal, não só os ganhos — só ficou
assim depois de corrigir e rodar um backfill numa quebra de ingestão do n8n
(`achatarDeal()` parando de gravar esse e outros 2 campos desde 13/08/2026),
achada investigando o mesmo pedido do Junior. Não detalhado aqui por não ser
mudança de dashboard, mas relevante pra entender por que o campo passou a
ser confiável agora e não antes.

Verificado com `npm run build` + `npx vitest run` (123 testes) via
`~/ws-dashboard-build`.

### 2026-08-21 — Funil de UMA marca zerado: filtro de marca no evento
Junior filtrou 17–21/08 e viu **1 MQL** na Oral Unic (CRM: 10 deals criados) e
**1** na Viva — mas selecionando as **duas marcas juntas** os números voltavam
ao normal. Duas marcas mostrando mais que a soma de cada uma é impossível, e
foi essa inversão que apontou o caminho.

**Causa raiz: `useFunilEventos` filtrava `.eq('marca', ...)` no servidor.**
O hook só faz isso quando há **exatamente 1 marca** selecionada (com 2+ ele
busca tudo e filtra no cliente) — exatamente o recorte que quebrava. E a
coluna `marca` de `vw_funil_etapas_v2` vem de `deal_eventos.marca`, um retrato
gravado na ingestão que está **nulo em 554 dos 636 eventos** da janela (87%);
545 desses eventos pertencem a deals que **têm** marca no `deal_snapshot`. Em
agosto/26 o preenchimento caiu para 82,7% (era 99,5% em junho): a origem
`api_backfill_stage_history` nunca preenche marca, e `api_sync` preenche só
metade.

O filtro era **redundante** desde sempre: o recorte por marca já vem de
`idsEscopo` — o conjunto de `id_lead` de `vw_funil_vendas` (marca
autoritativa), aplicado no `extra` de `countStageEvents` / `dealsInStage` /
`repeatedDealsInStage`. Removido dos dois consumidores (Visão Macro e
`FunilCompletoSection`). `marca` saiu também de `FunnelEventRow` e do `select`
do hook, pra ninguém reintroduzir o filtro. Perf não sofre: o predicado ficava
acima da window function da view, não podava scan nenhum.

Verificado end-to-end com o `metrics.ts` real sobre a API real (17–21/08):

| | MQL | Contato | Conexão | SQL | Diag |
|---|---|---|---|---|---|
| Oral Unic antes | 1 | 0 | 1 | 0 | 0 |
| Oral Unic depois | 9 | 4 | 3 | 0 | 0 |
| Viva antes | 1 | 2 | 2 | 0 | 0 |
| Viva depois | 9 | 7 | 6 | 3 | 2 |
| As duas juntas | 18 | 11 | 9 | 3 | 2 |

O "antes" reproduz os prints do Junior etapa por etapa, e depois do fix a
união das duas marcas é a soma exata das duas sozinhas.

Sobra em aberto, menor: com "Deals criados no período" **On**, Viva bate certo
com o CRM (9 = 9), mas Oral Unic dá 8 contra 10 do CRM. Não é exclusão da
view (os 8 deals do período estão todos lá, funil SDR) — é diferença na
origem, ainda não investigada. E note que, com o toggle **Off**, a linha MQL
conta **passagem pela etapa** no período, não criação de deal: as duas coisas
não têm por que bater.

### 2026-08-21 — Conexão entra no funil da Visão Macro
Junior pediu a etapa **Conexão** logo depois de Contato Efetivo. A Visão Macro
foi de 7 pra 8 etapas (`MACRO_STAGES` em `FunilVendas.tsx`) — só isso: a etapa
já existia no catálogo (`STAGE_ORDER`/`STAGE_DATE_FIELD` → `data_conexao`) e no
funil completo da Performance Detalhada, então funil, Aging e Atual passaram a
mostrá-la sem nenhuma outra mudança.

Nota de leitura: Conexão não é usada por todos os funis, então o degrau vem
**menor** que "SQL · Reunião agendada" logo abaixo dele (em ago/26, no cru:
Contato Efetivo 337 → Conexão 160 → SQL 217). A conversão Conexão→SQL vai
passar de 100%, com seta pra cima — comportamento já esperado, o funil não é
monotônico.

### 2026-08-20 — Achada a causa real do filtro de 1 dia zerando o funil
O calendário novo (ontem) resolveu a UX, mas o Junior reportou que selecionar
um único dia (ex.: 19/08 a 19/08) ainda zerava o funil inteiro — enquanto um
range de 2 dias (18/08–19/08) mostrava dado normalmente. Sintoma exato: bug
de fuso horário, não de UI.

Causa raiz: `toLocalDate` (`dateUtils.ts`) fazia `new Date(value)` pra
qualquer entrada, presumindo sempre `timestamptz`. Mas `vw_funil_etapas_v2.dia`
(base do funil em modo Performance/Passagens, via `useFunilEventos`) é uma
coluna `date` **pura, sem hora**. `new Date('2026-08-19')` (sem hora) o
JavaScript interpreta como **meia-noite UTC**, não meia-noite local — e
formatar isso em Brasília (UTC-3) devolve **18/08**, o dia anterior. Todo
evento de 19/08 virava 18/08 e caia fora de uma janela de exatamente um dia
(19 a 19); numa janela de 2 dias (18–19) o evento deslocado ainda caía
dentro, escondendo o bug.

Confirmado direto no banco antes de mexer no código: `vw_funil_etapas_v2`
tinha 182 eventos em 19/08 e 129 em 18/08 — não era falta de dado, era o
dia sendo computado errado no cliente. `toLocalDate` agora detecta string
`YYYY-MM-DD` pura (sem hora) e devolve direto, sem tentar converter fuso —
só datas com hora (`timestamptz`) passam pela conversão UTC→Brasília. Corrige
tanto o filtro de janela (`isInWindow`) quanto a deduplicação por mês em
modo "Deals únicos" (`toLocalYearMonth`, usado em `eventsInStage` e
`groupRepeatedDeals`) e a data exibida nos pop-ups de deal (`fmtData`) —
todos liam da mesma função. Novo `dateUtils.test.ts` trava o caso.

O fix de "min/max cruzados" nos dois `<input type="date">` de ontem era uma
correção real (evitava range invertido), mas não era a causa deste zero
específico — o bug estava um nível abaixo, na conversão de data, e só
apareceu de forma visível depois que o calendário novo tornou trivial
selecionar exatamente um dia.

### 2026-08-19 — Filtro de Dia vira calendário com atalhos, no lugar de 2 inputs nativos
Selecionar um range no modo Dia exigia abrir o calendário nativo duas vezes
(um `<input type="date">` pro início, outro pro fim) — incômodo pra qualquer
recorte, e a raiz de o filtro de dia só mostrar zero ("ainda não está dando
pra ver os dados do dia", segundo o Junior).

Novo `src/components/ui/DateRangePicker.tsx`: um botão só, abre popover com
calendário mensal (clique no dia inicial, depois no final — a ordem não
importa, o componente reordena sozinho) + coluna de atalhos (Hoje, Ontem,
Esta semana, Últimos 7 dias, Últimos 30 dias) que aplica na hora. Seleção
manual no calendário exige confirmar em "Aplicar" — sem isso o segundo
clique já aplicaria a seleção sem chance de revisar. Dias futuros ficam
desabilitados; navegação de mês trava no piso (`PISO_PERIODO`) e em "hoje".

Inspirado no seletor do dashboard antigo (Lovable) que o Junior mandou de
referência — sem a coluna de atalho "mês inteiro" que aquele tinha, porque
duplicaria o modo Mês que já existe separado no filtro de período.

Verificado manualmente: como o app inteiro exige login (Claude não tem
credencial), o componente foi montado numa rota temporária sem autenticação
só pra esse teste, verificado no browser (seleção de range, atalhos,
navegação de mês, dias futuros bloqueados) e removido antes do commit — não
sobrou nenhum vestígio no código.

### 2026-08-19 — Filtros dos popups viram MultiSelect; popups leves de KPI; Aging/Atual ganham leadtime duplo
`MultiSelect` saiu de `FilterBar.tsx` pra `src/components/ui/MultiSelect.tsx`
(junto com `controlStyle`/`labelStyle`/`ordenarOpcoes`) pra ser compartilhado.
`StageDealsDrawer` (popup ao clicar numa etapa do funil) trocou os 5
`<select>` nativos (marca/funil/fonte/SDR/closer) por `MultiSelect` — mesmo
visual da barra, e agora aceita marcar vários valores por filtro, não só um.
As opções já vinham dos próprios deals do popup (nunca lista fixa); isso não
mudou, só ganhou `ordenarOpcoes` (ordem pt-BR) no lugar de `.sort()` cru.

Receita, Fechamentos e Vendas por fonte ganharam popup ao clicar — mas leve:
`SimpleDealsDrawer`, só a lista de deals ganhos (negociação/marca/fonte/
valor/data), sem filtro nem quebra por marca/responsável como o popup do
funil. `MetricCard` já suportava `onClick`; `SCard` (local a `FunilVendas.tsx`)
ganhou a mesma capacidade pro card de Vendas por fonte, que não é MetricCard.

**Aging e Atual pararam de usar Mediana/P75 e de mostrar o funil visual.**
Viram `EtapaLeadtimeList` — uma linha por etapa, na mesma sequência de 7 do
Performance (antes Aging ordenava por quantidade de deals, usando a etapa
crua da view, sem resolver variantes de rótulo pro mesmo StageKey — corrigido
junto). Cada linha mostra 2 médias: tempo parado NESSA etapa, e tempo em
andamento no funil inteiro desde o MQL (métrica nova). `computeAging`
(`aging.ts`) mudou de percentil pra média e ganhou um 3º parâmetro
(`mqlPorDeal: Map<id_lead, data_novo_mql>`) pra calcular a segunda métrica;
resolve a etapa com `resolveStage` antes de agrupar. Atual não usa mais
`vw_deal_etapa_periodos` pra isso — computa as duas datas direto de cada
`FunnelRow` vivo (`data_<etapa atual>` e `data_novo_mql`), sem depender da
tabela de aging.

### 2026-08-19 — Marca vira multi-seleção; card de Meta ganha quebra por marca
Filtro de Marca era o único ainda com `<select>` nativo (destoava do resto da
barra) e só permitia uma marca (ou Consolidado) por vez. Virou `MultiSelect`
igual Fonte/Período, e agora aceita **várias marcas ao mesmo tempo** — não só
"uma" ou "todas". `SharedFiltersContext.brandKey: string` virou
`brandKeys: string[]` (nunca vazio; todas as marcas reais marcadas ao mesmo
tempo é visualmente igual a "Consolidado", sem valor sentinela separado).

Busca no servidor continua filtrada por marca quando é **exatamente 1**
selecionada (mais rápido); com 2+ busca tudo e filtra no cliente via
`buildScopeFilter({ marcas })`, mesmo padrão já usado por Fonte/Sub-Fonte.
Cor de tema usa a da marca só com 1 selecionada; com 2+ cai no teal do
Consolidado. Afeta `FunilVendas.tsx` e `FunilCompletoSection.tsx`
(Performance Detalhada), que leem o mesmo filtro compartilhado.

Card de Meta ganhou dropdown "ver por marca" (ícone de seta) em Receita e
Fechamentos, mostrando meta + realizado de cada marca selecionada — só
aparece com 2+ marcas em jogo. `useMetaResumo` parou de aceitar `marca` e
passou a sempre buscar todas (a tabela de metas é pequena) devolvendo
`porMarca: Map<string, MetaResumo>`; quem soma/filtra pro subconjunto
selecionado é o próprio `FunilVendas.tsx`, junto com o realizado (mesma
lógica pros dois lados, mesmo `scopedSemMarca`). Título do card também virou
igual "Funil de vendas"/"Vendas por fonte" (`font-display`, 18px) — antes era
um rótulo pequeno em caixa alta, destoando dos vizinhos.

"Vendas por fonte" passou a mostrar quantidade **e** % lado a lado na legenda
(só tinha %).

### 2026-08-19 — Funil de Vendas vira Visão Macro: rename, multi-seleção de período, funil simplificado, meta
Renomeado para **Visão Macro** (menu + título). Três problemas de filtro
corrigidos e um pedido de conteúdo (brainstorm com o Junior sobre o que fazia
sentido numa tela de snapshot executivo de Expansão de Franquias):

**Filtro de dia zerando dados.** Os dois `<input type="date">` tinham
`min`/`max` cruzados entre si; digitar (não só usar o calendário) podia
produzir um range invertido sem nenhum aviso, zerando tudo. Cada campo agora
se autocorrige — mudar o início empurra o fim junto se ficar pra trás, e
vice-versa — o que também resolve trivialmente "quero ver só um dia".

**Multi-seleção de período (mês/trimestre/ano), estilo Excel.** Reaproveitado
o `MultiSelect` que já existia pra Fonte/Sub-Fonte. Semântica é **união
exata**, não intervalo: selecionar Jun + Ago mostra só esses dois meses, sem
preencher Julho. `SharedFiltersContext` trocou `periodValue: string` por
`periodValues: string[]` e passou a expor `ranges: DateRange[]` (a união,
cada período já truncado em "hoje" individualmente se em curso) ao lado de
`range` (caixa delimitadora, só pra texto/consultas de intervalo único).
`metrics.ts` ganhou um terceiro parâmetro em `toWindow`/`isInWindow`
(`ranges`) com prioridade sobre `dateRange` — sem isso, meses em `activePeriods`
(mecanismo antigo, nunca usado de fato) não teriam o truncamento de "hoje" que
`rangeForPeriod` já fazia. Com 2+ períodos selecionados a comparação "vs.
período anterior" some da tela — não existe "anterior" bem definido pra um
conjunto não-contíguo.

**Funil simplificado.** Visão Macro passou de 12 para 7 etapas (MQL → Contato
Efetivo → SQL · Reunião Agendada → Diagnóstico → SAL → Oportunidade →
Fechamento — "Oportunidade · COF" virou só "Oportunidade" nessa tela). O
funil completo de 12 etapas + custo por etapa + badges de repetidos migrou
pra **Performance Detalhada**, num bloco novo e independente
(`FunilCompletoSection`) que lê a mesma base (`vw_funil_vendas` +
`SharedFiltersContext`) da Visão Macro — sem tocar no resto da página, que
continua na base antiga (`vw_marketing_funil`, filtros próprios).
`TrapFunnel` saiu de dentro de `FunilVendas.tsx` pra
`src/components/ui/TrapFunnel.tsx`, compartilhado pelas duas telas.

**Card "Conversão global" removido** — duplicava a KPI "Conversão MQL→Ganho"
do topo, mesmo número duas vezes na mesma tela.

**Card de Meta novo.** Receita e Fechamentos vs. `DB_Metas_Performance`
(`meta_financeira`/`meta_qtd_vendas`), somada por todos os meses cobertos
pelo período selecionado (trimestre/ano somam os meses; Consolidado soma
todas as marcas, excluindo `Geral/Outbound/Repasse` como já fazia
`metaTimeSdr`/`metaTimeCloserFat`). Meta é mensal por natureza — some da tela
no modo Dia. Novo `useMetaResumo` em `useMetasPerformance.ts`; ignora o
toggle Negócios×Unidades (não existe meta de unidades na base).

Branch original ficou 8 PRs atrás da `main` (features de "repetidos" e
No-show redesenhado, já em produção) sem eu perceber de início — refeito numa
branch nova a partir da `main` atual pra não regredir nada já publicado.

### 2026-08-18 — `vw_deal_ciclo_enriquecido` parava de rodar por timeout
Dashboard demorando 10-15s pra carregar e às vezes quebrando com "canceling
statement due to statement timeout" — em **todas** as abas, não só Funil de
Vendas.

Causa raiz: a CTE `ult` de `vw_deal_ciclo_enriquecido` recomputava a cadeia
inteira de views (`vw_deal_ciclo` → `vw_deal_eventos_ciclo`, com joins em
`deal_eventos`, `deal_contatos`, `atribuicao_legado`, `pessoa_alias`,
`nome_cargo_foto` e uma subquery correlacionada por linha) uma **segunda vez**
só pra achar o ciclo máximo por `id_lead` — 1 vez em `ult`, 1 vez em `norm`.
O role `anon` do dashboard tem `statement_timeout` de só 3s; qualquer página
de `vw_funil_vendas` (sem filtro de data, ~5 páginas de 1000 linhas por
carregamento) já levava ~1,9s cada, perto ou acima do limite.

Troquei a CTE `ult` por uma window function (`max(ciclo) OVER (PARTITION BY
id_lead)`) sobre o mesmo scan de `vw_deal_ciclo` que `norm` já fazia —
resultado idêntico, sem a segunda passada. Validado com checksums (count,
count ciclo_atual, count ganhos, soma de valor_contrato — idênticos antes e
depois) e `EXPLAIN ANALYZE` na query real do hook: 1896ms → 882ms por página
(2,15x mais rápido), 168k → 116k buffer hits. Afeta `vw_funil_vendas` e
`vw_marketing_funil` (ambas dependem dessa view), portanto todas as abas de
Vendas. Aplicado direto no Supabase de Expansão (`cygxmduuwlwfbodfrlkr`),
sem migration no repo (é `CREATE OR REPLACE VIEW`, não versionado em código).

Ainda sobra trabalho: mesmo a ~880ms/página, 5 páginas sequenciais somam
~4s+ sob carga — perto do timeout de novo. Se o problema voltar, os próximos
suspeitos são a subquery correlacionada de `ciclo` em `vw_deal_eventos_ciclo`
(hoje 1 índice-only-scan por linha de evento) e o padrão de paginação do
`useFunilVendas` (5 round-trips sequenciais porque o PostgREST limita a
1000 linhas por request).

### 2026-08-17 — Leadtime de perda/fechamento passa a respeitar período
Os cards de "Tempo de ciclo" (Funil de Vendas) ignoravam o período e o toggle
"Deals criados no período" — eram sempre média vitalícia, mesmo com o rótulo
do card de perda dizendo "no período". `rowsInLoss` (novo, espelha `isSale`/
`rowsInStage`) e `rowsInStage(..., 'Fechamento', ...)` agora aplicam `win` e
`viewModes`, iguais ao resto da página.

### 2026-08-18 — Mais espaço entre "repetidos" e a seta de conversão
"+N repetidos" e a seta de conversão (▼ XX%) entre etapas do funil ficavam
quase colados — a legenda só tinha `marginTop: 3` e a linha de conversão
tinha altura fixa de 15px sem padding. PR #17.

### 2026-08-18 — Caixa de No-show: centralizada, tracejado preto, com repetidos
Primeira versão da caixa de No-show (pill laranja) ficava descentralizada do
eixo do funil — a div centralizava contra a largura da linha inteira,
incluindo a coluna de custo, não só contra a coluna do funil — e visualmente
igual ao selo de repetidos, confundindo os dois. A legenda de "+N repetidos"
por etapa tinha o mesmo bug de centralização, só que menos visível (texto
sem borda).

Virou um retângulo de bordas arredondadas, borda tracejada preta, sem
preenchimento, com largura calculada pela mesma função de escala das etapas
do funil — proporcional à quantidade de No-show, igual aos degraus. No-show
também ganhou sua própria contagem de repetidos (o evento "No Show" também
pode ter passagem repetida no histórico), clicável, abrindo o mesmo popup
das outras etapas. PR #15.

### 2026-08-18 — Popup de repetidos por deal + No-show sai do topo
O contador de repetidos agrupava por passagem, não por deal — um "+5
repetidos" podia ser 2 deals sem dizer quantas vezes cada um. `groupRepeatedDeals()`
(novo em `metrics.ts`) agrupa por deal (ou deal+etapa no popup geral) e expõe
`vezes`, agora coluna na tabela. Badge "Repetidos" do cabeçalho ficou clicável:
abre popup com todas as etapas, breakdown "Por Etapa" + coluna Etapa.

No-show saiu do cabeçalho do card (onde parecia mais um KPI) e virou uma
saída lateral tracejada logo após "SQL · Reunião agendada" — ponto real onde
o deal sai do fluxo normal — com visual que deixa claro que não é etapa do funil.

`StageDealsDrawer` e o novo `RepeatedDealsDrawer` passaram a compartilhar
BarList/topBreakdown/StatusBadge/cell/fmtData via `dealDrawerShared.tsx`, que
antes viviam duplicados dentro do primeiro. PR #13.

### 2026-08-18 — Repetidos no Funil de Vendas (modo Passagens)
Com o toggle **Contagem = Passagens**, cada passagem além da primeira do
deal/ciclo no mês agora conta como "repetido" — antes o drawer já mostrava a
mesma linha várias vezes nesse modo, mas sem nenhuma indicação de que era
repetição, nem contador algum.

Adicionado: badge com o total de repetidos (+ %) no cabeçalho do card do
funil; legenda clicável "+N repetidos" abaixo de cada etapa; popup por etapa
listando quais deals são os repetidos (ver ajuste de agrupamento por deal,
acima).

`repeatedDealsInStage()` (novo, em `metrics.ts`) espelha `dealsInStage()` —
mesma regra de escopo, ciclo e cohort — pra lista nunca divergir do número
mostrado. Fechamento nunca tem repetido: é a trava de venda (`status_atual`),
não uma passagem no histórico de eventos, então o conceito não se aplica. PR #11.

### 2026-08-17 — Correção do toggle de Contagem
Passagens aparecia **menor** que Deals únicos, e Fechamento zerava em Passagens.
Três causas: os modos liam bases diferentes; venda não é etapa no histórico; e
"Reunião Agendada SQL" duplicava no handoff SDR→Closer (71 → 144).
Os dois modos passaram a ler o histórico de eventos, Fechamento sempre pela
trava de venda, e SQL só na etapa do Closer. PR #4.

### 2026-08-17 — Filtro de Fonte dinâmico
As opções de Fonte estavam fixas no código (`Inbound`, `Resgate`,
`Sem Classificação`). Quando "Prospecção Ativa" passou a existir, 174 deals
ficaram inalcançáveis pelo filtro. Agora as opções derivam dos dados. PR #3.

### 2026-08-14 — Fonte Macro = "Prospecção Ativa" no RD
401 de 423 deals do funil Prospecção Ativa classificados via API do RD.
Os 268 marcados como `Resgate` foram **preservados** por decisão do Junior.
21 bloqueados por falta de Marca — depois preenchidos com Marca=Oral Unic,
Cidade=a, Estado=a. 2 deals estavam deletados no RD.

Verificação feita antes: **nenhuma cadência ativa usa Fonte Macro como
gatilho**. A cadência #5 usa **Sub-Fonte** — o plano original de mover Fonte
Macro para lá teria quebrado 268 deals.

### 2026-08-14 — Event Sourcing captura Fonte Macro
`processar_deal_evento` passou a ler `event_fields_config`, cumprindo o que a
tabela prometia na descrição. Novo campo rastreado = 1 INSERT.

### 2026-08-14 — Funil de Vendas migrado para o Supabase de Expansão
MQL vinha da tabela `leads` do Supabase de **Marketing** e era o denominador da
conversão global. Agora todo o volume vem do banco de Expansão.
Inclui: view `vw_funil_vendas`, 12 etapas (4 novas: Interesse Reunião, Conexão,
Comitê, Pré-Contrato), FilterBar sticky, período por granularidade, modos
Performance/Aging/Atual, e correção do `overflow:hidden` do AppLayout que
impedia sticky. Primeiro conjunto de testes do repositório (vitest). PR #1.

Spec: `docs/superpowers/specs/2026-08-14-funil-vendas-supabase-design.md`

---

## 10. Histórico do lado Marketing (Gabriel)

Ingestão de mídia migrada de n8n para Edge Functions do Supabase em 2026-08-13,
agendadas por pg_cron no projeto `jmuluoksnlqrvzbcltim`:

| Function | Escreve em | Quando |
|---|---|---|
| `ingest-meta-ads` | `media_daily_raw` | minuto 5 de cada hora |
| `ingest-google-ads` | `media_daily_raw` | minuto 10 de cada hora |
| `ingest-google-search-terms` | `keywords_daily`, `search_terms_daily` | 05:20 UTC |
| `ingest-facebook-pages` | `fb_page_daily`, `fb_posts` | 05:30 UTC |

Secrets no Vault do projeto de Marketing, acessados via `public.get_secret(name)`.
Workflows n8n antigos desativados, não deletados.
