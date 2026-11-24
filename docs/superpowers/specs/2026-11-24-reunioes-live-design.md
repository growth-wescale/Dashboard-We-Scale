# Reuniões (sessões) ao lado do Diagnóstico — LIVE da Eletrovias

Data: 24/11/2026 · Pedido do Junior · Abas: Visão Macro e Performance (Vendas)

## Por que

Desde novembro/2026 a Jéssica faz a R1 da Eletrovias em grupo ("LIVE": vários
candidatos numa call só). O Brunno e o Junior olham duas coisas:

1. **quantidade de Diagnósticos** — o que já aparece e continua igual;
2. **quantidade de reuniões (sessões)** — antes era o próprio Diagnóstico
   (1 R1 = 1 Diagnóstico), agora não é mais: 1 LIVE pode gerar 10 Diagnósticos.

Medido em 24/11 (Inbound, todas as marcas, Diagnóstico de 01 a 24/11 em
`vw_funil_vendas`, um por negócio/ciclo): 45 Diagnósticos de negócio com
`tipo_r1 = 'LIVE'` (44 Eletrovias + 1 Odonto Legacy). 39 deles caem em 8
gravações (as 8 "LIVE: ELETROVIAS" da Jéssica) e 6 ficam sem gravação (5
Eletrovias + 1 Odonto Legacy), que viram 3 LIVEs estimadas. Ou seja, 45
Diagnósticos de LIVE = 11 reuniões. Somando as R1 individuais da Eletrovias
(~38), são ~49 reuniões para ~83 Diagnósticos. **Esses são os números de
aceite** (podem crescer até o merge, porque novembro ainda corre).

## Objetivo, não-objetivos, anti-objetivos

- **Objetivo:** mostrar "em N reuniões · M de LIVE" colado no Diagnóstico, na
  Visão Macro e na Performance, com pop-up que explica de onde vem o número.
- **Não-objetivos:** mudar o número de Diagnósticos, o funil, a Corrida de
  Performance, as metas, o bloco "Reuniões no MeetRox" (R1–R5) ou o funil
  completo de 12 etapas da Performance (`FunilCompletoSection`). Nada de alerta.
- **Anti-objetivos (seria fracasso mesmo funcionando):**
  - outra coisa com "LIVE" no nome (treinamento, live de marketing, LIVE de R2)
    entrar na conta;
  - a linha aparecer em marca que não faz LIVE, poluindo a tela;
  - Reuniões e Diagnóstico seguirem filtros diferentes (um número com Marca X e
    o outro sem).

## Regra de negócio (decidida com o Junior)

**Reuniões = R1 individuais + sessões de LIVE.**

- **R1 individual:** cada Diagnóstico que já conta hoje (mesmos eventos de
  `eventsInStage(..., 'Diagnóstico', ...)`, mesmos filtros, mesmo modo
  Passagens/Deals únicos) de negócio que **não** está ligado a uma LIVE conta 1.
- **Sessão de LIVE:** uma gravação do MeetRox só é sessão de LIVE se foi a
  **R1** de pelo menos um negócio com `tipo_r1 = 'LIVE'`. "Foi a R1" =
  - o e-mail do negócio (`deal_contatos.email`) está nos convidados
    (`DB_Reunioes_MeetRox.attendees`);
  - a gravação é de Closer (linha em `vw_closer_reunioes`);
  - é a **primeira** gravação de Closer com esse convite entre
    `data_reuniao_realizada − 14 dias` e `data_reuniao_realizada`.
  O **título não decide nada** (só é exibido). Testado em 24/11 sem olhar o
  título: achou exatamente as 8 "LIVE: ELETROVIAS" de novembro e nenhuma outra
  gravação. Pegar a *primeira* (e não a última) gravação importa: com a última,
  um negócio movido para Diagnóstico depois da R2 caía na R2.
- Negócios que caem na mesma gravação = **1 reunião**, com a **data da LIVE**
  (não a do Diagnóstico — o Closer move os participantes ~1,6 dia depois).
- **Piso de data (decisão minha):** só entram Diagnósticos a partir de
  01/11/2026, quando a LIVE começou. Motivo: `tipo_r1` é campo do negócio no RD
  e vale para todos os ciclos dele; sem o piso, um negócio reciclado marcado
  LIVE em novembro levaria o Diagnóstico de um ciclo antigo junto. Hoje são 0
  casos, o piso é só proteção. O piso fica só na view nova; `vw_funil_vendas`
  não é tocada.
- **Negócio marcado "Individual" que estava convidado na LIVE (decisão
  minha):** se a primeira gravação de Closer dele (mesma regra acima) for uma
  sessão de LIVE já identificada, ele entra nessa sessão, porque foi a mesma
  reunião. Medido em nov/26: 0 casos. A sessão continua precisando de ≥1
  negócio marcado LIVE para existir.
