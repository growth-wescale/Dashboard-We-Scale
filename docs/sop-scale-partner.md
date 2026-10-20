# S&OP · Scale Partner

Alteração restrita à folha Scale Partner em `SopMarketing.tsx`.

- Sem o complemento “FONTE · Base Marketing”; os indicadores existentes de
  investimento, leads, MQL e CP-MQL são preservados.
- Meses sem snapshot ganham vendas e receita de `vw_funil_vendas`, no banco
  de Expansão. Consulta exclusiva, paginada e cancelável, ativada somente
  nessa folha, com cache isolado e recorte pela data da venda em Brasília.
- Somente status Ganho e marcas Scale Partner/We Scale. Chave negócio/ciclo;
  criação anterior ao mês não impede contabilizar uma venda no mês.
- Revisão aprovada em 20/10: seção de compradores removida da tela e do PDF.
  O complemento de nome/empresa e a consulta de identificação em Marketing
  também foram retirados. Vendas e receita preservadas, com os mesmos filtros.
  A chave de cache foi versionada para não reaproveitar a estrutura anterior.
- Beauty Connection removido apenas do quadro de eventos. Os snapshots
  históricos e os respectivos indicadores anteriores não são reescritos.
- Mapeamento usa adset ou utm_term preservada do RD: ODONTOLOGIA e LLK.
  ADV+, Saúde/Beleza, vídeos e ausências não são atribuídos automaticamente:
  permanecem em Sem evento identificado, incluídos no denominador total.
- Erro comercial não vira zero; a exportação aguarda a nova consulta e mantém
  o alerta visível em caso de falha. Venda sem valor não acrescenta receita.

Sem escrita em banco, migração, nova permissão, dependência ou alteração de
hooks compartilhados ou páginas de Vendas/metas. A revisão de metas e
comunidade da folha Legacy está documentada separadamente em
`sop-legacy-comunidade-2026-10-20.md`.

Verificação: testes unitários de período, fuso, status, fonte, dedupe,
mapeamento, cancelamento, paginação e falhas; build/lint e
conferência visual local a 1440/1024px e exportação PDF de nove folhas com
dados fictícios (folha Scale Partner revisada). Não equivale a deploy ou QA
autenticado com dados reais. Publicação depende de PR e merge.
