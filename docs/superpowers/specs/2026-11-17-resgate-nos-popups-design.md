# Resgate visível nos pop-ups de deal — desenho curto

17/11/2026 · pedido do chefe do Junior, via Junior.

## Por quê

O time está resgatando negócios perdidos. A diretoria quer ver nos pop-ups de deal das abas de
Vendas quais negócios são resgate, quanto tempo eles levam no total e quanto levam depois de
reativados. Hoje o dashboard sabe disso (ciclo > 1), mas não mostra: só existe a coluna "Data da
última reativação", e o "Leadtime" dos resgates mede às vezes desde a criação, às vezes desde um
MQL novo no ciclo 2.

## Regra (decisão do Junior)

**Resgate = negócio perdido e reaberto num dia diferente do dia da perda** (dia de Brasília).

- Linha de `vw_funil_vendas` com `ciclo > 1` **e** dia do início do ciclo
  (`data_criacao_negociacao`) > dia da perda que fechou o ciclo anterior.
- Reabertura no mesmo dia da perda não é resgate, mesmo que o banco tenha aberto ciclo novo
  (acontece quando o negócio é perdido de novo em outro dia).
- Ciclo > 1 sem data da perda anterior conta como resgate (minha decisão: o banco só abre ciclo
  depois de uma perda, mas não dá pra provar o mesmo dia).
- Fonte Macro "Resgate" em ciclo 1 **não** ganha a tag (minha decisão: marca uma lista de
  prospecção, não reabertura; não há reativação pra medir).

Medido em 17/11: 134 linhas com ciclo > 1 → **106 resgates** (28 reabertos no mesmo dia; 3 sem
perda anterior, contados como resgate).

## Abordagens

- **A. Regra na view (escolhida pelo Junior).** `vw_funil_vendas` ganha `eh_resgate` e
  `data_perda_anterior`. Uma resposta só para dashboard, Corrida, n8n e RMP; segue a regra do
  projeto de que regra de negócio mora na view.
- B. Regra só na tela (o navegador já tem todos os ciclos). Mais rápida, mas a regra ficaria
  presa no dashboard e outros relatórios teriam que copiá-la. Descartada.

## O que muda

**Banco (Supabase de Expansão)**
- `vw_funil_vendas`: colunas novas no fim, `data_perda_anterior timestamptz` (perda que fechou o
  ciclo anterior do mesmo deal, lida da fonte da view, não da própria `vw_funil_vendas`, que filtra
  linhas) e `eh_resgate boolean`. `CREATE OR REPLACE VIEW`, matview intocada.
- Conferência antes/depois: mesmo checksum das colunas antigas; 106 resgates.
- Base ao vivo: as duas colunas em `dash_colunas()` e `COLUNAS_VENDAS`, na mesma transação do
  `dash_sincronizar(true)`; `FunnelRow` ganha os campos.

**Regra no código**
- `ehResgate(row)` num lugar só (lê `eh_resgate`), usada por pop-ups e Corrida.

**Pop-ups** (etapa, Receita/Fechamentos/Vendas por fonte, Análise de Perda, Repetidos)
- Selo **"Resgate"** ao lado do nome do negócio; ao passar o mouse: "perdido em dd/mm, reaberto em
  dd/mm · N dias parado".
- **Leadtime geral**: no resgate (e em qualquer ciclo > 1), desde `data_criacao_original` (bate com
  o MQL do 1º ciclo em todos os casos medidos); no ciclo 1, como hoje (MQL, senão criação).
- **Leadtime pós-reativação**: desde `data_criacao_negociacao`, só em resgate; "—" nos outros.
- Mesma data de referência de cada pop-up (etapa, venda, perda, última repetição; hoje em
  Aging/Atual).
- Pop-up de etapa: filtro **Novo × Resgate** junto dos filtros que já existem. Os outros três não
  têm barra de filtro e ficam só com selo e colunas.
- "Data da última reativação" continua.

**Campanha de Metas / Corrida (decisão do Junior: mesma regra)**
- Os 2 pontos de resgate passam de `ciclo > 1` para `eh_resgate`. `useCorridaPerformance` passa a
  buscar a coluna. Textos ("Negociação retomada…") dizem "reaberta em outro dia".
- Efeito medido: saem 2 SQL e 1 RR em set/26 e 1 SQL e 1 RR em out/26 do bônus; nada em nov/26.

## Fora

- Mudar o processo no RD (projeto Contato × Negociação). Quando entrar, só `ehResgate` e a origem
  do leadtime geral mudam.
- Cards e KPIs com totais de resgate (só pop-ups agora).

## Para quem for construir

- Ordem das colunas do pop-up, larguras e texto exato do tooltip.
- Como achar a perda anterior na view (lag por ciclo ou junção na fonte), desde que dê os 106.
- Testes: `ehResgate`, os dois leadtimes, o filtro e a regra da Corrida.
- Verificação: build + vitest em cópia fora do OneDrive; checksum da view; conferir 3 resgates na
  tela com dado real.
