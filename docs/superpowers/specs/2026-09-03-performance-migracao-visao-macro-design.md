# Aba "Performance" — migração para o stack da Visão Macro

**Data:** 2026-09-03
**Aba afetada:** Performance Detalhada (renomeada para **Performance**)
**Fora de escopo:** Visão Macro, Análise de Perda, Análise de Objeções, GP
Setembro, todas as abas de Marketing

---

## 1. Problema

A aba **Performance Detalhada** ainda vive na base antiga. O corpo da página
(strip de KPIs, seções SDR e Closer, metas, tabelas por pessoa, cards de
conversão) lê `vw_funil_compat` via `usePerformanceEquipe`, com **filtros
próprios** — um dropdown de marca com "Consolidado", dois `<input type=date>`
de mês, e só o toggle de origem vindo do contexto compartilhado. O único
bloco já migrado é `FunilCompletoSection`, que lê `vw_funil_vendas` +
`SharedFiltersContext` e por isso não conversa com o resto da própria página.

Consequências:

- **Os números não batem com a Visão Macro.** `vw_funil_compat` e
  `vw_funil_vendas` têm grão e allowlist diferentes; a contagem por linha de
  `usePerformanceEquipe` (uma passagem por `data_*` na linha do deal) não é a
  contagem por evento (`vw_funil_etapas_v2`) que a Visão Macro usa, e a trava
  "Reunião Agendada SQL só no funil do Closer" não é aplicada aqui.
- **Filtros divergentes.** Sem `FilterBar`, a aba não tem Fonte, Sub-fonte,
  multi-seleção de período, multi-marca, nem os toggles Unidades / Deals
  criados no período / Passagens. Trocar de aba troca o recorte sob os pés do
  usuário.
- **Metas sem leitura diária.** O card de meta (`GoalTracker`) mostra só o
  ritmo acumulado do time, sem a "meta do dia", e só para SQL do time e
  faturamento do time.

O Junior pediu: renomear para **Performance**, trazer **todos os filtros da
Visão Macro**, trocar os cards macro da seção SDR para **MQL · SQL · RR ·
SAL**, adicionar **meta diária** às métricas com meta cadastrada, e
retrabalhar a **Performance por SDR** (e, por decisão posterior, também a de
Closer) no mesmo padrão.

## 2. Decisões tomadas (rodada de perguntas 2026-09-03)

| Tema | Decisão |
|---|---|
| Estrutura | **Manter as 2 seções** (SDR / Closer), modernizando. Não virar cópia do funil único da Visão Macro. |
| "Meta diária" | **Barra de ritmo acumulado** (esperado até hoje, dias corridos) **+ "meta do dia"** = meta mensal ÷ dias úteis. |
| Dias úteis | **Segunda a sábado**, sem calendário de feriados. Só domingo fica de fora. |
| MQL e SAL (sem meta no banco) | **Card de volume sem linha de meta.** |
| Tabela por SDR | **Retrabalhar** para espelhar os cards: MQL · SQL · RR · SAL + % de meta. |
| Seção Closer | **Mesma reforma dos dois lados** — strip novo, metas diárias em COF / Fechamentos / Receita, tabela por Closer retrabalhada. |
| Totais do strip × tabela | **Strip = contagem da Visão Macro** (por evento, com trava do Closer). **Tabela = soma por pessoa** (por `nome_sdr`/`nome_closer` da linha). Diferença explicada em nota de rodapé. |

## 3. Renomear e roteamento

| Onde | Mudança |
|---|---|
| `src/components/AppLayout.tsx` (item de menu `performance-vendas`) | label `Performance Detalhada` → `Performance` |
| `src/pages/PerformanceVendas.tsx` `<h1>` | `Performance Detalhada` → `Performance` |
| Rota `/performance-vendas`, nome do componente `PerformanceVendas`, nome do arquivo | **inalterados** — não quebrar bookmarks nem links no Slack |
| Linha de rodapé da página | `Fonte: vw_funil_compat + DB_Metas_Performance` → `Fonte: vw_funil_vendas + vw_funil_etapas_v2 + DB_Metas_Performance` |
| `CLAUDE.md` | §1 tabela de abas (`Performance Detalhada` → `Performance`), §5 menções, §8 remover/ajustar o item de pendência da migração, §9 nova entrada de histórico |

Sem `<Navigate>` novo: a URL não muda.

## 4. Camada de dados — trocar o stack

### 4.1 Remover o caminho antigo

