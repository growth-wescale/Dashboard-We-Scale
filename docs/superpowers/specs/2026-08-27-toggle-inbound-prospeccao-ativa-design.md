# Toggle Inbound × Prospecção Ativa nas abas de Expansão

**Data:** 2026-08-27
**Abas afetadas:** Visão Macro, Performance Detalhada, Análise de Perda
**Fora de escopo:** Análise de Objeções, todas as abas de Marketing

---

## 1. Problema

As três abas de Expansão misturam dois motores comerciais que não se
comparam: o **Inbound** (lead chega, entra no funil SDR / Odonto Scale /
Closer) e a **Prospecção Ativa** (o SDR sai atrás do lead, funil próprio).
Como o funil é um só na tela, o volume da prospecção dilui toda a conversão
do Inbound.

A distorção é grande, não marginal. Em agosto/2026 a Prospecção Ativa
produziu **898 MQL contra 765 do Inbound** — mais da metade do topo do funil
— e **zero vendas**. Toda taxa de conversão exibida hoje carrega esse peso.

## 2. Regra de classificação

Um ciclo (e, como se demonstra abaixo, o deal inteiro) é **Prospecção
Ativa** quando **qualquer evento seu aconteceu no funil "Prospecção
Ativa"**. Caso contrário é **Inbound**.

### Por que "qualquer evento" e não "o funil de origem"

A formulação original do pedido era por origem: nasceu em SDR / Odonto Scale
/ Closer, ou a retomada (saída de perdido) foi num desses. Medindo a base,
90 ciclos não são cobertos por ela — nasceram num funil Inbound e foram
movidos para Prospecção Ativa **no meio do ciclo**, sem perda entre as duas
coisas:

| Nasceu em | Terminou o ciclo em | Ciclos |
|---|---|---|
| Odonto Scale | Prospecção Ativa | 59 |
| Oral Unic (funil legado) | Prospecção Ativa | 27 |
| SDR | Prospecção Ativa | 4 |

Exemplo real, deal `6a3fc687dc26a1001da6f887` (Odonto Scale): criado
27/06 em "Odonto Scale > Novos Leads", movido para Prospecção Ativa em
10/07 sem ter sido perdido, perdido lá em 17/07, e o ciclo 2 já nasce no
Prospecção Ativa. Sob a regra de origem estrita o ciclo 1 seria Inbound
mesmo tendo sido trabalhado como prospecção.

Decisão do Junior: **Prospecção Ativa contamina o ciclo inteiro.** Quem
encostou no funil de prospecção conta como prospecção.

A regra também resolve o caso simétrico levantado no pedido — deal
prospectado no Prospecção Ativa que vai para o Closer negociar continua
Prospecção Ativa —, e devolve ao Inbound os 620 ciclos nascidos no SDR que
hoje aparecem como "Closer" só por causa do handoff (`nome_funil` em
`vw_funil_vendas` é o funil do **último** evento do ciclo, não do primeiro).

### Grão: deal, não ciclo

Medido na base: **0 deals em 6.126 têm um ciclo Prospecção Ativa e outro
Inbound.** Sob esta regra, classificar por `(id_deal, ciclo)` e classificar
por `id_deal` produzem resultado idêntico. Isso é o que permite a
implementação barata da seção 3 — a classificação sai direto de
`deal_eventos`, sem passar pela cadeia cara de `vw_deal_ciclo` nem exigir
recriação de `mv_deal_ciclo_enriquecido`.

Se um dia um deal passar a divergir entre ciclos, o resultado deste desenho
é classificá-lo por inteiro como Prospecção Ativa — nunca partir o histórico
de um mesmo deal entre os dois toggles, o que seria pior de ler.

### Funis legados

`Oral Unic`, `Inpot` e `Lisô Laser` classificam como Inbound. Não aparecem
na Visão Macro de qualquer forma (a allowlist de `vw_funil_vendas` já os
exclui) e são resíduo histórico nas outras duas abas.

## 3. Camada de dado

View nova, lida direto da tabela crua:

```sql
create or replace view vw_deal_origem_comercial as
select id_deal,
       case when bool_or(nome_funil = 'Prospecção Ativa')
            then 'Prospecção Ativa' else 'Inbound' end as origem_comercial
from deal_eventos
group by id_deal;
```

Cobertura verificada: **100%** dos deals de `vw_funil_vendas` (6.033
ciclos) e de `vw_funil_compat` (6.126 deals) têm ao menos um evento.
Ninguém cai em fallback — mas o join usa `coalesce(..., 'Inbound')` para
que um deal futuro sem evento não vire `null` e suma dos dois toggles.

