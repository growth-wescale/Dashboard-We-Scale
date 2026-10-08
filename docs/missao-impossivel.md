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

Em 08/10, aprovado marcador visual de pacing somente no placar Q4:
proporção inclusiva dos dias de 01/10 a 31/12 (92 dias), limitada a 0–100%.
É referência linear temporal, não rateio de receita nem nova meta financeira.
MQL mantém percentual realizado/meta cadastrada; quando pendente, barra
neutra sem valor numérico fictício. Meta Anual e CP-MQL preservados.

Orçamento aprovado em 08/10/2026: Eletrovias R$ 28.000 em outubro,
R$ 28.000 em novembro e R$ 20.000 em dezembro (total R$ 76.000).
Inpot e Lisô preservam 40/40/20. Tabela e pacing usam os mesmos valores;
totais mensais das prioritárias: R$ 92.800 / R$ 92.800 / R$ 52.400,
somando R$ 238.000. Sem alteração de metas comerciais ou banco.

- Inpot, Eletrovias e Lisô Laser: três cards separados por marca (nove no total):
  MQL/CP-MQL, SQL/SAL e pacing de investimento, todos do mês vigente.
  Vendas/faturamento por marca foram retirados; os dois placares fixos não mudam.
- MQL: classificação/dedupe de `leadUtils` por marca, dentro do mês. Meta de
  volume vem do cadastro mensal Marketing `metas` (`metrica=mql`); falta ou
  duplicidade de cadastro fica pendente. CP-MQL = gasto/MQL, indisponível sem
  MQL; custos-alvo aprovados: Inpot 220, Eletrovias 37, Lisô Laser 300 reais.
  Eficiência do custo = meta/realizado, limitada a 100% quando dentro da meta;
  o valor real e diferença continuam visíveis, inclusive custo zero válido.
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
- Pacing mensal no terceiro card de cada marca: gasto acumulado, orçamento mensal,
  saldo, percentual usado e ritmo contra proporção de dias corridos. Não
  inventar orçamento por canal nem presumir verba de Oral Unic.
- Fora de out–dez/2026, os blocos mensais são omitidos com aviso explícito;
  os placares continuam identificados como 2026.

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
5. Metas MQL do mês/três marcas: 200 + sentinela, somente marca/valor.
6. Leads do mês/três marcas: dia decrescente/id crescente, oito páginas de
   500 no máximo. Campos mínimos para classificação e dedupe; sem nomes.

Até 20 requisições por carga completa, uma por vez. Sem `SELECT *`, `count`,
histórico completo de eventos ou consultas por card. Leituras adicionais
exclusivas desta página, preservando o timeout total e cache anteriores.
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
