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
| Marketing | Visão Geral, Saúde da Marca, Acompanhamento Meta, S&OP Marketing | Gabriel |
| **Expansão / Vendas** | **Visão Macro, Performance, Análise de Perda, Análise de Objeções, GP Setembro** | **Junior** |

**Junior mexe só nas abas de Vendas** — e, dentro delas, não em Análise de Objeções.

Análise de Termos vive **dentro** de Saúde da Marca (aba "termos" por marca), não como página separada. Cadências foi removida em 28/08/2026 — não estava em uso ativo.

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
| `vw_deal_origem_comercial` | 1 linha por deal: `Inbound` ou `Prospecção Ativa`. Agregado direto de `deal_eventos`, não passa pela cadeia cara de `vw_deal_ciclo`. `atribuicao_manual.origem_override` tem prioridade sobre a regra — ver seção "Inbound × Prospecção Ativa" |

`vw_marketing_funil` é a view **antiga**; ainda serve Análise de Perda até ela
ser migrada. Não usar em código novo.

### Campos que importam

- `fonte_macro` — classificação de negócio: `Inbound`, `Resgate`, `Prospecção Ativa`, `Sem Classificação`. Vem de `payload->>'Fonte Macro'`
- `sub_fonte` / `utm_source` — origem de tráfego (meta, google, ig…). Dimensão **ortogonal** à fonte macro. `sub_fonte` da view é normalização do `utm_source` no banco, **não** o campo "Sub-Fonte" do RD. O dashboard normaliza `utm_source` no cliente (`normalizeSubFonte`, `fonteMapping.ts`) e, **quando `utm_source` é vazio**, cai no campo "Sub-Fonte" do RD CRM (`payload->>'Sub-Fonte'`), exposto como `sub_fonte_crm` em `vw_funil_vendas` — valor **cru** (nomes de lista/evento: "Feira de Franquias 2026", "Busca Orgânica", "SBC Repasse"), sem agrupar
- `origem_comercial` — motor comercial do negócio: `Prospecção Ativa` se **qualquer** evento dele aconteceu nesse funil, `Inbound` caso contrário. **Não confundir com `fonte_macro`**, que tem um valor de mesmo nome mas é outra dimensão — ver seção "Inbound × Prospecção Ativa" abaixo
- `quantidade_unidades` — quantidade de franquias do produto anexado ao deal no RD. Disponível em **qualquer** etapa/status (não só Ganho); **0 quando o deal não tem produto cadastrado ainda** — não confundir com `saleUnits()` (`metrics.ts`), que floora em 1 só pro toggle de vendas (venda fechada sem produto ainda conta como 1 unidade vendida)
- `ciclo` / `eh_reciclagem` / `eh_ciclo_atual` — um deal perdido e reciclado tem várias linhas

### Inbound × Prospecção Ativa

São dois motores comerciais que não se comparam, e desde 27/08 as três abas de
Vendas mostram **um de cada vez** (toggle ao lado do título, sem estado
"Todos"). A regra:

> Um deal é **Prospecção Ativa** se QUALQUER evento dele aconteceu no funil
> "Prospecção Ativa". Caso contrário é **Inbound**. A prospecção contamina o
> deal inteiro — prospectado e depois negociado no Closer continua sendo
> Prospecção Ativa.

Três alternativas foram medidas e **descartadas**, todas dão resultado errado:

1. `nome_funil` — é o funil do **último** evento do ciclo. 620 ciclos nascidos
   no SDR aparecem como "Closer" só por causa do handoff
2. `fonte_macro = 'Prospecção Ativa'` — dimensão ortogonal (origem de captura,
   não funil de trabalho). 10 ciclos Inbound têm essa fonte; e dentro da
   Prospecção Ativa a maior fatia nem usa esse valor: 856 `Prospecção Ativa`
   + **391 `Resgate`** + 2 `Inbound`
3. funil do **primeiro** evento do ciclo — deixa de fora 90 ciclos que nasceram
   em Odonto Scale/SDR e migraram pro Prospecção Ativa no meio do caminho, sem
   terem sido perdidos

**Grão é o deal, não o ciclo, e dá no mesmo:** medido, **0 deals em 6.126** têm
um ciclo Inbound e outro Prospecção Ativa. Por isso a classificação sai direto
de `deal_eventos`, sem tocar em `mv_deal_ciclo_enriquecido`.

**Prospecção Ativa tem 0 vendas e R$ 0 de receita em toda a base** — os ganhos
e a receita inteira estão no Inbound. Não é bug de contagem: bate com a regra
de que Prospecção Ativa nunca tem Closer. No toggle dela o funil morre antes do
Fechamento e a conversão global é 0%.

Qualquer relatório novo (n8n, RPC, e-mail) tem que ler `origem_comercial` das
views, nunca reimplementar a regra.

**Override manual para artefato técnico.** A regra lê `deal_eventos` ao pé da
letra: qualquer linha com `nome_funil = 'Prospecção Ativa'` contamina, mesmo
que não seja prospecção de verdade. Achado em 27/08: `from_rdsm_integration`
(criação automática de deal via RD Marketing) às vezes cria o deal direto
numa etapa de Prospecção Ativa e o move pro funil certo segundos depois — sem
nenhuma ação humana. Não dá para apagar essa entrada no RD (a API não expõe
edição/exclusão de `deal_stage_histories`, só teve confirmado por
`404` em `GET /deals/:id/deal_stage_histories`), então `atribuicao_manual`
ganhou a coluna `origem_override`, com prioridade sobre a regra em
`vw_deal_origem_comercial` — mesmo padrão de `sdr_override`/`closer_override`.
Usar só para casos confirmados como artefato, nunca para "esconder" um deal
de Prospecção Ativa de verdade.

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
Nos modos de evento (Performance/Aging) a trava é `STAGE_ID_OBRIGATORIO` sobre
`id_etapa` do evento. No modo **Funil Atual** (que olha a etapa corrente do
deal, não o histórico) a mesma trava é `currentStage(row)` em `metrics.ts`,
comparando `vw_funil_vendas.id_etapa_atual` (= `deal_snapshot.id_etapa`) —
`resolveStage(etapa_funil)` sozinho não distingue SDR de Closer, só olha o
nome. Deal parado na "Reunião Agendada SQL" do SDR some do balde no Atual.

**SDR/Closer de deal vivo = dono ATUAL, não o dono da última mudança de etapa.**
A eleição de `nome_sdr`/`nome_closer` em `vw_deal_ciclo` amostra `vw_deal_posse`
no instante `ts_fim_sdr`/`ts_fim_closer` — o **último evento `mudanca_etapa`**
daquela camada. `troca_responsavel` não é `mudanca_etapa`, então não move esse
âncora: um deal parado na mesma etapa desde antes de uma troca de responsável
ficava congelado no dono antigo (Thiago de férias → reatribuído a Xay/Sarah no
RD, mas o dash seguia mostrando Thiago). Desde 03/09 há a fonte `posse_atual`:
para o **ciclo corrente, `deal_snapshot.status IN ('open','ongoing')`**, e
conforme a **camada da etapa ATUAL** do deal (`datas.camada_atual` = camada do
último `mudanca_etapa`) — etapa SDR → escreve `nome_sdr`, etapa Closer →
escreve `nome_closer` — o nome vem do intervalo de posse aberto (`fim IS NULL`
= dono atual do RD), com prioridade sobre `evento`/`posse`/`campo_rd`. Usa
`camada_atual`, **não** `ts_fim_closer IS NULL`: um deal em No Show (camada SDR)
que já passou pelo Closer segue o dono como SDR, e a coluna de Closer fica
intocada. Deal Ganho/Perdido, ciclo antigo, ou numa etapa da outra camada
**não** tem o lado dele tocado — o SDR histórico de quem trabalhou o deal
continua congelado no handoff. `sdr_fonte`/`closer_fonte` = `'posse_atual'`
marca as linhas corrigidas por essa regra.

**Closer eleito nunca pode ter cargo SDR puro.** As três fontes de `nome_closer`
(`evento`, `posse`, `posse_atual`) leem `responsavel`/`dono` — um campo de
"quem está com o deal no RD agora", não "quem é Closer de verdade". Para um
negócio que entrou numa etapa do Closer mas foi perdido/no-show **antes** de o
RD reatribuir o dono pra um Closer real, esse campo fica preso no nome de quem
o entregou — quase sempre o próprio SDR. Achado em 04/09: 149 ciclos com
`nome_closer` = nome de SDR puro (Xayane 104, Thiago 27, Sarah Padilha 16),
87% já perdidos, mas 19 ainda "Em andamento" — apareciam no filtro de Closer
da FilterBar junto com os Closers de verdade. Fix: `clo_evento` e `clo_posse`
(e o ramo `posse_atual` dentro de `pre`) só aceitam o nome se
`nome_cargo_foto.cargo` da pessoa **não for exatamente `'SDR'`** — cai pro
próximo da cadeia (`campo_rd`, o `payload->>'Closer responsável'`, mantido por
outra automação e mais confiável). Cargo `'SDR/Closer'` (ex.: Vanessa Daniel,
que acumula os dois papéis) não é bloqueado de propósito — só o `'SDR'` puro.
**Não existe trava simétrica do lado SDR ainda** — um Closer aparecendo como
`nome_sdr` é medido e maior (568 ciclos), mas concentrado em funis legados
(`Odonto Scale`, `Get it`, `Inpot`/`Lisô Laser` como nome de funil) onde pode
ser fato histórico real (o Closer atual trabalhou como SDR antes da reforma de
funis), não bug — decisão de mexer aí fica pro Junior, ver pendência.

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
src/lib/funilFilterOptions.ts opções cruzadas de Marca/Fonte/Sub-fonte (compartilhado Visão Macro + Performance)
src/lib/metaRitmo.ts          ritmo acumulado + meta do dia (usado pelo MetaRitmoCard)
src/lib/performanceRows.ts    agregação por SDR/Closer (aba Performance)

