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
- `quantidade_unidades` — franquias por contrato, usado no toggle Unidades
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
src/components/ui/StageDealsDrawer.tsx    popup de deals de uma etapa (clique no funil)
src/components/ui/RepeatedDealsDrawer.tsx popup de repetidos — por etapa ou "todas as etapas" (modo Passagens)
src/components/ui/dealDrawerShared.tsx    BarList/topBreakdown/StatusBadge/cell/fmtData usados pelos dois popups acima

src/hooks/useFunilVendas.ts   lê vw_funil_vendas (sem filtro de data — o recorte é no metrics)
src/hooks/useFunilEventos.ts  lê vw_funil_etapas_v2
src/hooks/useFunilAging.ts    lê vw_deal_etapa_periodos + vw_leadtime_stats
src/hooks/useMetasPerformance.ts  metas por colaborador/mês + `useMetaResumo` (soma vários meses, sem quebra por pessoa)
```

### Os controles da barra

| Controle | Efeito |
|---|---|
| Marca | filtra no servidor |
| Período | granularidade (dia/mês/trimestre/ano) + quais períodos (multi-seleção estilo Excel, exceto no modo Dia) |
| Fonte / Sub-Fonte | `fonte_macro` / `utm_source` normalizado. **Opções vêm dos dados, nunca de lista fixa** |
| Vendas | Negócios × Unidades |
| Deals criados no período | Off = data da etapa · On = safra de MQL |
| Contagem | Deals únicos × Passagens |

Modos do card do funil: **Performance** (volume no período), **Aging** (há
quanto tempo parados), **Atual** (onde estão agora, ignora período). A Visão
Macro mostra um subconjunto de 7 etapas (MQL → Contato Efetivo → SQL ·
Reunião Agendada → Diagnóstico → SAL → Oportunidade → Fechamento); o funil
completo de 12 etapas fica em Performance Detalhada.

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

---

## 9. Histórico de mudanças

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
