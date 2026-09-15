# Linha do Tempo do Deal — design

**Data:** 2026-09-15 · **Dono:** Junior (Expansão) · **Status:** aprovado em brainstorm, aguardando revisão do spec

## 1. Objetivo

Uma tela nova nas abas de Vendas onde se entra num deal e se vê, em ordem
cronológica, tudo que aconteceu com ele: mudanças de etapa, perda/ganho,
reciclagem, trocas de responsável, mudanças de funil e de campo, **tarefas do
SDR** (ligação, WhatsApp, e-mail) e **reuniões do MeetRox** (com duração, nota
e resumo). A tela tem **zoom semântico**: afastando, vê-se só as fases
(Macro); no meio, cada etapa (Etapas); aproximando, cada toque (Micro).

Visual aprovado com mockups: **"A Pista"** — trilha horizontal em setas
(chevrons), uma por fase, com nós grandes redondos com ícone por etapa,
alternando acima e abaixo da pista, ligados por fio pontilhado que termina
numa bolinha paralela à pista (sem encostar). Identidade We Scale: vinho
(`--ws-vinho-b`) no SDR, verde (`--ws-verde`) no Closer, dourado no ganho,
`--status-atencao` no no-show, `--status-risco` na perda.

### Fora de escopo (decidido em 15/09)

- **Caminho padrão** (linha do tempo agregada com calor e rachaduras). Fica
  pra um segundo spec. Este design deixa o modelo de "momento" e a regra de
  desvio prontos pra ele reaproveitar, mas **nenhuma tela agregada** entra
  aqui.
- Editar qualquer coisa (é leitura pura; ações continuam no RD).
- Guardar estado de zoom na URL.
- `MqlDrawer` (lado Marketing) não ganha link pra timeline.

## 2. Portas de entrada

| Porta | Comportamento |
|---|---|
| Menu Vendas → **Linha do Tempo** (`/linha-do-tempo`) | busca de deal por nome, ou colando id/link do RD. Resultado = cartões no nível Macro (a pista de 4 setas com as durações). Clicar abre o deal |
| `/linha-do-tempo/:idDeal` | a tela do deal |
| Popups de deal existentes (`StageDealsDrawer`, `SimpleDealsDrawer`, `PerdaDealsDrawer`, `RepeatedDealsDrawer`) | ícone de "linha do tempo" ao lado do link externo pro RD, em cada linha, navegando pra rota acima. Nenhuma outra mudança nos popups |

A busca **não** aplica o toggle de Origem nem a `FilterBar` (é um deal só; os
filtros de recorte não fazem sentido aqui). Origem, marca, SDR e Closer
aparecem como chips no cabeçalho do deal. `AppLayout.getActiveKey` passa a
reconhecer `/linha-do-tempo` como aba de Vendas (`isVendas`, sem `AiChat`).

## 3. Fontes de dados (Supabase de Expansão, leitura direta, zero DDL)

| Fonte | Chave | O que vira | Fatos medidos em 15/09 |
|---|---|---|---|
| `deal_eventos` | `id_deal` | etapas, perda, ganho, retomada, troca de responsável, mudança de funil/marca/fonte | ~37k eventos; 9 tipos; mediana 3 eventos por deal, máx. 23 |
| `db_tarefas_sdr` | `deal_id` | tarefas: `type` ∈ call, whatsapp, email, task, lunch, meeting; `status_calc` ∈ concluida_no_prazo, concluida_atrasada, atrasada, em_aberto; `prazo`, `done_date`, `user_name`, `subject`, `notes` | ~50k tarefas em 5.273 deals |
| `DB_Reunioes_MeetRox` | **`coalesce(id_deal, crm_deal_id)`** | reuniões: `call_timestamp`, `duration_minutes`, `ai_score` (0–1), `scorecard_name` (R1…R4), `call_type_name`, `summary` (jsonb de seções), `scorecard_answers`, `url`, `user_name` | 1.550 reuniões; `id_deal` preenchido em só **8**, `crm_deal_id` em 1.137 — o join tem que ser pelo coalesce. 1.331 com resumo, 891 com scorecard. **`transcription`, `api_payload`, `associations_raw` nunca são selecionados** (pesados) |
| `vw_funil_vendas` | `id_lead` (todas as linhas = todos os ciclos) | cabeçalho: `nome_negociacao`, `marca`, `status_atual`, `nome_sdr`, `nome_closer`, `origem_comercial`, `fonte_macro`, `valor_produto`, `quantidade_unidades`, `data_novo_mql`, `nome_funil`, `motivo_perda`; e a busca | já lida pelo `useFunilVendas` com as mesmas colunas |