src/contexts/SharedFiltersContext.tsx   filtros compartilhados, persistidos em localStorage
src/components/ui/FilterBar.tsx         barra sticky
src/components/ui/TrapFunnel.tsx          funil visual (trapézios, custo, repetidos) — compartilhado com Performance
src/components/ui/FunilCompletoSection.tsx bloco do funil completo (12 etapas) em Performance
src/components/ui/MultiSelect.tsx         multi-seleção estilo Excel — usada pela barra E pelos filtros dos popups
src/components/ui/DateRangePicker.tsx     calendário + atalhos (Hoje/Ontem/...) pro filtro de Dia
src/components/ui/StageDealsDrawer.tsx    popup de deals de uma etapa (clique no funil) — filtros MultiSelect por marca/funil/fonte/SDR/closer, opções vêm sempre do próprio recorte
src/components/ui/RepeatedDealsDrawer.tsx popup de repetidos — por etapa ou "todas as etapas" (modo Passagens)
src/components/ui/SimpleDealsDrawer.tsx   popup leve (sem filtro) dos quadrantes de KPI — Receita, Fechamentos, Vendas por fonte
src/components/ui/dealDrawerShared.tsx    BarList/topBreakdown/StatusBadge/cell/fmtData usados pelos popups acima
src/components/ui/MetaRitmoCard.tsx       card de métrica com barra de ritmo + meta do dia

