# Inscrições Beauty na S&OP

Card **BC · INSCRIÇÕES** da folha We Scale, restrito a outubro de 2026 e sem alterar o snapshot histórico. Nesse mês, 18 inscrições de 01 a 23/10 foram vinculadas individualmente ao export de negócios Beauty criado no RD CRM no mesmo período. A contagem é por ocorrência do evento `beautyconnection_multistep`; não representa MQL, presença nem negócios únicos em outros períodos.

## Ativação controlada

1. Revisar `beauty_view.sql` no Oral Unic DW. Conferir que `ouro.vw_leads_candidatos` oferece os quatro campos usados e que a consulta agregada para 01–23/10 retorna 18. View e role são DDL de instalação única; conferir existência antes de executar. Provisionar a senha da role fora do Git; conceder somente `SELECT` na view agregada. Não usar a credencial administrativa do Metabase no aplicativo.
2. Subir `app.py` como serviço isolado, com conexão TLS `verify-full` ao banco `oralunic_dw` usando `dashboard_beauty_ro`. Configuração protegida fora do Git: `mode`, `supabase_url`, `supabase_anon_key`, `postgres` (`dbname`, `user`, `password`, `host`, `port`, `sslmode`, `sslrootcert`). Expor exclusivamente `/api/beauty-ouro/v1/read` pelo host autenticado do dashboard. O navegador não escolhe SQL nem recebe identidade de contato.
3. Confirmar `/health`, `401` sem sessão, `403` sem permissão S&OP, contrato `beauty_inscricoes_v1` com usuário autorizado e soma 18 no corte validado. Ativar `VITE_BEAUTY_OURO_ENABLED=true` no build e publicar via PR/deploy normal do Dashboard. Conferir tela e PDF autenticados. Uma falha da ouro exibe `—` e erro; não vira zero.

Para reverter, publicar build com `VITE_BEAUTY_OURO_ENABLED=false` e depois parar o serviço isolado. A view e a role podem ser removidas após confirmar ausência de consumidores; não apagar fatos. O snapshot de setembro, MQLs Lisô, Vendas, mídia e demais indicadores da S&OP não são alterados por este contrato.

## Instalação verificada em 26/10/2026

View e role instaladas transacionalmente: apenas `ouro.vw_beauty_inscricoes_dia` é selecionável pela role fora dos esquemas de sistema; 18 inscrições no corte validado. Role com limite de cinco conexões e `default_transaction_read_only=on`. Zero DML de fatos e zero escrita RD.

Serviço `dashboard-beauty-ouro`, código em `/opt/wescale-beauty-ouro-20261026/app`, config/CA protegidos no subdiretório `config`, montados em `/run/beauty`. Imagem Python/psycopg já instalada, fixada em `sha256:5b2c0bf0279a28882311235507a5b1c965197d50475fa254196709eedb71d8bd`, com **`--entrypoint python`** e comando `-B /app/app.py`; não herdar a entrada original da imagem. Usuário10001, filesystem readonly, sem capabilities, no-new-privileges, limite512MiB/1CPU/64PIDs, rede `dashboard_default`, porta de diagnóstico apenas `127.0.0.1:18083`. Traefik encaminha o prefixo Beauty para8080. Nenhum serviço Partner/coletor foi reiniciado.

Saúde interna aprovada; POST público sem sessão401. Consulta real com a role Beauty confirmou TLS verificado, transação somente leitura e contagem18. Frontend ativa a flag apenas no workflow de produção; merge/deploy e QA autenticado são verificações posteriores à instalação.
