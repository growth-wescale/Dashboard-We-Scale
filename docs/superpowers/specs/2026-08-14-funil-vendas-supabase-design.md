# Funil de Vendas — migração para o Supabase de Expansão

**Data:** 2026-08-14
**Branch:** `feat/funil-vendas-supabase`
**Escopo:** aba `/funil-vendas`. Performance Detalhada e Análise de Perda ficam para etapas seguintes. Análise de Objeções está fora.

---

## Problema

A aba Funil de Vendas mistura duas fontes de dados sem que isso esteja visível na tela:

- **MQL** vem da tabela `leads` do Supabase de **Marketing** (`jmuluoksnlqrvzbcltim`), marcado no código como `// MQL from leads table (marketing source of truth)` em `FunilVendas.tsx:258`. Como o MQL é o denominador, a Conversão MQL→Ganho também é meio-marketing.
- **Tentando Contato até Fechamento** vem do Supabase de **Expansão** (`cygxmduuwlwfbodfrlkr`), via `vw_marketing_funil`.

Além disso:

1. **Faltam 4 etapas.** `vw_marketing_funil` não expõe `data_interesse_reuniao`, `data_conexao`, `data_comite` nem `data_pre_contrato`. As colunas existem na view-mãe `vw_deal_ciclo_enriquecido`.
2. **O filtro de fonte usa a coluna errada.** O código lê `fonte`; a classificação de negócio está em `fonte_macro`. É a causa do donut "Vendas por fonte" exibir "Sem classificação 100%".
3. **Não há os controles de visualização** que existiam no dash Lovable: Negócios×Unidades, safra/coorte, Únicos×Passagens, e os modos Performance/Aging/Atual.
4. **Filtros não persistem** entre abas nem sobrevivem ao scroll.

## Objetivo

Toda métrica de volume do funil (MQL até Fechamento) passa a vir do Supabase de Expansão. O Supabase de Marketing continua alimentando **apenas** investimento de mídia, que sustenta CAC e ROAS.

---

## Arquitetura

```
Supabase Expansão (cygxmduuwlwfbodfrlkr)
│
├── vw_deal_ciclo_enriquecido        (existe — 1 linha por ciclo de vida do deal)
│     └── vw_funil_vendas            NOVA — base das abas de Vendas
│
├── vw_funil_etapas_v2               (existe — modo "Passagens")
├── vw_deal_etapa_periodos           (existe — modo "Aging")
└── vw_leadtime_stats                (existe — benchmark p50/p75 do Aging)

Supabase Marketing (jmuluoksnlqrvzbcltim)
└── media_daily_raw                  (existe — só CAC e ROAS)
```

### Por que uma view nova em vez de reaproveitar `vw_marketing_funil`

`vw_marketing_funil` renomeia colunas (`data_novo_mql`→`data_mql`, `data_agendamento_reuniao_sql`→`data_sql`, `data_reuniao_realizada`→`data_diagnostico`) e descarta 4 datas de etapa, `nome_sdr`, `nome_closer` e `passagens_no_ciclo`. Os renames conflitam com a camada `metrics.ts` portada do Lovable, que espera os nomes crus da view-mãe.

`vw_funil_vendas` é **aditiva**: não altera nem remove `vw_marketing_funil`, que continua servindo o hook atual até a migração das outras abas.

### SQL da view

```sql
create or replace view public.vw_funil_vendas as
select
  d.id_lead, d.ciclo, d.eh_reciclagem, d.eh_ciclo_atual,
  d.marca, d.nome_funil, d.etapa_funil, d.status_atual,
  d.nome_sdr, d.nome_closer,
  d.fonte_macro, d.sub_fonte, d.utm_source, d.utm_medium, d.utm_campaign,
  d.valor_contrato, d.quantidade_unidades, d.motivo_perda,
  d.data_criacao_negociacao, d.data_criacao_original,
  d.data_novo_mql, d.data_tentando_contato, d.data_contato_efetivo,
  d.data_interesse_reuniao, d.data_conexao,
  d.data_agendamento_reuniao_sql, d.data_reuniao_realizada, d.data_no_show,
  d.data_sal, d.data_oportunidade, d.data_comite, d.data_pre_contrato,
  d.data_venda, d.data_perdido
from public.vw_deal_ciclo_enriquecido d
where d.nome_funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale')
  and d.marca is not null and d.marca <> ''
  and d.status_atual is distinct from 'Excluído'
  and (d.nome_negociacao is null or lower(d.nome_negociacao) not like '%test%');

grant select on public.vw_funil_vendas to anon, authenticated;
```

O filtro de marca nula replica a decisão já auditada no hook atual (67 nulos + 12 vazios ignorados no consolidado).

---

## Etapas do funil

Doze etapas, na ordem. As quatro marcadas com `NOVA` não existem na tela hoje.