src/hooks/useFunilVendas.ts   lê vw_funil_vendas (sem filtro de data — o recorte é no metrics)
src/hooks/useFunilEventos.ts  lê vw_funil_etapas_v2
src/hooks/useFunilAging.ts    lê vw_deal_etapa_periodos + vw_leadtime_stats
src/hooks/useMetasPerformance.ts  metas por colaborador/mês + `useMetaResumo` (meta por marca, soma vários meses, sem quebra por pessoa)
src/hooks/useMetasTimeResumo.ts   meta do time por marca (SDR+Closer)
```

### Os controles da barra

| Controle | Efeito |
|---|---|
| **Origem** (ao lado do título, não na barra) | Inbound × Prospecção Ativa. Filtrado **no servidor** — as opções de todos os outros filtros passam a derivar só do recorte ativo |
| Marca | multi-seleção estilo Excel. Todas marcadas == Consolidado. 2+ marcas: busca sem filtro no servidor e filtra no cliente |
| Período | granularidade (dia/mês/trimestre/ano) + quais períodos (multi-seleção estilo Excel, exceto no modo Dia) |
| Fonte / Sub-Fonte | `fonte_macro` / `utm_source` normalizado (Sub-Fonte cai no campo do RD quando `utm_source` é vazio). **Opções vêm dos dados, nunca de lista fixa** — e desde 31/08 **cruzadas** com os demais filtros ativos (Marca, Fonte, a outra) **+ a janela de período**: só aparece o valor que produz ≥1 deal no funil do recorte atual. O valor já selecionado sempre fica na lista (escape hatch) |
| SDR / Closer | `nome_sdr` / `nome_closer`, multi-seleção. Desde 04/09 também cruzados nesse mesmo esquema — inclusive um com o outro (escolher um SDR restringe as opções de Closer aos dele, e vice-versa) |
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
etapas fica em Performance.

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

- [ ] **Closer com cargo SDR puro contamina o filtro/eleição de `nome_sdr`** — o inverso do fix de 04/09 (que travou o lado Closer). Medido: 568 ciclos com `nome_sdr` = nome de Closer ativo (Rômulo 216, Jéssica 181, Giullia 97, Douglas 49, Aurélio Briano 23), concentrados em funis legados (`Odonto Scale`, `Get it`, `Inpot`/`Lisô Laser` como nome de funil — não a marca). Pode ser fato histórico real (closer atual trabalhou como SDR antes da reforma de funis de agosto), não necessariamente bug — precisa validar caso a caso com o Junior antes de aplicar a mesma trava, que aqui teria bloqueio muito mais amplo
- [ ] **Análise de Perda** ainda lê `vw_marketing_funil` (via `vw_funil_compat`/`usePerformanceEquipe`) e tem filtros próprios. Migrar para `vw_funil_vendas` + `SharedFiltersContext`. (Performance foi migrada em 2026-09-03.)
- [ ] **Metas não separam Inbound de Prospecção Ativa** — `DB_Metas_Performance` não tem a dimensão, então o card de Meta mostra a meta CHEIA nos dois lados do toggle. No toggle Prospecção Ativa isso vira meta inteira contra R$ 0 realizado. Decisão do Junior em 27/08 foi deixar assim por ora; separar quando o time lançar meta de prospecção
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

### 2026-09-04 (4) — Xayane (SDR) aparecia como Closer no filtro novo; trava por cargo em vw_deal_ciclo

Junior testou o filtro de SDR/Closer do PR #72 e reportou: a lista de Closer
trazia "Xayane" — ela é SDR, não Closer. "A lógica tá certa (mostra o que tem
no banco), mas operacionalmente tem algo errado."

**Investigação confirmou dado errado, não bug do filtro.** `nome_closer` (em
`vw_deal_ciclo`) é eleito com prioridade `evento > posse/posse_atual >
campo_rd`. Pra negócios que entraram numa etapa do Closer mas foram
perdidos/no-show **antes** de o RD reatribuir o dono pra um Closer de
verdade, o evento de `mudanca_etapa` captura `responsavel` = quem ainda era o
dono no RD naquele instante — quase sempre o SDR que agendou a reunião.
Provado com um deal real (`695712d7...`, Inpot): o dashboard mostrava
Closer = Xayane, mas `payload->>'Closer responsável'` (campo dedicado do RD,
mantido por outra automação, mais confiável) já dizia **Jéssica**.

**Tamanho:** 149 ciclos com `nome_closer` = nome de SDR puro (Xayane 104,
Thiago 27, Sarah Padilha 16), 87% perdidos mas **19 ainda "Em andamento"**
(afetavam contagem ao vivo, não só ruído histórico). Achado um precedente do
mesmo padrão já reconhecido em código: `useMetasClosers.ts` comentava
"Vanessa Daniel aparece como Closer... mas é SDR na realidade" — mesma
família de bug, canto diferente do dashboard.

**Fix em `vw_deal_ciclo`** (`CREATE OR REPLACE VIEW`, matview
`mv_deal_ciclo_enriquecido` refeita na hora): as três fontes de Closer
(`clo_evento`, `clo_posse`, e o ramo `posse_atual` dentro de `pre`) passaram a
exigir que o cargo da pessoa em `nome_cargo_foto` **não seja exatamente
`'SDR'`** — falha essa checagem e cai pro próximo da cadeia (`campo_rd`).
Cargo `'SDR/Closer'` (Vanessa Daniel) não é bloqueado, só o `'SDR'` puro —
ela pode legitimamente fechar negócio às vezes. `papel_responsavel` (que já
existia em `vw_deal_eventos_ciclo`, calculado do mesmo `nome_cargo_foto`, só
nunca tinha chegado até `clo_evento`) resolveu o lado evento sem precisar de
join novo; `clo_posse` e `posse_atual` ganharam `LEFT JOIN nome_cargo_foto`
próprio, porque partem de `vw_deal_posse.dono` (nome cru, sem cargo).

Verificado: checksum de `vw_deal_ciclo` e `vw_funil_vendas` idêntico
antes/depois (9.351 ciclos, 50 ganhos, 4.605 perdidos, 4.696 em andamento;
7.036 linhas / 6.712 ciclo atual / 45 ganhos / R$ 1.998.779,98 / 4.758
perdidos / 2.233 em andamento). Pós-fix: Xayane/Thiago/Sarah Padilha somem de
`nome_closer` (149 → 0); os 3 deals de exemplo resolvem pra `campo_rd`
corretamente (`695712d7...` e `6a733c30...` → Jéssica, `6a51996...` → Aurélio
Briano). Vanessa Daniel intocada (2 ciclos, como esperado).

**Achado colateral, não corrigido:** o problema espelhado do lado SDR é
**maior** — 568 ciclos com `nome_sdr` = nome de Closer ativo, mas
concentrados em funis legados (`Odonto Scale`, `Get it`, `Inpot`/`Lisô Laser`
como nome de funil) onde pode ser fato histórico real, não bug. Registrado
como pendência na seção 8 — decisão de aplicar a mesma trava fica pro Junior,
caso a caso.

### 2026-09-04 (3) — Filtros de SDR e Closer em Visão Macro e Performance

Junior pediu dois filtros novos na `FilterBar` compartilhada: **SDR** e
**Closer**. `buildScopeFilter` (`metrics.ts`) já tinha os campos `sdrs`/
`closers` prontos no `ScopeOptions` — declarados mas nunca usados fora do
popup de etapa (`StageDealsDrawer`, que faz seu próprio filtro local). Só
faltava expor isso como filtro global.

Implementação seguiu o molde exato de Fonte/Sub-Fonte: `sdrs`/`closers`
entraram como estado persistido no `SharedFiltersContext` (mesmo padrão de
array vazio = sem restrição, incluídos no `resetFiltros`), dois `MultiSelect`
novos na `FilterBar`, e `funilFilterOptions` ganhou `sdrs`/`closers` na
entrada e na saída — cruzando cada lista com os demais filtros ativos + a
janela de período, **inclusive um com o outro**: selecionar um SDR restringe
as opções de Closer aos que já trabalharam deal dele, e vice-versa (mesma
regra "estilo Excel" que já existia entre Marca/Fonte/Sub-fonte).

Escopo ficou só em Visão Macro + Performance, as duas abas que já
compartilham essa infra. Análise de Perda pediu coordenação: outra sessão do
Claude Code já estava rodando em paralelo, migrando exatamente essa aba de
`vw_marketing_funil` para `vw_funil_vendas` + `FilterBar` (a pendência da
seção 8) — avisada via `send_message` pra incluir o mesmo filtro de
SDR/Closer como parte dessa migração, evitando trabalho duplicado ou
conflito de merge.

Verificado: `npm run build` (tsc -b) + `npx vitest run` (209 testes, 7
novos) num worktree separado (`git worktree add`, fora do OneDrive, sem
interferir nas outras sessões rodando na mesma pasta) — e desta vez também
**visto renderizado**: rota temporária sem autenticação (removida antes do
commit, mesmo padrão da entrada de 19/08 sobre o `DateRangePicker`)
confirmou os dois filtros populados com nomes reais, filtrando o funil
corretamente, e o cruzamento SDR↔Closer funcionando (selecionar "Thiago"
como SDR reduziu as opções de Closer a só "Jéssica"). PR #72, merge direto
a pedido do Junior.

### 2026-09-04 (2) — Performance: % de conclusão em vez de delta; SAL do SDR arredondado e preenchido

Dois ajustes rápidos em cima da entrada anterior (mesmo dia).

**% de conclusão, não delta.** "vs. esperado até hoje" mostrava um delta
assinado (ex.: "-18,6%"), que lê como déficit. Junior pediu o inverso: de 10
esperados, 8 feitos → mostrar "80%" (quanto já foi cumprido), não "-20%".
Novo `Ritmo.pctDoEsperado` (`realizado ÷ esperado × 100`, sem cap — passa de
100% quando adianta o ritmo); `deltaPct` continua existindo só internamente,
pro limiar do selo "no ritmo" (>= -2%), nunca mais exibido em texto. Aplicado
no `MetaRitmoCard` e nas duas linhas do `MetaBreakdownDrawer` por pessoa (a
segunda linha, "% da meta total", reaproveita `pctRealizado`, que já existia).

**Sem vírgula em meta fracionária, e meta de SAL do SDR preenchida.**
Rateio de meta entre 2 pessoas cobrindo a mesma marca (ex. SQL de Inpot ÷ 2)
gera número quebrado; o anel "Hoje" do popup mostrava isso cru com 1 casa
decimal ("0 / 1,9"). Novo `nfCeil()` (`Math.ceil`, sem decimal) substitui
`nf()` em todo card/popup com meta (SQL, RR, SAL, COF, Fechamentos) e no anel
de hoje — nunca mostra vírgula, e arredondar pra CIMA (não pro mais próximo)
evita subestimar o alvo. Junto, aplicada a meta de SAL do SDR de
setembro/2026 (`DB_Metas_Performance.meta_volume_sal`, achada mas ainda vazia
na entrada anterior): valor tirado da aba "SDRs" de `Metas 2026.xlsx`
("General - Líderes de Expansão" no OneDrive) — a segunda tabela da aba
(linhas 16-23) bate exatamente com o `meta_sql`/`meta_reuniao_realizada` já
cadastrados (total 245,3 / 145,2, idêntico à soma no banco), então o SAL dela
(total 86,9) é a fonte certa. Rateado entre os responsáveis de cada marca do
mesmo jeito que `meta_sql` já é (marca com 2 responsáveis parte a meta ao
meio, marca com 1 só leva o valor cheio), arredondado pra cima: Sarah/Oral
Unic=11, Sarah/Viva=7, Sarah/Eletrovias=10, Thiago/Inpot=14,
Thiago/Eletrovias=10, Thiago/B2Case=10, Thiago/Lisô Laser=3, Xayane/Inpot=14,
Xayane/Lisô Laser=3, Xayane/B2Case=10 — total 92 (soma dos arredondamentos
individuais, por isso maior que 86,9). SAL do **Closer** continua sem meta,
por decisão do Junior (entrada anterior).

Verificado: `npm run build` (tsc -b) + `npx vitest run` (205 testes) via
`~/ws-dashboard-build`, e o UPDATE conferido por SELECT contra o banco real.

### 2026-09-04 — Performance: metas diárias clicáveis + meta de SAL (SDR)

Junior pediu 4 ajustes nos cards de meta (SQL/RR/SAL/COF/Fechamentos/Receita)
da aba Performance:

1. **"Até hoje"** — os cards de meta diária (SQL, RR, SAL, COF) ganharam uma
   3ª estatística ao lado de "Meta do dia"/"Meta do mês": quanto já deveria
   ter sido feito no mês até a data de hoje (o número que já existia por
   trás do "-X% vs. esperado até hoje", agora também exibido cru).
2. **Cards clicáveis** — clicar num card com meta abre um popup
   (`MetaBreakdownDrawer`) com o desdobramento por pessoa: SQL/RR/SAL/COF
   mostram ritmo (barra + "esperado até hoje" + delta) e um anel com o
   resultado de **hoje** (realizado hoje vs. meta do dia da pessoa);
   Fechamentos/Receita mostram só Realizado × Meta do mês × % (não fazia
   sentido "hoje" pra metas que não são divididas por dia — item 4).
3. **Meta de SAL pro SDR** — descoberta ao investigar: `DB_Metas_Performance`
   já tinha a coluna `meta_volume_sal` (texto) com dado real desde jun/2026,
   só nunca tinha sido lida pelo dashboard (corrige a entrada de 03/09 acima,
   que dizia "SAL sem meta — não existe no banco"). Setembro ainda não tinha
   sido preenchido no momento desta mudança — o card mostra "—" até alguém
   lançar a meta do mês, igual qualquer outra meta ausente. Por decisão do
   Junior, só o SAL do **SDR** ganhou meta — o SAL do **Closer** (mesma
   coluna, dado também existe pros dois papéis) continua só volume, sem meta
   nem popup.
4. **Receita e Fechamentos só com meta do mês** — esses dois nunca foram
   pensados como "meta dividida por dia útil" (ritmo diário não faz sentido
   pra eles), então saíram do tratamento de ritmo — sem barra, sem "meta do
   dia", sem popup com "hoje".

Implementação: `MetaRitmoCard` ganhou `granularity: 'daily' | 'monthly'` +
`onClick`; `useMetasPerformance`/`useMetasTimeResumo` passaram a ler
`meta_volume_sal` (a de `useMetasTimeResumo` soma só linhas `funcao='SDR'`,
por decisão do item 3); novo módulo puro `src/lib/metaBreakdown.ts`
(`buildPersonMetaRows`/`buildPersonSimplesRows`) combina o realizado do
período e de hoje — os dois vêm de rodar `buildSdrRows`/`buildCloserRows`
(já existentes) com janelas diferentes, sem duplicar a lógica de agregação —
com a meta por pessoa. `SCard` (v2) ganhou `onClick` opcional.

Verificado: `npm run build` (tsc -b) + `npx vitest run` (200 testes) via
`~/ws-dashboard-build`. App exige login — não visto renderizado.

### 2026-09-03 (3) — Performance Detalhada vira "Performance" e migra pro stack da Visão Macro

A aba saiu de `vw_funil_compat`/`usePerformanceEquipe` + filtros próprios e
passou a consumir `useSharedFilters` + `useFunilVendas` + `useFunilEventos`,
igual à Visão Macro e ao `FunilCompletoSection` que já vivia nela. Agora tem a
`FilterBar` compartilhada inteira (marca multi, período multi, fonte,
sub-fonte, toggles) + `OrigemToggle`, e os números batem com a Visão Macro
(contagem por evento, com a trava "Reunião Agendada SQL só no funil do
Closer").

**Estrutura mantida:** duas seções, SDR e Closer. Cada strip de cards:
- SDR: MQL · SQL · RR · SAL (MQL e SAL sem meta — não existe no banco).
- Closer: Reuniões realizadas · SAL · COF · Fechamentos · Receita.
Cards com meta (SQL, RR no SDR; COF, Fechamentos, Receita no Closer) usam o
novo `MetaRitmoCard`: barra de ritmo acumulado (esperado até hoje, dias
corridos) + "meta do dia" = meta mensal ÷ dias úteis (segunda a sábado, sem
feriados, via `businessDaysInMonth`). **Metas só aparecem quando o período
resolve para exatamente 1 mês** — em multi-mês / trimestre / ano / dia os
cards caem pra volume simples, mesma lógica da Visão Macro que esconde "vs.
período anterior" em multi-seleção.

**Tabelas por pessoa retrabalhadas** (`buildSdrRows`/`buildCloserRows` agora
em `src/lib/performanceRows.ts`, sobre `FunnelRow`): SDR mostra MQL · SQL · RR
· SAL + Meta SQL + % + MQL→SQL; Closer mostra RR · SAL · COF · Ganhos ·
Faturamento + Meta Fat. + % + Win rate. Contagem por pessoa é por data de
etapa na linha do deal, atribuída ao `nome_sdr`/`nome_closer` — pode dar um
pouco menos que o strip (deal sem responsável), explicado em nota de rodapé
em cada seção.

**Extraído p/ compartilhar:** `funilFilterOptions` (o cruzamento "estilo
Excel" Marca × Fonte × Sub-fonte × janela) saiu de dentro de `FunilVendas.tsx`
pra `src/lib/funilFilterOptions.ts`; as duas páginas usam a mesma função.
`usePerformanceEquipe.ts` **não foi deletado** — Análise de Perda ainda o
consome (`vw_funil_compat` intacta no banco).

**Rota, arquivo e componente inalterados** (`/performance-vendas`,
`PerformanceVendas.tsx`, `export function PerformanceVendas`). Só o `<h1>` e o
label do menu viraram "Performance".

Verificado: `npm run build` (tsc -b) + `npx vitest run` (188 testes) via
`~/ws-dashboard-build`. O strip usa as MESMAS funções de contagem de
`metrics.ts` que a Visão Macro (`countStage`/`countStageEvents`/`countSales`/
`sumRevenue`), mas o app exige login — não foi visto renderizado nem
comparado por SQL contra a base.

Spec: `docs/superpowers/specs/2026-09-03-performance-migracao-visao-macro-design.md`

### 2026-09-03 (2) — SDR/Closer responsável ficava congelado no dono antigo
Junior reportou: no modo **Funil Atual**, os 9 deals em "Novo MQL" da Eletrovias
apareciam todos como do **Thiago** — mas Thiago está de férias e ele já tinha
reatribuído no RD todas as negociações Em Andamento para Xay/Sarah. Suspeita
dele: a contabilização de SDR/closer estava errada em toda a base, não só nesse
caso.

**Causa raiz.** `vw_deal_ciclo` elege `nome_sdr` amostrando `vw_deal_posse` no
instante `ts_fim_sdr` = `max(data_evento) FILTER (WHERE camada='SDR')` sobre
eventos **`mudanca_etapa`**. `troca_responsavel` não é `mudanca_etapa`, então
não avança esse âncora. Um deal que entrou na etapa uma vez e nunca mais se
moveu tem `ts_fim_sdr` congelado na data de entrada — qualquer reatribuição
posterior (a troca em massa da cobertura de férias) fica invisível para a
eleição, que segue devolvendo o dono da data de entrada. O snapshot
(`deal_snapshot.responsavel`) e o evento `troca_responsavel` estavam **certos**
(confirmado deal a deal contra a API do RD com o token do Junior: JACSON,
Marcelo Ultramari, Fernando Marcos Luiz etc. = Xayane no RD); o sync não tem
culpa. Nos casos em que um `mudanca_etapa` antigo de origem `webhook` carimbou
o então-dono, `sdr_evento` (fonte `'evento'`, tida como confiável) travava o
nome mesmo com posse mais nova — mesmo sintoma, sub-caso. Blast radius medido:
**188 de 2.051 deals Em Andamento ainda na fase SDR (9,2%)** + 6 na fase Closer
com `nome_closer` defasado.

**Fix — `vw_deal_ciclo` (`CREATE OR REPLACE VIEW`, matview não tocada na DDL;
`REFRESH` rodado depois).** Nova fonte `posse_atual`: para o **ciclo corrente**
com `deal_snapshot.status IN ('open','ongoing')`, conforme a **camada da etapa
atual** do deal (`datas.camada_atual` = camada do último `mudanca_etapa`) —
etapa SDR escreve `nome_sdr`, etapa Closer escreve `nome_closer` — o nome vem do
intervalo de posse aberto (`vw_deal_posse.fim IS NULL` = dono atual do RD), com
prioridade sobre `evento`/`posse`/`campo_rd`. Deal **Ganho/Perdido, ciclo
antigo, ou numa etapa da outra camada** não tem o lado dele tocado — o SDR
histórico continua congelado no handoff (regra de negócio: quem trabalhou o
deal). CTEs novas `ciclo_max` e `posse_atual`; `datas` ganhou `camada_atual`;
`campos_rd` ganhou `snap_status`; `sdr_fonte`/`closer_fonte` ganharam o valor
`'posse_atual'`. `vw_funil_vendas` não expõe essas colunas de fonte, então
**zero mudança no front** (pass-through).

A 1ª versão do gate usava `ts_fim_closer IS NULL` p/ escolher o lado — isso
punha o nome de um SDR na coluna de **Closer** se um deal em No Show (camada
SDR, mas que já passou pelo Closer) fosse reatribuído a um SDR. Trocado no
mesmo dia para `camada_atual` (migration `..._gate_por_camada_atual`); com isso
os 9 No Show deixam de aparecer com `nome_sdr` histórico e passam a seguir o
dono atual como SDR.

**Verificado.** Simulação da view inteira sobre a base real. Checksum de
`vw_funil_vendas` idêntico antes/depois (7.013 linhas, 6.689 ciclo atual, 45
ganhos, R$ 1.998.779,98, 4.745 perdidos, 2.223 em andamento). Pós-fix (gate
`camada_atual`): divergência entre `nome_sdr` e o dono atual do RD, para deals
Em Andamento **numa etapa de camada SDR**, caiu de **188 → 0** (2.051 deals);
divergência `nome_closer` em deals numa etapa Closer, 6 → 0. Nenhum ciclo
fechado/passado nem o lado da outra camada foi alterado. Odonto Scale intocado
(2 sem SDR eleito, pré-existente). Rollback salvo no scratchpad da sessão.

**Automático daqui pra frente.** Reatribuir o responsável no RD propaga sozinho:
`wf_5` (5 min) ou `espelhar-rd` edge (15 min) grava `troca_responsavel` +
atualiza `deal_snapshot` → `vw_deal_posse` recalcula o intervalo aberto →
`posse_atual` → matview refaz a cada 2 min. Latência total ~2–7 min. Validado
end-to-end com reatribuições reais de 03/09 (ex.: Thiago→Sarah às 19:35, já
refletido em `vw_funil_vendas` ~30 min depois sem intervenção).

### 2026-09-03 — Funil Atual: "Reunião Agendada SQL" só no funil do Closer
Junior reportou (de novo) que no modo **Funil Atual** da Visão Macro a etapa
"SQL · Reunião agendada" listava deals do funil do **SDR**, não só do Closer.

**Causa raiz.** Os modos de evento (Performance/Aging) já aplicavam a trava
`STAGE_ID_OBRIGATORIO` (`id_etapa` do evento === `69b1badfe1def700137f1b89`,
o Closer). O modo Atual não olha o histórico de eventos — resolve a etapa
corrente de cada deal com `resolveStage(r.etapa_funil)`, e `etapa_funil` só
carrega o **nome** da etapa, idêntico ("Reunião Agendada SQL") no funil do SDR
e no do Closer. `FunnelRow` nunca carregou o id da etapa corrente. Medido na
base: 21 deals vivos nessa etapa no Closer (`69b1bad…`), 7 no SDR
(`69380917e00ed10014daaa68`), 1 em Odonto Scale — os 7 do SDR eram os do print.

**Fix.**
- **Banco:** `vw_funil_vendas` ganhou `id_etapa_atual` (= `s.id_etapa`,
  `deal_snapshot` já estava no JOIN pro `sub_fonte_crm`). `CREATE OR REPLACE
  VIEW`, matview não tocada. Checksum idêntico antes/depois (7.013 linhas,
  6.689 ciclo atual, 44 ganhos, R$ 1.983.779,98, 4.745 perdidos, 2.224 em
  andamento); `id_etapa_atual` preenchido em 7.013/7.013 (0 nulo — nenhum
  deal legítimo do Closer é descartado por falta de snapshot).
- **Front:** `FunnelRow.id_etapa_atual` + coluna no `COLS` do `useFunilVendas`;
  helper `currentStage(row)` novo em `metrics.ts` (resolve a etapa e, se ela
  tem funil obrigatório, exige `id_etapa_atual` batendo); `dealsInStage(…,
  'atual')` e o `atualLeadtime` de `FunilVendas.tsx` passaram a usá-lo no
  lugar de `resolveStage(etapa_funil)`. Deal parado na "Reunião Agendada SQL"
  do SDR agora sai do balde no Atual (não cai em etapa anterior — mesma
  semântica que Performance, que já descartava esses eventos).
- Só o modo Atual da Visão Macro mudou. `SopMarketing`/`BubbleMatrix` (lado
  Marketing) usam `resolveStage(etapa_funil)` cru e ficaram como estavam.

Verificado: `npm run build` (tsc -b) + `npx vitest run` (143 testes, +4
travando o caso) via `~/ws-dashboard-build`, e a distribuição conferida em SQL
contra a base real. App exige login — não visto renderizado.

### 2026-09-01 (2) — Bug real de perda duplicada corrigido; script ganha prompt interativo
Checagem pedida pelo Junior: `wf_6` corrigido foi importado no n8n (confirmado
por ele). Corrigido também o bug do deal preso achado ontem no `espelho_rd_edge`.

**Causa raiz do `duplicate key value violates unique constraint
"ux_deal_eventos_perda_por_dia"`:** o `INSERT` de `tipo_evento='perda'` em
`processar_deal_evento` só tinha `ON CONFLICT` pro índice de timestamp exato
(`id_deal, tipo_evento, id_etapa, data_evento`). Existe um **segundo** índice
único, `ux_deal_eventos_perda_por_dia` (parcial, por `id_deal` + dia
calendário em `America/Sao_Paulo`, só `WHERE tipo_evento='perda'`) — e
Postgres só aceita 1 alvo de conflito por `INSERT`. Deal perdido 2x no mesmo
dia (reaberto e perdido de novo, ou como no caso real, uma tentativa de sync
que colide com um evento de meses atrás no mesmo dia calendário) faz o
segundo insert estourar em vez de ser ignorado — e como a função inteira
falha, **o `UPDATE deal_snapshot` do fim nunca roda**, deixando o snapshot
travado no estado antigo pra sempre, não só o evento.

Caso real: `6a77d95d266e710001049644` — RD diz `win=false` desde 11/08, mas
`deal_snapshot.status` ficou preso em `'ongoing'` porque toda tentativa de
sync (várias, incluindo pelo `espelho_rd_edge` recém-ligado) morria na
segunda inserção de `'perda'` (já existia 1 evento de perda naquele mesmo
dia, via webhook). Confirmado com `select tipo_evento, data_evento,
(data_evento at time zone 'America/Sao_Paulo')::date from deal_eventos where
id_deal=... and tipo_evento='perda'` — 1 evento só, mesmo dia do `updated_at`
do RD.

**Fix:** envolvido só esse `INSERT` num bloco `BEGIN...EXCEPTION WHEN
unique_violation THEN...END` — não duplica o evento, mas ainda marca
`gerou_perda := true` (pra `registrar_fechamento` do caller seguir sendo
chamado) e, principalmente, **deixa a função continuar até o fim**, então o
snapshot atualiza. `CREATE OR REPLACE FUNCTION`, aplicado direto — resto da
função idêntico.

Testado chamando a RPC direto com os dados reais desse deal: sem erro,
`gerou_perda: true`, `deal_snapshot.status` virou `'lost'` corretamente, e
`deal_eventos` continua com só 1 linha de `'perda'` (não duplicou). Deal
liberado — não vai mais aparecer como falha nos próximos ciclos do
`espelho_rd_edge`.

**`docs/scripts/espelhar_rd.py` ganhou prompt interativo pras 3 credenciais**
(token do RD, URL e service key do Supabase), por pedido do Junior — ele
achou mais fácil e mais seguro que `export` (que deixa o valor salvo no
histórico do shell, `.zsh_history`/`.bash_history`). `getpass.getpass()`,
sem eco na tela, nada gravado em arquivo. Se as variáveis de ambiente já
estiverem definidas (uso em automação/CI), o script não pergunta — só
prompta o que estiver faltando. Testado com stdin simulado, os 3 valores
foram capturados certos.

Ver [[espelho-rd-edge-function-modo-observe]].

### 2026-09-01 — wf_6 corrigido (paginação, status normalizado, payload); achado erro recorrente no espelho live
Checagem de saúde do `espelho_rd_edge` (ligado ontem): backlog caiu de 5.772
para 5.051 durante a noite, maioria dos ciclos `success`. **Achado 1 erro
recorrente:** deal `6a77d95d266e710001049644` falha toda tentativa com
`duplicate key value violates unique constraint "ux_deal_eventos_perda_por_dia"`
— é o bug já registrado na seção 8 (`processar_deal_evento` sem tratamento
pra perda duplicada no mesmo dia). Não trava o resto do lote, só esse deal
fica perpetuamente sem sincronizar. Ainda não corrigido — Junior avisado,
decisão de prioridade em aberto.

**wf_6 corrigido** (`docs/scripts/n8n/wf_6-corrigido.json`, entregue pro
Junior importar no n8n — sem acesso direto à API do n8n nesta sessão). Três
bugs do diagnóstico de 31/08, todos resolvidos:
1. Lia `deal_snapshot` sem paginar — Supabase cortava em 1.000 de ~8.300
   linhas, 88% da base nunca conferida. Agora pagina em blocos de 1.000.
2. `status` derivado da listagem do RD (`open`/`lost`/`won` via `win`)
   comparado cru contra o `status` do banco (`open`/`ongoing`/`won`/`lost`) —
   `open` × `ongoing` são o mesmo estado e geravam ~174 alarmes falsos por
   dia. Agora normaliza os dois pra `em_andamento` antes de comparar, mesma
   `classeStatus()` da Edge Function.
3. Nunca comparava `payload` — por isso nunca pegaria o caso original de
   Fonte Macro. Agora compara campo a campo, mas grava **1 linha por deal**
   em `divergencias_sync` (lista os campos divergentes), não 1 por campo —
   pra não inflar a tabela com milhares de linhas por causa do backlog que
   o `espelho_rd_edge` já está corrigindo sozinho.

Sintaxe validada com `node --check` (função async envolvendo o código, mesmo
padrão de execução do n8n). Lógica é a mesma já testada ao vivo na Edge
Function — `comparar()`/`norm()`/`classeStatus()` idênticas, só reescritas
pro runtime do n8n. Não aplicado em produção nesta sessão — depende do
Junior importar o JSON.

**Nota esperada:** nos primeiros ~2 dias (enquanto o backlog do
`espelho_rd_edge` não zera), o wf_6 corrigido vai reportar os MESMOS ~5 mil
deals como divergentes de payload todo dia — é o comportamento certo, some
sozinho conforme o backlog é absorvido.

Ver [[espelho-rd-edge-function-modo-observe]].

### 2026-08-31 (3) — Modo live ligado: bug de memória achado e corrigido em produção
Junior autorizou ligar o modo `live`. Primeira tentativa **quebrou** — achado,
corrigido e revalidado na mesma sessão, documentado sem maquiagem.

**O que aconteceu.** Ao trocar `espelho_rd_config.modo` pra `'live'`, o
primeiro ciclo do `pg_cron` (21:45) travou com `WORKER_RESOURCE_LIMIT` (HTTP
546) e **não escreveu nada** (confirmado: 0 eventos com
`origem='api_espelho_edge'` antes da correção). O lock ficou preso — não é o
`comPrazo`/`finally` que cobre esse caso, só o auto-release de 20 min do
`deals_sync_tentar_lock`. Não esperei os 20 min: liberei manualmente e voltei
`modo` pra `'observe'` na hora, pra não ficar tentando de novo e falhando em
loop enquanto eu investigava.

**Causa raiz.** As duas estruturas grandes da varredura (`rdDeals`, ~8.700
objetos com até 90 campos cada; `snap`, ~8.300 do espelho) ficavam vivas na
memória do worker durante **todo** o loop de escrita, porque a função só
usava `.size` delas no retorno final — mas a referência inteira continuava
presa até esse ponto, impedindo o coletor de lixo de liberar espaço bem na
hora em que a escrita (GETs individuais ao RD, payload maior, mais lento)
mais precisava dele.

**Correção:** soltar as duas (`rdDeals.clear()`, `snap.clear()`) assim que
`porCategoria`/`plano` são calculados, guardando só `.size` em variáveis
primitivas (`rdTotal`, `snapTotal`) antes de entrar no loop de escrita.
Também reduzido `max_escritas_por_execucao` de 150 pra **30**, de propósito
conservador — evidência de que memória era a causa, não tempo, mas não custa
começar devagar. Reimplantado (v7), testado de novo com `modo=live`: **66,5s,
30 aplicados, 0 falhas, 59 eventos gerados**, todos com
`origem='api_espelho_edge'`, log íntegro em `sync_execucao`.

**Estado atual: `live`, rodando a cada 15 min, 30 por ciclo.** Restam ~5.772
divergentes — no ritmo atual (30/15min), zera em ~2 dias sozinho. Se quiser
mais rápido, `max_escritas_por_execucao` pode subir depois de ver alguns
ciclos limpos seguidos (`select * from sync_execucao where
job='espelho_rd_edge' order by iniciado_em desc`).

**Duas ações de configuração (`espelho_rd_config`, `deals_sync_liberar_lock`)
foram barradas pelo classificador de segurança do Claude Code** na primeira
tentativa (troca pra `live`, e antes disso a gravação da `service_role_key`
no Vault) — Junior liberou explicitamente as duas vezes. Reduzir
`max_escritas_por_execucao` e voltar `modo` pra `observe` (direção de menos
risco) passaram sem bloqueio.

Ver [[espelho-rd-edge-function-modo-observe]] (nome desatualizado agora que
saiu do modo observe, mas o conteúdo sobre timeouts/concorrência continua
valendo).

### 2026-08-31 (2) — Espelho automático via Edge Function + pg_cron (modo observe)
Continuação do item anterior. Junior pediu a reforma virar automática, não só o
script de terminal — mas primeiro cobrou garantia de que não ia pesar o banco.

**Diagnóstico prévio corrigido.** O pedido original ("voltou a perder eventos de
troca de responsável/marca") tinha premissa parcialmente errada: os eventos
continuam nascendo (`troca_responsavel`, `mudanca_marca` seguem até hoje em
`deal_eventos`). O que quebrou foi o **autor**: `origem='webhook'` tinha
responsável em 6.989/6.989 eventos (100%); `origem='api_sync'` (desde a migração
de 17/08, ver [[ingestao-por-cron-sem-autor-de-etapa]]) só em 1.148/3.450 (33%),
e `api_backfill_stage_history` em 0/1.162 — a API do RD não expõe quem moveu
etapa. **Voltar o webhook não resolveria** o problema original (Fonte Macro):
medido, eventos `mudanca_fonte_macro` com `origem='webhook'` só existem nos 2
dias do backfill por PUT (14/08, 17/08); em dia normal é zero, porque o
`crm_deal_updated` também não dispara em edição isolada de campo.

**Arquitetura:** Edge Function `espelhar-rd` (`supabase/functions/espelhar-rd/`,
Deno/TS) + `pg_cron` a cada 15 min via `pg_net`, mesmo padrão que o Marketing já
usa desde 13/08. Mesma lógica de diff do `docs/scripts/espelhar_rd.py` (varre RD
por `/deal_pipelines` + listagem paginada, compara contra `deal_snapshot`,
reescreve pelas mesmas RPCs do `wf_5`) — os dois são irmãos, não vão divergir de
propósito.

**Dois bugs achados só em teste ao vivo, ambos corrigidos antes de agendar:**
1. `fetch()` do Deno não tem timeout por padrão — uma chamada ao RD travou e
   prendeu o worker por minutos (`deals_sync_state.running` preso). Corrigido com
   `AbortSignal.timeout(15s)` por request + um prazo global (`Promise.race`,
   130s) cobrindo qualquer chamada, não só as do RD.
2. A listagem do RD leva **~6s por página** a partir da Edge Function (rede até
   o RD mais longa daqui que do Mac ou do n8n — não é lentidão do RD em si,
   confirmado repetindo a medição 3x). Sequencial (padrão do `wf_5`) levaria
   ~4-5min pras 44 páginas, estourando qualquer orçamento. Resolvido buscando 6
   páginas em paralelo (`Promise.allSettled`, só leitura, sem risco de escrita
   dupla) — cai pra ~35-43s medidos com 8.721 deals reais.

**Um WORKER_RESOURCE_LIMIT (HTTP 546) visto 1x** num teste de ponta a ponta
(depois resolvido sozinho — reprodução limpa em 42s logo em seguida). Quando
acontece, a plataforma mata o worker à força e o `finally` não roda — o lock
fica preso até o **auto-release de 20min** já existente em
`deals_sync_tentar_lock` (não é 100% coberto pelo `comPrazo`/`finally`, só o
timeout do lock cobre esse caso). Documentado no código como limitação
conhecida, não escondido.

**Segurança de credencial:** a `service_role_key` foi pro Vault
(`vault.create_secret`, nome `service_role_key`) — o Claude Code bloqueou a
primeira tentativa pelo classificador de segurança automático (ação sensível),
Junior liberou explicitamente antes da segunda tentativa. `invocar_espelho_rd()`
(SQL, `security definer`) busca a chave do Vault em tempo de execução — ela
**nunca aparece em texto plano** em `cron.job.command` nem em nenhum arquivo.
`get_secret()` (RPC criada no item anterior) só é executável por `service_role`.

**Estado atual: modo `observe`.** `espelho_rd_config.modo='observe'` — a cada
15 min ela varre, compara e loga em `sync_execucao` (job
`espelho_rd_edge`), mas **não escreve nada**. Rodando de verdade, mediu: 8.721
deals no RD, 8.352 no espelho, **5.801 divergentes** (mesma ordem de grandeza do
`espelhar_rd.py` medido no item anterior — 647 ausentes, 161 marca, 158 etapa,
1.030 funil, 97 status, 5.153 payload). Trocar pra `live` é 1 UPDATE
(`update espelho_rd_config set valor='live' where chave='modo'`), sem
reimplantar nada — Junior decide quando, depois de revisar uns dias de logs em
modo observe. Uma vez live, ela mesma vai gradualmente absorver o backlog
histórico (capada em `max_escritas_por_execucao`, hoje 150/ciclo — ~14 ciclos
pra zerar os 5.801), tornando o backfill manual opcional, não obrigatório.

Não verificado na tela — mudança é 100% de banco/infra, sem tocar no dashboard.

Ver [[rd-nao-bumpa-updated-at-em-campo-personalizado]].

### 2026-08-31 — Espelho do RD parou de acompanhar campo personalizado; script de backfill
Junior reportou 2 deals (`6a919da7336ff5002855e2b0`, `6a85e0f17d2dd70029c42354`)
com Fonte Macro "Franqueado" preenchida no RD e "Sem Classificação" no dashboard.

**Causa raiz: o RD não altera `updated_at` quando um campo personalizado é
editado.** Provado: o `deal_snapshot` gravou Fonte Macro vazia em 28/08 14:41 e
19/08 17:01 UTC — carimbos idênticos ao `updated_at` do RD, que não se moveu
depois da edição. Como o `wf_5` só lista deals com `updated_at > watermark`,
esses deals ficaram abaixo da marca e nunca mais seriam olhados. Não é lag: o
sync está saudável (3.405 execuções, zero falhas).

**O webhook não resolveria.** Medido: eventos `mudanca_fonte_macro` com
`origem='webhook'` só existem em 14/08 (134) e 17/08 (222) — os dias do backfill
por PUT na API. Em dia normal, zero. O `crm_deal_updated` também não dispara em
edição isolada de campo. Confirma [[ingestao-por-cron-sem-autor-de-etapa]]:
não reativar o webhook.

**O que o Junior sentiu ("perdi os eventos de troca de responsável/marca") é
outra coisa, e é real:** os eventos continuam nascendo, mas perderam o autor.
`origem='webhook'` tinha responsável em 6.989/6.989 (100%); `origem='api_sync'`
tem em 1.148/3.450 (33%), e `api_backfill_stage_history` em 0/1.162 — porque
`registrar_stage_history` não tem parâmetro de responsável. Some a isso que
eventos de campo hoje só nascem de carona em outra mudança.

**Escopo medido** (8.717 deals do RD × 8.348 do espelho, campo a campo):
5.802 deals divergentes — 1.030 de funil, 647 nunca ingeridos, 161 de marca,
158 de etapa, 97 de status, 5.154 com algum campo do payload. Impacto na Visão
Macro: **+916 deals entram** (512 Prospecção Ativa, 211 Odonto Scale, 170 SDR,
23 Closer; 711 Oral Unic; 5 são ganhos), **131 saem** (movidos para Lisô Laser
no RD), e **170 deals visíveis hoje já foram apagados no RD**.

**Entregue:** `docs/scripts/espelhar_rd.py` — varre o RD inteiro (44 páginas,
a listagem já traz os campos personalizados), resolve o funil por um mapa
etapa→funil de `/deal_pipelines` (1 request; conferido 8/8 contra o GET
individual), compara contra `deal_snapshot` e reescreve só o divergente pelas
MESMAS RPCs do `wf_5`, com `p_origem='api_espelho'`. Dry-run por padrão, segura
o lock do `wf_5` (90 min) para não competir, libera sem avançar o watermark,
faz backup do estado anterior em JSONL e tem checkpoint retomável. Nunca apaga:
deals sumidos do RD saem em `saida/sumiram_do_rd.csv` para revisão. Credenciais
só por variável de ambiente — o repo é público.

Aplicado até agora **apenas nos 2 deals do report**, como validação: 2 eventos
`mudanca_fonte_macro` gerados, e confirmado em `vw_funil_vendas` após o refresh
da matview. O backfill completo (~5.802 deals, ~1h) é decisão do Junior.

**Bugs achados no `wf_6` (reconciliação), ainda não corrigidos:** lê
`deal_snapshot` sem paginar e o PostgREST corta em 1.000 de 8.348 linhas (88% da
base nunca é conferida); compara `status` da listagem (`open`, derivado de `win`)
com o do snapshot (`ongoing`), gerando 174 falsos positivos; e não compara o
`payload`, sendo cego justamente para campo personalizado. O `wf_8` grava alertas
em `sync_dlq` com destino "PLACEHOLDER" — 2.130 acumulados desde 20/08, ninguém lê.

### 2026-09-03 — /okrs: Vendas com toggle acumulado/fixo, células com 2 métricas, redução pra 3 abas
Junior pediu 5 ajustes na `/okrs` (PR #54, um dia depois dos 4 PRs da
sessão anterior):

1. **Célula Vendas + Receita juntas** (sem toggle Receita/Vendas). Cada
   célula mostra vendas no topo (com sufixo "venda(s)"), receita compacta
   abaixo e % de atingimento colorida. % prioriza meta de quantidade; se
   marca não tem `meta_qtd_vendas`, cai na de receita.
2. **Toggle Meta fixa × Meta acumulada** (default Fixa). No modo
   acumulado, cada mês compara realizado (jul + … + M) vs meta
   (jul + … + M). Coluna "H2 total" é o semestre inteiro nos dois modos.
   Acumulação é feita no componente via prefix-sum por linha — hook
   `useVendasSemestre` não mudou.
3. **Redução pra 3 abas** (Copa · Meta de vendas · OKRs). Aba "Meta B2B"
   deixa de existir — bônus e OKRs B2B migram pra dentro da aba OKRs, que
   agora tem 3 seções: Bônus + OKRs B2B + placeholder B2C. Meta B2C fica
   junto pra usar a mesma UI editora quando os KRs forem definidos.
4. **Cleitinho removido** (bloco + `CleitinhoExample`/`CleitinhoRow` +
   `SALARIO_ANALISTA` + wrapper `OkrsList` — tudo código morto).
5. **H2 total intacto**: Junior questionou se estava puxando o semestre
   ou só o mês. Verificado — já vinha do semestre desde o PR #50 (soma
   dos 6 meses), sem regressão.

Diff líquido −100 linhas (código morto removido). Build 238ms, 139 testes.

### 2026-09-02 — /okrs vira hub com 4 abas: Copa restaurada, Vendas do semestre e placeholder B2C
4 PRs incrementais reorganizaram a `/okrs` (criada 01/09 com apenas Bônus +
Cleitinho + 2 OKRs). Junior pediu separar coisas diferentes que estavam
empilhadas na mesma página.

- **PR #50 · Vendas do semestre.** Bloco novo antes dos OKRs: tabela
  **marca × mês (jul-dez/2026)** com realizado × meta cadastrada, toggle
  Receita ↔ Vendas, cores no atingimento (verde ≥100%, âmbar 50-99%,
  vermelho <50%, cinza sem meta). Total consolidado na última linha.
  Consolidado Inbound + Prospecção Ativa (PA tem 0 vendas hoje, mas
  aparece automático quando começar a ganhar). Novo hook
  `useVendasSemestre.ts`: 1 query em `DB_Metas_Performance` + 1 em
  `vw_funil_vendas` (Supabase Expansão), agrega client-side — mesmo padrão
  do `useHistoricoAtingimento`.
- **PR #51 · 4 abas + restaura Copa.** Página em pill sticky no topo:
  🏆 Acompanhamento Meta (default) · 📊 Meta de vendas · 🎯 Meta B2B · 🚩
  OKRs. `MetaCopaB2B.tsx` (559 linhas, versão de 11/ago) tinha sido
  deletado por engano em 01/09 quando a `/okrs` foi criada — restaurado
  agora como aba interna. `constants/copab2b.ts` sempre esteve tracked, só
  o componente foi removido. **Meta B2B** herdou o Bônus + Cleitinho + 2
  OKRs. **OKRs** é placeholder (B2C entra em PR futuro).
- **PR #52 · Setembro/26 na Copa.** `getMesCorrente()` caía no fallback
  AGO_26 e a Copa abria em agosto mesmo estando 02/09. Adicionado
  `SET_26: CopaMesConfig` (30 dias, `fechado=false`, mesmo baseline
  maio/26 de jul/ago — decisão explícita do Junior de manter). `AGO_26`
  marcado como `fechado=true`. Dropdown fica [Set, Ago, Jul] mais recente
  primeiro; fallback aponta pra SET_26.
- **PR #53 · Metas por Marca lê dado real** (feito pelo Junior + Claude
  Sonnet 5, fora desta sessão). A seção "Metas por marca (franqueadora)"
  da Campanha de Metas rodava mockada — dependia de `DB_Metas_Marca` que
  nunca chegou a existir e mostrava números divergentes da fonte real
  (Inpot 3/224.7k em vez de 5/374.5k). Trocado pra `DB_Metas_Performance`
  (`funcao='Closer'`), agregado por marca — mesma tabela dos cards de
  Closer e Grid dos SDRs. Novo `useMetaPorMarca.ts` substitui
  `useMetasMarca.ts` (removido). Sai o aviso "tabela não existe", a
  coluna Ação/Editar e o modal de edição — vira leitura pura. Renomeado
  "Metas por marca (franqueadora)" → "Metas por Marca". Set/26 conferido
  contra o SQL: Inpot 5/374500, Eletrovias 4/159600, B2Case 4/40000, Oral
  Unic 2/149800, Lisô 1/39900, Viva 1/69900.

### 2026-09-02 — Ad creatives via Meta API (substitui mapa manual)
Cobertura de links de anúncios na Saúde da Marca estava em **2%** pra Oral
Unic e 33-68% nas outras marcas — `src/lib/creativeAssets.ts` é um mapa
manual (99 entradas) que ninguém mantinha atualizado enquanto o portfólio
escalou pra 215 anúncios ativos.

Nova infra automática:
- Tabela `public.ad_creatives` (Marketing) com 2.448 registros: ad_id,
  ad_name, marca, page_id, post_id, post_url, effective_object_story_id.
- Edge Function `ingest-meta-creatives` puxa `/act_<id>/ads?fields=id,
  name,creative{effective_object_story_id}` das 8 contas Meta e monta
  post_url a partir do story_id (`<page_id>_<post_id>` → `facebook.com/
  <page>/posts/<post>`). Token vem de `META_ACCESS_TOKEN` no Vault.
- Novo hook `useAdCreatives` retorna Map<ad_name, post_url> paginado.
- `SaudeDaMarca.buildCampaigns` prioriza URL do banco, cai pro mapa
  estático como fallback (retrocompatível).

Cobertura pós-migração (30d, anúncios Meta ativos):
- Oral Unic 2% → 93% · Inpot 40% → 90% · B2Case 33% → 93% · Viva 41% → 93%
- Eletrovias 67% → 94% · Lisô 68% → 91%
- Odonto Scale e Scale Partners continuam 0% (sem anúncios Meta ativos
  nas contas mapeadas — usam Google Ads / RSA que nunca tiveram postUrl)

**Pendência:** agendar `ingest-meta-creatives` via `pg_cron` (não incluído
neste PR). Enquanto não roda diariamente, anúncios criados depois de
01/09 ficam sem link até rodar manual.

### 2026-09-01 — Página /okrs (Meta & OKRs H2 2026) substitui Copa B2B, e Modo GP (tema F1) no dashboard inteiro
Duas frentes no mesmo dia.

**Página /okrs.** Página `MetaCopaB2B` (protótipo trainee de julho, sem
uso) foi removida. Substituída por `/okrs` com 3 blocos originais: (1)
'Como funciona o bônus' com split 50% empresa / 30% OKRs / 20% avaliação,
(2) simulado Cleitinho com analista R$ 5k, (3) 2 OKRs editáveis (5% MQLs
owned + reduzir CP-MQL 20%). Editor persiste em tabela nova
`public.okrs_h2` no Supabase Marketing (criada via MCP em 01/09). RLS:
leitura + escrita pra authenticated. Hook `useOkrs` + `updateOkrValor`
cuidam da leitura/upsert. Rota `/copa-b2b` vira redirect pra `/okrs`
(bookmarks preservados). Menu 'Acompanhamento Meta' vira 'Meta & OKRs'.
*(A Copa voltou em 02/09 como aba interna — ver entrada acima.)*

**Modo GP (tema F1).** 4 PRs incrementais entregaram o tema visual F1 pra
setembro:
1. Tema base: `data-gp='f1'` no `<html>`, brand-accent vermelho F1
   (#E10600), tracejado 3px no topo, sidebar carbono, liveries por
   marca (Oral Unic roxo Mercedes, Inpot verde, Eletrovias laranja,
   etc.). Toggle bandeira 🏁 na topbar + botão ▶ pra reexibir intro.
   Default LIGADO em setembro/2026, DESLIGADO em outros meses.
   Hook `useGpMode` + CSS em `src/styles/gp-mode.css`.
2. `GpIntro` — animação fullscreen de abertura com wordmark 'WE SCALE'
   letra a letra (stagger 0.09s), swoosh vermelho, chips e ações.
   Roda em toda sessão até user clicar 'Não mostrar novamente'
   (localStorage `ws-gp-intro`).
3. `GpStrip` — faixa carbono de corrida em todas as páginas exceto
   `/gp-setembro`. Chips: volta atual, P1 do ranking (dados reais de
   `useMetasClosers`), dias pra bandeirada, pool R$ 12k.
4. `SennaCard` no rodapé da sidebar (foto real `public/assets/senna-
   monaco.png`, 1MB) + prêmio 'Troféu Senna · Mônaco 88' nos incentivos
   da Campanha de Metas.

Página `/gp-setembro` rebuild nativo (React) — antes era iframe pro HTML
Claude artifact de 2MB. Estrutura F1 completa: hero, toggle Ciclo, 4
voltas, coluna Classificação P1-P4 (Jéssica, Douglas, Aurélio, Bruna),
Meta do time, 4 cards de prêmios (incluindo Troféu Senna), grid de
pilotos com foto real (jessica.png, douglas.png, aurelio.png), tabela
histórico mar-ago, Grid dos SDRs (Sarah, Thiago, Xayane, Vanessa Daniel)
e seção Metas por marca (planilha franqueadora).

### 2026-08-31 — Sub-fonte: fallback pro campo do RD + opções cruzadas com os demais filtros
Junior reportou dois problemas no filtro de Sub-fonte da Visão Macro: (1) em
Prospecção Ativa + Ago/2026 + Fonte "Prospecção Ativa", o dropdown de Sub-fonte
oferecia "Meta" e "Google" — e selecionar os dois zerava o funil, ou seja, essas
opções nem deviam estar lá; (2) `utm_source` vazio virava "Não identificado"
mesmo quando o deal tinha o campo "Sub-Fonte" preenchido no RD CRM.

**Correção 2 (feita primeiro, a 1 depende dela).** `vw_funil_vendas` ganhou
`LEFT JOIN deal_snapshot s ON s.id_deal = d.id_lead` e a coluna
`sub_fonte_crm = NULLIF(btrim(s.payload->>'Sub-Fonte'),'')` no fim —
`CREATE OR REPLACE VIEW`, **matview não tocada**. Join por PK, 1:1; checksum
idêntico antes/depois (6.252 linhas, 5.940 ciclo atual, 41 ganhos,
R$ 1.935.827,98, 4.499 perdidos, 1.712 em andamento). 1.344 deals da view
passam a ter sub-fonte real vinda do RD (antes todos em "Não identificado").
`normalizeSubFonte(utmSource, subFonteCrm?)` (`fonteMapping.ts`): com
`utm_source` vazio ou template de UTM não resolvido, devolve o valor **cru** do
RD (`Lista Oral Unic David`, `Feira de Franquias 2026`, `Busca Orgânica`,
`SBC Repasse`…), sem agrupar — são nomes de lista/evento/repasse que não mapeiam
nos grupos de tráfego. Retorno deixou de ser a união fechada `SubFonteGrupo`;
`SUB_FONTE_GRUPOS` sobra só como semente da lista, e saiu do piso das opções em
`FilterBar`. `sub_fonte_crm` entrou em `FunnelRow`, no `COLS` de
`useFunilVendas` e no `buildScopeFilter` de `metrics.ts`.

**Correção 1.** As listas `marcasDisponiveis` / `fontesDisponiveis` /
`subFontesDisponiveis` em `FunilVendas.tsx` viraram um `opcoesFiltro` único que
cruza os três: cada lista aplica **todos os outros** filtros ativos (origem já
vem no fetch + marca + fonte + sub-fonte) **e** a janela de período — menos o
próprio filtro. "Deal na janela" = tem alguma data de etapa (`STAGE_DATE_FIELD`,
as 12 do funil) dentro de `win`, ou só o MQL no modo safra. Reproduz o cenário
do Junior: no recorte Prospecção Ativa + Ago/2026 + Fonte "Prospecção Ativa" o
dropdown de Sub-fonte agora mostra só `Lista Oral Unic David` (695) e
`Não identificado` (18) — Meta e Google somem porque não têm deal no funil de
agosto. Inbound + Ago/2026 continua com Meta (881), Google (78) e agora também
`Feira de Franquias 2026` (71), `Busca Orgânica` (5) etc., antes diluídos em
"Não identificado" (que caiu pra 121).

**Ressalva pré-existente, não regride:** com **exatamente 1 marca** selecionada,
o fetch já filtra no servidor, então o dropdown de Marca só mostra aquela marca
(era assim antes). No Consolidado (padrão) e com 2+ marcas o cruzamento de Marca
funciona pleno. Só a Visão Macro tem essa barra — Performance Detalhada usa
filtros próprios e não foi afetada.

Verificado: `npm run build` (tsc -b) + `npx vitest run` (139 testes) via
`~/ws-dashboard-build`, e a lógica conferida em SQL contra a base real. App
exige login, então não foi visto renderizado.

### 2026-08-28 — Odonto Legacy na SOP: rename, KPI strip novo, volume por etapa CRM, funil inverso scrollable
Junior pediu quatro coisas no slide Odonto Legacy da SOP, aplicadas nas duas
superfícies (React `SopMarketing.tsx` + estática `sop-weekly.html`):

1. **Rename**. Label da aba passa de "Odonto Scale" (React) / "Oral Unic Legacy"
   (HTML) pra `Odonto Legacy` nos dois. `marca: 'Odonto Scale'` continua no
   banco (regra `feedback_odonto_vocabulario.md`).
2. **KPI strip vira 3 cards**: `Invest · MQL · (CP-MQL + Custo/membro
   comunidade)`. Removi LEADS. O 3º card ficou duplo: `KpiCard` ganhou campo
   opcional `extra?: { label; value }` renderizado abaixo dos deltas com
   divisor. Custo/membro = `mtdInvest / COMUNIDADE_LEGACY_ATUAL.total` (80,
   hardcoded no constants). No HTML a `mkt` table equivalente passou de
   `[Invest, MQL, Leads]` pra `[Invest, MQL, CP-MQL, Custo/membro]` — sem os
   dois valores (semana/MTD) sendo divididos por 80 (semana R$ 64 é meio sem
   sentido, mas mantém a paridade visual do layout).
3. **Volume por etapa do CRM** abaixo do gráfico MQL Semanal (Col 1) — só
   Odonto Legacy. Snapshot: deals ativos hoje agrupados pelas 8 etapas da
   Visão Macro (`MACRO_STAGES_SOP` local ao arquivo, mesma sequência do
   `MACRO_STAGES` de `FunilVendas.tsx`). Usa `resolveStage` do `metrics.ts`
   sobre `rawCrmAll` já filtrado por marca pelo `useVendasFunil`. No HTML
   virou um bloco `extras` novo com valores hardcoded do snapshot 28/08
   (MQL 2 · Contato efetivo 1 · SQL 1 · Diagnóstico 1 · SAL 2 · resto 0);
   16 deals em Tentando Contato ficam de fora (não estão na Visão Macro).
4. **Funil Inverso scrollable** (mês corrente): `overflow: 'visible'` →
   `overflowY: 'auto'` no card da Col 3, mesmo padrão do card "MTD vs MTD"
   (Col 2). Caso mês fechado mantém `overflow: 'hidden'` porque o
   `ClosedInverseFunnel` tem layout fixo. Antes cortava embaixo quando o
   funil ficava mais alto que a coluna.

Deploy manual via rsync pra VPS (fora do fluxo padrão de PR). Commits
`e75eb8f` e `11d1c3b` ficaram na `deploy-local`, ainda não abertos em PR.

**Cuidado herdado** revelado no processo: a rotina de verificação diária
comparava `main` local com `origin/main`, achando que `deploy-local` estava
12 commits atrás. Não estava — `deploy-local` já continha os PRs #27-31 há
tempos. Ver `feedback_deploy_check_deploy_local_nao_main.md`.

### 2026-08-28 — Limpeza: removidas Cadências e Análise de Termos
Cadências não estava em uso ativo; Análise de Termos era redundante com a aba
"termos" dentro de Saúde da Marca (mesmo componente `TermosPanel`).

Removidos: `src/pages/Cadencias.tsx`, `AnaliseTermos.tsx`, `useCadencias.ts`,
`TouchpointDrawer.tsx`, tipos Fluxo/Motivo/Touchpoint/StatusExecucao/
PrioridadeTp em `types.ts`, dep `@xyflow/react` (20 packages a menos).
Total: 1.417 linhas + bundle Cadencias de ~201KB no chunk lazy.

Rotas antigas `/cadencias` e `/analise-termos` viraram redirect (pra `/` e
`/marca`) pra não 404 bookmarks e links no Slack.

`TermosPanel` preservado — SaudeDaMarca continua usando na sub-aba termos por
marca.

### 2026-08-28 — SOP Odonto Legacy · duas superfícies, foco novo
Card Odonto Legacy da SOP passou a focar em **receita + qualidade de execução
da comunidade** (não meta unitária, SQL, SAL, CP-MQL). Aplicado em duas
superfícies que precisam ficar em paridade:

1. `public/sop-weekly.html` (estática, reunião) — CSS scope `.legacy-theme`
   redefine `--teal` pra dourado; branch em `openBrand()` renderiza widget
   de comunidade em vez de funil inverso quando `b.key === 'odonto'`.
2. `src/pages/SopMarketing.tsx` (React, /sop-marketing) — quando
   `slide.marca === 'Odonto Scale'`: KPI strip de 7 vira 3 (INVEST/LEADS/MQL),
   MTD chart só MQL, sparkline CP-MQL oculto, Col 3 vira `ComunidadeLegacyPanel`,
   waterfall funnel oculto. Accent do slide de `#0ea5e9` (azul solto) pra
   `#7f0c72` (Legacy purple).