- `PerformanceVendas.tsx` deixa de importar `usePerformanceEquipe`,
  `FunilCompatRow`, `inPeriod`, `BRANDS_WITH_OVERVIEW`, `currentMonthRange` e
  o dropdown/estado de marca e mês locais.
- **Deletar `src/hooks/usePerformanceEquipe.ts`.** Verificado: nenhum outro
  arquivo importa `usePerformanceEquipe` nem `FunilCompatRow`. Se a busca no
  momento da implementação achar outro consumidor, o hook fica e só a página
  para de usá-lo — decisão registrada no plano.
- `vw_funil_compat` continua existindo no banco (Análise de Perda ainda não
  foi migrada e não é escopo aqui); só a Performance para de lê-la.

### 4.2 O que a página passa a consumir

Mesma montagem de `FunilVendas.tsx` / `FunilCompletoSection.tsx`:

```
useSharedFilters()      → origem, brandKeys, periodMode, periodValues, ranges,
                          range, fontes, subFontes, viewModes
useFunilVendas(origem, marcaFetch)     → linhas de vw_funil_vendas (sem data)
useFunilEventos({ origem, inicio, fim })→ eventos de vw_funil_etapas_v2
useMediaData(...)                       → só se algum card de Performance
                                          precisar de investimento (hoje não
                                          precisa; não incluir)
```

Boilerplate copiado 1:1 do que já existe nas duas telas:

- `marcasSelecionadas`, `todasSelecionadas`, `accent`/`dark`, `scopeLabel`,
  `marcaFetch` (busca no servidor por marca só com exatamente 1 marca).
- `marcasParaEscopo`, `scope = buildScopeFilter({ origem, marcas, fontes,
  subFontes })`, `scoped = rows.filter(scope)`.
- `win = toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end })))`.
- `idsEscopo = new Set(scoped.map(r => String(r.id_lead)))` para o `extra` de
  `countStageEvents`.
- `safra = viewModes.funnelView === 'cohort' ? cohortKeys(scoped, win) : null`.

### 4.3 Hook compartilhado de opções de filtro

A lógica "estilo Excel" que cruza Marca × Fonte × Sub-fonte com a janela de
período (`opcoesFiltro` em `FunilVendas.tsx`, ~linhas 462–488) é **extraída**
para `src/hooks/useFunilFilterOptions.ts`:

```ts
useFunilFilterOptions(rows: FunnelRow[], win: PeriodWindow, opts: {
  marcasParaEscopo: string[]
  fontes: string[]
  subFontes: string[]
  cohort: boolean
}): { marcas: string[]; fontes: string[]; subFontes: string[] }
```

Comportamento idêntico ao atual (mesma definição de "deal na janela": tem
alguma `STAGE_DATE_FIELD` dentro de `win`, ou só `data_novo_mql` no modo
safra). `FunilVendas.tsx` passa a consumir o hook no lugar do bloco inline;
`PerformanceVendas.tsx` consome o mesmo. `marcasDisponiveis` (mapear os
valores de `marca` de volta para chaves de `BRAND_LIST`) fica em cada página,
porque é trivial e específico da apresentação.

### 4.4 Cabeçalho e barra

```tsx
<PageTop
  title="Performance"
  titleAside={<OrigemToggle />}
  subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
  actions={<botão Exportar CSV do scoped>}
/>
<FilterBar
  marcasDisponiveis={marcasDisponiveis}
  fontesDisponiveis={opcoes.fontes}
  subFontesDisponiveis={opcoes.subFontes}
/>
<QueryErrorBanner errors={[erroFunil, erroMetas]} scope="Performance" />
```

`subtitlePeriodo` segue a mesma regra da Visão Macro (multi-período →
"N meses selecionados"; senão → "Ago 2026"). Export CSV: `downloadCsv(scoped,
'performance-<marcas>-<start>-<end>')`.

## 5. Contagem das métricas

### 5.1 Strip de cards (bate com a Visão Macro — por evento)

| Métrica | Fórmula |
|---|---|
| MQL | `countStage(scoped, 'MQL', win, viewModes)` |
| SQL | `countStageEvents(eventos, 'Reunião Agendada SQL', win, viewModes, { cohortIds: safra, extra: e => idsEscopo.has(String(e.id_deal)) })` |
| RR (Reunião Realizada) | `countStageEvents(eventos, 'Diagnóstico', win, viewModes, { … })` |
| SAL | `countStageEvents(eventos, 'SAL', win, viewModes, { … })` |
| Oportunidade COF | `countStageEvents(eventos, 'Oportunidade COF', win, viewModes, { … })` |
| Fechamentos | `countSales(scoped, win, viewModes)` (respeita `salesMode = units`) |
| Receita | `sumRevenue(scoped, win, viewModes)` |

