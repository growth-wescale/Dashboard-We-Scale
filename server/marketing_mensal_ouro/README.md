# Gateway mensal de Marketing

Leitura definitiva da ouro por período mensal, autorizada em 06/11/2026. Não altera fatos, RD, Vendas, Esteira ou os gateways de outubro. Partner continua no seu gateway existente. O consumidor é habilitado por `VITE_MARKETING_MENSAL_OURO_ENABLED=true` no build de produção. A flag `VITE_PREVIA_MENSAL` continua exclusiva do localhost; o aviso técnico da prévia não aparece em produção.

## Contrato

- `POST /api/marketing-mensal-ouro/v1/read`, Bearer da sessão Marketing: `{ "route": "/marca", "dataset": "leads", "periodo": { "inicio": "2026-11-01", "fim": "2026-11-06" } }`. Dataset `media` usa o mesmo intervalo. Contrato `marketing_mensal_v1`.
- Datas inclusivas, a partir de novembro/2026, sem limite fixo de mês. SQL parametrizado, somente cinco views da ouro. Nenhum SQL recebido do cliente. MQL é negociação; capital/UF/contato não requalificam.
- Sessão, usuário ativo, permissão da página e marcas revalidados em toda chamada, inclusive cache quente. Lisô inclui seu evento Beauty separado; Oral/Legacy preservam os acessos existentes. Mídia Legacy na conta Oral é filtrada pela frente real antes da resposta.
- Cada intervalo lê todas as projeções e o recibo na mesma transação `REPEATABLE READ READ ONLY`. Cache de oito intervalos em memória; renovação após 180 segundos, falha tenta novamente no ciclo de 15 segundos; após 300 segundos, retorna 503 em vez de servir uma cópia vencida. Limites de linhas recusam resultados incompletos.
- `GET /api/marketing-mensal-ouro/status` expõe apenas data/horário da última publicação validada. `/health` exige recibo recente. Período inteiramente posterior retorna 409 `periodo_sem_publicacao`; parcial devolve `through` e aviso. Publicação não certifica completude histórica de todas as fontes.

## Views de leitura

`python3 server/marketing_mensal_ouro/views.py` imprime DDL transacional para `ouro.vw_marketing_mensal_{captacoes,negocios,contatos,midia,cobertura}`. Não executa nada. Os SELECTs reutilizam os critérios da prévia. Perfil/vínculos da prata ficam encapsulados nas views da ouro; o serviço não recebe acesso direto à prata. Fonte SQL é a existente em `marketing_mensal_previa` e `outubro_ouro/perfil.sql`, evitando duas regras de qualificação.

O proprietário das views deve ter somente os acessos de origem necessários. Criar, em etapa autorizada separada, a role de login `dashboard_marketing_mensal_ro`, sem superuser, criação de roles/bancos, replicação ou bypass RLS; conexão padrão somente leitura. Conceder CONNECT em `oralunic_dw`, USAGE em ouro e SELECT exclusivamente nas cinco views. Revogar acesso público às views. Não trocar objetos existentes: `CREATE VIEW` deve falhar se o nome já existir para exigir revisão.

## Instalação e aceite

1. Rever o SQL emitido e instalar as views/role somente após autorização. Verificar grants positivos e negativos, incluindo ausência de INSERT/UPDATE/DELETE e SELECT direto nas fontes.
2. Provisionar `config.json` e certificado CA fora do git, legíveis apenas pelo operador e UID10001. O exemplo não contém credenciais. Não usar a chave administrativa do Metabase no serviço definitivo.
3. `compose.yml` propõe um serviço separado, sem porta pública direta, com filesystem somente leitura. A imagem já presente no VPS em06/11 é `sha256:5b2c0bf0279a28882311235507a5b1c965197d50475fa254196709eedb71d8bd` (Python3.12.14, psycopg3.3.5). Confirmar presença ao instalar; não substituir containers existentes.
4. Validar anônimo401, página/marca indevida403, dados por período e marcas, corte de dezembro sem publicação e renovação automática além de300s. Comparar IDs/valores com a prévia sem persistir registros pessoais.
5. Só então habilitar o consumidor mensal no frontend, atualizar endpoint/contrato e cobertura para este gateway, mantendo a referência histórica de outubro. Publicação pelo fluxo de PR e aceite do usuário. A flag local atual continua restrita ao localhost.

Rollback: desabilitar o consumidor mensal e manter os gateways existentes. Não apagar views/dados ou remover fatos para reverter uma tela. A instalação do serviço é separada do deploy do frontend. Não remover objetos existentes para reinstalar; conferir o estado antes de qualquer nova tentativa.