`deal_deletado` não entra na linha (o deal some do RD; a busca também não o
encontra, porque a view exclui). Deal sem marca é invisível na view → a rota
mostra "deal não encontrado no dashboard" com link pro RD (regra já
documentada na seção 4 do CLAUDE.md).

## 4. Modelo: `Momento` e `Timeline` (`src/lib/timeline/`)

Camada pura, testada com vitest, sem React.

```ts
type TipoMomento =
  | 'etapa' | 'no_show' | 'perda' | 'ganho' | 'retomada'
  | 'troca_responsavel' | 'mudanca_funil' | 'mudanca_campo'
  | 'tarefa' | 'reuniao'

type Camada = 'MQL' | 'SDR' | 'Closer' | 'Desfecho'

type Desvio = 'voltou' | 'pulou' | 'no_show' | 'trocou_funil' | 'perdeu' | 'reciclou'

interface Momento {
  id: string                    // `${fonte}:${id da linha}`
  idDeal: string
  instante: Date
  tipo: TipoMomento
  camada: Camada
  ciclo: number                 // 1 = original; +1 a cada 'retomada'
  etapa?: StageKey | null       // resolveStage(nome_etapa); null se cru desconhecido
  etapaCrua?: string            // nome como veio do RD (exibido quando etapa é null)
  ator?: string                 // responsavel / user_name
  titulo: string                // pronto pra UI
  detalhe?: string
  desvio?: Desvio
  meta?: MetaTarefa | MetaReuniao | MetaEtapa | MetaCampo
}
```

### Normalizadores (um por fonte)

- **`momentosDeEventos(rows)`** — `deal_eventos` → `Momento[]`.
  `mudanca_etapa` → `etapa` (ou `no_show` quando `resolveStage` dá `'No Show'`);
  `perda` → `perda` com `motivo_perda`/`anotacao_perda`; `ganho` → `ganho`;
  `deal_retomado` → `retomada`; `troca_responsavel` → `troca_responsavel`
  (`valor_anterior → valor_novo`); `mudanca_funil` → `mudanca_funil`;
  `mudanca_marca`/`mudanca_fonte_macro` → `mudanca_campo`. `deal_deletado` é
  descartado. Etapa crua que `resolveStage` não conhece ("Novo lead",
  "Pré-Contrato enviado", "Diagnostico"): **não some** — vira nó cinza com
  `etapaCrua`, camada herdada do momento anterior.
- **`momentosDeTarefas(rows)`** — `db_tarefas_sdr` → `tarefa`. `instante =
  done_date ?? prazo`. `meta = { tipoTarefa, status: status_calc, prazo,
  feitaEm, subject, notes, atrasoDias }`. Tarefa aberta e atrasada renderiza
  vazada (sem preenchimento).
- **`momentosDeReunioes(rows)`** — `DB_Reunioes_MeetRox` → `reuniao`.
  `instante = call_timestamp`. `meta = { duracaoMin, notaIA (ai_score×10, 1
  casa), scorecard, tipoReuniao, resumo (seções → título + bullets), url,
  participantes }`.

### `montarTimeline(momentos, cabecalho)` → `Timeline`

1. Ordena por `instante` (empate: etapa antes de tarefa).
2. **Ciclos**: `retomada` incrementa `ciclo`; tudo depois pertence ao ciclo
   novo. Bate com `vw_funil_vendas.ciclo`.
3. **Fusão de handoff**: dois `etapa` consecutivos que resolvem pro **mesmo
   `StageKey`** (o caso clássico é "Reunião Agendada SQL" no SDR e no Closer
   segundos depois, junto com `mudanca_funil`) viram **um nó só**, com
   `detalhe = "passou pro funil do Closer"`. É a mesma regra de negócio de
   "Reunião Agendada SQL só conta no Closer", aplicada ao grão do deal.