A trava "Reunião Agendada SQL só conta no funil do Closer" já está dentro de
`vw_funil_etapas_v2` / `countStageEvents` via `STAGE_ID_OBRIGATORIO` — não
precisa reimplementar.

**Seção SDR — strip:** MQL · SQL · RR · SAL.
**Seção Closer — strip:** Reuniões realizadas (RR) · SAL · Oportunidade COF ·
Fechamentos · Receita.

### 5.2 Metas com leitura diária

Cards que recebem o tratamento de meta:

| Seção | Card | Coluna de meta em `DB_Metas_Performance` |
|---|---|---|
| SDR | SQL | `meta_sql` |
| SDR | RR | `meta_reuniao_realizada` |
| Closer | Oportunidade COF | `meta_cof` |
| Closer | Fechamentos | `meta_qtd_vendas` |
| Closer | Receita | `meta_financeira` |

**MQL e SAL não têm meta** → card de volume simples, sem barra nem "meta do
dia".

### 5.3 Componente `MetaRitmoCard`

Novo componente em `src/components/ui/MetaRitmoCard.tsx`, usado pelos cards
com meta das duas seções. Estrutura:

1. **Rótulo** + valor **Realizado** (número grande, no recorte/`win`).
2. **Barra de ritmo acumulado.** `esperado = metaMensal × (diaDoMes / diasCorridosDoMes)`;
   barra preenche `realizado / metaMensal`; marcador vertical no `esperado`;
   selo `no ritmo` (delta ≥ −2%) / `abaixo do ritmo`. É a mesma matemática do
   `GoalTracker` atual — o `GoalTracker` pode ser generalizado e reaproveitado
   internamente, ou substituído. `diaDoMes` = `min(diasCorridosDoMes,
   dayOfMonth(fimDaJanela))`.
3. **Meta do dia.** `metaMensal ÷ diasUteis(mes)`, exibida como linha
   secundária ("Meta do dia: 4"). `diasUteis` = dias do mês de segunda a
   sábado.

### 5.4 Quando as metas aparecem

O tratamento de meta (barra + meta do dia) só é renderizado quando **o
período resolve para exatamente um mês**:

- `periodMode === 'mes'` **e** `periodValues.length === 1`.

Nos demais casos (`dia`, multi-mês, `trimestre`, `ano`) os cards SQL / RR /
COF / Fechamentos / Receita caem para o formato de volume simples (sem barra,
sem meta do dia). Mesmo princípio da Visão Macro, que esconde "vs. período
anterior" em multi-seleção e o card de meta no modo Dia.

`mesKey` da meta = `periodValues[0]` nesse caso.

### 5.5 Fonte das metas do time

Novo hook `src/hooks/useMetasTimeResumo.ts`, modelado em `useMetaResumo`:

```ts
useMetasTimeResumo({ mesesKeys: string[] }): {
  porMarca: Map<string, {
    metaSql: number; metaReuniao: number
    metaCof: number; metaFinanceira: number; metaQtdVendas: number
  }>
  loading: boolean; error: string | null
}
```

Busca `DB_Metas_Performance` por `mes_referencia in (mesesKeys)` e
`funcao in ('SDR','Closer')`, exclui `marca in ('Geral','Outbound','Repasse')`
(mesma regra `MARCAS_EXCLUIR` de `useMetasPerformance`), soma por `marca`. A
página soma o subconjunto das marcas selecionadas (`marcasSelecionadas`) para
obter a meta do time no recorte. Com "Consolidado" (todas marcadas), soma
todas.

Helpers de total continuam em `useMetasPerformance.ts` para a Visão Macro;
os novos campos (`metaReuniao`, `metaCof`, `metaQtdVendas` por marca) vivem no
hook novo para não inchar a assinatura de `useMetaResumo`.

## 6. Tabelas por pessoa (retrabalhadas)

`buildSdrRows` / `buildCloserRows` reescritas para consumir `FunnelRow[]`
(`scoped`) em vez de `FunilCompatRow[]`. Os campos são praticamente os mesmos
nomes (`data_novo_mql`, `data_agendamento_reuniao_sql`,
`data_reuniao_realizada`, `data_sal`, `data_venda`, `valor_contrato`,
`status_atual`, `nome_sdr`, `nome_closer`).

- Contagem **por linha**: para cada deal do `scoped`, se a `data_<etapa>` cai
  em `win` (`isInWindow`, não mais `inPeriod`), credita a etapa ao
  `nome_sdr` / `nome_closer` da linha.
