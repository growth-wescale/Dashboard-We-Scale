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

## Fechamento informado em 27/10/2026 — PR286 corretivo

Somente dados da folha existente. Componentes, estilos, posições, formatação,
navegação e nove folhas do PDF preservados; a folha extra anterior foi retirada.
Na abertura de Partner, o seletor existente identifica o fechamento15/08–19/10.
Seis cards: investimento21133.85, leads98, MQL51, CP-MQL414.39, vendas6,
receita13718. Os valores monetários mantêm o formato compacto original.

Fonte: texto do Comparativo Partner fornecido por Gabriel no chat em27/10,
referência https://claude.ai/artifact/9fUjSYbkM5ryWqtzyW5y73. Holding sem IDA
nem LISO Evento. Google recente ainda ausente, vendas em maturação no corte;
13–14/08 fora. A referência anterior01/05–12/08 é acessível pelas datas exatas
no seletor personalizado, sem modificar dados mensais ou atribuir totais a fontes.

Por decisão explícita de Gabriel, MQL semanal e eventos mantêm consultas ao
Dashboard para o mesmo período, não uma distribuição inventada dos98/51.
O carregamento desses detalhes cobre15/08–19/10 inteiro. As barras continuam
nas cinco semanas do gráfico existente. Esses detalhes consultados não são
uma conciliação certificada com o snapshot informado. Beauty mantém seu card
separado e conta somente inscrições dentro da janela selecionada.

Métricas do material sem espaço no layout atual (CPL/CPV/CPP, pessoas, ROAS,
ticket, dias ativos e ritmo30dias) não criam cards, gráficos ou folhas novos.
Sem alteração de fatos, fontes de outras páginas, RD, merge ou deploy.

O PR284 original foi mesclado externamente em53ae9bc às13:24 BRT; workflow
Deploy40540539342 concluído. A correção está no PR286, sem merge/deploy próprio.
