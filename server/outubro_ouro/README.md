# Marketing de outubro de 2026 · Inpot, B2Case e Viva

O gateway consulta três views da ouro do Oral Unic DW, a mesma base verificada no Metabase. Para preparar a DDL inicial, execute `python3 views.py`. O leitor dedicado dashboard_outubro_marketing_ro precisa de CONNECT no banco, USAGE no schema e SELECT somente nessas views. Provisione a senha fora do repositório. A consulta de negócios preserva a data de criação em Brasília e os perfis oficiais do CRM. A lista de campanhas em anuncios.sql delimita a mídia.

O serviço lê /run/outubro/config.json, exige TLS verify-full e verifica a identidade do leitor. Depois da carga inicial, renova os três conjuntos em uma transação somente leitura a cada 180 segundos. Uma cópia com mais de 300 segundos deixa de ser servida. Cada chamada a /api/outubro-ouro/v1/read valida a sessão, a aba e as marcas antes de devolver registros.

VITE_OUTUBRO_OURO_ENABLED habilita a integração exclusivamente nos clientes de Marketing. A publicação do frontend depende do merge do PR. A auditoria de 04/11 está em docs/audits/2026-11-04-inpot-b2case-viva-previa.md.