- Filtro de roster mantido (`useRosterVendas`, `rosterSetForSdr` /
  `rosterSetForCloser`).
- `% meta` por pessoa: `findMeta(metas, nome, 'SDR'|'Closer')` de
  `useMetasPerformance({ mesKey, marca: marcaFetch })`. Com 2+ marcas
  (ou Consolidado) a meta por pessoa é a soma de todas as marcas do mês
  (comportamento de `useMetasPerformance` sem `marca`) — documentado como o
  "alvo mensal cheio da pessoa".

### 6.1 Colunas

**SDR** (`SdrTable`): `Rank · Nome · MQL · SQL · RR · SAL · Meta SQL · % ·
MQL→SQL` — ordenada por `%` desc. `%` = `SQL da pessoa / meta_sql da pessoa`
(0 quando não há meta → mostra "—").

**Closer** (`CloserTable`): `Rank · Nome · RR · SAL · COF · Ganhos ·
Faturamento · Meta Fat. · % · Win rate` — ordenada por `%` desc. `%` =
`Faturamento / meta_financeira`; `Win rate` = `Ganhos / RR`.

### 6.2 Nota de rodapé (cada seção)

> Os cards acima usam a mesma contagem por evento da Visão Macro (a etapa
> "Reunião Agendada SQL" só conta no funil do Closer). A tabela abaixo soma
> por SDR/Closer atribuído ao negócio, então negócios sem responsável não
> entram nela — uma pequena diferença entre o total dos cards e a soma da
> tabela é esperada.

## 7. Mantidos, religados na base nova

- **Cards "Conversões — topo/fundo do funil".** Continuam com os mesmos
  degraus de hoje, só trocando a fonte dos números para os contadores por
  evento da seção 5.1 (a lista de conversões pode ter mais granularidade que
  o strip de 4 cards — isso é aceitável).
  - Topo: `MQL → Tentando contato`, `Tentando contato → Contato efetivo`,
    `Contato efetivo → SQL`. Usa `countStageEvents` para cada etapa.
  - Fundo: `SQL → RR (Diagnóstico)`, `RR → SAL`, `SAL → COF`,
    `COF → Fechamento`.
  - `Tentando Contato` e `Contato Efetivo` continuam via `countStageEvents`
    mesmo não tendo card no strip.
- **`FunilCompletoSection`.** Sem mudança de lógica — já está no stack
  compartilhado. Só atualizar o comentário de cabeçalho do arquivo, que hoje
  diz que "o resto da página ainda lê `vw_marketing_funil`" (deixará de ser
  verdade).

## 8. Helper de dias úteis

`src/lib/dateUtils.ts` ganha:

```ts
/** Dias de segunda a sábado no mês de `mesKey` ('YYYY-MM'). Sem feriados. */
export function businessDaysInMonth(mesKey: string): number
```

Puro, sem dependência de fuso (itera dia a dia via `new Date(ano, mes-1, d)`
local, conta `getDay() !== 0`). Testado.

## 9. Testes e verificação

- `src/lib/dateUtils.test.ts`: `businessDaysInMonth` para
  - fev/2026 (28 dias),
  - um mês que começa no domingo,
  - um mês de 31 dias com 5 domingos.
- Teste do seletor de meta do time: dado um conjunto de linhas cruas,
  `useMetasTimeResumo`/o reducer soma por marca e exclui `Geral/Outbound/Repasse`.
- `useFunilFilterOptions`: um teste de fumaça garantindo que a extração
  preserva o cruzamento (marca some da lista de marcas quando um filtro de
  fonte incompatível está ativo; valor já selecionado permanece).
- `npm run build` (tsc -b) **e** `npx vitest run` rodados na cópia local
  `~/ws-dashboard-build` (OneDrive trava o build in loco — ver CLAUDE.md §7).
- App exige login: sem screenshot renderizado. Conferência dos números por
  SQL contra a base real (comparar strip da Performance com a Visão Macro no
  mesmo recorte).

## 10. Fora de escopo / não fazer

- Migrar Análise de Perda (continua em `vw_marketing_funil`).
- Mexer em `vw_funil_compat` no banco.
- Separar meta de Inbound × Prospecção Ativa (pendência conhecida §8 do
  CLAUDE.md; a meta continua cheia nos dois lados do toggle).
- Calendário de feriados para "dias úteis".
- Meta para MQL e SAL (não existe no banco; não inventar).
- Mudar rota, nome de arquivo ou nome de componente.
- Tocar em `SopMarketing` / `BubbleMatrix` (lado Marketing).
