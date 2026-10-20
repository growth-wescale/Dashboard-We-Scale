# S&OP · Scale Partner

Alteração restrita à folha Scale Partner em `SopMarketing.tsx`.

- Sem o complemento “FONTE · Base Marketing”; os indicadores existentes de
  investimento, leads, MQL e CP-MQL são preservados.
- Meses sem snapshot ganham vendas e receita de `vw_funil_vendas`, no banco
  de Expansão. Consulta exclusiva, paginada e cancelável, ativada somente
  nessa folha, com cache isolado e recorte pela data da venda em Brasília.
- Somente status Ganho e marcas Scale Partner/We Scale. Chave negócio/ciclo;
  criação anterior ao mês não impede contabilizar uma venda no mês.
- Lista de compradores abaixo da distribuição por evento usa exatamente o
  mesmo recorte/fonte das novas métricas. Complemento de nome/empresa é
  lido em Marketing somente pelos IDs CRM dos ganhos, sem consulta de contatos
  em massa. Falha complementar mantém os ganhos e informa a limitação.
- Sem empresa disponível, “Não informada”. Empresa contida explicitamente
  no nome da negociação só é separada quando o nome cadastrado do contato
  é seu prefixo exato; essa origem é identificada na tabela. Nenhum dado pessoal
  é fixado no código ou incluído neste documento.
- Beauty Connection removido apenas do quadro de eventos. Os snapshots
  históricos e os respectivos indicadores anteriores não são reescritos.
- Mapeamento usa adset ou utm_term preservada do RD: ODONTOLOGIA e LLK.
  ADV+, Saúde/Beleza, vídeos e ausências não são atribuídos automaticamente:
  permanecem em Sem evento identificado, incluídos no denominador total.
- Erro comercial não vira zero; a exportação aguarda a nova consulta e mantém
  o alerta visível em caso de falha. Venda sem valor não acrescenta receita.

Sem escrita em banco, migração, nova permissão, dependência ou alteração de
hooks compartilhados, Legacy, Vendas, metas e demais folhas.

Verificação: testes unitários de período, fuso, status, fonte, dedupe,
identidade, mapeamento, cancelamento, paginação e falhas; build/lint e
conferência visual local a 1440/1024px e exportação PDF de nove folhas com
dados fictícios (folha Scale Partner revisada). Não equivale a deploy ou QA
autenticado com dados reais. Publicação depende de PR e merge.