Widget: 80 membros (73 Legacy + 4 iscas + 2 lista espera + 1 outros),
quadrante dentista × clínica (ICP alto = dent+clin 24%, ~19 pessoas),
alerta de 4 leads duplicados. Números em `src/constants/comunidadeLegacy.ts`
pra Junior/Gabriel atualizarem semanalmente sem tocar em componente.

Cores do site legacy.oralunic.com.br: `#7f0c72` primário + `#efbe5b`/`#CC993E`
gold. Extraídas do CSS oficial do site (assets/styles-Dj8Jfko3.css).

### 2026-08-28 — Nova aba GP Setembro (Vendas)
Página estática de campanha de metas (tema Fórmula 1) como iframe em
`/gp-setembro`, mesmo padrão da Análise de Objeções. HTML gerado como
artifact Claude (bundler self-contained), copiado inteiro pra
`public/gp-setembro.html`.

Dados povoados: 5 closers reais de ago/2026 (Douglas, Jéssica, Aurélio,
Vanessa Daniel, Rômulo), meta Set distribuída por closer usando
mapping marca→closer observado em `DB_Metas_Performance` ago/2026 (Inpot→
Douglas, Oral Unic→Aurélio, Lisô/B2Case/Eletrovias→Jéssica, Viva→Douglas,
Legacy→Vanessa, Rômulo sem meta). Total time (soma): 32 un / R$ 769.752 —
não bate exatamente com R$ 723.800 do xlsx WE SCALE (só Franquia), porque
inclui Legacy da Vanessa. Se precisar segregar, avisar.