Ela entra por `LEFT JOIN` em cinco views de topo, todas por
`CREATE OR REPLACE VIEW`, aplicadas direto no Supabase de Expansão
(`cygxmduuwlwfbodfrlkr`) como as demais views desta cadeia:

| View | Serve | Grão da view | Chave do join |
|---|---|---|---|
| `vw_funil_vendas` | Visão Macro | ciclo | `id_lead` |
| `vw_funil_etapas_v2` | Visão Macro (Passagens / Performance) | evento | `id_deal` |
| `vw_funil_compat` | Performance Detalhada, Análise de Perda | deal | `id_lead` |
| `vw_marketing_funil` | Análise de Perda | ciclo | `id_lead` |
| `vw_perdas` | Análise de Perda | evento de perda | `id_deal` |

`vw_deal_etapa_periodos` (modo Aging) **não** ganha coluna: o front já cruza
as linhas de aging com os deals de `vw_funil_vendas`, então filtrar a lista
de deals antes é suficiente.

`mv_deal_ciclo_enriquecido` **não é tocada** — nem DROP, nem recriação de
índice, nem mudança no job do `pg_cron`.

### Performance — risco a validar antes de fechar

O agregado varre as ~23.8k linhas de `deal_eventos` a cada query, e
`useFunilVendas` pagina 7 vezes por carregamento. Antes de dar o trabalho
por pronto, rodar `EXPLAIN ANALYZE` na query real do hook e comparar com o
baseline atual (~11ms por página desde a materialização de 25/08).

Critério: se o custo adicional passar de **~50ms por página**, converter em
`mv_deal_origem_comercial` (6k linhas, índice único em `id_deal`) e pendurar
o `REFRESH` no job de 2 minutos que já existe. Não materializar por
precaução — medir primeiro.

## 4. Camada de front

### Estado

`SharedFiltersContext` ganha:

```ts
export type OrigemComercial = 'Inbound' | 'Prospecção Ativa'
origem: OrigemComercial
setOrigem: (o: OrigemComercial) => void
```

Persistido em `localStorage` sob `wescale.vendas.origem`, validado na
leitura pelo mesmo `oneOf(...)` dos demais filtros. Padrão: **`'Inbound'`**.
Entra em `resetFiltros()`, voltando ao padrão.

São **dois estados, sem "Todos"** — decisão do Junior. Não existe mais
leitura consolidada nas três abas; o número que aparece é sempre de um lado
só.

### Componente

`src/components/ui/OrigemToggle.tsx` — dois botões, mesmo visual do
`ModeToggle` que já existe dentro de `FunilVendas.tsx` (pill com fundo
`--ws-bg`, botão ativo em `--ws-surface` com `--shadow-sm`).

Rótulos **por extenso**: `Inbound` e `Prospecção Ativa`. Nunca abreviar
para "PA" ou "Prosp." na interface.

`PageTop` ganha uma prop opcional `titleAside?: ReactNode`, renderizada no
mesmo flex row do `<h1>`, para o toggle ficar colado ao título. As três
páginas passam `<OrigemToggle />` por ali.

### Onde o filtro é aplicado

**Na saída dos hooks, antes de qualquer agregação** — nunca dentro de
`metrics.ts` nem por página.

```
useFunilVendas()  → filtra por origem → tudo o mais (metrics, popups, filtros)
useFunilEventos() → filtra por origem
useFunilAging()   → filtra pelos deals que sobraram do passo acima
usePerformanceEquipe() / usePerdas() → filtram por origem
```

Isso entrega de graça o requisito de que **todas as opções de filtro sigam o
toggle ativo**: marca, fonte, sub-fonte, SDR, closer e funil já derivam das
linhas carregadas, tanto na `FilterBar` quanto nos `MultiSelect` dos popups
(`StageDealsDrawer`, `RepeatedDealsDrawer`). Nenhum desses componentes
precisa mudar.

### MQL nas duas abas antigas

Performance Detalhada e Análise de Perda contam MQL do Supabase de
**Marketing** (`useLeads` + `isLeadMql` + `deduplicateLeads`), que não
conhece funil do RD e por isso não separa por origem.

Decisão do Junior: **trocar pelo MQL da Expansão.** Nas duas páginas, o
contador de MQL passa a ser as linhas de `vw_funil_compat` com
`data_novo_mql` dentro do período, já filtradas pelo toggle — a mesma fonte
que a Visão Macro usa. `useLeads` sai dessas duas páginas.

