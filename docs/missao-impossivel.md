# Missão Impossível — contrato de acompanhamento

Status: implementação autorizada por Gabriel em 07/10/2026; publicação depende
de PR, merge pelo usuário e deploy. A verificação visual será por print do usuário.

## Escopo

`/okrs`, aba Acompanhamento Meta. OKRs, edição de KRs, Campanha, TV, S&OP,
Hub de metas e filtros compartilhados não mudam. O acompanhamento jul–set
continua acessível sob consulta explícita. A tabela Meta de vendas mantém seu
histórico H2 e recebe uma indicação de que não representa a estratégia atual.

Metas em `constants/missaoImpossivel.ts`: receita anual e Q4 independentes,
prioridade em Inpot/Eletrovias/Lisô, verba 40/40/20 por marca. Viva é adicional;
Oral Unic a definir; B2Case sem novo investimento. Não há índice de perda de
performance nem redistribuição da receita entre meses.

## Fontes e fórmulas

- Receita: `vw_funil_vendas`, Supabase Expansão. Somente status Ganho e data de
  venda no período em Brasília, valor do contrato uma vez por negócio/ciclo.
  Não multiplica por unidades. Contratos nulos contribuem zero e geram aviso.
  Placar anual e Q4 não recebem filtros locais do detalhamento. Incluem todas
  as marcas e origens da view, sem limitar ao catálogo de prioritárias.
- Captação: `leads` e `media_daily_raw`, Supabase Marketing. CP-MQL mantém
  investimento/MQL deduplicado, `isLeadMql`, `deduplicateLeads` e segregação
  de mídia existentes. A exceção de dedupe de participantes de eventos não muda.
- Funil: `vw_funil_vendas` + `vw_funil_etapas_v2`, todas as origens. Marca e
  criação vêm do negócio, não do evento. Passagens aceitas pelas regras de
  `eventsInStage` são unidas às datas normalizadas da view de ciclos para
  preservar históricos anteriores ao event sourcing. Handoff SQL é filtrado
  pelos IDs de etapa já usados em Vendas; não se infere passagem por etapa pulada.
- Contagem: uma ocorrência por negócio/ciclo no intervalo inteiro. A mesma
  passagem em meses diferentes não acrescenta outro negócio no total anual.
- Taxas dos mesmos negócios: denominador = conjunto da etapa inicial no
  período; numerador = interseção desse conjunto com a etapa seguinte no mesmo
  período. SQL/MQL, ganhos/SQL, ganhos/SAL; sem denominador, mostrar traço.
  Uma venda que não passou por SQL conta em receita, não na conversão SQL.
  Mostrar numerador e denominador evita confundir a taxa de conversão com a
  razão de totais de grupos diferentes. Não há média das taxas mensais.
- Filtro opcional de criação: `data_criacao_original`, sem fallback silencioso
  para data MQL ou reciclagem. O intervalo de criação pode diferir do intervalo
  de análise; este último continua controlando as etapas e vendas. Datas de
  criação ausentes são informadas e excluídas quando o filtro está ativo.
- CRM e Marketing não têm correspondência individual completa homologada.
  Por isso o filtro de criação do CRM não altera captação/CP-MQL, identificado
  na interface. MQL/entrada CRM inclui a entrada Lead do motor Outbound, sem
  reclassificar cadastros Marketing. Não somar as duas bases nem apresentar
  suas populações como idênticas.
- Realizado termina hoje. Períodos futuros ficam sem realizado. Orçamento
  considera o intervalo escolhido inteiro; intervalos parciais dentro de Q4
  usam proporção de dias de cada mês. Fora de Q4 não há orçamento aprovado para
  comparação. O rateio de receita permanece inexistente.

## ADR — consulta local isolada

Decisão: novo hook restrito a esta página, com consultas paginadas, ordenação
total, cache, abort, timeout e refresh de cinco minutos via infraestrutura
`useConsultaFiltrada`. Deals/eventos não refazem download a cada filtro local.
Permissão existente `aba.okrs` é mantida, sem alargar papéis ou acessos.

Alternativas: alterar os hooks comerciais compartilhados aumentaria o alcance
do PR; usar a view legada perpetuaria diferenças de eventos/identidade. Uma nova
RPC ou banco unificado exigiria migração e autorização de fonte fora do escopo.
O hook isolado custa uma carga inicial própria, mas limita risco de regressão.
Não muda schema, RLS, chave, origem canônica ou espelho RD.

## Validação

Testes puros de orçamento, datas/fuso, criação, conjuntos, dedupe, receita e
captação; testes do contrato de consulta/paginação/erro e de renderização React
sem navegador (acesso, loading, erro e exibição dos placares).

Conferência somente leitura em 07/10/2026 usando o código novo com a API
configurada localmente: receita anual idêntica à `sumRevenue` de Vendas,
diferença de zero centavos. Nenhuma chave negócio/ciclo duplicada na base
consultada. Há contratos ganhos sem valor; nenhuma correção foi executada.
Valores comerciais vivos e dados individuais não são fixados em código/testes
ou reproduzidos neste documento público. Evidência agregada fica na nota
confidencial do projeto no vault.

Build/testes e leitura de API não equivalem a publicação ou QA autenticado.
