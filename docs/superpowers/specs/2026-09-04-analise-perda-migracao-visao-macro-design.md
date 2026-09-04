# Aba "Análise de Perda" — validação + migração para o stack da Visão Macro

**Data:** 2026-09-04
**Aba afetada:** Análise de Perda
**Fora de escopo:** Visão Macro, Performance, Análise de Objeções, GP Setembro,
todas as abas de Marketing

---

## 1. Problema

A **Análise de Perda** nunca foi revisada a fundo desde que as telas de Vendas
existem. É a última das 3 abas migráveis ainda na base antiga — o CLAUDE.md já
listava isso como pendência conhecida ("ainda lê `vw_marketing_funil` via
`vw_funil_compat`/`usePerformanceEquipe`... migrar para `vw_funil_vendas` +
`SharedFiltersContext`"), mesmo problema que a Performance tinha antes de
03/09.

Hoje (`src/pages/AnalisePerda.tsx`, 544 linhas, tudo inline):

- **Dados**: `usePerdas` → `vw_perdas` (evento de perda) para motivo/etapa/
  responsável/marca; `usePerformanceEquipe` → `vw_funil_compat` só como
  denominador de MQL. Nenhum dos dois usa `vw_funil_vendas`.
- **Filtros**: 100% locais — dropdown de marca single-select, 2
  `<input type="date">` nativos, sem Fonte/Sub-fonte, sem multi-seleção. Só
  `origem` vem do `SharedFiltersContext` (via `<OrigemToggle />`, já migrado).
- **Sem popups**: página inteira é agregado somente-leitura, nenhum `BarRow`
  é clicável.
- **Sem testes**: toda a lógica de agregação (`computeKpis`, `computeMotivos`,
  `computeEvitavel`, `computeEtapas`, `computeCruzamentos`,
  `computeResponsaveis`, `computeMarcas`) é inline no `.tsx`, zero cobertura —
  diferente do padrão do projeto (`metrics.ts`, `performanceRows.ts` etc.).

## 2. Validação feita nesta sessão

Consulta direta ao Supabase de Expansão (`cygxmduuwlwfbodfrlkr`), ago/2026:

| | `vw_perdas` (evento) | `vw_funil_vendas` (`status_atual='Perdido'`) |
|---|---|---|
| Deals distintos | 947 | 918 (861 em `eh_ciclo_atual`) |

**A diferença de 33 quase toda explicada por dado de teste que a página atual
não filtra direito.** `usePerdas.ts` só exclui `nome_negociacao ilike
%teste%` e `nome_funil in ('Oral Unic','Inpot')` — não pega motivo de teste
(`"[NOVO] Teste"`, `"Registro de teste - apagar"`) nem funis legados como
`Odonto Scale`/`Repasse`/`Lisô Laser` (funil-marca, não a marca em si).
`vw_funil_vendas` já exclui tudo isso na origem (allowlist de funil + sem
deals de teste — regra documentada no CLAUDE.md §3). Um caso real também
achado: um deal perdido no funil **SDR** em ago/26 teve seu `nome_funil`
trocado depois para `"Lisô Laser"` (funil de onboarding, fora da allowlist) —
ele desaparece inteiro de `vw_funil_vendas`, perda incluída. Ver decisão §3.

**Bug de dado ativo, não só de UI**: `computeMotivos`/`computeKpis` na página
atual **não excluem** a categoria `ignorar` (teste/duplicado) nem motivos não
catalogados como `"Registro de teste - apagar"` — eles contam cheio em
"Negociações Perdidas", na taxa de perda e aparecem como barra cinza sem
rótulo no ranking de motivos. Migrar pra `vw_funil_vendas` corrige isso de
graça (a view já exclui o deal inteiro).

**Achado que simplifica a migração**: `vw_funil_vendas` já tem
`motivo_perda`, `data_perdido`, `valor_contrato`, `quantidade_unidades`,
`fonte_macro`, `sub_fonte`, `nome_sdr`/`nome_closer`, `origem_comercial` — os
mesmos campos que Visão Macro/Performance já consomem. E `metrics.ts` já tem
`isLoss`/`rowsInLoss` (linhas 260-282), espelhando `isSale`/`rowsInStage`
byte a byte — é a mesma trava que os cards de "Tempo de ciclo" da Visão Macro
já usam (`status_atual === 'Perdido'`, ver CLAUDE.md §4 "Trava de venda").
**Não é preciso tocar em nenhuma view do banco.**

## 3. Decisões tomadas (rodada de perguntas 2026-09-04)

| Tema | Decisão |
|---|---|
| Grão / fonte de verdade | **`vw_funil_vendas`, trava `isLoss` (status atual)** — não `vw_perdas` (evento). Congruência total com as outras 3 abas prevalece sobre preservar o histórico bruto de ciclos reciclados/funis trocados. `vw_perdas`/`usePerdas.ts` ficam órfãos no código (mesmo padrão de `vw_funil_compat`/`usePerformanceEquipe` após a migração da Performance) — não deletar. |
| Filtro de teste | **Herdar da view** — sem lista de motivo-lixo nova no front; `vw_funil_vendas` já exclui deal de teste na origem. |
| Filtros da FilterBar | **Marca multi + Período multi/granularidade + Fonte/Sub-fonte + "Deals criados no período"** entram. Fora: toggle Contagem (Passagens não se aplica a evento terminal único) e toggle Vendas Negócios×Unidades (não migra como toggle). |
| Receita perdida | Novo KPI. Soma `valor_contrato` só dos perdidos com **`data_oportunidade` preenchida** (chegaram em Oportunidade ou depois) — evita contar como "receita perdida" um deal que nunca teve produto/valor real definido. |
| Popups | **Praticamente em tudo**: as 2 KPIs escuras + Receita Perdida, cada linha de Motivo, Etapa, Responsável, Marca, e cada célula do heatmap. |
| `motivosPerda.ts` | Resolver a fragilidade a acento/case **agora**, junto (pendência do CLAUDE.md §8). |

## 4. Camada de dados — trocar o stack

### 4.1 Remover o caminho antigo

- `AnalisePerda.tsx` deixa de importar `usePerdas`, `PerdaEvento`,
  `usePerformanceEquipe`, `FunilCompatRow`, `BRANDS_WITH_OVERVIEW` (dropdown
  local), `currentMonthRange`, `inPeriod`.
- **Não deletar** `src/hooks/usePerdas.ts` nem `src/hooks/usePerformanceEquipe.ts`
  — verificar no momento da implementação se algo mais os importa (hoje,
  não); se continuarem sem uso, ficam órfãos como `usePerformanceEquipe` já
  ficou após a migração da Performance. `vw_perdas`/`vw_funil_compat`
  continuam existindo no banco, intocadas.

### 4.2 O que a página passa a consumir

Mesma montagem de `FunilVendas.tsx`/`PerformanceVendas.tsx`, **sem**
`useFunilEventos` (perda é trava de snapshot, não passagem de etapa — não há
"evento de perda" a contar via `vw_funil_etapas_v2`, só o `status_atual` da
linha):

```ts
const { origem, brandKeys, periodMode, periodValues, ranges, range, fontes, subFontes, viewModes } = useSharedFilters()
// marcasSelecionadas / todasSelecionadas / scopeLabel / marcaFetch / marcasParaEscopo — copiado 1:1 de PerformanceVendas.tsx
const { data: rows, error: rowsError } = useFunilVendas(origem, marcaFetch)
const scope = buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes })
const scoped = rows.filter(scope)
const win = toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end })))
const opcoes = funilFilterOptions({ rows, win, marcasParaEscopo, fontes, subFontes, cohort: viewModes.funnelView === 'cohort' })
const marcasDisponiveis = BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key)
```

### 4.3 Cabeçalho e barra

```tsx
<PageTop title="Análise de Perda" titleAside={<OrigemToggle />}
  subtitle={`${scopeLabel} · ${subtitlePeriodo}`}
  actions={<botão Exportar CSV do perdidos>} />
<FilterBar marcasDisponiveis={marcasDisponiveis}
  fontesDisponiveis={opcoes.fontes} subFontesDisponiveis={opcoes.subFontes} />
<QueryErrorBanner errors={[rowsError]} scope="Análise de Perda" />
```

`subtitlePeriodo` segue a mesma regra da Visão Macro/Performance (multi-
período → "N meses selecionados"; senão → "Ago 2026"). Rodapé da página:
`Fonte: vw_funil_vendas` (troca a linha atual `vw_perdas + vw_funil_compat`).

## 5. Módulo puro `src/lib/perdaRows.ts` (novo)

Toda a lógica hoje inline no `.tsx` migra pra cá, sobre `FunnelRow[]`,
seguindo o padrão de `performanceRows.ts`/`metrics.ts` — testável sem mock de
Supabase.

```ts
export function perdidos(rows: FunnelRow[], win: PeriodWindow, modes: ViewModes): FunnelRow[] {
  return rowsInLoss(rows, win, modes) // já existe em metrics.ts — reuso direto
}

export interface KpisPerda {
  perdidasDeals: number; mqlsPeriodo: number; taxaPerda: number
  emAberto: number; leadtimeDias: number; etapaTop: StageKey | null
  receitaPerdida: number
}
export function computeKpis(scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes): KpisPerda

export interface MotivoRow { motivo: string; qtd: number; pct: number; categoria: CategoriaMotivo | null; deals: FunnelRow[] }
export function computeMotivos(perdas: FunnelRow[]): MotivoRow[]

export interface EvitavelStats { pctEvitavel: number; qtdProcesso: number; qtdMercado: number }
export function computeEvitavel(perdas: FunnelRow[]): EvitavelStats

export interface EtapaRow { etapa: StageKey; ordem: number; qtd: number; leadtime: number; deals: FunnelRow[] }
export function computeEtapas(perdas: FunnelRow[]): EtapaRow[]

export interface CruzCel { motivo: string; etapa: StageKey; qtd: number; deals: FunnelRow[] }
export function computeCruzamentos(perdas: FunnelRow[]): { motivos: string[]; etapas: EtapaMeta[]; celulas: CruzCel[] }

export interface RespRow { nome: string; camada: 'SDR' | 'Closer' | '—'; qtd: number; deals: FunnelRow[] }
export function computeResponsaveis(perdas: FunnelRow[]): RespRow[]

export interface MarcaRow { marca: string; qtd: number; pctSobreMql: number; deals: FunnelRow[] }
export function computeMarcas(perdas: FunnelRow[], scoped: FunnelRow[], win: PeriodWindow, modes: ViewModes): MarcaRow[]

export function dealsReceitaPerdida(perdas: FunnelRow[]): FunnelRow[] // data_oportunidade preenchida
```

Diferença chave vs. hoje: cada linha de agregação carrega os `FunnelRow[]`
que a compõem (`deals`), pra alimentar o popup direto — sem recomputar o
filtro na hora do clique.

### 5.1 Fórmulas

| Métrica | Cálculo |
|---|---|
| `perdidasDeals` | `perdidos(scoped, win, modes).length` |
| `mqlsPeriodo` | `countStage(scoped, 'MQL', win, modes)` — mesma função que Visão Macro/Performance usam pro denominador |
| `taxaPerda` | `perdidasDeals / mqlsPeriodo * 100` |
| `emAberto` | `scoped.filter(r => r.status_atual === 'Em andamento' && r.eh_ciclo_atual).length` |
| `leadtimeDias` | média de `businessDaysBetween(data_novo_mql, data_perdido)` sobre os perdidos com as duas datas presentes (mesmo util de hoje, `src/lib/businessHours.ts`) |
| `etapaTop` | moda de `currentStage(row)` sobre os perdidos — reusa `currentStage` (já aplica a trava "Reunião Agendada SQL só Closer" de graça; hoje `etapa_canonica` de `vw_perdas` não aplicava essa trava) |
| `receitaPerdida` | soma de `valor_contrato` dos perdidos com `data_oportunidade` não nulo |
| Motivo/Etapa/Responsável/Marca | agrupamento direto sobre `motivo_perda`, `currentStage(row)`, `nome_sdr`/`nome_closer` + `stageOwnerRole(currentStage(row))`, `marca` |

`camada` (SDR×Closer) por linha de responsável usa `stageOwnerRole(currentStage(row))`.
**Verificado no banco**: 578 dos 4.757 deals perdidos têm `nome_sdr` **e**
`nome_closer` preenchidos ao mesmo tempo (deal passou pelas duas camadas
antes de perder) — não dá pra assumir que só um dos dois vem preenchido.
`stageOwnerRole` resolve isso: como ele deriva a camada da **etapa onde o
deal foi perdido** (não de quais campos estão preenchidos), a atribuição usa
`nome_sdr` quando `camada === 'sdr'` e `nome_closer` quando `'closer'` —
correto nos dois casos (preenchimento único ou duplo).

### 5.2 `motivosPerda.ts`

`classificarMotivo` ganha normalização antes do lookup nos `Set`:

```ts
function normalize(s: string): string {
  return s
    .replace(/^\[NOVO\]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove diacríticos
    .trim()
    .toLowerCase()
}
```

Os três `Set<string>` (`PROCESSO`/`MERCADO`/`IGNORAR`) passam a guardar as
strings já normalizadas (minúsculas, sem acento) — elimina as entradas
duplicadas por variação de grafia que existem hoje (ex. as 3 variantes de
"Sem interesse / não quis conversa"). Comportamento externo de
`classificarMotivo` não muda (mesma assinatura, mesmo retorno).

## 6. Popups — `PerdaDealsDrawer` (novo componente)

`src/components/ui/PerdaDealsDrawer.tsx`, modelado em `SimpleDealsDrawer.tsx`
(reaproveita `cell`/`fmtData` de `dealDrawerShared.tsx`, `rdDealUrl`, mesmo
layout de painel lateral) — mas com colunas de perda em vez de venda:

```tsx
interface PerdaDealsDrawerProps {
  open: boolean; onClose: () => void
  title: string; subtitle: string
  deals: FunnelRow[]; accent: string
}
```

Colunas: `Negociação` (link RD) · `Marca` · `Motivo` (`motivo_perda`,
prefixo `[NOVO]` limpo) · `Etapa perdida` (`currentStage(row)`) ·
`Responsável` (`nome_sdr ?? nome_closer`) · `Valor` (`valor_contrato`) ·
`Data` (`data_perdido`, via `fmtData`).

Pontos clicáveis (cada um abre o drawer com o subconjunto já calculado em
`perdaRows.ts`, sem novo fetch):

| Clique | `deals` passados |
|---|---|
| KPI "Negociações Perdidas" | `perdidos(scoped, win, modes)` |
| KPI "Perda Evitável" | mesma lista, badge indica quantos Processo/Mercado |
| KPI "Receita Perdida" (novo) | `dealsReceitaPerdida(perdidos)` |
| Linha de Motivo | `motivoRow.deals` |
| Linha de Etapa | `etapaRow.deals` |
| Linha de Responsável | `respRow.deals` |
| Linha de Marca | `marcaRow.deals` |
| Célula do heatmap | `celula.deals` |

`Heatmap` ganha `onCellClick?: (motivo: string, etapa: StageKey) => void` —
resolve pra `celula.deals` via lookup no array já calculado (mesmo padrão de
`val()` que a função já usa pra achar a célula).

## 7. Fluxo de filtros específicos (preservados)

`motivoTab` (`'todos'|'processo'|'mercado'`) e `respTab`
(`'todos'|'SDR'|'Closer'`) continuam `useState` local — dimensões que só
existem aqui, sem equivalente na `FilterBar` compartilhada. Filtram
client-side sobre o resultado de `computeMotivos`/`computeResponsaveis`,
igual hoje.

## 8. Testes e verificação

- `src/lib/perdaRows.test.ts` (novo): `computeKpis` (taxa de perda, leadtime,
  etapa top respeitando a trava do Closer), `computeMotivos`/`computeEvitavel`
  (categorização + `deals` corretos por bucket), `computeEtapas`,
  `computeMarcas` (% sobre MQL da própria marca), `dealsReceitaPerdida`
  (exclui perdido sem `data_oportunidade`).
- `src/constants/motivosPerda.test.ts` (novo): `classificarMotivo` com acento/
  case variando (`"Sem Perfil (Fora Do Icp)"`, `"sem perfil (fora do icp)"` →
  mesma categoria), prefixo `[NOVO]` com/sem espaço, motivo não catalogado →
  `null`.
- `npm run build` (tsc -b) **e** `npx vitest run` na cópia local
  `~/ws-dashboard-build` (CLAUDE.md §7 — OneDrive trava build in loco).
- Conferência por SQL contra a base real: comparar `perdidasDeals` da página
  nova, recorte Consolidado + mês corrente, contra
  `select count(*) from vw_funil_vendas where status_atual='Perdido' and
  data_perdido between ...` — deve bater exato (mesma trava).
- App exige login — sem screenshot renderizado nesta sessão.

## 9. Fora de escopo / não fazer

- Tocar em `vw_perdas`, `vw_funil_compat` ou qualquer view no banco.
- Deletar `usePerdas.ts`/`usePerformanceEquipe.ts` (ficam órfãos, não usados).
- Migrar a estrutura de motivos pra tabela no banco (a pendência do CLAUDE.md
  é só sobre fragilidade de string — resolvida com normalização de acento,
  não com nova tabela).
- Toggle Contagem (Passagens) e toggle Vendas Negócios×Unidades como
  controles — a ideia de "unidades/valor" vira o KPI de Receita Perdida, não
  um toggle.
- Anotação de perda (`anotacao_perda`, só existe em `vw_perdas`) — fica de
  fora por ora; não há pedido por ela e adicionar exigiria reintroduzir
  `vw_perdas` no fluxo principal, contra a decisão da seção 3.
- Mudar rota (`/analise-perda`), nome de arquivo ou nome do componente.