Consequência esperada e aceita: **o número de MQL dessas duas abas muda de
patamar** em relação ao que se via até hoje, e com ele a taxa de perda
(`perdidasDeals / mqlsPeriodo`) da Análise de Perda e a coluna MQL dos KPIs
da Performance Detalhada. Não é regressão; é a troca de fonte. O valor de
referência de agosto/2026 na Expansão é 765 MQL Inbound + 898 Prospecção
Ativa.

### Card de Meta

**Inalterado.** A meta cheia de `DB_Metas_Performance` aparece nos dois
toggles, contra o realizado já filtrado. Decisão explícita do Junior:
"por enquanto, as metas não mudam".

Isso significa que, no toggle Prospecção Ativa, o card mostra a meta inteira
do mês contra R$ 0 realizado. Fica registrado como pendência em
`CLAUDE.md`: separar metas por origem em `DB_Metas_Performance`.

## 5. O que o Junior vai ver — dado real, não bug

Três coisas vão parecer erradas na primeira olhada e não são:

1. **Prospecção Ativa tem 0 vendas e R$ 0 de receita em toda a base.** Os
   40 ganhos e os R$ 1.925.827,98 estão todos no Inbound. Bate com a regra
   já documentada de que Prospecção Ativa nunca tem Closer. No toggle
   Prospecção Ativa o funil morre antes do Fechamento e a conversão global
   é 0%.

2. **A opção de Fonte "Prospecção Ativa" não some do toggle Inbound.**
   Sobram 10 ciclos com `fonte_macro = 'Prospecção Ativa'` que nunca
   passaram pelo funil de mesmo nome. Funil e fonte macro são dimensões
   ortogonais por design — não se alinham 100%.

3. **Dentro do toggle Prospecção Ativa, a maior fonte não é "Prospecção
   Ativa".** São 856 Prospecção Ativa + **391 Resgate** + 2 Inbound. A
   prospecção reaproveita muito MQL antigo, e isso está classificado como
   Resgate na origem.

## 6. Números de referência (checksum)

Medidos em 2026-08-27, para validar a implementação contra:

| Métrica | Inbound | Prospecção Ativa |
|---|---|---|
| Ciclos em `vw_funil_vendas` | 4.785 | 1.249 |
| Ciclos atuais | 4.502 | 1.228 |
| Ganhos | 40 | 0 |
| Receita | R$ 1.925.827,98 | R$ 0 |
| MQL agosto/2026 (Expansão) | 765 | 898 |
| Perdas agosto/2026 | 656 | 82 |

Soma de ciclos = 6.034 contra 6.033 em `vw_funil_vendas` no momento da
medição: a matview foi atualizada entre as duas consultas (refresh de 2
minutos). Reconferir os dois lados no mesmo instante ao validar.

## 7. Testes

Unitários novos (vitest), na camada pura:

- classificação: ciclo com evento em Prospecção Ativa → Prospecção Ativa;
  ciclo só com eventos SDR/Closer/Odonto Scale → Inbound; ciclo misto
  (nasce Odonto Scale, migra para Prospecção Ativa) → Prospecção Ativa.
- o filtro de origem aplicado à lista de `FunnelRow` não altera nenhuma
  outra dimensão do recorte (marca, período, fonte seguem funcionando).
- opções derivadas: dado um conjunto com as duas origens, filtrar por
  Inbound remove das opções de fonte aquelas que só existiam em linhas de
  Prospecção Ativa.

Verificação obrigatória antes de PR, na cópia em disco local (a pasta está
no OneDrive):

```bash
rsync -a --delete "$PWD/src/" ~/ws-dashboard-build/src/
cd ~/ws-dashboard-build && npm run build && npx vitest run
```

`npm run build` (que usa `tsc -b`) é obrigatório — `tsc --noEmit` não pega
import não usado.

## 8. Fora de escopo

- Separar metas por origem em `DB_Metas_Performance` (vira pendência).
- Migrar Performance Detalhada e Análise de Perda de `vw_marketing_funil` /
  `vw_funil_compat` para `vw_funil_vendas` + `SharedFiltersContext` — a
  pendência antiga continua de pé; este trabalho adiciona a coluna nas views
  antigas em vez de antecipar a migração.
- Aba Análise de Objeções.
- Um terceiro estado "Todos" no toggle.