Componente do artifact (bundle interno) foi patchado pra:
- Renderizar unidades ao lado de R$ (card do time + card por piloto)
- Safe divide quando closer tem `metaMes: 0` (evita NaN no ranking)

Histórico mar-ago dos closers é real (% atingimento meta_financeira vs
ganhos do `vw_funil_vendas`), não mock. `INFO` (dia/semana do mês) recomputa
a cada carregamento — hoje mostra dia 0 pré-Setembro, começa a contar
1/09.

### 2026-08-27 — Override de origem para 2 deals contaminados por artefato técnico
Junior reportou pelo link do RD: o deal "Nunzio Juliano Latterza" (B2Case,
`6a870ab4c5cd95000121cc95`) aparecia em Prospecção Ativa com Fonte Macro
Inbound, e pelo histórico dele no CRM nunca tinha sido prospectado de verdade.

Investigação cruzando `deal_eventos` com a API oficial do RD (não é
divergência de sync — os dois concordam): o deal foi **criado direto** em
`Prospecção Ativa > Reunião Agendada SQL` às 20/08 11:09:57 (BRT), e movido
pro funil certo (`SDR > Interesse Reunião`) **15 segundos depois**.
`from_rdsm_integration: true` no JSON do RD — criação automática via
integração com RD Marketing, não ação humana. `utm_source=meta`,
`utm_medium=Instagram_Stories`: lead pago de mídia de verdade, não
prospecção. Achado um segundo deal idêntico (`6a881eeec881770001479615`,
Ademir Bicesto), mesma marca, mesma campanha RD ("B2Case > CRM (Limpo) -
Prosp Ativa", criada 19/08), mesmo padrão (bounce em 105s). Consultei a API
filtrando por essa campanha: **são exatamente esses 2 deals no total** — não
é problema sistêmico na fonte Meta (1.221 leads Meta de B2Case, só esses 2
tocaram Prospecção Ativa).

**Não dá para corrigir isso no RD.** Testado direto: `GET
/deals/:id/deal_stage_histories` devolve `404` — a API não expõe edição nem
exclusão de entrada de histórico de etapa. A única forma documentada de o RD
reescrever uma entrada é como efeito colateral de o deal **revisitar de
verdade** aquela etapa (ver `historico-rd-nao-e-imutavel` na memória) — e
forçar isso só pra "limpar" o dado poluiria o CRM de produção e nem
resolveria (a nova entrada ainda diria `nome_funil = 'Prospecção Ativa'`).

Fix ficou no nosso banco: `atribuicao_manual` ganhou a coluna
`origem_override` (mesmo padrão de `sdr_override`/`closer_override`, mesma
tabela, com `motivo` documentando a investigação), e
`vw_deal_origem_comercial` passou a dar prioridade a ela sobre a regra
(`COALESCE(ov.origem_override, <regra de sempre>)`). Nenhuma das 4 views que
leem dela (`vw_funil_vendas`, `vw_funil_etapas_v2`, `vw_funil_compat`,
`vw_marketing_funil`, `vw_perdas`) precisou ser tocada — herdaram a mudança
de graça. Os 2 deals passaram a `Inbound`; Prospecção Ativa caiu de 1.249
para 1.247 ciclos em `vw_funil_vendas`, exatamente -2.

**Uso do override é exceção, não regra geral.** Só pra casos confirmados
como artefato técnico (como este), nunca pra esconder prospecção real.

### 2026-08-27 — Toggle Inbound × Prospecção Ativa nas três abas de Vendas
Junior pediu para separar Visão Macro, Performance Detalhada e Análise de Perda
entre os dois motores comerciais, com toggle ao lado do título de cada aba.

**A regra que ele descreveu não cobria a base inteira.** O pedido era por
origem — nasceu em SDR/Odonto Scale/Closer, ou a retomada foi num desses. Medindo,
90 ciclos ficam de fora: nasceram num funil Inbound e foram movidos pro
Prospecção Ativa **no meio do ciclo**, sem perda entre as duas coisas (59 de
Odonto Scale, 27 do funil legado Oral Unic, 4 do SDR). Caso real:
`6a3fc687dc26a1001da6f887`, criado 27/06 em "Odonto Scale > Novos Leads",
movido pro Prospecção Ativa em 10/07 sem ter sido perdido, perdido lá em 17/07.
Junior decidiu: **Prospecção Ativa contamina o ciclo inteiro.** Regra e
alternativas descartadas na seção 3.

**Achado que simplificou tudo:** 0 deals em 6.126 têm um ciclo de cada origem.
Grão-deal e grão-ciclo dão resultado idêntico, então a classificação sai de um
agregado de `deal_eventos` — **a matview não foi tocada**, nem DROP, nem índice,
nem o job do `pg_cron`.

Banco: view nova `vw_deal_origem_comercial` + coluna `origem_comercial` por
`LEFT JOIN` (com `coalesce → 'Inbound'`) em `vw_funil_vendas`,
`vw_funil_etapas_v2`, `vw_funil_compat`, `vw_marketing_funil` e `vw_perdas`.
Tudo `CREATE OR REPLACE`, aplicado direto no Supabase de Expansão. Cobertura
100% (nenhum deal sem evento). Checksums idênticos ao antes em todas as 5 views:
6.035 ciclos, 40 ganhos, R$ 1.925.827,98 ao centavo.

`EXPLAIN ANALYZE` da query real do `useFunilVendas`: **11ms → 36ms por página**.
O critério definido no spec era materializar se passasse de 50ms — não passou,
então ficou como view. Se apertar, `mv_deal_origem_comercial` (6k linhas) no
mesmo cron de 2min resolve.

Front: `origem` no `SharedFiltersContext` (persistido, padrão Inbound, entra no
`resetFiltros`), `OrigemToggle.tsx` novo, slot `titleAside` no `PageTop`.
**O filtro é no servidor** — vale porque é sempre um valor só, sem a ambiguidade
que obriga a marca a filtrar no cliente com 2+ selecionadas. Efeito colateral
bom: Inbound são ~5 páginas em vez de 7, fica mais rápido que antes. E as opções
de todos os outros filtros (marca, fonte, sub-fonte, SDR, closer) passaram a
seguir o toggle de graça, porque já derivam das linhas carregadas.

**Cuidado herdado:** `origem_comercial` pode ser filtrada no servidor em
`vw_funil_etapas_v2`, mas `marca` não — a marca ali vem de retrato
denormalizado, nula em ~17% dos eventos. A origem vem de join com COALESCE e
nunca é nula; conferido que 14.873 + 1.636 = 16.509, o total da view.

**MQL da Performance Detalhada e da Análise de Perda trocou de banco.** Vinha do
Supabase de **Marketing** (`useLeads` + `isLeadMql`), que não conhece funil do
RD e por isso não separava por origem. Passou a vir de `data_novo_mql` da
Expansão, mesma fonte da Visão Macro — decisão do Junior, ciente de que o número
muda de patamar. `data_novo_mql` entrou no `.or()` de data do
`usePerformanceEquipe`, senão deal com MQL na janela mas criado antes sumia.
Referência de agosto/26: 765 MQL Inbound + 898 Prospecção Ativa — mais da metade
do topo do funil era prospecção diluída no consolidado.

Card de Meta ficou **inalterado** de propósito (meta cheia nos dois lados) — ver
pendência na seção 8.

**Não verificado na tela.** O app exige login e o ambiente desta sessão bloqueou
subir o dev server, então o toggle compila e está testado, mas ninguém olhou o
posicionamento renderizado.

Spec: `docs/superpowers/specs/2026-08-27-toggle-inbound-prospeccao-ativa-design.md`

### 2026-08-25 — Unidades mostra 0 (não 1) quando o deal não tem produto
Ajuste rápido logo depois de a coluna Unidades passar a aparecer em qualquer
etapa (entrada abaixo): Junior olhou o popup do MQL e viu **todo mundo com
"1 unidade"**, inclusive deals recém-criados sem produto nenhum — o
`GREATEST(...,1)` da view estava inventando "1" pra qualquer deal sem
`_quantidade_unidades`, o que é enganoso fora do contexto de venda ("tá
negociando 1 unidade" quando na verdade não tem produto definido ainda).

Troquei o piso de `GREATEST(COALESCE(_quantidade_unidades, al_unid, 1), 1)`
pra `GREATEST(COALESCE(_quantidade_unidades, al_unid, 0), 0)` em
`vw_deal_ciclo_enriquecido` — agora **0 = sem produto cadastrado**, valor
real = tem produto com essa quantidade. Checksum de novo idêntico (linhas,
ciclo atual, ganhos, soma de valor, perdidos, em andamento); a distribuição
mudou de 6.375 deals em "1" pra **6.111 em "0" e 284 com quantidade real**
(máx. 6).

**Não afeta o toggle de vendas.** `saleUnits()` (`metrics.ts`) já tinha seu
próprio piso independente (`q > 0 ? q : 1`) — pensado assim desde 19/08
porque uma venda fechada sem produto registrado ainda conta como 1 unidade
vendida. Como esse piso é aplicado no código, não na view, o toggle
Negócios×Unidades continua contando certo mesmo com a view agora devolvendo
0 pros ganhos sem produto. Só o que é **exibido** na coluna mudou.

`StageDealsDrawer.tsx`/`SimpleDealsDrawer.tsx`: fallback do frontend
`?? 1` → `?? 0` (cosmético — a view não deve mais devolver null, mas
mantém a semântica certa se acontecer).

Verificado com `npm run build` + `npx vitest run` (123 testes) via
`~/ws-dashboard-build`.

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