| # | Etapa | Coluna |
|---|---|---|
| 1 | MQL | `data_novo_mql` |
| 2 | Tentando Contato | `data_tentando_contato` |
| 3 | Contato Efetivo | `data_contato_efetivo` |
| 4 | Interesse Reunião `NOVA` | `data_interesse_reuniao` |
| 5 | Conexão `NOVA` | `data_conexao` |
| 6 | SQL · Reunião Agendada | `data_agendamento_reuniao_sql` |
| 7 | Diagnóstico | `data_reuniao_realizada` |
| 8 | SAL | `data_sal` |
| 9 | Oportunidade · COF | `data_oportunidade` |
| 10 | Comitê `NOVA` | `data_comite` |
| 11 | Pré-Contrato `NOVA` | `data_pre_contrato` |
| 12 | Fechamento | `data_venda` + trava `status_atual = 'Ganho'` |

`No Show` (`data_no_show`) permanece fora da sequência, exibido como badge lateral — deals podem voltar dela para o funil.

**O funil não é monotônico.** Em agosto, Pré-Contrato (3) > Comitê (2), porque deals pulam etapas. A UI não deve assumir volume decrescente nem calcular taxa de passagem negativa como erro.

---

## Camada de métricas

`src/lib/metrics.ts`, portado do dash Lovable com adaptações mínimas. Centraliza toda contagem, parametrizada pelos toggles. Regras que ele impõe:

- **Trava de venda:** um deal só conta como venda se `status_atual === 'Ganho'`, independente de `data_venda` estar preenchida.
- **Chave composta:** identidade de linha é `id_lead::ciclo`, nunca `id_lead` sozinho — um deal reciclado tem múltiplos ciclos.
- **Aliases de etapa:** `STAGE_ALIASES` resolve rótulos crus do RD (`"Diagnóstico (1 dia)"`, `"Negociação SAL (7 dias)"`, `"Tentando Contato (Cadência)"`, `"Pré Contrato (5 dias)"`) para a etapa canônica. Necessário no modo Atual, que lê `etapa_funil` cru.

Adaptações em relação ao original: `buildScopeFilter` passa a filtrar por `fonte_macro` e sub-fonte normalizada em vez de `fonte`.

---

## Filtros e toggles

`src/contexts/SharedFiltersContext.tsx` — estado único, persistido em `localStorage`, consumido pelas 3 abas de Vendas conforme forem migradas.

| Controle | Valores | Campo |
|---|---|---|
| Período | Dia / Mês / Trimestre / Ano + range livre | datas de etapa |
| Marca | lista de marcas | `marca` |
| Fonte | Inbound / Resgate / Sem Classificação | `fonte_macro` |
| Sub-Fonte | grupos normalizados | `utm_source` |
| Vendas | Negócios \| Unidades | `quantidade_unidades` |
| Deals criados no período | Off \| On | Off = data da etapa; On = safra de MQL |
| Contagem | Deals únicos \| Volume de passagens | troca a fonte para eventos |

Chaves de persistência: `wescale.vendas.periodo`, `.marca`, `.fonte`, `.subFonte`, `.salesMode`, `.funnelView`, `.eventSource`. Valores lidos do localStorage são validados contra o conjunto permitido antes de aplicar.

### Normalização da sub-fonte

`src/lib/fonteMapping.ts` agrupa variantes de `utm_source`:

| Grupo | Valores crus |
|---|---|
| Meta | `meta`, `ig`, `facebook`, `instagram`, `fb`, `an`, `forms nativo meta`, `facebookluizti` |
| Google | `google`, `adwords` |
| Evento | `evento`, `lp-evento`, `qrcode` |
| Landing Page | `landing-page-viva`, `inpot-landing` |
| Outros | demais valores preenchidos |
| Não identificado | vazio, `{{site_source_name}}` |

Mapa em constante editável. Valor desconhecido cai em "Outros" — nunca é descartado.

### Modo Passagens

Troca a fonte de `vw_funil_vendas` para `vw_funil_etapas_v2`, usando `rn_deal_etapa_mes = 1` para únicos e todas as linhas para passagens. Como essa view não expõe `fonte_macro`, o filtro de fonte é resolvido por `id_deal` contra o conjunto já filtrado na view principal.

---

## Modos de funil

Toggle local da seção do funil (não faz parte dos três toggles globais).

| Modo | Semântica | Fonte |
|---|---|---|
| **Performance** | volume que passou por cada etapa dentro do período | `vw_funil_vendas`, ou `vw_funil_etapas_v2` se Passagens |
| **Atual** | deals parados em cada etapa **neste momento**; ignora o filtro de período | `etapa_funil` onde `eh_ciclo_atual and status_atual = 'Em andamento'`, via aliases |
| **Aging** | há quanto tempo os deals de cada etapa estão parados (p50/p75) | `vw_deal_etapa_periodos` onde `data_saida is null`, com benchmark de `vw_leadtime_stats` |

### O Aging exige filtro de deals vivos

`vw_deal_etapa_periodos` não fecha o período quando o deal é perdido. Sem restringir a `status_atual = 'Em andamento'` e `eh_ciclo_atual`, o modo conta deals mortos e produz números sem sentido:

| Etapa | Sem filtro | Com filtro |
|---|---|---|
| Tentando Contato | 1.959 deals / p50 95,1 dias | 105 deals / p50 10,0 dias |
| Contato Efetivo | 1.019 deals / p50 65,2 dias | 159 deals / p50 16,0 dias |
| Interesse Reunião | 239 deals / p50 25,1 dias | 142 deals / p50 21,8 dias |

Com o filtro correto o gargalo real aparece: **Interesse Reunião**, com 142 deals parados há mediana de 21,8 dias.

---

## Layout

A faixa de filtros no topo passa a ser sticky: `position: sticky; top: 0`, `z-index` acima dos cards, com sombra aplicada ao descolar do topo. Apenas a faixa congela — cabeçalho da página e conteúdo rolam normalmente.

---

## Impacto nos números

Comparação no mesmo recorte da tela atual (consolidado, 01–14/08/2026):

| Etapa | Hoje | Depois |
|---|---|---|
| MQL | 311 *(marketing)* | **346** |
| Tentando contato | 309 | 323 |
| Contato efetivo | 212 | 215 |
| Interesse Reunião | — | **127** |
| Conexão | — | **86** |
| SQL · Reunião agendada | 60 | 61 |
| Diagnóstico | 34 | 34 |
| SAL | 14 | 14 |
| Oportunidade · COF | 4 | **5** |
| Comitê | — | **2** |
| Pré-Contrato | — | **3** |
| Fechamento | 1 | 1 |

Conversão MQL→Ganho passa de 1/311 para 1/346. A troca é feita sem aviso na interface (decisão do produto).

### Ressalva de qualidade de dado

O donut de fonte deixa de mostrar "Sem classificação 100%", mas **não fica limpo**: 35% dos MQLs de agosto genuinamente não têm `fonte_macro` no RD. A evolução é real e vale acompanhar:

| Mês | MQLs | % sem classificação |
|---|---|---|
| Abril | 667 | 100% |
| Maio | 799 | 100% |
| Junho | 817 | 100% |
| Julho | 1.019 | 76,8% |
| Agosto | 367 | 35,1% |

Isso é preenchimento faltando na origem, não defeito do dashboard. A tela passa a expor o problema em vez de escondê-lo atrás de uma coluna errada.

---

## Arquivos

**Novos**

| Arquivo | Responsabilidade |
|---|---|
| `vw_funil_vendas` (SQL) | base filtrada das abas de Vendas |
| `src/lib/metrics.ts` | toda contagem, parametrizada pelos toggles |
| `src/lib/fonteMapping.ts` | normalização de `utm_source` |
| `src/contexts/SharedFiltersContext.tsx` | estado dos filtros, persistido |
| `src/components/ui/FilterBar.tsx` | faixa sticky de filtros e toggles |
| `src/hooks/useFunilVendas.ts` | leitura de `vw_funil_vendas` |
| `src/hooks/useFunilEventos.ts` | leitura de `vw_funil_etapas_v2` (Passagens) |
| `src/hooks/useFunilAging.ts` | leitura de `vw_deal_etapa_periodos` + `vw_leadtime_stats` |

**Modificados:** `src/pages/FunilVendas.tsx` (consome a nova camada; `useLeads` sai), `src/App.tsx` (provider do contexto).

**Intocados:** `useVendasFunil.ts` e `vw_marketing_funil` permanecem até a migração de Performance e Perda. `useMediaData` continua servindo CAC e ROAS.

---

## Testes

O repositório não tem infraestrutura de teste. Adiciono `vitest` cobrindo apenas `metrics.ts` — lógica pura, sem rede:

- trava de venda: deal com `data_venda` mas `status_atual != 'Ganho'` não conta
- `salesMode: units` soma `quantidade_unidades`, com mínimo 1 quando nulo
- `funnelView: cohort` conta pela safra de MQL, ignorando a data da etapa
- `eventSource: unique` respeita `rn_deal_etapa_mes = 1`
- chave composta distingue ciclos do mesmo `id_lead`
- aliases resolvem os rótulos crus do RD
- normalização de sub-fonte agrupa variantes e não descarta desconhecidos

Verificação manual: `npx tsc --noEmit` limpo, e conferência dos 12 volumes de agosto contra a tabela de impacto acima.

---

## Fora de escopo

- Aba Análise de Objeções
- Migração de Performance Detalhada e Análise de Perda (etapas seguintes)
- Correção do preenchimento de `fonte_macro` no RD Station
- Itens de segurança do diagnóstico: RLS desabilitado em `atributos_legado` e `_backup_correcao_closer_20260807`; anon key do projeto de Marketing exposta no histórico do git
- Metas hardcoded em `src/constants/metasVendas.ts`

---

## Riscos

| Risco | Mitigação |
|---|---|
| Deploy automático em push para `main` | trabalho em `feat/funil-vendas-supabase`, merge só via PR aprovado |
| View nova sem grant para `anon` | `grant select` incluído no SQL; validar leitura pelo dashboard antes do merge |
| Volume de linhas no cliente | paginação de 1.000 mantida; ~6,7k deals hoje, agregação em memória como o Lovable já fazia |
| Divergência entre abas durante a transição | Performance e Perda seguem na fonte antiga até serem migradas; a diferença é conhecida e temporária |