- **LIVE estimada:** negócio `tipo_r1 = 'LIVE'` com Diagnóstico e sem gravação
  encontrada vira sessão estimada = agrupamento por (Closer do negócio, dia do
  Diagnóstico em Brasília), com a data do Diagnóstico. Aparece com etiqueta
  "estimada". Em nov/26: 3 (duas da Jéssica, uma da Thaina — esta é o negócio
  da Odonto Legacy marcado como LIVE, provável erro de preenchimento no RD).
  Causa provável das sem par: lead que entrou por link sem convite por e-mail
  (as 4 de Eletrovias são da Cassiana) e uma gravação de 18/11 sem título nem
  convidados.
- **Período:** a sessão conta no período em que a LIVE aconteceu; os
  Diagnósticos dela continuam na data deles. Com "Deals criados no período"
  ligado (safra), a sessão conta se tiver ≥1 negócio da safra, sem olhar data
  (mesma lógica de `cohortIds` do Diagnóstico).
- **Filtros da barra:** marca, fonte, sub-fonte, SDR, tipo de R1 e origem
  valem pelos negócios: a sessão entra se ≥1 dos seus negócios com Diagnóstico
  passa nesses filtros. Com "Tipo de R1 = Individual" não há sessão de LIVE.
- **Filtro de Closer (decisão minha):** para sessão de LIVE, vale **quem
  conduziu** (quem gravou), igual ao bloco "Reuniões no MeetRox"; para R1
  individual e LIVE estimada, o `nome_closer` do negócio, igual à coluna DIAG.
  Motivo: a contagem de reuniões responde "quantas reuniões a pessoa fez". Em
  nov/26, 4 dos 39 negócios de LIVE gravada estão com outro Closer
  (`nome_closer` = Douglas, que pegou a R2) e a LIVE foi da Jéssica. Efeito
  aceito: com Closer = Douglas, os Diagnósticos dele incluem esses 4, mas as
  reuniões dele não incluem a LIVE da Jéssica, e o pop-up explica isso.
- **Por pessoa:**
  - SDR: a sessão conta 1 para cada SDR que teve negócio nela (a soma das SDRs
    pode passar do total — aceito pelo Junior).
  - Closer: a sessão conta 1 para quem gravou (`vw_closer_reunioes.closer`);
    estimada, para o Closer do negócio. Individual: `nome_closer` do negócio,
    como na coluna DIAG.
  - Mesma classificação das tabelas de hoje (`classificador` de
    `performanceRows.ts`): Ex-integrantes, Sem SDR/Sem Closer, pessoa fora do
    cargo.

## O que aparece na tela

**Visão Macro**, modo Performance do funil, embaixo da barra do Diagnóstico
(mesmo estilo do "+N repetidos"), clicável:

```
  Diagnóstico ██████████████  83    ▼ 62%
        em 49 reuniões · 11 de LIVE
```

Não aparece em Aging/Atual (são foto do estoque, não passagem no período).

**Performance**, nos dois cards "Diagnóstico" (SDR e Closer), como rodapé do
card (`MetaRitmoCard` já aceita `rodape`), clicável sem disparar o clique do
card:

```
┌ Diagnóstico ───────────────────┐
│ 83          meta 120 · ritmo…   │
│ em 49 reuniões · 11 de LIVE     │
└────────────────────────────────┘
```

**Tabelas por pessoa da Performance:** coluna **REUNIÕES** logo depois de DIAG
(SDR: depois do grupo DIAGNÓSTICO Real/Meta/Δ; Closer: depois de DIAG).

**Regra de exibição (decisão minha):** a linha aparece só quando **Reuniões ≠
Diagnósticos** no recorte, ou seja, quando há algo a explicar. Consequências:
- LIVE com um negócio só, ou negócio de outra marca marcado LIVE por engano
  (vira estimada de 1), não fazem a linha aparecer: os números ficam iguais.
  Isso atende o anti-objetivo da marca que não faz LIVE sem lista fixa de
  marcas, e se outra marca começar a fazer LIVE, ela entra sozinha.
- Recorte que pega Diagnósticos de uma LIVE de outro período (LIVE em 30/11,
  Diagnósticos em 02/12, olhando dezembro): Reuniões < Diagnósticos e a linha
  aparece ("em N reuniões · 0 de LIVE"). O pop-up tem uma seção "Diagnósticos
  de LIVE de outro período" com a data da LIVE.
- O inverso (modo Dia 30/11: 0 Diagnósticos e 1 reunião) também mostra a linha,
  e o pop-up diz em que data os Diagnósticos foram registrados.
- A coluna REUNIÕES das tabelas segue a mesma regra, olhando o total do recorte.
Sem comparação "vs. período anterior".

**Pop-up "Reuniões"** (abre pelo clique na linha):
- cabeçalho: total de reuniões, quantas de LIVE, quantos Diagnósticos;
- LIVEs primeiro (mais recente no topo): data/hora, Closer, título, link da
  gravação, convidados externos, quantos viraram Diagnóstico, % comparecimento
  (Diagnósticos ÷ convidados), etiqueta "estimada" quando for o caso; cada LIVE
  expande e lista os negócios (nome, SDR, status, data do Diagnóstico, link RD
  e Linha do Tempo);
