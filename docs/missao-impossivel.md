# Missão Impossível — acompanhamento isolado de metas

## Escopo autorizado em 07/10/2026

Somente `/okrs` → **Acompanhamento Meta**. A aba OKRs, Meta de vendas,
Configuração das Metas, Campanha, TV, Visão Geral, S&OP, fontes e regras
compartilhadas permanecem intactas. Não há escrita no banco nem novo serviço.
A versão anterior do PR #227 foi revertida pelo #228. Não recuperar seu
carregamento completo de deals/eventos.

Preservados os dois placares fixos: anual de R$ 4.932.000 e outubro–dezembro
de R$ 2.068.360. Receita de todas as marcas/origens, somente Ganho, data da
venda em Brasília, valor do contrato uma vez por ciclo. Não ratear receita.
Os saldos são independentes; Q4 não foi redefinido como saldo anual.

## Contrato dos cards

- Inpot, Eletrovias e Lisô Laser: trimestre no topo (unidades/faturamento,
  meta e realizado); mês vigente abaixo (as mesmas duas métricas).
- Metas vêm de `DB_Metas_Performance`: soma das parcelas Closer para
  unidades/receita e SDR para SQL/SAL. Reutiliza o planejamento publicado
  pelo motor comercial, inclusive funil inverso quando configurado. Não
  recalcula metas com as taxas de outra estratégia nem escreve nesse espelho.
- Falta de qualquer mês/parcela: meta total e percentual pendentes, soma
  parcial explicitamente rotulada. Zero cadastrado é diferente de null.
  Não repetir outubro em novembro/dezembro. Na leitura de 07/10 havia metas
  somente de outubro para as três prioritárias; próximos meses dependem do
  cadastro comercial normal, não desta implementação.
- SQL: reuniões agendadas, pela data `data_agendamento_reuniao_sql`.
  SAL: `data_sal`, usada por decisão de Gabriel como referência de realizada
  **apenas nesta página**. Não altera Diagnóstico/Reunião Realizada do CRM.
  Cada negócio+ciclo conta uma vez. Não conta reentradas/passagens nem faz
  consulta ao histórico de eventos. Inclui negócios antigos que avançaram
  no mês, sem filtro de origem. Não confundir estes volumes com uma taxa de
  conversão de coorte ou com contagem de reuniões MeetRox.
- `quantidade_unidades` usa `saleUnits` compartilhado. Receita não é
  multiplicada por unidades. Contratos sem valor são sinalizados.
- Pacing mensal **depois** do Plano: gasto acumulado, orçamento mensal,
  saldo, percentual usado e ritmo contra proporção de dias corridos. Não
  inventar orçamento por canal nem presumir verba de Oral Unic.
- Fora de out–dez/2026, os blocos mensais são omitidos com aviso explícito;
  os placares e trimestre continuam identificados como 2026.

## Proteção da leitura

`useMissaoResumo` e `missaoCache` são exclusivos da nova tela. Acesso é
verificado antes da montagem; cache por usuário/data, invalidado no logout
ou troca de conta. Clientes de conexão e permissões existentes não mudam.

`consultarMissao` executa **sequencialmente**:

1. Ganhos de 2026 até hoje (ou fim de 2026): até 500 linhas + sentinela.
2. Metas de out–dez das três prioritárias/SDR/Closer: 200 + sentinela.
3. SQL/SAL do mês vigente das três prioritárias: 500 + sentinela.
4. Mídia das três marcas, mês até hoje, somente colunas necessárias;
   ordenação total `dia,id`, páginas de 500, máximo oito páginas.

Até 11 requisições por carga completa, uma por vez. Sem `SELECT *`, `count`,
histórico completo de eventos, busca de leads ou consultas por card.
Sentinelas dependem do limite padrão da API (1.000), maior que 501. Se esse
limite do servidor mudar, revisar o contrato para não aceitar truncamento.
Ao atingir o teto ou ocorrer erro, não exibe totais parciais ou zeros falsos.

Cache de 15 minutos; **sem polling**, retry automático ou reação ao refresh
global. Botão próprio, intervalo mínimo de um minuto entre tentativas, inclusive
remontagens/erros. Timeout total de 20 segundos; desmontagem cancela leitura
sem consumidores. Horário da última leitura fica visível. Este cache é local à
sessão da aba, não proteção global do banco entre múltiplos usuários.

## Verificação e limites

- Testes puros de datas, metas incompletas, roles, ganho/dedupe/unidades,
  SQL/SAL, pacing, erro, paginação limitada, cancelamento e cache. Renderização
  React sem navegador valida conteúdo, acesso, falha e período fora da missão.
- Execução do **loader novo** em 07/10: três SELECTs CRM sequenciais HTTP 200;
  tempos observados 246/67/96ms. Sem dados individuais impressos/persistidos.
  Mídia não foi validada em sessão autenticada nesta execução; isso permanece
  pendente de QA com Gabriel. Não interpretar leitura anônima vazia como zero.
- Resposta rápida e menor quantidade de linhas não provam custo interno da
  view nem ausência de impacto concorrente. Não há acesso às métricas internas
  do banco; nenhum teste de estresse foi feito em produção.
- Publicação somente após revisão/merge de Gabriel. Depois conferir deploy,
  prints da página e disponibilidade de Vendas. Se houver regressão, reverter
  este PR pelo mesmo fluxo, sem mexer no banco.

Não abrir dashboard automaticamente. QA visual/autenticado por prints,
conforme orientação de Gabriel.