4. **Camada** de cada `etapa`: `MQL` pra `StageKey 'MQL'`; senão
   `stageOwnerRole(etapa)` (`metrics.ts`) → `SDR` | `Closer`. Momentos
   não-etapa herdam a camada do último `etapa` antes deles. `perda`/`ganho` →
   `Desfecho`.
5. **Desvios** (comparando com `STAGE_ORDER`):
   - `voltou`: índice da etapa nova < índice da etapa anterior (No Show não
     conta, tem regra própria);
   - `pulou`: índice novo > anterior + 1;
   - `no_show`: tipo `no_show`;
   - `trocou_funil`: `mudanca_funil` cujo `valor_novo` é um funil diferente da
     progressão SDR→Closer;
   - `perdeu`: `perda`; `reciclou`: `retomada`.
6. **Trechos** (`Trecho[]`): intervalo entre dois `etapa` consecutivos, com
   duração, camada, e agregados do que aconteceu dentro (`toques`,
   `atrasados`, `reunioes`). É o que o nível Etapas mostra como "4 toques" e
   o nível Micro abre.
7. **Fases** (`Fase[]`): MQL · SDR · Closer · Desfecho, cada uma com início,
   fim (ou "hoje" se em andamento), duração e resumo (etapas, toques,
   no-shows, reuniões). É o nível Macro e a largura dos chevrons.
8. `fim` da timeline: `instante` do `ganho`/`perda` do ciclo atual, ou
   **agora** se `status_atual = 'Em andamento'` (nó terminal aberto, com
   marcador "hoje").

Regras já existentes que a camada **respeita** (nunca reimplementa):
`resolveStage`/`STAGE_ORDER`/`stageOwnerRole` de `metrics.ts`; `toLocalDate`
de `dateUtils.ts` pra qualquer agrupamento por dia (fuso Brasília);
`fmtDuracao`/`leadtimeDias` de `dealDrawerShared.tsx`; `classificarMotivo`
de `motivosPerda.ts` no cartão de perda.

## 5. Layout da Pista (`layoutPista.ts`, puro)

Entrada: `Timeline` + `{ k, x0, larguraPx }` (escala em px/dia, deslocamento,
largura do viewport). Saída: posições prontas pra desenhar — nada de
matemática no componente.

- **Eixo X = tempo.** `x(t) = (t − inicio) × k − x0`.
- **Chevrons**: um por fase, de `x(fase.inicio)` a `x(fase.fim)`, altura 32.
  Texto da fase centralizado ("SDR · 17 DIAS · XAYANE"); some quando não
  cabe (`largura < texto + 24`) e vira só a cor.
- **Nós de etapa** (r = 26; terminal r = 32): alternam fileira de cima e de
  baixo na ordem cronológica. **Espaçamento mínimo de 190 px entre vizinhos
  da mesma fileira**: se `x` proporcional viola, o nó é empurrado pra
  direita e o fio pontilhado fica inclinado (do nó até o ponto verdadeiro na
  pista). Rótulo (nome da etapa + linha de detalhe) à direita do nó; o nó
  terminal senta na ponta da pista com rótulo acima.
- **Bolinha** (r = 4,5) no fim do fio, **14 px afastada** da borda da pista,
  sem encostar. Cor da camada; laranja no no-show; vermelha na perda.
- **Fileira de toques** (só Micro): linha fina 32 px abaixo da pista;
  bolinhas r = 11 com ícone por tipo; contorno `--status-atencao` quando
  `concluida_atrasada`/`atrasada`; vazada quando não concluída. **Cluster**:
  bolinhas a menos de 26 px viram uma só com "+N". Reuniões MeetRox entram
  nessa fileira como nó r = 14 com ícone de vídeo, na cor da camada.
- **Marcadores** (só Micro): `troca_responsavel`, `mudanca_funil`,
  `mudanca_campo` como bolinha vazada r = 4,5 acima da pista com fio curto e
  texto pequeno ("responsável: Thiago → Xayane").
- **Reciclagem**: a pista continua na mesma linha; entre o `perda` do ciclo N
  e a `retomada` do N+1 o chevron é cinza tracejado com "reaberto em X
  dias".