- depois as R1 individuais, uma linha por negócio.
- "Convidados externos" = `attendees` sem e-mail `@wescale.com.br` /
  `@oralunic.com.br`. Limite conhecido: convidado ≠ presente, e sócio com
  e-mail próprio conta como convidado a mais (comparecimento fica um pouco
  subestimado).

## Como é construído (decisões minhas, o Junior deixou o "como" comigo)

- **Banco (Supabase de Expansão):** view nova `vw_reuniao_live`, uma linha por
  (negócio, ciclo) com `tipo_r1 = 'LIVE'` e `data_reuniao_realizada` preenchida,
  com a gravação encontrada (`call_id`, `call_timestamp`, `closer`, `titulo`,
  `url`, `convidados_externos`) ou nulos quando não achar. Lê
  `vw_funil_vendas`, `deal_contatos`, `DB_Reunioes_MeetRox` e
  `vw_closer_reunioes`. Só metadado (nada de transcrição/resumo), `grant select`
  para `anon, authenticated`, mesmo padrão de `vw_closer_reunioes`. SQL em
  `docs/sql/2026-11-24-reuniao-live.sql`.
- **Fora do `dash_*`:** a view não entra em `vw_funil_vendas` nem em
  `dash_colunas` — é pequena (dezenas de linhas por mês) e é lida por um hook
  próprio com `cacheConsulta` + `buscarTodasPaginas`, igual a
  `useReunioesCloser`. Assim o MeetRox (sincroniza a cada 5 min) não vira
  dependência do `dash_sincronizar`.
- **Cliente:** função pura nova (ex.: `src/lib/reunioesLive.ts`, testada) que
  recebe os eventos de Diagnóstico já filtrados (saída de `eventsInStage` com
  os mesmos `evOpts` do card), as linhas de `vw_funil_vendas` e as linhas da
  view, e devolve as reuniões (individuais, LIVE, estimadas) com total, de
  LIVE e quebra por SDR/Closer. Os dois pontos de uso (Visão Macro e
  Performance) chamam a mesma função, para os números nunca divergirem.
- Para a sessão contar pela data da LIVE, a função precisa dos Diagnósticos dos
  negócios de LIVE **fora** da janela também (ex.: LIVE em 30/11, Diagnóstico
  em 02/12). O construtor decide como (ex.: chamar `eventsInStage` com janela
  aberta só para esses negócios).
- `TrapFunnel` ganha prop opcional para a linha do Diagnóstico (só a Visão
  Macro passa). Tabelas: `buildSdrRows`/`buildCloserRows` ganham o campo de
  reuniões, ou é calculado à parte e juntado por linha — escolha do construtor,
  desde que a coluna use a mesma classificação de pessoa.

## Abordagens consideradas

1. **MeetRox × RD por e-mail (escolhida).** Usa o que já existe, liga 39 de
   45 Diagnósticos de LIVE de novembro à gravação certa, e o resto vira
   "estimada". Depende de o convite sair por e-mail.
2. **Só RD, agrupando por Closer + dia do Diagnóstico.** Descartada: novembro
   daria 15 "LIVEs" para 8–9 reais, porque o Closer move os participantes em
   dias diferentes. (Fica só como reserva para as sem gravação.)
3. **Campo novo no RD "Data da LIVE".** Exato, mas cria trabalho pro Closer e
   exige preencher o passado à mão. Pode entrar depois se a 1 incomodar.

## Verificação esperada

- Teste unitário da função pura: individual, LIVE com vários negócios, LIVE
  com negócio fora do filtro, estimada, Passagens × Deals únicos, safra, LIVE
  com Diagnóstico fora da janela, SDR com negócio em 2 sessões.
- Conferência no banco: `vw_reuniao_live` de nov/26 devolve 45 negócios de
  LIVE, 39 em 8 gravações e 6 sem gravação (números de 24/11; podem crescer).

## Fora do escopo, registrado

`vw_funil_vendas.tipo_r1` lê só o campo do RD: não há trava de marca nem de
data, ao contrário do que a seção 3 do CLAUDE.md dá a entender ("outras marcas
e meses anteriores = Individual" era verdade porque o campo estava vazio
neles). Hoje há 1 negócio da Odonto Legacy (Thaina, Diagnóstico 18/11) marcado
LIVE, provável erro de preenchimento no RD. Ajustar o texto do CLAUDE.md e
avisar o Junior; corrigir a view, se ele quiser, é outra mudança (passa por
`dash_colunas`).
- Diagnóstico, funil e tabelas atuais com números idênticos antes/depois.
- Visto renderizado com dado real (rota de prévia sem login só na cópia de
  build), Visão Macro e Performance, Eletrovias e uma marca sem LIVE (linha
  some).
- `npm run build` + `npx vitest run` fora do OneDrive.

## Deixado para o construtor

Nome exato das funções/componentes, layout fino do pop-up, como passar os
Diagnósticos fora da janela, e se o pop-up reaproveita `dealDrawerShared`.
CLAUDE.md: entrada no histórico e linha de `vw_reuniao_live` na tabela de
objetos da seção 3.