## Validação local

`python3 -B -m unittest discover -s server/marketing_mensal_ouro -p 'test_*.py'` cobre isolamento de marcas/sessões/abas, proteção de Vendas, períodos, falha de carga, renovação após180s, limites e SQL somente ouro. A comparação real dos SELECTs propostos com a prévia é feita somente em leitura no Metabase, sem DDL.

### Resultado de 06/11/2026

15 testes de gateway e 1.089 testes frontend aprovados; build de prévia concluído e lint sem erros (avisos preexistentes). Consultas propostas equivalentes à prévia em todos os campos/IDs: 1.138 linhas de leads/negócios e 493 de mídia, na publicação de06/11 às11h02 BRT, período01–06/11. SHA256 dos conjuntos ordenados: leads `877b09a394670ec3cc2a2e4f9ed173fac44b5ca70d30f8fbdfa44b844d972eea`, mídia `553e81a813c034b96fd33d4b2c871cd228aa7d869efe9974310e6277c9c0e849`. São equivalência de SELECTs/transformação, não prova de instalação ou de privilégio da role proposta.

Prévia autenticada conferida em Visão Geral, Saúde/Franquia/Legacy, Metas e S&OP: Oral6MQLs, franquiaR$1.623,45/CP-MQLR$270,58 (arredondados na tela). AvaliadoresR$544,42 preservados fora de Franquia; consultoriaLegacyR$3.949,06 preservada, incluindo GoogleR$1.668,19 que deixou de ser somado à Franquia na S&OP. Os investimentos e MQLs das outras marcas mantiveram os valores da conferência anterior. Outubro coberto pelos testes históricos; novembro, dezembro e janeiro pelos novos testes de recorte. Esteira não foi alterada ou revalidada nesta implementação; fontes de Vendas preservadas. Nenhum PDF, instalação de serviço/views/role, merge ou publicação.

### Instalação autorizada em 06/11/2026

Serviço isolado `dashboard-marketing-mensal-ouro` instalado no VPS a partir do código de `8a25207`, com TLS e imagem existente homologada. O retorno da criação pelo Metabase não confirmou a transação, mas a inspeção posterior comprovou as cinco views e a role criadas; a DDL não foi repetida. Grants vivos: SELECT somente nas cinco views, zero escrita, sem acesso direto à prata ou fatos e sem privilégios administrativos. Arquivos de configuração protegidos no servidor, fora do repositório.

Publicação da ouro de06/11 às12h46 BRT: as views instaladas e a prévia retornaram todos os campos e IDs idênticos em1.155 registros de leads/negociações e494 de mídia. SHA256: leads `e778ead6527bf1a42c4d2a4bef4e7749f4ed4910e83569ffed5da5c58e3c05dd`; mídia `64ceb6a6f35654d1c6afa2d85ca1369dd47131821ca099eca83397e91d8b8008`. O volume aumentou pela carga automática posterior à comparação anterior.

Prévia autenticada com o gateway definitivo: Visão Geral, Saúde Franquia/Legacy, Metas e todas as folhas da S&OP concluídas sem alertas. Recorte01–06/11: Oral6MQLs/R$1.646,40/CP-MQLR$274,40; Legacy26MQLs/R$4.005,42; AvaliadoresR$550,97 fora de Franquia. S&OP confirmou também Inpot12, B2Case8, Viva8, Eletrovias209, Lisô28 e Partner14; Beauty permaneceu separado. Anônimo401, rota Vendas400 e dezembro sem publicação409. Os testes adicionais cobrem intervalo misto, cache por mês, outubro delegado integralmente e preservação de Partner/Vendas/Esteira.

Renovação viva confirmada após310,622s: mesma instância, zero reinícios, resposta200 e1.155 registros válidos, sem reinício ou refresh manual do serviço. Dezembro retornou409 e a UI ocultou os cartões. Cards de outubro comparados entre prévia e produção anterior: textos/valores idênticos. Código instalado e local conferidos por SHA256.


### Identificação da negociação na Lista de MQLs

O nome e o e-mail acompanham a negociação pelo vínculo de negócio e contato da mesma conta. Vínculos de versões da API que identificam o mesmo contato são consolidados. Uma negociação com identidades conflitantes continua na lista com os campos de identificação vazios.

A migração aditiva das views já instaladas pode ser gerada com `python3 -B server/outubro_ouro/atualizar_identidade.py`. O SQL preserva as colunas existentes e os grants. Após a migração, os serviços de outubro e mensal precisam carregar o `perfil.py` da mesma revisão. A implementação aceita as views anteriores durante a atualização.