- **Eixo de tempo**: rótulos discretos embaixo, densidade por `k` (dias →
  semanas → meses).

## 6. Zoom (`useZoomPan`, hook; `nivelDeZoom`, puro)

- Estado `{ k, x0 }`. Scroll com Ctrl/⌘ ou pinch: zoom ancorado no cursor.
  Scroll simples e arrasto: pan. Botões − · + · ⤢ (ajustar ao deal).
  Teclado: `+`, `-`, `0`.
- Limites: `k` entre "deal inteiro cabe em 60% da largura" e "1 dia = 400
  px"; `x0` não deixa a pista sair da tela.
- **Nível derivado de `k` com histerese** (`nivelDeZoom(k, nivelAtual)`):
  entra em Micro quando `k > 90 px/dia`, sai quando `k < 70`; entra em Macro
  quando `k < 9 px/dia`, sai quando `k > 12`. Sem isso o nível pisca na
  fronteira.
- Abre sempre em **Etapas, ajustado ao deal inteiro**.
- Transição entre níveis: as camadas de SVG de cada nível ficam montadas e
  trocam por `opacity` + `transform: scale()` em 250 ms (`transition` CSS),
  respeitando `prefers-reduced-motion`.

| Nível | Chevrons | Nós | Fileira de toques | Marcadores |
|---|---|---|---|---|
| Macro | sim, com duração | 1 por fase, com resumo | não | não |
| Etapas | sim | 1 por etapa; subtítulo com "N toques · 1 atrasado" do trecho | não | não |
| Micro | sim (esticados) | 1 por etapa, com hora | sim | sim |

## 7. Componentes (`src/components/timeline/`)

| Componente | Responsabilidade |
|---|---|
| `DealHeader` | nome, chips (marca com `BRAND_ACCENT`, origem, status, SDR → Closer), KPIs: dias no funil, toques, atrasados, reuniões, taxa de franquia + unidades, link RD |
| `PistaCanvas` | o SVG. Recebe `LayoutPista` + `nivel`. Só desenha; sem fetch, sem matemática |
| `MomentoPopover` | cartão do clique, por tipo: **etapa** (de → para, quem, tempo parado no trecho); **tarefa** (assunto, tipo, quem, prazo × feita, atraso em dias, notas, "abrir no RD"); **reunião** (tipo, duração, nota IA, scorecard R1–R4 com ✓/✗ por pergunta, seções do resumo, "abrir no MeetRox"); **perda** (motivo cru + categoria de `classificarMotivo`, anotação); **troca/mudança** (antes → depois) |
| `ZoomControls` | − · + · ⤢ · pill com o nível atual |
| `TimelineLegend` | só os símbolos que existem no nível atual |
| `DealSearch` (página `/linha-do-tempo`) | input com debounce 300 ms; lista de cartões Macro; aceita id (24 hex) ou URL `crm.rdstation.com/app/deals/<id>` e navega direto |

Ícones: `lucide-react` (já dependência) — Search (MQL), Phone (Tentando
contato), MessageSquare (Contato efetivo), Handshake (Interesse), Link
(Conexão), CalendarCheck (SQL), Users (Diagnóstico), CircleCheck (SAL),
FileText (Oportunidade), Gavel (Comitê), FilePen (Pré-contrato),
Trophy (Ganho), CircleX (Perdido), Ban (No-show), Video (reunião), Phone /
MessageCircle / Mail / ListTodo (tarefas).

## 8. Hooks (`src/hooks/`)

- **`useDealTimeline(idDeal)`** — 4 consultas em paralelo (`Promise.all`)
  no `supabaseVendas`: `deal_eventos` (`.eq('id_deal')`, ordenado por
  `data_evento`), `db_tarefas_sdr` (`.eq('deal_id')`), `DB_Reunioes_MeetRox`
  (`.or('id_deal.eq.X,crm_deal_id.eq.X')`, sem as colunas pesadas),
  `vw_funil_vendas` (`.eq('id_lead')`, todos os ciclos). Devolve
  `{ timeline, cabecalho, loading, erros: Partial<Record<Fonte, string>> }`.
  **Falha parcial não derruba a tela**: a fonte que falhou vira aviso
  ("tarefas indisponíveis") e o resto renderiza. Deal ausente na view →
  `naoEncontrado`.
- **`useBuscaDeal(termo)`** — `vw_funil_vendas.ilike('nome_negociacao',
  %termo%)`, `eh_ciclo_atual = true`, limite 20, mesmas colunas do
  cabeçalho. Sem termo → lista vazia (não carrega a view inteira).

Consultas por `id_deal` são pontuais e ficam longe do `statement_timeout`
de 3 s do `anon`. Verificar na implementação se `db_tarefas_sdr.deal_id` e
`DB_Reunioes_MeetRox.crm_deal_id` têm índice; se não, criar (é DDL no
Supabase de Expansão, via `apply_migration`, registrado no changelog).

## 9. Rotas, menu e links

- `App.tsx`: `LinhaDoTempo` (lazy) em `/linha-do-tempo` e
  `/linha-do-tempo/:idDeal`.
- `AppLayout.tsx`: `VENDAS_SUB` ganha `{ key: 'linha-do-tempo', label:
  'Linha do Tempo' }`; `getActiveKey`/`getVendasActiveSub`/`handleSelectSub`
  reconhecem a rota.
- 4 popups: ao lado do `<a href={rdDealUrl(...)}>` entra um `<Link
  to={`/linha-do-tempo/${id_lead}`}>` com ícone `History` (lucide), título
  "Linha do tempo". Só isso muda neles.

## 10. Estados vazios e erros

| Situação | Tela |
|---|---|
| id inválido / deal fora da view | "Deal não encontrado no dashboard" + link pro RD + lembrete de que deal sem marca não aparece |
| deal com eventos mas sem tarefas/reuniões | fileira de toques não aparece; legenda diz "sem tarefas registradas" |
| uma fonte falhou | banner `QueryErrorBanner` por fonte, resto renderiza |
| deal só com MQL (1 evento) | pista de 1 chevron + nó terminal "hoje" |
| busca sem resultado | "Nenhum deal com esse nome" + dica de colar o link do RD |

## 11. Testes

Vitest, funções puras:

- `momentosDeEventos`: cada tipo de evento; etapa crua desconhecida vira nó
  cinza; `deal_deletado` descartado; `No Show` vira `no_show`.
- `momentosDeTarefas`: `instante` = `done_date` ou `prazo`; status atrasado.
- `momentosDeReunioes`: nota IA ×10; resumo em seções; sem transcrição.
- `montarTimeline`: ordenação; ciclos via `retomada`; **fusão do handoff
  SDR→Closer em "Reunião Agendada SQL"**; camada herdada; cada `Desvio`;
  trechos com agregados; fases com duração; fim = agora quando em
  andamento.
- `layoutPista`: alternância; **espaçamento mínimo empurra e inclina o
  fio**; bolinha a 14 px da pista; cluster de toques; texto do chevron
  some quando não cabe.
- `nivelDeZoom`: histerese nas duas fronteiras.

Render conferido numa **rota temporária sem autenticação** (mesmo padrão
das sessões anteriores, removida antes do commit) com 3 deals reais: um
ganho com no-show, um perdido com reciclagem, um em andamento só com MQL.
Números do cabeçalho conferidos por SQL.

## 12. Decisões registradas

- **Tudo no cliente, sem view nova** — 3 consultas pontuais por deal; o
  modelo fica em TypeScript testável. Se um dia precisar de RPC (ex.: n8n
  montando a mesma linha), a normalização é portável.
- **SVG à mão, sem `d3`** — mesmo padrão do `TrapFunnel`. Se a matemática
  de zoom ficar frágil, trocar só o `useZoomPan` por `d3-zoom` é mudança
  contida.
- **Handoff vira um nó só** — coerente com a trava do Closer nas contagens.
- **Busca sem toggle de Origem** — muda o que foi dito no chat na seção 2
  do brainstorm; justificativa: quem busca por nome não quer que um toggle
  esconda o resultado.
- **Caminho padrão adiado** — o modelo (`Momento`, `Desvio`, `Trecho`) foi
  desenhado pra ele reaproveitar, mas nada agregado entra neste spec.
